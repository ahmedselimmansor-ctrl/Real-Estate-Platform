"""Knowledge-base tables: ``rag_documents`` and ``rag_chunks`` (CONTRACT §2)."""

from __future__ import annotations

import uuid
from datetime import datetime

from pgvector.sqlalchemy import Vector
from sqlalchemy import ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.config import VECTOR_DIM
from app.db.base import Base, created_at_column, updated_at_column, uuid_pk

#: ``rag_documents.source_type`` values produced by the ingestion loaders.
SOURCE_TYPES = ("property", "faq", "compound", "developer", "area", "url")


class RagDocument(Base):
    """A logical source document (one listing, one FAQ entry, one page…)."""

    __tablename__ = "rag_documents"

    id: Mapped[uuid.UUID] = uuid_pk()
    source_type: Mapped[str] = mapped_column(String(32), nullable=False)
    source_id: Mapped[str] = mapped_column(String(255), nullable=False)
    uri: Mapped[str | None] = mapped_column(Text, nullable=True)
    title: Mapped[str] = mapped_column(Text, nullable=False, default="")
    lang: Mapped[str] = mapped_column(String(8), nullable=False, default="en")
    checksum: Mapped[str] = mapped_column(String(64), nullable=False)
    meta: Mapped[dict] = mapped_column(
        "metadata", JSONB, nullable=False, default=dict, server_default="{}"
    )
    created_at: Mapped[datetime] = created_at_column()
    updated_at: Mapped[datetime] = updated_at_column()

    # Async sessions never lazy-load: relationships must be requested explicitly
    # (selectinload / joins), otherwise SQLAlchemy raises instead of emitting IO
    # from a non-greenlet context.
    chunks: Mapped[list[RagChunk]] = relationship(
        back_populates="document",
        cascade="all, delete-orphan",
        passive_deletes=True,
        lazy="raise",
    )

    __table_args__ = (
        UniqueConstraint("source_type", "source_id", name="uq_rag_documents_source"),
        Index("ix_rag_documents_source_type", "source_type"),
        Index("ix_rag_documents_checksum", "checksum"),
        Index("ix_rag_documents_lang", "lang"),
    )

    def __repr__(self) -> str:  # pragma: no cover - debug helper
        return f"<RagDocument {self.source_type}:{self.source_id} lang={self.lang}>"


class RagChunk(Base):
    """An embedded slice of a :class:`RagDocument`."""

    __tablename__ = "rag_chunks"

    id: Mapped[uuid.UUID] = uuid_pk()
    document_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("rag_documents.id", ondelete="CASCADE"), nullable=False
    )
    ordinal: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    token_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    meta: Mapped[dict] = mapped_column(
        "metadata", JSONB, nullable=False, default=dict, server_default="{}"
    )
    embedding: Mapped[list[float] | None] = mapped_column(Vector(VECTOR_DIM), nullable=True)
    created_at: Mapped[datetime] = created_at_column()

    document: Mapped[RagDocument] = relationship(back_populates="chunks", lazy="raise")

    __table_args__ = (
        UniqueConstraint("document_id", "ordinal", name="uq_rag_chunks_document_ordinal"),
        Index("ix_rag_chunks_document_id", "document_id"),
    )

    def __repr__(self) -> str:  # pragma: no cover - debug helper
        return f"<RagChunk doc={self.document_id} #{self.ordinal} tokens={self.token_count}>"
