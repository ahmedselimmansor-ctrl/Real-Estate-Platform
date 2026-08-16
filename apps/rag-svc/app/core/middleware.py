"""HTTP middleware: request correlation + structured access logging.

Every service reads and propagates ``X-Request-Id``, generating a UUID when the
header is absent (CONTRACT §4).
"""

from __future__ import annotations

import time
import uuid

from starlette.datastructures import Headers
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.middleware.gzip import GZipMiddleware
from starlette.requests import Request
from starlette.responses import Response
from starlette.types import Receive, Scope, Send

from app.core.logging import bind_request_id, clear_request_context, get_logger

REQUEST_ID_HEADER = "X-Request-Id"

logger = get_logger("rag-svc.http")

#: Paths that must not produce an access log line on every poll.
_QUIET_PATHS = {"/health", "/health/ready", "/api/chat/health", "/metrics"}


class RequestContextMiddleware(BaseHTTPMiddleware):
    """Bind a request id to the log context and echo it back to the caller."""

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        request_id = request.headers.get(REQUEST_ID_HEADER) or str(uuid.uuid4())
        request.state.request_id = request_id
        clear_request_context()
        bind_request_id(request_id)

        started = time.perf_counter()
        status_code = 500
        try:
            response = await call_next(request)
            status_code = response.status_code
            response.headers[REQUEST_ID_HEADER] = request_id
            return response
        finally:
            duration_ms = round((time.perf_counter() - started) * 1000, 2)
            if request.url.path not in _QUIET_PATHS:
                logger.info(
                    "http_request",
                    method=request.method,
                    path=request.url.path,
                    query=str(request.url.query) or None,
                    status=status_code,
                    duration_ms=duration_ms,
                    client=request.client.host if request.client else None,
                )
            clear_request_context()


class SelectiveGZipMiddleware(GZipMiddleware):
    """gzip for JSON payloads, transparent pass-through for SSE.

    Compressing ``text/event-stream`` buffers deltas inside the gzip window and
    destroys the token-by-token feel of the chatbot, so any request that asks
    for an event stream skips compression entirely (CONTRACT §6).
    """

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "http":
            accept = Headers(scope=scope).get("accept", "")
            if "text/event-stream" in accept.lower():
                await self.app(scope, receive, send)
                return
        await super().__call__(scope, receive, send)


def get_request_id(request: Request) -> str:
    """Return the correlation id bound to the current request."""
    return getattr(request.state, "request_id", None) or str(uuid.uuid4())
