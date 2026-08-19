"""Router composition for ``/api/chat`` (CONTRACT §1, §6).

nginx routes ``/api/chat/*`` here, so every public route carries that prefix.
``/health`` is additionally exposed at the root for the container healthcheck.

Stage 2 (chat graph, threads, SSE) registers its routers in :func:`build_router`
next to the ingestion router — nothing else in the app needs to change.
"""

from __future__ import annotations

from fastapi import APIRouter, Request
from fastapi.responses import ORJSONResponse

from app.api import chat_routes, ingest_routes
from app.api import health as health_module

API_PREFIX = "/api/chat"


def build_router() -> APIRouter:
    """The ``/api/chat`` router."""
    router = APIRouter(prefix=API_PREFIX)
    router.include_router(chat_routes.router)
    router.include_router(ingest_routes.router)

    @router.get(
        "/health",
        tags=["health"],
        summary="Liveness probe (chat prefix)",
        response_class=ORJSONResponse,
    )
    async def chat_health(request: Request) -> ORJSONResponse:
        """Same payload as ``GET /health`` — CONTRACT §6 lists it under the prefix."""
        return await health_module.health(request)

    return router


api_router = build_router()
health_router = health_module.router

__all__ = ["API_PREFIX", "api_router", "build_router", "health_router"]
