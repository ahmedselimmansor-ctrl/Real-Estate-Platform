"""Writes and lookups for ``rag_documents`` / ``rag_chunks``.

Ingestion is **idempotent**: a document is keyed by ``(source_type, source_id)``
and carries a SHA-256 ``checksum`` of everything that would change its chunks.
Re-ingesting an unchanged document is a no-op; a changed one has its chunks
replaced inside a single transaction.

The two hot statements are written as explicit SQL rather than ORM inserts so
the ``jsonb`` and ``vector`` casts are unambiguous under both asyncpg (runtime)
and psycopg (Alembic).
"""

from __future__ import annotations

import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

import orjson
from sqlalchemy import delete, func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import RagChunk, RagDocument
from app.db.sql import to_vector_param, vector_param

_UPSERT_DOCUMENT_SQL = text(
    """
    INSERT INTO rag_documents
        (id, source_type, source_id, uri, title, lang, checksum, metadata,
         created_at, updated_at)
    VALUES
        (:id, :source_type, :source_id, :uri, :title, :lang, :checksum,
         CAST(:metadata AS jsonb), :now, :now)
    ON CONFLICT (source_type, source_id) DO UPDATE SET
        uri        = EXCLUDED.uri,
        title      = EXCLUDED.title,
        lang       = EXCLUDED.lang,
        checksum   = EXCLUDED.checksum,
        metadata   = EXCLUDED.metadata,
        updated_at = EXCLUDED.updated_at
    RETURNING id
    """
)

_INSERT_CHUNK_SQL = text(
    f"""
    INSERT INTO rag_chunks
        (id, document_id, ordinal, content, token_count, metadata, embedding, created_at)
    VALUES
        (:id, :document_id, :ordinal, :content, :token_count,
         CAST(:metadata AS jsonb), {vector_param("embedding")}, :created_at)
    """
)


@dataclass(slots=True)
class StoredDocument:
    """The persisted state of one document, used to decide re-embedding."""

    id: uuid.UUID
    checksum: str
    chunk_count: int


@dataclass(slots=True)
class ChunkRow:
    """A chunk about to be written."""

    ordinal: int
    content: str
    token_count: int
    metadata: dict[str, Any]
    embedding: list[float] | None


class DocumentRepository:
    """All ``rag_documents`` / ``rag_chunks`` persistence."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    # --- reads ------------------------------------------------------------
    async def stored_state(self, source_type: str) -> dict[str, StoredDocument]:
        """``source_id -> (id, checksum, chunk_count)`` for one source type."""
        stmt = (
            select(
                RagDocument.id,
                RagDocument.source_id,
                RagDocument.checksum,
                func.count(RagChunk.id),
            )
            .select_from(RagDocument)
            .outerjoin(RagChunk, RagChunk.document_id == RagDocument.id)
            .where(RagDocument.source_type == source_type)
            .group_by(RagDocument.id, RagDocument.source_id, RagDocument.checksum)
        )
        rows = (await self._session.execute(stmt)).all()
        return {
            str(source_id): StoredDocument(
                id=document_id, checksum=checksum, chunk_count=int(chunk_count)
            )
            for document_id, source_id, checksum, chunk_count in rows
        }

    async def get(self, source_type: str, source_id: str) -> RagDocument | None:
        stmt = select(RagDocument).where(
            RagDocument.source_type == source_type,
            RagDocument.source_id == source_id,
        )
        return (await self._session.execute(stmt)).scalar_one_or_none()

    async def counts(self) -> dict[str, int]:
        """Corpus size — used by /health/ready and the ingest status endpoint."""
        documents = await self._session.scalar(select(func.count(RagDocument.id))) or 0
        chunks = await self._session.scalar(select(func.count(RagChunk.id))) or 0
        embedded = (
            await self._session.scalar(
                select(func.count(RagChunk.id)).where(RagChunk.embedding.isnot(None))
            )
            or 0
        )
        return {
            "documents": int(documents),
            "chunks": int(chunks),
            "embeddedChunks": int(embedded),
        }

    async def counts_by_source(self) -> dict[str, int]:
        stmt = select(RagDocument.source_type, func.count(RagDocument.id)).group_by(
            RagDocument.source_type
        )
        rows = (await self._session.execute(stmt)).all()
        return {str(source_type): int(count) for source_type, count in rows}

    # --- writes -----------------------------------------------------------
    async def upsert_document(
        self,
        *,
        source_type: str,
        source_id: str,
        title: str,
        lang: str,
        checksum: str,
        uri: str | None,
        metadata: dict[str, Any],
    ) -> uuid.UUID:
        """Insert or update one document row, returning its id."""
        document_id = await self._session.scalar(
            _UPSERT_DOCUMENT_SQL,
            {
                "id": uuid.uuid4(),
                "source_type": source_type,
                "source_id": source_id,
                "uri": uri,
                "title": title,
                "lang": lang,
                "checksum": checksum,
                "metadata": orjson.dumps(metadata or {}).decode("utf-8"),
                "now": datetime.now(UTC),
            },
        )
        if document_id is None:  # pragma: no cover - RETURNING always yields a row
            raise RuntimeError(f"Failed to upsert document {source_type}:{source_id}")
        return document_id

    async def delete_chunks(self, document_id: uuid.UUID) -> int:
        result = await self._session.execute(
            delete(RagChunk).where(RagChunk.document_id == document_id)
        )
        return int(result.rowcount or 0)

    async def replace_chunks(self, document_id: uuid.UUID, chunks: Sequence[ChunkRow]) -> int:
        """Atomically swap a document's chunks for ``chunks``."""
        await self.delete_chunks(document_id)
        if not chunks:
            return 0
        now = datetime.now(UTC)
        payload = [
            {
                "id": uuid.uuid4(),
                "document_id": document_id,
                "ordinal": chunk.ordinal,
                "content": chunk.content,
                "token_count": chunk.token_count,
                "metadata": orjson.dumps(chunk.metadata or {}).decode("utf-8"),
                "embedding": to_vector_param(chunk.embedding),
                "created_at": now,
            }
            for chunk in chunks
        ]
        await self._session.execute(_INSERT_CHUNK_SQL, payload)
        return len(payload)

    async def delete_document(self, source_type: str, source_id: str) -> bool:
        result = await self._session.execute(
            delete(RagDocument).where(
                RagDocument.source_type == source_type,
                RagDocument.source_id == source_id,
            )
        )
        return bool(result.rowcount)

    async def prune(self, source_type: str, keep_source_ids: Sequence[str]) -> int:
        """Delete documents of ``source_type`` the loader no longer produces."""
        stmt = delete(RagDocument).where(RagDocument.source_type == source_type)
        if keep_source_ids:
            stmt = stmt.where(RagDocument.source_id.notin_(list(keep_source_ids)))
        result = await self._session.execute(stmt)
        return int(result.rowcount or 0)
