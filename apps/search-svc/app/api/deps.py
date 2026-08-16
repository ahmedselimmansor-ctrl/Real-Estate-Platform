"""Shared FastAPI dependencies.

Stage 2 (search / autocomplete / facets / map routes) should reuse these rather
than reaching into the client modules directly.
"""

from __future__ import annotations

from typing import Annotated

from elasticsearch import AsyncElasticsearch
from fastapi import Depends, Query, Request
from motor.motor_asyncio import AsyncIOMotorCollection
from redis.asyncio import Redis

from app.core.config import Settings, get_settings
from app.core.context import get_request_id
from app.core.errors import ValidationAppError
from app.core.redis import get_redis, rate_limiter
from app.db.mongo import get_properties_collection
from app.es.client import get_es
from app.es.index_manager import IndexManager
from app.services.indexer import Indexer, get_indexer

# --------------------------------------------------------------- primitives


def settings_dep() -> Settings:
    return get_settings()


def es_dep() -> AsyncElasticsearch:
    return get_es()


def redis_dep() -> Redis:
    return get_redis()


def properties_collection_dep() -> AsyncIOMotorCollection:
    return get_properties_collection()


def index_manager_dep() -> IndexManager:
    return IndexManager(get_es(), settings=get_settings())


def indexer_dep() -> Indexer:
    return get_indexer()


def request_id_dep(request: Request) -> str:
    return getattr(request.state, "request_id", None) or get_request_id() or ""


SettingsDep = Annotated[Settings, Depends(settings_dep)]
ElasticsearchDep = Annotated[AsyncElasticsearch, Depends(es_dep)]
RedisDep = Annotated[Redis, Depends(redis_dep)]
PropertiesCollectionDep = Annotated[AsyncIOMotorCollection, Depends(properties_collection_dep)]
IndexManagerDep = Annotated[IndexManager, Depends(index_manager_dep)]
IndexerDep = Annotated[Indexer, Depends(indexer_dep)]
RequestIdDep = Annotated[str, Depends(request_id_dep)]


# ------------------------------------------------------------- rate limiters

#: Public search endpoints (CONTRACT §10.4).
search_rate_limit = rate_limiter("search")
#: Type-ahead is chattier than search, so it gets its own (larger) budget.
autocomplete_rate_limit = rate_limiter("search:autocomplete", limit=240, window_seconds=60)
#: Internal index administration.
admin_rate_limit = rate_limiter("search:admin", limit=60, window_seconds=60)


# ---------------------------------------------------------------- pagination


class Pagination:
    """`page` / `limit` query params per CONTRACT §4 (1-based, limit max 100)."""

    def __init__(self, page: int, limit: int) -> None:
        self.page = page
        self.limit = limit

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.limit

    def as_meta(self, total: int) -> dict[str, int]:
        from app.core.envelope import page_meta

        return page_meta(page=self.page, limit=self.limit, total=total)


def pagination_params(
    page: Annotated[int, Query(ge=1, description="1-based page number")] = 1,
    limit: Annotated[int, Query(ge=1, le=100, description="Items per page (max 100)")] = 20,
) -> Pagination:
    settings = get_settings()
    if limit > settings.MAX_PAGE_SIZE:
        raise ValidationAppError(
            f"limit must not exceed {settings.MAX_PAGE_SIZE}",
            details=[{"field": "limit", "message": f"max {settings.MAX_PAGE_SIZE}"}],
        )
    # Elasticsearch refuses from + size beyond index.max_result_window (10 000).
    if (page - 1) * limit >= 10000:
        raise ValidationAppError(
            "Pagination window exceeded: page * limit must stay below 10000",
            details=[{"field": "page", "message": "deep pagination is not supported"}],
        )
    return Pagination(page=page, limit=limit)


PaginationDep = Annotated[Pagination, Depends(pagination_params)]
