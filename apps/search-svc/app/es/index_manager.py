"""Index lifecycle: create, zero-downtime reindex, alias swap, delete, stats.

The write/read target is always the alias (`ES_INDEX`, default ``properties``)
which points at a concrete versioned index (`ES_INDEX_VERSION`, default
``properties_v1``). A rebuild creates ``properties_v2``, fills it, swaps the
alias atomically and drops the old index — readers never see an empty index.
"""

from __future__ import annotations

import re
import time
from collections.abc import Awaitable, Callable
from typing import Any

from elasticsearch import AsyncElasticsearch, NotFoundError, TransportError

from app.core.config import Settings, get_settings
from app.core.logging import get_logger
from app.es import mapping as mapping_module
from app.es.mapping import index_mappings, index_settings

log = get_logger("search-svc.index")

_VERSION_SUFFIX = re.compile(r"^(?P<base>.+)_v(?P<version>\d+)$")

#: Optional callable used to fill a freshly created index from the source of
#: truth (Mongo/seed). Receives the concrete index name, returns a doc count.
Populator = Callable[[str], Awaitable[int]]


def next_version_name(index_name: str) -> str:
    """`properties_v1` -> `properties_v2`; `properties` -> `properties_v2`."""
    match = _VERSION_SUFFIX.match(index_name)
    if match:
        return f"{match.group('base')}_v{int(match.group('version')) + 1}"
    return f"{index_name}_v2"


def index_version_number(index_name: str) -> int:
    match = _VERSION_SUFFIX.match(index_name)
    return int(match.group("version")) if match else 1


