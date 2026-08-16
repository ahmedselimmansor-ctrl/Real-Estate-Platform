"""``ingestion_runs`` — one row per POST /api/chat/ingest (CONTRACT §2, §6)."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, Index, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, uuid_pk

#: Lifecycle of an ingestion run.
RUN_STATUSES = ("pending", "running", "succeeded", "partial", "failed")

TERMINAL_RUN_STATUSES = ("succeeded", "partial", "failed")


class IngestionRun(Base):
    """Progress and outcome of a knowledge-base ingestion job."""

    __tablename__ = "ingestion_runs"

    id: Mapped[uuid.UUID] = uuid_pk()
    source: Mapped[str] = mapped_column(String(32), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="pending")
    stats: Mapped[dict] = mapped_column(
        JSONB, nullable=False, default=dict, server_default="{}"
    )
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        CheckConstraint(
            "status IN ('pending', 'running', 'succeeded', 'partial', 'failed')",
            name="status",
        ),
        Index("ix_ingestion_runs_source_started_at", "source", "started_at"),
        Index("ix_ingestion_runs_status", "status"),
    )

    @property
    def is_terminal(self) -> bool:
        return self.status in TERMINAL_RUN_STATUSES
