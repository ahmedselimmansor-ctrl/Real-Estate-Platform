"""Liveness and readiness probes (CONTRACT §4).

    GET /health        -> {"status":"ok","service":"search-svc","version":"1.0.0","deps":{...}}
    GET /health/ready   -> 200 when Elasticsearch + Mongo + Redis all answer, else 503

`/health` is what the docker compose healthcheck curls, so it always answers 200
as long as the process is alive; dependency state is reported in `deps`.
"""

from __future__ import annotations

import asyncio
from typing import Any

from fastapi import APIRouter, status
from fastapi.responses import ORJSONResponse

from app.core.config import get_settings
from app.core.logging import get_logger
from app.core.redis import ping_redis
from app.db.mongo import ping_mongo
from app.es.client import get_es, ping_es
from app.es.index_manager import IndexManager

log = get_logger("search-svc.health")

router = APIRouter(tags=["health"])

_PROBE_TIMEOUT_SECONDS = 3.0


async def _guarded(coro, name: str) -> bool:
    try:
        return bool(await asyncio.wait_for(coro, timeout=_PROBE_TIMEOUT_SECONDS))
    except TimeoutError:
        log.warning("dependency_probe_timeout", dependency=name)
        return False
    except Exception as exc:  # pragma: no cover - defensive probe
        log.warning("dependency_probe_failed", dependency=name, error=str(exc))
        return False


async def check_dependencies() -> dict[str, str]:
    """Probe Elasticsearch, Mongo and Redis concurrently."""
    elasticsearch, mongo, redis = await asyncio.gather(
        _guarded(ping_es(), "elasticsearch"),
        _guarded(ping_mongo(), "mongo"),
        _guarded(ping_redis(), "redis"),
    )
    return {
        "elasticsearch": "ok" if elasticsearch else "down",
        "mongo": "ok" if mongo else "down",
        "redis": "ok" if redis else "down",
    }


def _base_payload() -> dict[str, Any]:
    settings = get_settings()
    return {
        "status": "ok",
        "service": settings.SERVICE_NAME,
        "version": settings.SERVICE_VERSION,
    }


@router.get(
    "/health",
    summary="Liveness probe",
    response_class=ORJSONResponse,
    include_in_schema=True,
)
async def health() -> ORJSONResponse:
    deps = await check_dependencies()
    payload = {**_base_payload(), "deps": deps}
    return ORJSONResponse(status_code=status.HTTP_200_OK, content=payload)


@router.get(
    "/health/ready",
    summary="Readiness probe",
    response_class=ORJSONResponse,
)
async def health_ready() -> ORJSONResponse:
    settings = get_settings()
    deps = await check_dependencies()

    index_ready = False
    index_documents = 0
    if deps["elasticsearch"] == "ok":
        try:
            manager = IndexManager(get_es(), settings=settings)
            index_report = await manager.health()
            index_ready = bool(index_report.get("ready"))
            index_documents = int(index_report.get("documents", 0) or 0)
        except Exception as exc:  # pragma: no cover - defensive probe
            log.warning("index_health_failed", error=str(exc))

    # Elasticsearch and its index are hard requirements for serving search;
    # Mongo/Redis degrade gracefully (indexing pauses, cache misses).
    ready = deps["elasticsearch"] == "ok" and index_ready
    payload = {
        **_base_payload(),
        "status": "ready" if ready else "not_ready",
        "deps": deps,
        "index": {
            "ready": index_ready,
            "documents": index_documents,
            "alias": settings.ES_INDEX,
        },
    }
    return ORJSONResponse(
        status_code=status.HTTP_200_OK if ready else status.HTTP_503_SERVICE_UNAVAILABLE,
        content=payload,
    )
