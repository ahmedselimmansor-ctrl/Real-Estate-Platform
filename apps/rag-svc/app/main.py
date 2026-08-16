"""rag-svc application factory.

    uvicorn app.main:app --host 0.0.0.0 --port 8001

Wires: structured logging, X-Request-Id correlation, CORS, gzip (never for SSE),
the CONTRACT §4 error envelope, Postgres/pgvector, Redis, the model providers,
the retriever and the ingestion pipeline. The service **boots without any model
API key** — providers fall back to deterministic offline implementations and the
degradation is logged loudly and reported on /health.
"""

from __future__ import annotations

import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import ORJSONResponse

from app.api.router import api_router, health_router
from app.core.config import SERVICE_NAME, SERVICE_VERSION, Settings, get_settings
from app.core.errors import register_exception_handlers
from app.core.logging import configure_logging, get_logger
from app.core.middleware import REQUEST_ID_HEADER, RequestContextMiddleware, SelectiveGZipMiddleware
from app.core.redis import get_redis_manager
from app.db.init import bootstrap
from app.db.mongo import get_mongo_reader
from app.db.repositories.chat import ChatRepository
from app.db.session import get_database
from app.graph.builder import ChatAgent
from app.ingestion.pipeline import IngestionPipeline
from app.providers.registry import build_providers
from app.retrieval.hybrid_search import HybridSearcher
from app.tools.registry import build_tool_registry

logger = get_logger("rag-svc.main")

DESCRIPTION = """
Retrieval-augmented chat for the Nawy clone.

* `POST /api/chat/ingest` — build the knowledge base from Mongo listings, the
  shared `seed/` dataset or arbitrary URLs (service token required).
* `GET  /api/chat/ingest/status/{runId}` — progress of an ingestion run.
* `GET  /health`, `GET /health/ready` — liveness and readiness.
""".strip()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Start and stop every long-lived resource exactly once."""
    settings: Settings = get_settings()
    app.state.settings = settings
    app.state.started_at = time.time()

    for warning in settings.startup_warnings():
        logger.warning("configuration_warning", detail=warning)

    # --- Postgres ---------------------------------------------------------
    database = get_database()
    app.state.database = database
    if settings.rag_auto_migrate:
        await bootstrap(settings, database)
    else:
        await database.check()

    # --- Redis (soft dependency) -----------------------------------------
    redis_manager = get_redis_manager()
    app.state.redis = redis_manager
    await redis_manager.connect()

    # --- model providers + retrieval + ingestion --------------------------
    providers = build_providers(settings)
    app.state.providers = providers
    app.state.retriever = HybridSearcher(
        database=database, providers=providers, settings=settings
    )
    app.state.pipeline = IngestionPipeline(
        database=database, providers=providers, settings=settings
    )

    # --- chat agent (LangGraph) -------------------------------------------
    app.state.tools = build_tool_registry(settings)
    app.state.agent = ChatAgent(
        providers=providers,
        retriever=app.state.retriever,
        tools=app.state.tools,
        repository=ChatRepository(database),
        settings=settings,
    )

    logger.info(
        "agent_ready",
        **app.state.agent.describe(),
    )

    logger.info(
        "service_started",
        service=SERVICE_NAME,
        version=SERVICE_VERSION,
        env=settings.app_env,
        port=settings.port,
        postgres=database.healthy,
        redis=redis_manager.healthy,
        providers=providers.describe(),
        seed_dir=settings.seed_dir,
    )

    try:
        yield
    finally:
        logger.info("service_stopping", service=SERVICE_NAME)
        await providers.aclose()
        await get_mongo_reader().close()
        await redis_manager.close()
        await database.dispose()
        logger.info("service_stopped", service=SERVICE_NAME)


def create_app(settings: Settings | None = None) -> FastAPI:
    """Build the ASGI application."""
    cfg = settings or get_settings()
    configure_logging(cfg.log_level, json_logs=cfg.app_env != "development")

    app = FastAPI(
        title="Nawy Clone — RAG Chat Service",
        description=DESCRIPTION,
        version=SERVICE_VERSION,
        default_response_class=ORJSONResponse,
        docs_url="/docs" if not cfg.is_production else None,
        redoc_url=None,
        openapi_url="/openapi.json" if not cfg.is_production else None,
        lifespan=lifespan,
    )

    # Middleware runs bottom-up: correlation is added last so it wraps everything.
    app.add_middleware(SelectiveGZipMiddleware, minimum_size=1024)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=cfg.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", REQUEST_ID_HEADER, "X-Service-Token"],
        expose_headers=[REQUEST_ID_HEADER],
        max_age=600,
    )
    app.add_middleware(RequestContextMiddleware)

    register_exception_handlers(app)

    app.include_router(health_router)
    app.include_router(api_router)

    @app.get("/", include_in_schema=False)
    async def root() -> dict[str, object]:
        return {
            "success": True,
            "data": {
                "service": SERVICE_NAME,
                "version": SERVICE_VERSION,
                "prefix": "/api/chat",
                "docs": "/docs" if not cfg.is_production else None,
            },
        }

    return app


app = create_app()
