"""Error envelope and exception handlers (CONTRACT §4).

{"success": false, "error": {"code": "…", "message": "…", "details": []}}
"""

from __future__ import annotations

from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import ORJSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.logging import get_logger

logger = get_logger("rag-svc.errors")

#: Default SCREAMING_SNAKE code per HTTP status.
STATUS_CODE_MAP: dict[int, str] = {
    400: "BAD_REQUEST",
    401: "UNAUTHORIZED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    405: "METHOD_NOT_ALLOWED",
    409: "CONFLICT",
    413: "PAYLOAD_TOO_LARGE",
    415: "UNSUPPORTED_MEDIA_TYPE",
    422: "VALIDATION_ERROR",
    429: "RATE_LIMITED",
    500: "INTERNAL_ERROR",
    502: "UPSTREAM_ERROR",
    503: "SERVICE_UNAVAILABLE",
    504: "UPSTREAM_TIMEOUT",
}


class ApiError(Exception):
    """Domain error rendered with the contract error envelope."""

    def __init__(
        self,
        code: str,
        message: str,
        status_code: int = 400,
        details: list[Any] | None = None,
        headers: dict[str, str] | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code
        self.details: list[Any] = details or []
        self.headers = headers or {}

    def to_payload(self) -> dict[str, Any]:
        return error_payload(self.code, self.message, self.details)


class NotFoundError(ApiError):
    def __init__(self, code: str, message: str, details: list[Any] | None = None) -> None:
        super().__init__(code, message, status_code=404, details=details)


class UnauthorizedError(ApiError):
    def __init__(
        self,
        message: str = "Authentication is required",
        code: str = "UNAUTHORIZED",
        details: list[Any] | None = None,
    ) -> None:
        super().__init__(
            code,
            message,
            status_code=401,
            details=details,
            headers={"WWW-Authenticate": "Bearer"},
        )


class ForbiddenError(ApiError):
    def __init__(self, message: str = "Insufficient permissions", code: str = "FORBIDDEN") -> None:
        super().__init__(code, message, status_code=403)


class ValidationError(ApiError):
    def __init__(self, message: str, details: list[Any] | None = None) -> None:
        super().__init__("VALIDATION_ERROR", message, status_code=422, details=details)


class RateLimitedError(ApiError):
    def __init__(self, retry_after: int, message: str = "Too many requests") -> None:
        super().__init__(
            "RATE_LIMITED",
            message,
            status_code=429,
            details=[{"retryAfterSeconds": retry_after}],
            headers={"Retry-After": str(retry_after)},
        )


class UpstreamError(ApiError):
    """A model provider or downstream service failed."""

    def __init__(self, message: str, code: str = "UPSTREAM_ERROR", status_code: int = 502) -> None:
        super().__init__(code, message, status_code=status_code)


class ServiceUnavailableError(ApiError):
    def __init__(self, message: str, code: str = "SERVICE_UNAVAILABLE") -> None:
        super().__init__(code, message, status_code=503)


def error_payload(code: str, message: str, details: list[Any] | None = None) -> dict[str, Any]:
    return {"success": False, "error": {"code": code, "message": message, "details": details or []}}


def error_response(
    status_code: int,
    code: str,
    message: str,
    details: list[Any] | None = None,
    headers: dict[str, str] | None = None,
) -> ORJSONResponse:
    return ORJSONResponse(
        status_code=status_code,
        content=error_payload(code, message, details),
        headers=headers or {},
    )


def _request_id(request: Request) -> str | None:
    return getattr(request.state, "request_id", None)


def register_exception_handlers(app: FastAPI) -> None:
    """Attach the CONTRACT §4 error envelope to every failure mode."""

    @app.exception_handler(ApiError)
    async def _api_error(request: Request, exc: ApiError) -> ORJSONResponse:
        log = logger.warning if exc.status_code < 500 else logger.error
        log(
            "api_error",
            code=exc.code,
            status=exc.status_code,
            path=request.url.path,
            request_id=_request_id(request),
            message=exc.message,
        )
        return error_response(exc.status_code, exc.code, exc.message, exc.details, exc.headers)

    @app.exception_handler(RequestValidationError)
    async def _validation_error(request: Request, exc: RequestValidationError) -> ORJSONResponse:
        details = [
            {
                "field": ".".join(str(part) for part in err.get("loc", ()) if part != "body"),
                "message": err.get("msg", "Invalid value"),
                "type": err.get("type", "value_error"),
            }
            for err in exc.errors()
        ]
        logger.warning(
            "request_validation_error",
            path=request.url.path,
            request_id=_request_id(request),
            details=details,
        )
        return error_response(422, "VALIDATION_ERROR", "Request validation failed", details)

    @app.exception_handler(StarletteHTTPException)
    async def _http_error(request: Request, exc: StarletteHTTPException) -> ORJSONResponse:
        code = STATUS_CODE_MAP.get(exc.status_code, "HTTP_ERROR")
        message = exc.detail if isinstance(exc.detail, str) else "Request failed"
        headers = dict(exc.headers or {})
        logger.warning(
            "http_error",
            status=exc.status_code,
            code=code,
            path=request.url.path,
            request_id=_request_id(request),
        )
        return error_response(exc.status_code, code, message, headers=headers)

    @app.exception_handler(Exception)
    async def _unhandled(request: Request, exc: Exception) -> ORJSONResponse:
        logger.error(
            "unhandled_exception",
            path=request.url.path,
            request_id=_request_id(request),
            error=str(exc),
            error_type=type(exc).__name__,
            exc_info=exc,
        )
        return error_response(500, "INTERNAL_ERROR", "Internal server error")
