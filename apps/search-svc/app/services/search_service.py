"""Execution layer for the public search endpoints.

Talks to Elasticsearch through `app.services.query_builder` (DSL) and
`app.services.result_mapper` (shape), and caches every response under the
contract's `cache:search:{hash}` namespace (CONTRACT §2) so a reindex can flush
them all with `invalidate_namespace()`.

TTLs
----
results / facets / map / similar   `SEARCH_CACHE_TTL` (60s, CONTRACT §2)
autocomplete                       300s — prefixes change far more slowly
"""

from __future__ import annotations

import time
from collections.abc import Awaitable, Callable
from typing import Any

from elasticsearch import AsyncElasticsearch, NotFoundError

from app.core.config import Settings, get_settings
from app.core.errors import IndexNotReadyError, PropertyNotFoundError
from app.core.logging import get_logger
from app.core.redis import build_cache_key, cache_get, cache_set
from app.es.client import get_es
from app.schemas.search import (
    AutocompleteParams,
    MapFilters,
    MapMode,
    SearchFilters,
    SearchQuery,
)
from app.services import query_builder as qb
from app.services import result_mapper as rm
from app.services.geo import precision_for_bbox

log = get_logger("search-svc.search")

#: Autocomplete is far more cacheable than a filtered result page.
AUTOCOMPLETE_CACHE_TTL = 300
#: `/similar` and `/map` follow the index, not the user, so they can live longer.
SIMILAR_CACHE_TTL = 300


