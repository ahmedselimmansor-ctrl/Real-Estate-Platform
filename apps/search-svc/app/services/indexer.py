"""Indexing pipeline: MongoDB (or the seed corpus) -> Elasticsearch.

* full reindex — streams Mongo with a cursor and `async_bulk` in chunks of 500,
  logging progress; optionally rebuilt zero-downtime into a new index version
* upsert-one / delete-one — the hooks api-core calls after a write
* bootstrap — when Mongo is still empty (api-core has not seeded yet) the
  service indexes `/app/seed/properties.json` so search works immediately
"""

from __future__ import annotations

import time
from collections.abc import AsyncIterator, Iterable, Mapping
from datetime import UTC, datetime
from typing import Any, cast

from elasticsearch import AsyncElasticsearch, NotFoundError
from elasticsearch.helpers import async_bulk
from pymongo.errors import PyMongoError

from app.core.config import Settings, get_settings
from app.core.logging import get_logger
from app.core.redis import invalidate_namespace
from app.db.mongo import (
    count_properties,
    get_properties_collection,
    identifier_query,
    live_filter,
)
from app.es.client import get_es
from app.es.index_manager import IndexManager
from app.services import reference_data
from app.services.runs import RunReport, run_registry
from app.services.transformer import is_indexable, resolve_document_id, transform_property

log = get_logger("search-svc.indexer")

SOURCE_MONGO = "mongo"
SOURCE_SEED = "seed"
SOURCE_AUTO = "auto"


