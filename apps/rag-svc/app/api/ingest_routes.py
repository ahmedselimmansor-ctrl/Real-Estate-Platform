"""Knowledge-base ingestion endpoints (CONTRACT §6).

    POST /api/chat/ingest                  [X-Service-Token]  -> 202 {runId}
    GET  /api/chat/ingest/status/{runId}   [X-Service-Token]  -> run progress

The POST returns immediately with a ``runId``; the work happens in a Starlette
background task on the same event loop, streaming progress into
``ingestion_runs.stats`` so the caller can poll it.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, Path, Request, status
from fastapi.responses import ORJSONResponse

from app.api.deps import Pipeline
from app.core.envelope import envelope
from app.core.errors import ApiError, NotFoundError
from app.core.logging import get_logger
from app.core.rate_limit import service_rate_limit
from app.core.security import require_service_token
from app.db.repositories.documents import DocumentRepository
from app.db.repositories.ingestion_runs import IngestionRunRepository
from app.db.session import get_database
from app.ingestion.loaders import expand_sources
from app.schemas.ingest import IngestRequest

logger = get_logger("rag-svc.api.ingest")

router = APIRouter(
    prefix="/ingest",
    tags=["ingestion"],
    dependencies=[Depends(require_service_token)],
)


@router.post(
    "",
    status_code=status.HTTP_202_ACCEPTED,
    response_class=ORJSONResponse,
    summary="Ingest a corpus into the vector store",
    dependencies=[Depends(service_rate_limit("chat:ingest"))],
)
async def start_ingestion(
    request: Request,
    payload: IngestRequest,
    background_tasks: BackgroundTasks,
    pipeline: Pipeline,
) -> ORJSONResponse:
    """Queue an ingestion run and return its ``runId`` immediately."""
    sources = expand_sources(payload.source)

    async with get_database().session() as session:
        runs = IngestionRunRepository(session)
        if not payload.force:
            for name in sources:
                active = await runs.active_for_source(name)
                if active is not None:
                    raise ApiError(
                        "INGESTION_IN_PROGRESS",
                        f"An ingestion run for '{name}' is already {active.status} "
                        f"(runId {active.id})",
                        status_code=409,
                        details=[active.as_dict()],
                    )
        run = await runs.create(
            payload.source,
            stats={
                "requested": {
                    "source": payload.source,
                    "sources": sources,
                    "ids": payload.ids,
                    "urls": payload.urls,
                    "langs": payload.langs,
                    "limit": payload.limit,
                    "force": payload.force,
                    "prune": payload.prune,
                },
                "queuedAt": datetime.now(UTC).isoformat(),
            },
        )

    background_tasks.add_task(pipeline.run, run.id, payload.source, payload.to_options())
    logger.info(
        "ingestion_queued",
        run_id=str(run.id),
        source=payload.source,
        sources=sources,
        request_id=getattr(request.state, "request_id", None),
    )

    data = {
        "runId": str(run.id),
        "source": payload.source,
        "status": run.status,
        "sources": sources,
        "statusUrl": f"/api/chat/ingest/status/{run.id}",
        "acceptedAt": datetime.now(UTC).isoformat(),
    }
    return ORJSONResponse(status_code=status.HTTP_202_ACCEPTED, content=envelope(data))


@router.get(
    "/status/{run_id}",
    response_class=ORJSONResponse,
    summary="Progress of an ingestion run",
)
async def ingestion_status(
    run_id: Annotated[uuid.UUID, Path(alias="run_id", description="Ingestion run id")],
) -> ORJSONResponse:
    async with get_database().session() as session:
        run = await IngestionRunRepository(session).get(run_id)
        if run is None:
            raise NotFoundError("INGESTION_RUN_NOT_FOUND", f"No ingestion run with id {run_id}")
        corpus = await DocumentRepository(session).counts()

    return ORJSONResponse(content=envelope({**run.as_dict(), "corpus": corpus}))


@router.get(
    "/runs",
    response_class=ORJSONResponse,
    summary="Recent ingestion runs",
)
async def recent_runs(source: str | None = None, limit: int = 20) -> ORJSONResponse:
    bounded = max(1, min(int(limit), 100))
    async with get_database().session() as session:
        runs = await IngestionRunRepository(session).list_recent(bounded, source)
        corpus = await DocumentRepository(session).counts()
        by_source = await DocumentRepository(session).counts_by_source()
    return ORJSONResponse(
        content=envelope(
            {
                "runs": [run.as_dict() for run in runs],
                "corpus": {**corpus, "bySourceType": by_source},
            }
        )
    )
