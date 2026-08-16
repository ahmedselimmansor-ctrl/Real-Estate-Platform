"""HTTP middleware: correlation id, access logging, timing.

Every request gets an `X-Request-Id` (propagated from the caller when present,
generated otherwise), bound into the structlog context and echoed back on the
response — CONTRACT §4 "Correlation".
"""

from __future__ import annotations

import time

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response
from starlette.types import ASGIApp

from app.core.context import (
    REQUEST_ID_HEADER,
    clear_request_context,
    set_request_id,
)
from app.core.logging import get_logger
from app.core.redis import rate_limit_headers

log = get_logger("search-svc.http")

#: Paths that must not pollute the access log (container probes poll them).
QUIET_PATHS = frozenset({"/health", "/health/ready"})


class RequestContextMiddleware(BaseHTTPMiddleware):
    """Bind the correlation id, time the request and emit one JSON access log."""

    def __init__(self, app: ASGIApp, *, service: str = "search-svc") -> None:
        super().__init__(app)
        self.service = service

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        request_id = set_request_id(request.headers.get(REQUEST_ID_HEADER))
        request.state.request_id = request_id
        started = time.perf_counter()

        try:
            response = await call_next(request)
        except Exception:
            duration_ms = round((time.perf_counter() - started) * 1000, 2)
            log.exception(
                "request_failed",
                method=request.method,
                path=request.url.path,
                duration_ms=duration_ms,
            )
            clear_request_context()
            raise

        duration_ms = round((time.perf_counter() - started) * 1000, 2)
        response.headers[REQUEST_ID_HEADER] = request_id
        response.headers["X-Response-Time"] = f"{duration_ms}ms"
        for header, value in rate_limit_headers(request):
            response.headers[header] = value

        if request.url.path not in QUIET_PATHS:
            log.info(
                "request_completed",
                method=request.method,
                path=request.url.path,
                query=request.url.query or None,
                status=response.status_code,
                duration_ms=duration_ms,
                client=request.client.host if request.client else None,
            )

        clear_request_context()
        return response
