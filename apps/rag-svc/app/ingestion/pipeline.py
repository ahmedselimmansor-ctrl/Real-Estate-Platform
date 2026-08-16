"""The ingestion pipeline: load -> chunk -> embed -> upsert.

One :class:`IngestionPipeline` instance is created at startup and reused by the
background task behind ``POST /api/chat/ingest``. It is deliberately boring:

* **idempotent** — documents are keyed by ``(source_type, source_id)`` and
  skipped when their checksum is unchanged, so re-running an ingest is cheap and
  never duplicates chunks;
* **batched** — chunks are embedded in provider-sized batches across document
  boundaries (the provider itself caps each HTTP call at 10 inputs and bounds
  its own concurrency), so a 180-listing corpus is a few dozen calls;
* **observable** — progress is flushed into ``ingestion_runs.stats`` as it goes,
  which is what ``GET /api/chat/ingest/status/{runId}`` returns;
* **crash-tolerant** — a failing document is recorded and the run continues,
  ending as ``partial`` rather than losing the whole corpus.
"""

from __future__ import annotations

import asyncio
import time
import uuid
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

from sqlalchemy.exc import SQLAlchemyError

from app.core.config import Settings, get_settings
from app.core.errors import ApiError
from app.core.logging import get_logger
from app.db.repositories.documents import ChunkRow, DocumentRepository
from app.db.repositories.ingestion_runs import IngestionRunRepository
from app.db.session import Database, get_database
from app.ingestion.chunker import Chunk, TokenAwareChunker
from app.ingestion.documents import RawDocument
from app.ingestion.loaders import IngestOptions, expand_sources, get_loader
from app.providers.registry import ProviderBundle, build_providers

logger = get_logger("rag-svc.ingestion")

#: Only one run per source may mutate the corpus at a time.
_source_locks: dict[str, asyncio.Lock] = defaultdict(asyncio.Lock)

MAX_RECORDED_ERRORS = 10


@dataclass(slots=True)
class SourceStats:
    """Per-source counters merged into ``ingestion_runs.stats``."""

    documents: int = 0
    ingested: int = 0
    skipped: int = 0
    failed: int = 0
    pruned: int = 0
    chunks: int = 0
    embedded: int = 0
    tokens: int = 0

    def as_dict(self) -> dict[str, int]:
        return {
            "documents": self.documents,
            "ingested": self.ingested,
            "skipped": self.skipped,
            "failed": self.failed,
            "pruned": self.pruned,
            "chunks": self.chunks,
            "embeddedChunks": self.embedded,
            "embeddingTokens": self.tokens,
        }


@dataclass(slots=True)
class RunStats:
    """Aggregated view of one ingestion run."""

    started_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    sources: dict[str, SourceStats] = field(default_factory=dict)
    errors: list[dict[str, str]] = field(default_factory=list)
    provider: dict[str, Any] = field(default_factory=dict)
    _started_monotonic: float = field(default_factory=time.perf_counter)

    def for_source(self, source: str) -> SourceStats:
        return self.sources.setdefault(source, SourceStats())

    def record_error(self, source: str, document: str, error: str) -> None:
        if len(self.errors) < MAX_RECORDED_ERRORS:
            self.errors.append({"source": source, "document": document, "error": error[:500]})

    def totals(self) -> dict[str, int]:
        totals = SourceStats()
        for stats in self.sources.values():
            totals.documents += stats.documents
            totals.ingested += stats.ingested
            totals.skipped += stats.skipped
            totals.failed += stats.failed
            totals.pruned += stats.pruned
            totals.chunks += stats.chunks
            totals.embedded += stats.embedded
            totals.tokens += stats.tokens
        return totals.as_dict()

    def as_dict(self) -> dict[str, Any]:
        return {
            "totals": self.totals(),
            "sources": {name: stats.as_dict() for name, stats in self.sources.items()},
            "provider": self.provider,
            "errors": self.errors,
            "startedAt": self.started_at.isoformat(),
            "updatedAt": datetime.now(UTC).isoformat(),
            "elapsedMs": int((time.perf_counter() - self._started_monotonic) * 1000),
        }


