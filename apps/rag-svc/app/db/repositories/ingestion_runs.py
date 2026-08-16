"""``ingestion_runs`` bookkeeping (CONTRACT §2, §6).

Every POST /api/chat/ingest creates a row here immediately, so the caller gets a
``runId`` it can poll while the background task streams progress into ``stats``.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import IngestionRun


@dataclass(slots=True)
class RunView:
    """Serialisable projection of an :class:`IngestionRun`."""

    id: uuid.UUID
    source: str
    status: str
    stats: dict[str, Any]
    error: str | None
    started_at: datetime
    finished_at: datetime | None

    def as_dict(self) -> dict[str, Any]:
        return {
            "runId": str(self.id),
            "source": self.source,
            "status": self.status,
            "stats": self.stats or {},
            "error": self.error,
            "startedAt": self.started_at.isoformat() if self.started_at else None,
            "finishedAt": self.finished_at.isoformat() if self.finished_at else None,
        }


def to_view(run: IngestionRun) -> RunView:
    return RunView(
        id=run.id,
        source=run.source,
        status=run.status,
        stats=dict(run.stats or {}),
        error=run.error,
        started_at=run.started_at,
        finished_at=run.finished_at,
    )


class IngestionRunRepository:
    """Create, advance and read ingestion runs."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create(self, source: str, stats: dict[str, Any] | None = None) -> RunView:
        run = IngestionRun(
            id=uuid.uuid4(),
            source=source,
            status="pending",
            stats=stats or {},
            started_at=datetime.now(UTC),
        )
        self._session.add(run)
        await self._session.flush()
        return to_view(run)

    async def get(self, run_id: uuid.UUID) -> RunView | None:
        run = await self._session.get(IngestionRun, run_id)
        return to_view(run) if run is not None else None

    async def list_recent(self, limit: int = 20, source: str | None = None) -> list[RunView]:
        stmt = select(IngestionRun).order_by(IngestionRun.started_at.desc()).limit(limit)
        if source:
            stmt = stmt.where(IngestionRun.source == source)
        rows = (await self._session.execute(stmt)).scalars().all()
        return [to_view(run) for run in rows]

    async def active_for_source(self, source: str) -> RunView | None:
        """The newest still-running job for ``source``, if any."""
        stmt = (
            select(IngestionRun)
            .where(
                IngestionRun.source == source,
                IngestionRun.status.in_(("pending", "running")),
            )
            .order_by(IngestionRun.started_at.desc())
            .limit(1)
        )
        run = (await self._session.execute(stmt)).scalars().first()
        return to_view(run) if run is not None else None

    async def mark_running(self, run_id: uuid.UUID, stats: dict[str, Any] | None = None) -> None:
        values: dict[str, Any] = {"status": "running"}
        if stats is not None:
            values["stats"] = stats
        await self._session.execute(
            update(IngestionRun).where(IngestionRun.id == run_id).values(**values)
        )

    async def update_stats(self, run_id: uuid.UUID, stats: dict[str, Any]) -> None:
        await self._session.execute(
            update(IngestionRun).where(IngestionRun.id == run_id).values(stats=stats)
        )

    async def finish(
        self,
        run_id: uuid.UUID,
        *,
        status: str,
        stats: dict[str, Any],
        error: str | None = None,
    ) -> None:
        await self._session.execute(
            update(IngestionRun)
            .where(IngestionRun.id == run_id)
            .values(
                status=status,
                stats=stats,
                error=error,
                finished_at=datetime.now(UTC),
            )
        )