class Indexer:
    """Owns every write path into the Elasticsearch index."""

    def __init__(
        self,
        es: AsyncElasticsearch | None = None,
        *,
        index_manager: IndexManager | None = None,
        settings: Settings | None = None,
    ) -> None:
        self.settings = settings or get_settings()
        self.es = es or get_es()
        self.index_manager = index_manager or IndexManager(self.es, settings=self.settings)

    # ------------------------------------------------------------- transform

    def _area_slugs(self) -> dict[str, str]:
        try:
            return reference_data.area_slug_map()
        except Exception as exc:  # pragma: no cover - seed is optional
            log.warning("area_slug_map_failed", error=str(exc))
            return {}

    def to_es_document(
        self, doc: Mapping[str, Any], *, indexed_at: datetime | None = None
    ) -> dict[str, Any]:
        return transform_property(
            doc,
            area_slugs=self._area_slugs(),
            media_base_url=self.settings.media_base_url,
            indexed_at=indexed_at,
        )

    # ---------------------------------------------------------------- source

    async def _iter_mongo(self, query: dict[str, Any] | None = None) -> AsyncIterator[dict]:
        collection = get_properties_collection()
        cursor = collection.find(query if query is not None else live_filter()).batch_size(
            self.settings.ES_BULK_CHUNK_SIZE
        )
        async for document in cursor:
            yield document

    async def _iter_seed(self, ids: set[str] | None = None) -> AsyncIterator[dict]:
        for document in reference_data.load_seed_properties():
            if ids is not None and resolve_document_id(document) not in ids:
                continue
            yield document

    async def resolve_source(self, source: str = SOURCE_AUTO) -> str:
        """Pick Mongo when it holds listings, otherwise the seed corpus."""
        if source in (SOURCE_MONGO, SOURCE_SEED):
            return source
        mongo_count = await count_properties()
        if mongo_count > 0:
            return SOURCE_MONGO
        if self.settings.BOOTSTRAP_FROM_SEED and reference_data.seed_available():
            log.info("source_fallback_seed", mongo_documents=0)
            return SOURCE_SEED
        return SOURCE_MONGO

    async def _iter_documents(
        self, source: str, *, ids: set[str] | None = None
    ) -> AsyncIterator[dict]:
        if source == SOURCE_SEED:
            async for document in self._iter_seed(ids):
                yield document
            return

        query: dict[str, Any] | None = None
        if ids:
            query = {"$and": [live_filter(), {"$or": [identifier_query(i) for i in ids]}]}
        async for document in self._iter_mongo(query):
            yield document

    # ----------------------------------------------------------------- bulk

    async def _bulk_actions(
        self,
        documents: AsyncIterator[dict],
        index_name: str,
        report: RunReport,
        indexed_at: datetime,
    ) -> AsyncIterator[dict[str, Any]]:
        seen = 0
        async for document in documents:
            seen += 1
            if not is_indexable(document):
                log.debug("document_skipped", reason="deleted_or_id_less")
                continue
            es_doc = self.to_es_document(document, indexed_at=indexed_at)
            if not es_doc.get("id"):
                continue
            if seen % self.settings.ES_BULK_CHUNK_SIZE == 0:
                log.info("reindex_progress", run_id=report.runId, read=seen, index=index_name)
            yield {
                "_op_type": "index",
                "_index": index_name,
                "_id": es_doc["id"],
                "_source": es_doc,
            }
        report.total = seen

    async def _run_bulk(
        self,
        documents: AsyncIterator[dict],
        index_name: str,
        report: RunReport,
        indexed_at: datetime,
    ) -> tuple[int, list[Any]]:
        client = self.es.options(request_timeout=self.settings.ES_BULK_TIMEOUT)
        success, errors = await async_bulk(
            client,
            self._bulk_actions(documents, index_name, report, indexed_at),
            chunk_size=self.settings.ES_BULK_CHUNK_SIZE,
            max_retries=self.settings.ES_MAX_RETRIES,
            initial_backoff=1,
            raise_on_error=False,
            raise_on_exception=False,
            stats_only=False,
        )
        # `stats_only=False` above, so `errors` is the list of failures.
        failures = list(cast(list[Any], errors or []))
        if failures:
            log.error(
                "bulk_errors",
                run_id=report.runId,
                index=index_name,
                failed=len(failures),
                sample=failures[:3],
            )
        return int(success), failures

    async def _populate(self, index_name: str, source: str, report: RunReport) -> int:
        indexed_at = datetime.now(tz=UTC)
        documents = self._iter_documents(source)
        success, failures = await self._run_bulk(documents, index_name, report, indexed_at)
        report.indexed = success
        report.failed = len(failures)
        return success

    # ------------------------------------------------------------ full runs

    async def full_reindex(
        self,
        report: RunReport | None = None,
        *,
        source: str = SOURCE_AUTO,
        zero_downtime: bool = False,
        prune: bool = True,
    ) -> RunReport:
        """Rebuild the whole index from the source of truth."""
        run = report or run_registry.create(mode="full", source=source)
        run.mark_running()
        started = time.perf_counter()
        started_at = datetime.now(tz=UTC)

        try:
            resolved_source = await self.resolve_source(source)
            run.source = resolved_source
            await self.index_manager.ensure_index()

            if zero_downtime:
                run.mode = "zero_downtime"

                async def _populator(target_index: str) -> int:
                    return await self._populate(target_index, resolved_source, run)

                result = await self.index_manager.zero_downtime_reindex(populate=_populator)
                run.index = result["newIndex"]
                run.details = result
            else:
                index_name = await self.index_manager.write_index()
                run.index = index_name
                await self._populate(index_name, resolved_source, run)
                await self.index_manager.refresh(index_name)
                # Only prune when every document made it in, otherwise a partial
                # failure would delete listings that are still live upstream.
                if prune and run.failed == 0 and run.indexed > 0:
                    run.deleted = await self._prune_stale(index_name, started_at)

            await self.index_manager.refresh(run.index)
            await invalidate_namespace()
            run.mark_completed()
            log.info(
                "full_reindex_completed",
                run_id=run.runId,
                source=run.source,
                index=run.index,
                indexed=run.indexed,
                failed=run.failed,
                deleted=run.deleted,
                duration_ms=int((time.perf_counter() - started) * 1000),
            )
        except Exception as exc:
            run.mark_failed(str(exc))
            log.exception("full_reindex_failed", run_id=run.runId, error=str(exc))
        finally:
            await run_registry.persist(run)
        return run

    async def _prune_stale(self, index_name: str, started_at: datetime) -> int:
        """Drop documents that were not refreshed by this run (deleted upstream)."""
        cutoff = started_at.isoformat().replace("+00:00", "Z")
        try:
            response = await self.es.options(
                request_timeout=self.settings.ES_BULK_TIMEOUT
            ).delete_by_query(
                index=index_name,
                query={
                    "bool": {
                        "must_not": {"range": {"indexedAt": {"gte": cutoff}}},
                    }
                },
                conflicts="proceed",
                refresh=True,
            )
        except NotFoundError:
            return 0
        deleted = int(dict(response).get("deleted", 0) or 0)
        if deleted:
            log.info("stale_documents_pruned", index=index_name, deleted=deleted)
        return deleted

    async def index_ids(
        self,
        ids: Iterable[str],
        report: RunReport | None = None,
        *,
        source: str = SOURCE_AUTO,
    ) -> RunReport:
        """Reindex an explicit set of listing ids (`POST /reindex {ids:[...]}`)."""
        wanted = {str(i).strip() for i in ids if str(i).strip()}
        run = report or run_registry.create(mode="partial", source=source)
        run.mark_running()

        try:
            resolved_source = await self.resolve_source(source)
            run.source = resolved_source
            await self.index_manager.ensure_index()
            index_name = await self.index_manager.write_index()
            run.index = index_name

            indexed_at = datetime.now(tz=UTC)
            documents = self._iter_documents(resolved_source, ids=wanted)
            success, failures = await self._run_bulk(documents, index_name, run, indexed_at)
            run.indexed = success
            run.failed = len(failures)

            missing = max(0, len(wanted) - run.total)
            run.details = {"requested": len(wanted), "missing": missing}
            await self.index_manager.refresh(index_name)
            await invalidate_namespace()
            run.mark_completed()
            log.info(
                "partial_reindex_completed",
                run_id=run.runId,
                requested=len(wanted),
                indexed=run.indexed,
                failed=run.failed,
            )
        except Exception as exc:
            run.mark_failed(str(exc))
            log.exception("partial_reindex_failed", run_id=run.runId, error=str(exc))
        finally:
            await run_registry.persist(run)
        return run

    # ----------------------------------------------------------- single doc

    async def fetch_source_document(self, identifier: str) -> dict[str, Any] | None:
        """Look the listing up in Mongo, falling back to the seed corpus."""
        try:
            document = await get_properties_collection().find_one(identifier_query(identifier))
            if document:
                return dict(document)
        except (PyMongoError, OSError) as exc:
            log.warning("mongo_lookup_failed", identifier=identifier, error=str(exc))

        if self.settings.BOOTSTRAP_FROM_SEED:
            for candidate in reference_data.load_seed_properties():
                if identifier in {
                    resolve_document_id(candidate),
                    candidate.get("slug"),
                    candidate.get("mongoId"),
                }:
                    return dict(candidate)
        return None

    async def index_one(self, identifier: str) -> dict[str, Any] | None:
        """Upsert a single listing (`POST /api/search/index/{id}`)."""
        document = await self.fetch_source_document(identifier)
        if document is None:
            log.warning("index_one_not_found", identifier=identifier)
            return None
        if not is_indexable(document):
            deleted = await self.delete_one(identifier)
            log.info("index_one_soft_deleted", identifier=identifier, removed=deleted)
            return {"id": identifier, "action": "deleted", "deleted": deleted}

        await self.index_manager.ensure_index()
        index_name = await self.index_manager.write_index()
        es_doc = self.to_es_document(document)
        await self.es.index(index=index_name, id=es_doc["id"], document=es_doc, refresh="wait_for")
        await invalidate_namespace()
        log.info("document_indexed", id=es_doc["id"], index=index_name)
        return {"id": es_doc["id"], "action": "indexed", "index": index_name, "document": es_doc}

    async def delete_one(self, identifier: str) -> bool:
        """Remove a listing from the index (`DELETE /api/search/index/{id}`)."""
        index_name = await self.index_manager.write_index()
        try:
            await self.es.delete(index=index_name, id=identifier, refresh="wait_for")
        except NotFoundError:
            log.info("delete_one_missing", identifier=identifier)
            return False
        await invalidate_namespace()
        log.info("document_deleted", id=identifier, index=index_name)
        return True

    # ------------------------------------------------------------ bootstrap

    async def bootstrap(self, *, force: bool = False) -> dict[str, Any]:
        """Ensure the index exists and holds documents (startup path).

        Indexes from Mongo when api-core has already seeded it, otherwise from
        `/app/seed/properties.json` so the UI has data on a cold `docker compose up`.
        """
        ensure = await self.index_manager.ensure_index()
        existing = await self.index_manager.document_count()

        if existing > 0 and not force:
            log.info("bootstrap_skipped", documents=existing, index=ensure.get("index"))
            return {"skipped": True, "documents": existing, **ensure}

        source = await self.resolve_source(SOURCE_AUTO)
        if source == SOURCE_SEED and not reference_data.seed_available():
            log.warning("bootstrap_no_source", seed_dir=str(reference_data.seed_dir()))
            return {"skipped": True, "documents": 0, "reason": "no_source", **ensure}

        run = run_registry.create(mode="bootstrap", source=source)
        await self.full_reindex(run, source=source, prune=False)
        return {
            "skipped": False,
            "runId": run.runId,
            "status": run.status,
            "documents": run.indexed,
            "source": run.source,
            **ensure,
        }


_indexer: Indexer | None = None


def get_indexer() -> Indexer:
    """Process-wide indexer singleton."""
    global _indexer
    if _indexer is None:
        _indexer = Indexer()
    return _indexer


def reset_indexer() -> None:
    """Drop the singleton (used on shutdown and in tests)."""
    global _indexer
    _indexer = None