class IngestionPipeline:
    """Runs one ingest request end to end."""

    def __init__(
        self,
        database: Database | None = None,
        providers: ProviderBundle | None = None,
        settings: Settings | None = None,
        chunker: TokenAwareChunker | None = None,
    ) -> None:
        self._settings = settings or get_settings()
        self._database = database or get_database()
        self._providers = providers or build_providers(self._settings)
        self._chunker = chunker or TokenAwareChunker(settings=self._settings)
        self._flush_size = max(
            1,
            self._settings.rag_embedding_batch_size * self._settings.rag_embedding_concurrency,
        )

    # --- public API -------------------------------------------------------
    async def run(self, run_id: uuid.UUID, source: str, options: IngestOptions) -> dict[str, Any]:
        """Execute the run and persist its outcome. Never raises."""
        stats = RunStats(
            provider={
                "embeddings": self._providers.embeddings.name,
                "model": self._providers.embeddings.model,
                "degraded": not self._providers.embeddings.available,
            }
        )
        try:
            sources = expand_sources(source)
        except ApiError as exc:
            await self._finish(run_id, "failed", stats, exc.message)
            return stats.as_dict()

        await self._mark_running(run_id, stats)
        logger.info("ingestion_started", run_id=str(run_id), source=source, sources=sources)

        succeeded = 0
        for name in sources:
            async with _source_locks[name]:
                try:
                    await self._ingest_source(run_id, name, options, stats)
                    succeeded += 1
                except ApiError as exc:
                    logger.warning(
                        "ingestion_source_failed",
                        run_id=str(run_id),
                        source=name,
                        code=exc.code,
                        error=exc.message,
                    )
                    stats.record_error(name, "-", f"{exc.code}: {exc.message}")
                except (SQLAlchemyError, OSError, ValueError) as exc:
                    logger.error(
                        "ingestion_source_failed",
                        run_id=str(run_id),
                        source=name,
                        error=str(exc),
                        error_type=type(exc).__name__,
                    )
                    stats.record_error(name, "-", f"{type(exc).__name__}: {exc}")

        totals = stats.totals()
        if succeeded == 0:
            status = "failed"
        elif stats.errors or totals["failed"]:
            status = "partial"
        else:
            status = "succeeded"

        error = stats.errors[0]["error"] if status == "failed" and stats.errors else None
        await self._finish(run_id, status, stats, error)
        logger.info(
            "ingestion_finished",
            run_id=str(run_id),
            source=source,
            status=status,
            **totals,
        )
        return stats.as_dict()

    # --- per-source -------------------------------------------------------
    async def _ingest_source(
        self,
        run_id: uuid.UUID,
        source: str,
        options: IngestOptions,
        stats: RunStats,
    ) -> None:
        loader = get_loader(source)
        source_stats = stats.for_source(source)

        documents = await loader.load(options)
        source_stats.documents = len(documents)
        await self._write_stats(run_id, stats)

        async with self._database.session() as session:
            repository = DocumentRepository(session)
            stored = await repository.stored_state(loader.source_type)

        pending: list[tuple[RawDocument, list[Chunk]]] = []
        pending_chunks = 0
        seen_ids: list[str] = []

        for document in documents:
            seen_ids.append(document.source_id)
            if document.is_empty():
                source_stats.skipped += 1
                continue

            existing = stored.get(document.source_id)
            if (
                existing is not None
                and not options.force
                and existing.checksum == document.checksum
                and existing.chunk_count > 0
            ):
                source_stats.skipped += 1
                continue

            chunks = self._chunker.split(document.text, metadata=document.metadata)
            if not chunks:
                source_stats.skipped += 1
                continue

            pending.append((document, chunks))
            pending_chunks += len(chunks)

            if pending_chunks >= self._flush_size:
                await self._flush(run_id, source, pending, stats, source_stats)
                pending, pending_chunks = [], 0

        if pending:
            await self._flush(run_id, source, pending, stats, source_stats)

        if options.prune and loader.prunable and not options.ids and not options.limit:
            async with self._database.session() as session:
                removed = await DocumentRepository(session).prune(loader.source_type, seen_ids)
            source_stats.pruned = removed
            if removed:
                logger.info("ingestion_pruned", source=source, removed=removed)

        await self._write_stats(run_id, stats)

    # --- embedding + write ------------------------------------------------
    async def _flush(
        self,
        run_id: uuid.UUID,
        source: str,
        batch: list[tuple[RawDocument, list[Chunk]]],
        stats: RunStats,
        source_stats: SourceStats,
    ) -> None:
        """Embed one batch of chunks and persist the documents that own them."""
        texts = [chunk.content for _, chunks in batch for chunk in chunks]
        vectors: list[list[float] | None]
        try:
            result = await self._providers.embeddings.embed_documents(texts)
            vectors = list(result.vectors)
            source_stats.tokens += result.total_tokens
        except ApiError as exc:
            logger.error(
                "embedding_batch_failed",
                run_id=str(run_id),
                source=source,
                chunks=len(texts),
                error=exc.message,
            )
            for document, _ in batch:
                source_stats.failed += 1
                stats.record_error(source, document.describe(), exc.message)
            return

        if len(vectors) != len(texts):  # pragma: no cover - provider guarantees parity
            logger.error(
                "embedding_count_mismatch",
                expected=len(texts),
                received=len(vectors),
                source=source,
            )
            vectors = (vectors + [None] * len(texts))[: len(texts)]

        cursor = 0
        for document, chunks in batch:
            document_vectors = vectors[cursor : cursor + len(chunks)]
            cursor += len(chunks)
            try:
                await self._persist(document, chunks, document_vectors)
            except (SQLAlchemyError, OSError) as exc:
                source_stats.failed += 1
                stats.record_error(source, document.describe(), f"{type(exc).__name__}: {exc}")
                logger.error(
                    "document_persist_failed",
                    source=source,
                    document=document.describe(),
                    error=str(exc),
                )
                continue

            source_stats.ingested += 1
            source_stats.chunks += len(chunks)
            source_stats.embedded += sum(1 for vector in document_vectors if vector)

        await self._write_stats(run_id, stats)

    async def _persist(
        self,
        document: RawDocument,
        chunks: list[Chunk],
        vectors: list[list[float] | None],
    ) -> None:
        rows = [
            ChunkRow(
                ordinal=chunk.ordinal,
                content=chunk.content,
                token_count=chunk.token_count,
                metadata=chunk.metadata,
                embedding=vector,
            )
            for chunk, vector in zip(chunks, vectors, strict=True)
        ]
        async with self._database.session() as session:
            repository = DocumentRepository(session)
            document_id = await repository.upsert_document(
                source_type=document.source_type,
                source_id=document.source_id,
                title=document.title,
                lang=document.lang,
                checksum=document.checksum,
                uri=document.uri,
                metadata=document.metadata,
            )
            await repository.replace_chunks(document_id, rows)

    # --- run bookkeeping --------------------------------------------------
    async def _mark_running(self, run_id: uuid.UUID, stats: RunStats) -> None:
        try:
            async with self._database.session() as session:
                await IngestionRunRepository(session).mark_running(run_id, stats.as_dict())
        except (SQLAlchemyError, OSError) as exc:  # pragma: no cover - bookkeeping only
            logger.warning("ingestion_run_update_failed", run_id=str(run_id), error=str(exc))

    async def _write_stats(self, run_id: uuid.UUID, stats: RunStats) -> None:
        try:
            async with self._database.session() as session:
                await IngestionRunRepository(session).update_stats(run_id, stats.as_dict())
        except (SQLAlchemyError, OSError) as exc:  # pragma: no cover - bookkeeping only
            logger.warning("ingestion_run_update_failed", run_id=str(run_id), error=str(exc))

    async def _finish(
        self, run_id: uuid.UUID, status: str, stats: RunStats, error: str | None
    ) -> None:
        try:
            async with self._database.session() as session:
                await IngestionRunRepository(session).finish(
                    run_id, status=status, stats=stats.as_dict(), error=error
                )
        except (SQLAlchemyError, OSError) as exc:  # pragma: no cover - bookkeeping only
            logger.error("ingestion_run_finish_failed", run_id=str(run_id), error=str(exc))