class IndexManager:
    """All index/alias administration for the `properties` search index."""

    def __init__(
        self,
        es: AsyncElasticsearch,
        *,
        settings: Settings | None = None,
        alias: str | None = None,
        version_index: str | None = None,
    ) -> None:
        cfg = settings or get_settings()
        self.es = es
        self.settings = cfg
        self.alias = alias or cfg.ES_INDEX
        self.version_index = version_index or cfg.ES_INDEX_VERSION

    # ------------------------------------------------------------- inspection

    async def index_exists(self, index_name: str) -> bool:
        return bool(await self.es.indices.exists(index=index_name))

    async def alias_exists(self) -> bool:
        return bool(await self.es.indices.exists_alias(name=self.alias))

    async def resolve_alias(self) -> str | None:
        """Concrete index currently behind the alias (None when unset)."""
        try:
            response = await self.es.indices.get_alias(name=self.alias)
        except NotFoundError:
            return None
        names = sorted(dict(response).keys())
        return names[0] if names else None

    async def write_index(self) -> str:
        """Index that documents should be written to right now."""
        return await self.resolve_alias() or self.version_index

    async def document_count(self, index_name: str | None = None) -> int:
        target = index_name or self.alias
        try:
            response = await self.es.count(index=target)
        except NotFoundError:
            return 0
        return int(dict(response).get("count", 0))

    # --------------------------------------------------------------- creation

    def _create_body(self, *, with_alias: bool) -> dict[str, Any]:
        body: dict[str, Any] = {
            "settings": index_settings(
                number_of_shards=self.settings.ES_NUMBER_OF_SHARDS,
                number_of_replicas=self.settings.ES_NUMBER_OF_REPLICAS,
            ),
            "mappings": index_mappings(),
        }
        if with_alias:
            body["aliases"] = {self.alias: {}}
        return body

    async def create_index(self, index_name: str, *, with_alias: bool = False) -> bool:
        """Create `index_name` from the contract mapping. Returns False if it existed."""
        if await self.index_exists(index_name):
            log.info("index_exists", index=index_name)
            return False
        body = self._create_body(with_alias=with_alias)
        await self.es.indices.create(
            index=index_name,
            settings=body["settings"],
            mappings=body["mappings"],
            aliases=body.get("aliases"),
        )
        log.info("index_created", index=index_name, alias=self.alias if with_alias else None)
        return True

    async def ensure_index(self) -> dict[str, Any]:
        """Idempotent bootstrap: guarantee `alias -> concrete index` exists."""
        if await self.alias_exists():
            current = await self.resolve_alias()
            log.info("index_ready", alias=self.alias, index=current)
            return {"created": False, "alias": self.alias, "index": current}

        # An index literally named like the alias would block alias creation.
        if await self.index_exists(self.alias):
            log.warning("alias_name_taken_by_index", name=self.alias)
            return {"created": False, "alias": None, "index": self.alias}

        if await self.index_exists(self.version_index):
            await self.swap_alias(self.version_index)
            log.info("alias_attached", alias=self.alias, index=self.version_index)
            return {"created": False, "alias": self.alias, "index": self.version_index}

        await self.create_index(self.version_index, with_alias=True)
        return {"created": True, "alias": self.alias, "index": self.version_index}

    # ---------------------------------------------------------------- aliases

    async def swap_alias(self, new_index: str, *, remove_from: str | None = None) -> list[str]:
        """Atomically point the alias at `new_index`, detaching every other index."""
        actions: list[dict[str, Any]] = []
        detached: list[str] = []

        try:
            current = dict(await self.es.indices.get_alias(name=self.alias))
        except NotFoundError:
            current = {}

        for index_name in current:
            if index_name == new_index:
                continue
            if remove_from is not None and index_name != remove_from:
                continue
            actions.append({"remove": {"index": index_name, "alias": self.alias}})
            detached.append(index_name)

        actions.append({"add": {"index": new_index, "alias": self.alias}})
        await self.es.indices.update_aliases(actions=actions)
        log.info("alias_swapped", alias=self.alias, index=new_index, detached=detached)
        return detached

    # -------------------------------------------------------------- rebuilds

    async def reindex_documents(
        self,
        source_index: str,
        target_index: str,
        *,
        wait_for_completion: bool = True,
    ) -> dict[str, Any]:
        """Server-side `_reindex` from one concrete index into another."""
        response = await self.es.options(
            request_timeout=self.settings.ES_BULK_TIMEOUT
        ).reindex(
            source={"index": source_index},
            dest={"index": target_index},
            wait_for_completion=wait_for_completion,
            refresh=True,
        )
        result = dict(response)
        log.info(
            "reindex_completed",
            source=source_index,
            target=target_index,
            created=result.get("created"),
            total=result.get("total"),
            failures=len(result.get("failures", []) or []),
        )
        return result

    async def zero_downtime_reindex(
        self,
        *,
        populate: Populator | None = None,
        drop_old: bool = True,
    ) -> dict[str, Any]:
        """Rebuild the index into a new version and swap the alias atomically.

        `populate` (when given) fills the new index from the source of truth —
        Mongo or the seed dataset. Otherwise documents are copied with the
        Elasticsearch `_reindex` API.
        """
        started = time.perf_counter()
        source_index = await self.resolve_alias()
        if source_index is None:
            await self.ensure_index()
            source_index = await self.resolve_alias() or self.version_index

        target_index = next_version_name(source_index)
        if await self.index_exists(target_index):
            log.warning("stale_target_index_deleted", index=target_index)
            await self.delete_index(target_index)

        await self.create_index(target_index, with_alias=False)

        if populate is not None:
            indexed = await populate(target_index)
            copied_from = "source-of-truth"
        else:
            result = await self.reindex_documents(source_index, target_index)
            indexed = int(result.get("created", 0) or 0)
            copied_from = source_index

        await self.es.indices.refresh(index=target_index)
        detached = await self.swap_alias(target_index)

        deleted: list[str] = []
        if drop_old:
            for old_index in detached:
                if old_index != target_index:
                    await self.delete_index(old_index)
                    deleted.append(old_index)

        report = {
            "alias": self.alias,
            "previousIndex": source_index,
            "newIndex": target_index,
            "documents": indexed,
            "copiedFrom": copied_from,
            "deletedIndices": deleted,
            "durationMs": int((time.perf_counter() - started) * 1000),
        }
        log.info("zero_downtime_reindex_done", **report)
        return report

    # ---------------------------------------------------------------- delete

    async def delete_index(self, index_name: str) -> bool:
        """Delete a concrete index (no-op when absent)."""
        try:
            await self.es.indices.delete(index=index_name, ignore_unavailable=True)
        except NotFoundError:
            return False
        log.info("index_deleted", index=index_name)
        return True

    async def refresh(self, index_name: str | None = None) -> None:
        try:
            await self.es.indices.refresh(index=index_name or self.alias)
        except NotFoundError:  # pragma: no cover - index not created yet
            log.warning("refresh_skipped_missing_index", index=index_name or self.alias)

    # ----------------------------------------------------------------- stats

    async def stats(self) -> dict[str, Any]:
        """Health/stats report: doc count, store size, alias target, mapping fields."""
        report: dict[str, Any] = {
            "alias": self.alias,
            "index": None,
            "exists": False,
            "documents": 0,
            "deletedDocuments": 0,
            "sizeBytes": 0,
            "sizeMb": 0.0,
            "health": "unknown",
            "mappedFields": len(mapping_module.PROPERTIES),
            "indexVersion": self.version_index,
        }

        try:
            current = await self.resolve_alias()
            if current is None and await self.index_exists(self.version_index):
                current = self.version_index
            report["index"] = current
            if current is None:
                return report

            report["exists"] = True
            report["documents"] = await self.document_count(current)

            stats_response = dict(await self.es.indices.stats(index=current, metric="docs,store"))
            totals = stats_response.get("_all", {}).get("primaries", {}) or {}
            docs = totals.get("docs", {}) or {}
            store = totals.get("store", {}) or {}
            report["deletedDocuments"] = int(docs.get("deleted", 0) or 0)
            size_bytes = int(store.get("size_in_bytes", 0) or 0)
            report["sizeBytes"] = size_bytes
            report["sizeMb"] = round(size_bytes / (1024 * 1024), 3)

            health = dict(await self.es.cluster.health(index=current))
            report["health"] = health.get("status", "unknown")
            report["shards"] = health.get("active_shards", 0)
            report["indexVersionNumber"] = index_version_number(current)
        except (NotFoundError, TransportError, OSError) as exc:
            log.warning("index_stats_failed", error=str(exc))
            report["error"] = str(exc)

        return report

    async def health(self) -> dict[str, Any]:
        """Compact readiness view used by `/health` and `/api/search/index/health`."""
        stats = await self.stats()
        ready = bool(stats.get("exists")) and stats.get("health") in {"green", "yellow"}
        return {"ready": ready, **stats}
