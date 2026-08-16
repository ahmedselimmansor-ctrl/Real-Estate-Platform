"""Response envelopes (CONTRACT §4).

Success:
    {"success": true, "data": <payload>, "meta": {page, limit, total, totalPages}}
`meta` is only emitted for paginated payloads.

Error:
    {"success": false, "error": {"code": "SCREAMING_SNAKE", "message": "...", "details": []}}
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
    totalPages: int = Field(default=0, ge=0, description="ceil(total / limit)")


class ResponseEnvelope(BaseModel, Generic[T]):
    """Canonical success envelope."""

    model_config = ConfigDict(populate_by_name=True)

    success: bool = True
    data: T
    meta: PageMeta | None = None


class ErrorBody(BaseModel):
    code: str = Field(description="SCREAMING_SNAKE error code")
    message: str = Field(description="Human readable message")
    details: list[Any] = Field(default_factory=list)


class ErrorEnvelope(BaseModel):
    """Canonical error envelope."""

    success: bool = False
    error: ErrorBody


def page_meta(*, page: int, limit: int, total: int) -> dict[str, int]:
    """Build the `meta` block, computing `totalPages` defensively."""
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
    """Wrap `data` in the success envelope (adding `meta` when provided)."""
    body: dict[str, Any] = {"success": True, "data": data}
    if meta is not None:
        body["meta"] = meta.model_dump() if isinstance(meta, PageMeta) else dict(meta)
    return body


def paginated(
    items: Sequence[Any] | list[Any],
    *,
    page: int,
    limit: int,
    total: int,
) -> dict[str, Any]:
    """Success envelope for a paginated collection."""
    return envelope(list(items), page_meta(page=page, limit=limit, total=total))


def error_envelope(
    code: str,
    message: str,
    details: list[Any] | None = None,
) -> dict[str, Any]:
    """Wrap an error in the canonical error envelope."""
    return {
        "success": False,
        "error": {
            "code": code,
            "message": message,
            "details": details or [],
        },
    }
