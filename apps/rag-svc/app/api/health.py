"""Liveness and readiness probes (CONTRACT §4).

    GET /health        -> {"status":"ok","service":"rag-svc","version":"1.0.0","deps":{...}}
    GET /health/ready  -> 200 once Postgres answers, 503 while it does not

``/health`` is what the compose healthcheck polls, so it never blocks on IO: it
reports the last known state of Postgres/Redis plus the *configuration* state of
the model providers. ``/health/ready`` performs the live probes.

Model providers are reported from configuration only — a health check must never
spend money or quota calling DashScope/OpenAI. ``configured`` means a key is
present, ``fallback`` means the deterministic offline implementation is serving.
"""

from __future__ import annotations

import asyncio
import time
from typing import Any

from fastapi import APIRouter, Request, status
from fastapi.responses import ORJSONResponse

from app.core.config import SERVICE_NAME, SERVICE_VERSION, get_settings
from app.core.logging import get_logger
from app.core.redis import get_redis_manager
from app.db.session import get_database

logger = get_logger("rag-svc.health")

router = APIRouter(tags=["health"])

_PROBE_TIMEOUT_SECONDS = 3.0


async def _guarded(coro: Any, name: str) -> bool:
    try:
        return bool(await asyncio.wait_for(coro, timeout=_PROBE_TIMEOUT_SECONDS))
    except TimeoutError:
        logger.warning("dependency_probe_timeout", dependency=name)
        return False
    except Exception as exc:  # noqa: BLE001 - a probe must never raise
        logger.warning("dependency_probe_failed", dependency=name, error=str(exc))
        return False


def _base_payload(request: Request) -> dict[str, Any]:
    started_at = getattr(request.app.state, "started_at", None)
    payload: dict[str, Any] = {
        "status": "ok",
        "service": SERVICE_NAME,
        "version": SERVICE_VERSION,
    }
    if started_at:
        payload["uptimeSeconds"] = round(time.time() - started_at, 1)
    return payload


def _provider_deps() -> dict[str, str]:
    """Config-presence view of DashScope and OpenAI (no network calls)."""
    return get_settings().provider_status()


def _cached_deps() -> dict[str, str]:
    return {
        "postgres": "ok" if get_database().healthy else "down",
        "redis": "ok" if get_redis_manager().healthy else "down",
        **_provider_deps(),
    }


async def _live_deps() -> dict[str, str]:
    postgres, redis = await asyncio.gather(
        _guarded(get_database().check(), "postgres"),
        _guarded(get_redis_manager().ping(), "redis"),
    )
    return {
        "postgres": "ok" if postgres else "down",
        "redis": "ok" if redis else "down",
        **_provider_deps(),
    }


@router.get("/health", summary="Liveness probe", response_class=ORJSONResponse)
async def health(request: Request) -> ORJSONResponse:
    """Always 200 while the process is alive; dependency state sits in ``deps``."""
    payload = {**_base_payload(request), "deps": _cached_deps()}
    providers = getattr(request.app.state, "providers", None)
    if providers is not None:
        payload["models"] = providers.describe()
    return ORJSONResponse(status_code=status.HTTP_200_OK, content=payload)


@router.get("/health/ready", summary="Readiness probe", response_class=ORJSONResponse)
async def health_ready(request: Request) -> ORJSONResponse:
    """503 until Postgres answers — without it there is nothing to retrieve."""
    deps = await _live_deps()
    ready = deps["postgres"] == "ok"

    corpus: dict[str, int] | None = None
    if ready:
        corpus = await _corpus_counts()

    payload = {
        **_base_payload(request),
        "status": "ready" if ready else "not_ready",
        "deps": deps,
        "corpus": corpus,
    }
    return ORJSONResponse(
        status_code=status.HTTP_200_OK if ready else status.HTTP_503_SERVICE_UNAVAILABLE,
        content=payload,
    )


async def _corpus_counts() -> dict[str, int] | None:
    from app.db.repositories.documents import DocumentRepository

    try:
        async with get_database().session() as session:
            return await DocumentRepository(session).counts()
    except Exception as exc:  # noqa: BLE001 - readiness must not 500
        logger.warning("corpus_counts_failed", error=str(exc))
        return None
