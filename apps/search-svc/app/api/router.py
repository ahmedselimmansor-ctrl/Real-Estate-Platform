"""Aggregate router mounted at `/api/search` (CONTRACT §6).

Route order matters: the internal administration router owns the literal
`/index/*` paths, so it is included first; the public query router then adds
`GET /`, `/autocomplete`, `/facets`, `/similar/{id}` and `/map`.
"""

from __future__ import annotations

from fastapi import APIRouter

from app.api import admin_routes, search_routes
from app.core.config import API_PREFIX

api_router = APIRouter()

# The prefix is applied here, not on `app.include_router(...)`: FastAPI rejects
# a route whose include-prefix *and* path are both empty, and the canonical
# search endpoint is `GET /api/search` — i.e. path "" on the search router.

# Internal index administration: /reindex, /index/{id}, /index/health
api_router.include_router(admin_routes.router, prefix=API_PREFIX)
# Public query API: "" (the prefix root), /autocomplete, /facets, /similar/{id}, /map
api_router.include_router(search_routes.router, prefix=API_PREFIX)
