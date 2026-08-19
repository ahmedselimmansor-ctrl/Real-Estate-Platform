"""search-svc — FastAPI application factory and process lifecycle.

Public routes are mounted under the fixed `/api/search` prefix (CONTRACT §6);
nothing depends on ASGI `root_path`, so the service behaves identically whether
it is reached directly on :8000 or through nginx.
"""

from __future__ import annotations

import asyncio
import contextlib
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import ORJSONResponse

from app.api.health import router as health_router
from app.api.router import api_router
from app.core.config import API_PREFIX, Settings, get_settings
from app.core.context import REQUEST_ID_HEADER, SERVICE_TOKEN_HEADER
from app.core.envelope import envelope
from app.core.errors import register_exception_handlers
from app.core.logging import configure_logging, get_logger
from app.core.middleware import RequestContextMiddleware
from app.core.redis import close_redis, ping_redis
from app.db.mongo import close_mongo, ping_mongo
from app.es.client import close_es, get_es, wait_for_elasticsearch
from app.es.index_manager import IndexManager
from app.services.indexer import get_indexer, reset_indexer

log = get_logger("search-svc")

DESCRIPTION = """
Elasticsearch-backed search for the TopChoice: index management, full-text and
filtered property search, autocomplete, facets, geo/map queries and
recommendations.

* Public prefix: `/api/search`
* Index: `properties_v1` behind the `properties` alias
* Auth: `Authorization: Bearer <access token>` (optional) — internal endpoints
  require the `X-Service-Token` header.
"""


async def _startup_bootstrap(app: FastAPI) -> None:
    """Create the index if needed and seed it when it is still empty."""
    try:
        result = await get_indexer().bootstrap()
        app.state.bootstrap = result
        log.info("bootstrap_finished", **{k: v for k, v in result.items() if k != "details"})
    except asyncio.CancelledError:  # pragma: no cover - shutdown during bootstrap
        log.warning("bootstrap_cancelled")
        raise
    except Exception as exc:
        log.error("bootstrap_failed", error=str(exc))
        app.state.bootstrap = {"skipped": True, "error": str(exc)}


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Connect Elasticsearch / Mongo / Redis, ensure the index, then clean up."""
    settings: Settings = get_settings()
    configure_logging(
        level=settings.LOG_LEVEL,
        json_logs=settings.LOG_JSON,
        service=settings.SERVICE_NAME,
        version=settings.SERVICE_VERSION,
        environment=settings.APP_ENV,
    )
    settings.assert_production_ready()
    log.info(
        "service_starting",
        port=settings.PORT,
        env=settings.APP_ENV,
        elasticsearch=settings.ELASTICSEARCH_URL,
        mongo_db=settings.mongo_db_name,
        index_alias=settings.ES_INDEX,
    )

    es = get_es()
    app.state.settings = settings
    app.state.index_manager = IndexManager(es, settings=settings)
    app.state.bootstrap = None
    bootstrap_task: asyncio.Task[None] | None = None

    es_ready = await wait_for_elasticsearch(es)
    if es_ready:
        try:
            ensured = await app.state.index_manager.ensure_index()
            log.info("index_ensured", **ensured)
        except Exception as exc:
            log.error("index_ensure_failed", error=str(exc))
    else:
        log.error("starting_without_elasticsearch")

    mongo_ok, redis_ok = await asyncio.gather(ping_mongo(), ping_redis())
    log.info("dependencies_checked", elasticsearch=es_ready, mongo=mongo_ok, redis=redis_ok)

    if es_ready and settings.BOOTSTRAP_ON_STARTUP:
        # Non-blocking: the container must pass its healthcheck while indexing.
        bootstrap_task = asyncio.create_task(_startup_bootstrap(app), name="search-bootstrap")

    try:
        yield
    finally:
        log.info("service_stopping")
        if bootstrap_task is not None and not bootstrap_task.done():
            bootstrap_task.cancel()
            # The task was just cancelled; whatever it raises on the way out
            # is not actionable during shutdown.
            with contextlib.suppress(asyncio.CancelledError, Exception):
                await bootstrap_task
        reset_indexer()
        await asyncio.gather(close_es(), close_mongo(), close_redis(), return_exceptions=True)
        log.info("service_stopped")


def create_app(settings: Settings | None = None) -> FastAPI:
    """Application factory (uvicorn imports `app` below)."""
    cfg = settings or get_settings()
    configure_logging(
        level=cfg.LOG_LEVEL,
        json_logs=cfg.LOG_JSON,
        service=cfg.SERVICE_NAME,
        version=cfg.SERVICE_VERSION,
        environment=cfg.APP_ENV,
    )

    application = FastAPI(
        title="TopChoice Search Service",
        description=DESCRIPTION,
        version=cfg.SERVICE_VERSION,
        default_response_class=ORJSONResponse,
        lifespan=lifespan,
        docs_url=f"{API_PREFIX}/docs",
        redoc_url=f"{API_PREFIX}/redoc",
        openapi_url=f"{API_PREFIX}/openapi.json",
        contact={"name": "TopChoice", "url": cfg.FRONTEND_URL},
    )

    # Middleware — added last runs first, so the correlation id wraps everything.
    application.add_middleware(GZipMiddleware, minimum_size=1024, compresslevel=6)
    application.add_middleware(
        CORSMiddleware,
        allow_origins=cfg.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=[
            "Authorization",
            "Content-Type",
            "Accept",
            "Accept-Language",
            REQUEST_ID_HEADER,
            SERVICE_TOKEN_HEADER,
        ],
        expose_headers=[REQUEST_ID_HEADER, "X-Response-Time", "X-RateLimit-Remaining"],
        max_age=600,
    )
    application.add_middleware(RequestContextMiddleware, service=cfg.SERVICE_NAME)

    register_exception_handlers(application)

    # Root-level probes (docker compose healthcheck curls /health).
    application.include_router(health_router)
    # Everything public lives under /api/search.
    # `api_router` already carries API_PREFIX (see app/api/router.py).
    application.include_router(api_router)

    @application.get("/", include_in_schema=False)
    async def service_root() -> dict[str, Any]:
        return envelope(
            {
                "service": cfg.SERVICE_NAME,
                "version": cfg.SERVICE_VERSION,
                "prefix": API_PREFIX,
                "docs": f"{API_PREFIX}/docs",
                "index": {"alias": cfg.ES_INDEX, "version": cfg.ES_INDEX_VERSION},
            }
        )

    log.info("app_created", prefix=API_PREFIX, cors_origins=cfg.cors_origins)
    return application


app = create_app()
