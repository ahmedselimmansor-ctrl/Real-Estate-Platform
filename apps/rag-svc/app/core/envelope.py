"""Success response envelope (CONTRACT §4).

    {"success": true, "data": <payload>, "meta": {page, limit, total, totalPages}}

``meta`` is emitted only for paginated payloads. The error envelope lives in
:mod:`app.core.errors` next to the exception handlers that produce it.
"""

from __future__ import annotations

import math
from collections.abc import Sequence
from typing import Any, Generic, TypeVar

from pydantic import BaseModel, ConfigDict, Field

T = TypeVar("T")


class PageMeta(BaseModel):
    """Pagination metadata — present only on paginated endpoints."""

    model_config = ConfigDict(populate_by_name=True)

    page: int = Field(default=1, ge=1, description="1-based page number")
    limit: int = Field(default=20, ge=1, description="Items per page")
    total: int = Field(default=0, ge=0, description="Total matching items")
    totalPages: int = Field(default=0, ge=0, description="ceil(total / limit)")  # noqa: N815


class ResponseEnvelope(BaseModel, Generic[T]):
    """Canonical success envelope."""

    model_config = ConfigDict(populate_by_name=True)

    success: bool = True
    data: T
    meta: PageMeta | None = None


def page_meta(*, page: int, limit: int, total: int) -> dict[str, int]:
    """Build the ``meta`` block, computing ``totalPages`` defensively."""
    safe_limit = max(1, int(limit))
    safe_page = max(1, int(page))
    safe_total = max(0, int(total))
    return {
        "page": safe_page,
        "limit": safe_limit,
        "total": safe_total,
        "totalPages": int(math.ceil(safe_total / safe_limit)) if safe_total else 0,
    }


def envelope(data: Any, meta: dict[str, Any] | PageMeta | None = None) -> dict[str, Any]:
    """Wrap ``data`` in the success envelope (adding ``meta`` when provided)."""
    body: dict[str, Any] = {"success": True, "data": data}
    if meta is not None:
        body["meta"] = meta.model_dump() if isinstance(meta, PageMeta) else dict(meta)
    return body


def paginated(
    items: Sequence[Any],
    *,
    page: int,
    limit: int,
    total: int,
) -> dict[str, Any]:
    """Success envelope for a paginated collection."""
    return envelope(list(items), page_meta(page=page, limit=limit, total=total))
