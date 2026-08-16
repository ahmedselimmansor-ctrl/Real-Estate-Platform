"""Shared FastAPI dependencies.

Long-lived collaborators (model providers, the retriever, the ingestion
pipeline) are built once in the lifespan handler and read off ``app.state`` from
here, so routes stay free of construction logic and tests can swap them out.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends, Request

from app.core.errors import ServiceUnavailableError
from app.db.session import Database, get_database
from app.ingestion.pipeline import IngestionPipeline
from app.providers.registry import ProviderBundle
from app.retrieval.hybrid_search import HybridSearcher


def _from_state(request: Request, attribute: str, label: str):
    value = getattr(request.app.state, attribute, None)
    if value is None:
        raise ServiceUnavailableError(
            f"{label} is not initialised yet", code="SERVICE_STARTING"
        )
    return value


def get_providers(request: Request) -> ProviderBundle:
    return _from_state(request, "providers", "Model providers")


def get_retriever(request: Request) -> HybridSearcher:
    return _from_state(request, "retriever", "Retriever")


def get_pipeline(request: Request) -> IngestionPipeline:
    return _from_state(request, "pipeline", "Ingestion pipeline")


def get_db(request: Request) -> Database:
    return getattr(request.app.state, "database", None) or get_database()


Providers = Annotated[ProviderBundle, Depends(get_providers)]
Retriever = Annotated[HybridSearcher, Depends(get_retriever)]
Pipeline = Annotated[IngestionPipeline, Depends(get_pipeline)]
Db = Annotated[Database, Depends(get_db)]
