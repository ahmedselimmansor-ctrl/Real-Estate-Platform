"""Request-scoped context (correlation id) shared by logs and responses."""

from __future__ import annotations

import uuid
from contextvars import ContextVar

import structlog

REQUEST_ID_HEADER = "X-Request-Id"
SERVICE_TOKEN_HEADER = "X-Service-Token"

_request_id: ContextVar[str | None] = ContextVar("nawy_request_id", default=None)


def new_request_id() -> str:
    return str(uuid.uuid4())


def set_request_id(request_id: str | None) -> str:
    """Bind a request id to the current context (generating one when absent)."""
    resolved = (request_id or "").strip() or new_request_id()
    _request_id.set(resolved)
    structlog.contextvars.bind_contextvars(request_id=resolved)
    return resolved


def get_request_id() -> str | None:
    return _request_id.get()


def clear_request_context() -> None:
    _request_id.set(None)
    structlog.contextvars.clear_contextvars()
