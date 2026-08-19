"""Internal index administration (CONTRACT §6 — search-svc).

    POST   /api/search/reindex        [X-Service-Token]  full or {ids:[...]}
    POST   /api/search/index/{id}     [X-Service-Token]  upsert one
    DELETE /api/search/index/{id}     [X-Service-Token]  remove one
    GET    /api/search/index/health                      index stats

Reindex runs are executed in a `BackgroundTask` and identified by a `runId`;
`GET /index/health` reports the outcome of the most recent run.
"""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, BackgroundTasks, Body, Depends, Path, status
from fastapi.responses import ORJSONResponse

from app.api.deps import IndexerDep, IndexManagerDep, SettingsDep, admin_rate_limit
from app.core.config import API_PREFIX
from app.core.envelope import envelope
from app.core.errors import PropertyNotFoundError
from app.core.logging import get_logger
from app.core.security import require_service_token
from app.db.mongo import count_properties
from app.schemas.admin import IndexHealth, ReindexAccepted, ReindexRequest
from app.services.indexer import Indexer
from app.services.runs import RunReport, run_registry

log = get_logger("search-svc.admin")

router = APIRouter(tags=["index-admin"])

ServiceTokenGuard = Depends(require_service_token)
RateLimitGuard = Depends(admin_rate_limit)


async def _execute_reindex(indexer: Indexer, run: RunReport, payload: ReindexRequest) -> None:
    """Background worker for `POST /reindex`."""
    log.info("reindex_started", run_id=run.runId, mode=run.mode, source=payload.source)
    if payload.is_partial:
        await indexer.index_ids(payload.ids or [], run, source=payload.source)
    else:
        await indexer.full_reindex(
            run,
            source=payload.source,
            zero_downtime=payload.zeroDowntime,
            prune=payload.prune,
        )


@router.post(
    "/reindex",
    summary="Rebuild the search index (full or by ids)",
    status_code=status.HTTP_202_ACCEPTED,
    dependencies=[ServiceTokenGuard, RateLimitGuard],
    response_class=ORJSONResponse,
)
async def reindex(
    background_tasks: BackgroundTasks,
    indexer: IndexerDep,
    body: Annotated[ReindexRequest | None, Body(description="Reindex options")] = None,
) -> ORJSONResponse:
    """Queue a reindex run and return its `runId` immediately."""
    # An empty body means "rebuild everything", matching `{"full": true}`.
    payload = body or ReindexRequest(full=True)
    mode = "partial" if payload.is_partial else "zero_downtime" if payload.zeroDowntime else "full"
    run = run_registry.create(mode=mode, source=payload.source)  # type: ignore[arg-type]
    await run_registry.persist(run)

    background_tasks.add_task(_execute_reindex, indexer, run, payload)

    accepted = ReindexAccepted(
        runId=run.runId,
        status=run.status,
        mode=mode,
        source=payload.source,
        requested=len(payload.ids) if payload.ids else None,
        zeroDowntime=payload.zeroDowntime,
        statusUrl=f"{API_PREFIX}/index/health",
    )
    log.info("reindex_queued", run_id=run.runId, mode=mode, source=payload.source)
    return ORJSONResponse(
        status_code=status.HTTP_202_ACCEPTED,
        content=envelope(accepted.model_dump()),
    )


@router.get(
    "/index/health",
    summary="Index stats: document count, size, alias target, last run",
    dependencies=[RateLimitGuard],
    response_class=ORJSONResponse,
)
async def index_health(
    index_manager: IndexManagerDep,
    settings: SettingsDep,
) -> ORJSONResponse:
    report: dict[str, Any] = await index_manager.health()
    report["mongoDocuments"] = await count_properties()
    report["lastRun"] = await run_registry.load_latest()
    report["indexVersion"] = settings.ES_INDEX_VERSION
    payload = IndexHealth(**report)
    status_code = status.HTTP_200_OK if payload.ready else status.HTTP_503_SERVICE_UNAVAILABLE
    return ORJSONResponse(status_code=status_code, content=envelope(payload.model_dump()))


@router.post(
    "/index/{property_id}",
    summary="Upsert a single listing into the index",
    dependencies=[ServiceTokenGuard, RateLimitGuard],
    response_class=ORJSONResponse,
)
async def index_property(
    indexer: IndexerDep,
    property_id: Annotated[str, Path(min_length=1, description="Property UUID, Mongo id or slug")],
) -> ORJSONResponse:
    result = await indexer.index_one(property_id)
    if result is None:
        raise PropertyNotFoundError(property_id)
    return ORJSONResponse(
        status_code=status.HTTP_200_OK,
        content=envelope(
            {
                "id": result["id"],
                "action": result["action"],
                "index": result.get("index"),
            }
        ),
    )


@router.delete(
    "/index/{property_id}",
    summary="Remove a single listing from the index",
    dependencies=[ServiceTokenGuard, RateLimitGuard],
    response_class=ORJSONResponse,
)
async def delete_property(
    indexer: IndexerDep,
    property_id: Annotated[str, Path(min_length=1, description="Property UUID used as the ES _id")],
) -> ORJSONResponse:
    deleted = await indexer.delete_one(property_id)
    return ORJSONResponse(
        status_code=status.HTTP_200_OK,
        content=envelope({"id": property_id, "action": "deleted", "deleted": deleted}),
    )
