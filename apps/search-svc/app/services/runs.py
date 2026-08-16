"""Bookkeeping for background (re)index runs.

Runs are kept in a small in-process ring buffer and mirrored into Redis under
the `cache:search:*` namespace so `GET /api/search/index/health` can report the
last run even after a reload.
"""

from __future__ import annotations

import uuid
from collections import OrderedDict
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime
from typing import Any, Literal

from app.core.logging import get_logger
from app.core.redis import REINDEX_BOOKKEEPING_PREFIX, cache_get, cache_set

log = get_logger("search-svc.runs")

RunStatus = Literal["queued", "running", "completed", "failed"]
RunMode = Literal["full", "partial", "bootstrap", "zero_downtime"]

#: Protected from the post-reindex cache flush — see `app.core.redis`.
RUN_KEY_PREFIX = REINDEX_BOOKKEEPING_PREFIX
LAST_RUN_KEY = f"{RUN_KEY_PREFIX}:last"
RUN_TTL_SECONDS = 3600
_MAX_TRACKED_RUNS = 50


def _utc_now_iso() -> str:
    return datetime.now(tz=UTC).isoformat().replace("+00:00", "Z")


@dataclass
class RunReport:
    """State of one indexing run."""

    runId: str = field(default_factory=lambda: str(uuid.uuid4()))
    mode: RunMode = "full"
    status: RunStatus = "queued"
    source: str = "mongo"
    index: str | None = None
    total: int = 0
    indexed: int = 0
    failed: int = 0
    deleted: int = 0
    startedAt: str = field(default_factory=_utc_now_iso)
    finishedAt: str | None = None
    durationMs: int | None = None
    error: str | None = None
    details: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    def mark_running(self) -> None:
        self.status = "running"
        self.startedAt = _utc_now_iso()

    def mark_completed(self) -> None:
        self.status = "completed"
        self._finish()

    def mark_failed(self, error: str) -> None:
        self.status = "failed"
        self.error = error
        self._finish()

    def _finish(self) -> None:
        self.finishedAt = _utc_now_iso()
        try:
            started = datetime.fromisoformat(self.startedAt.replace("Z", "+00:00"))
            finished = datetime.fromisoformat(self.finishedAt.replace("Z", "+00:00"))
            self.durationMs = int((finished - started).total_seconds() * 1000)
        except ValueError:  # pragma: no cover - defensive
            self.durationMs = None


class RunRegistry:
    """In-memory registry (most recent runs) with Redis mirroring."""

    def __init__(self, max_runs: int = _MAX_TRACKED_RUNS) -> None:
        self._runs: OrderedDict[str, RunReport] = OrderedDict()
        self._max_runs = max_runs

    def create(self, *, mode: RunMode = "full", source: str = "mongo") -> RunReport:
        report = RunReport(mode=mode, source=source)
        self._runs[report.runId] = report
        while len(self._runs) > self._max_runs:
            self._runs.popitem(last=False)
        return report

    def get(self, run_id: str) -> RunReport | None:
        return self._runs.get(run_id)

    def latest(self) -> RunReport | None:
        if not self._runs:
            return None
        return next(reversed(self._runs.values()))

    def all(self) -> list[RunReport]:
        return list(reversed(self._runs.values()))

    async def persist(self, report: RunReport) -> None:
        """Best-effort mirror into Redis (never fails a run)."""
        payload = report.to_dict()
        await cache_set(f"{RUN_KEY_PREFIX}:{report.runId}", payload, RUN_TTL_SECONDS)
        await cache_set(LAST_RUN_KEY, payload, RUN_TTL_SECONDS)
        log.debug("run_persisted", run_id=report.runId, status=report.status)

    async def load(self, run_id: str) -> dict[str, Any] | None:
        report = self.get(run_id)
        if report is not None:
            return report.to_dict()
        cached = await cache_get(f"{RUN_KEY_PREFIX}:{run_id}")
        return cached if isinstance(cached, dict) else None

    async def load_latest(self) -> dict[str, Any] | None:
        report = self.latest()
        if report is not None:
            return report.to_dict()
        cached = await cache_get(LAST_RUN_KEY)
        return cached if isinstance(cached, dict) else None


#: Process-wide registry.
run_registry = RunRegistry()