class SearchService:
    """Read path: search, autocomplete, facets, similar and map."""

    def __init__(
        self,
        es: AsyncElasticsearch | None = None,
        *,
        settings: Settings | None = None,
    ) -> None:
        self.settings = settings or get_settings()
        self._es = es

    # ------------------------------------------------------------- plumbing

    @property
    def es(self) -> AsyncElasticsearch:
        """Resolved lazily so the shared client can be recreated on reconnect."""
        return self._es or get_es()

    @property
    def index(self) -> str:
        """Always query the alias, never a concrete index version."""
        return self.settings.ES_INDEX

    async def _search(self, body: dict[str, Any]) -> dict[str, Any]:
        """Run one search, translating a missing index into `INDEX_NOT_READY`."""
        try:
            response = await self.es.search(index=self.index, **qb.search_kwargs(body))
        except NotFoundError as exc:
            log.error("search_index_missing", index=self.index, error=str(exc))
            raise IndexNotReadyError(
                f"Search index '{self.index}' does not exist yet — trigger a reindex"
            ) from exc
        return dict(response)

    @staticmethod
    async def _cached(
        key: str,
        ttl: int,
        producer: Callable[[], Awaitable[dict[str, Any]]],
    ) -> tuple[dict[str, Any], bool]:
        """Return `(payload, from_cache)` for a JSON-serializable producer."""
        hit = await cache_get(key)
        if hit is not None:
            return dict(hit), True
        payload = await producer()
        await cache_set(key, payload, ttl)
        return payload, False

    # --------------------------------------------------------------- search

    async def search(self, query: SearchQuery) -> tuple[dict[str, Any], dict[str, int]]:
        """`GET /api/search` — returns `(data, meta)` ready for the envelope."""
        key = build_cache_key("results", query.cache_payload())

        async def produce() -> dict[str, Any]:
            started = time.perf_counter()
            body = qb.build_search_body(
                query.filters,
                from_=query.offset,
                size=query.limit,
            )
            response = await self._search(body)
            total = rm.total_hits(response)
            data: dict[str, Any] = {
                "results": rm.map_hits(response, origin=query.filters.origin),
                "took": int(response.get("took", 0) or 0),
                "maxScore": (response.get("hits") or {}).get("max_score"),
                "cached": False,
            }
            if query.withFacets:
                data["facets"] = await self._facets(query.filters)
            log.debug(
                "search_executed",
                total=total,
                took_ms=round((time.perf_counter() - started) * 1000, 2),
                sort=str(query.filters.sort),
            )
            return {
                "data": data,
                "meta": {"page": query.page, "limit": query.limit, "total": total},
            }

        payload, from_cache = await self._cached(key, self.settings.SEARCH_CACHE_TTL, produce)
        data = dict(payload["data"])
        data["cached"] = from_cache
        return data, dict(payload["meta"])

    # --------------------------------------------------------------- facets

    async def facets(self, filters: SearchFilters) -> dict[str, Any]:
        """`GET /api/search/facets` — cached sidebar aggregation buckets."""
        key = build_cache_key("facets", filters.normalised())

        async def produce() -> dict[str, Any]:
            return await self._facets(filters)

        payload, _ = await self._cached(key, self.settings.SEARCH_CACHE_TTL, produce)
        return payload

    async def _facets(self, filters: SearchFilters) -> dict[str, Any]:
        interval = qb.DEFAULT_PRICE_INTERVAL
        body = qb.build_facets_body(filters, price_interval=interval)
        response = await self._search(body)
        facets = rm.map_facets(response.get("aggregations"), price_interval=interval)
        if not facets.get("total"):
            facets["total"] = rm.total_hits(response)
        return facets

    # --------------------------------------------------------- autocomplete

    async def autocomplete(self, params: AutocompleteParams) -> dict[str, Any]:
        """`GET /api/search/autocomplete` — typed, deduped completion suggestions."""
        key = build_cache_key(
            "autocomplete",
            {"q": params.q.lower(), "limit": params.limit, "types": list(params.types)},
        )

        async def produce() -> dict[str, Any]:
            body = qb.build_autocomplete_body(
                params.q,
                size=params.limit,
                types=params.types,
            )
            response = await self._search(body)
            suggestions = rm.map_suggestions(response, limit=params.limit, types=params.types)

            if not suggestions and len(params.q) >= 2:
                # The completion field can be empty on documents indexed by an
                # older mapping — fall back to the edge-ngram analyzer.
                fallback = await self._search(
                    qb.build_autocomplete_fallback_body(params.q, size=params.limit)
                )
                suggestions = rm.map_fallback_suggestions(fallback, limit=params.limit)

            return {"suggestions": suggestions}

        payload, _ = await self._cached(key, AUTOCOMPLETE_CACHE_TTL, produce)
        return payload

    # -------------------------------------------------------------- similar

    async def similar(self, property_id: str, *, limit: int = 10) -> dict[str, Any]:
        """`GET /api/search/similar/{id}` — more_like_this with a ±25% price band."""
        key = build_cache_key("similar", {"id": property_id, "limit": limit})

        async def produce() -> dict[str, Any]:
            source, document_id = await self._load_source(property_id)
            body = qb.build_similar_body(
                source,
                index=self.index,
                document_id=document_id,
                size=limit,
            )
            response = await self._search(body)
            results = rm.map_hits(response)
            strategy = "more_like_this"

            if not results:
                fallback = qb.build_similar_fallback_body(
                    source, document_id=document_id, size=limit
                )
                response = await self._search(fallback)
                results = rm.map_hits(response)
                strategy = "fallback"

            return {"sourceId": document_id, "strategy": strategy, "results": results}

        payload, _ = await self._cached(key, SIMILAR_CACHE_TTL, produce)
        return payload

    async def _load_source(self, property_id: str) -> tuple[dict[str, Any], str]:
        """Fetch the reference listing by `_id`, then by slug / reference number."""
        try:
            document = dict(await self.es.get(index=self.index, id=property_id))
            return dict(document.get("_source") or {}), str(document.get("_id"))
        except NotFoundError:
            pass

        response = await self._search(
            {
                "size": 1,
                "track_total_hits": False,
                "_source": {"includes": list(qb.SOURCE_FIELDS)},
                "query": {
                    "bool": {
                        "should": [
                            {"term": {"slug": property_id}},
                            {"term": {"mongoId": property_id}},
                            {"term": {"referenceNo": property_id}},
                            {"term": {"id": property_id}},
                        ],
                        "minimum_should_match": 1,
                    }
                },
            }
        )
        hits = (response.get("hits") or {}).get("hits") or []
        if not hits:
            raise PropertyNotFoundError(property_id)
        return dict(hits[0].get("_source") or {}), str(hits[0].get("_id"))

    # ------------------------------------------------------------------ map

    async def map_search(self, filters: MapFilters) -> dict[str, Any]:
        """`GET /api/search/map` — clustered pins, or raw points when sparse."""
        key = build_cache_key("map", filters.normalised())

        async def produce() -> dict[str, Any]:
            bbox = qb.bounding_box(filters)
            precision = int(filters.precision or precision_for_bbox(bbox))
            response = await self._search(qb.build_map_body(filters, precision=precision))
            total = rm.total_hits(response)

            payload: dict[str, Any] = {
                "mode": MapMode.CLUSTERS.value,
                "precision": precision,
                "total": total,
                "bbox": bbox.as_list(),
                "clusters": [],
                "points": [],
            }

            if 0 < total <= filters.maxPoints:
                points_response = await self._search(
                    qb.build_map_points_body(filters, size=min(total, filters.maxPoints))
                )
                payload["mode"] = MapMode.POINTS.value
                payload["points"] = rm.map_hits(points_response)
            else:
                payload["clusters"] = rm.map_clusters(response.get("aggregations"))
            return payload

        payload, _ = await self._cached(key, self.settings.SEARCH_CACHE_TTL, produce)
        return payload


_service: SearchService | None = None


def get_search_service() -> SearchService:
    """Process-wide `SearchService` (created lazily, reset by the tests)."""
    global _service
    if _service is None:
        _service = SearchService()
    return _service


def reset_search_service() -> None:
    """Drop the singleton (used on shutdown and between tests)."""
    global _service
    _service = None
