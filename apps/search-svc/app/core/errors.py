"""Application errors and FastAPI exception handlers (CONTRACT §4).

Every failure — validation, HTTP, Elasticsearch, Mongo or unhandled — leaves the
service as:

    {"success": false, "error": {"code": "...", "message": "...", "details": []}}

with the correct HTTP status and the `X-Request-Id` correlation header.
"""

from __future__ import annotations

from typing import Any

from elasticsearch import ApiError, NotFoundError, TransportError
from fastapi import FastAPI, HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import ORJSONResponse
from pydantic import ValidationError
from pymongo.errors import PyMongoError
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.context import REQUEST_ID_HEADER, get_request_id
from app.core.envelope import error_envelope
from app.core.logging import get_logger

log = get_logger("search-svc.errors")

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
    429: "RATE_LIMIT_EXCEEDED",
    500: "INTERNAL_ERROR",
    502: "BAD_GATEWAY",
    503: "SERVICE_UNAVAILABLE",
    504: "GATEWAY_TIMEOUT",
}


class AppError(Exception):
    """Domain error carrying an explicit contract error code."""

    def __init__(
        self,
        code: str,
        message: str,
        *,
        status_code: int = status.HTTP_400_BAD_REQUEST,
        details: list[Any] | None = None,
        headers: dict[str, str] | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code
        self.details = details or []
        self.headers = headers or {}


class NotFoundAppError(AppError):
    def __init__(self, message: str = "Resource not found", *, code: str = "NOT_FOUND") -> None:
        super().__init__(code, message, status_code=status.HTTP_404_NOT_FOUND)


class PropertyNotFoundError(AppError):
    def __init__(self, property_id: str) -> None:
        super().__init__(
            "PROPERTY_NOT_FOUND",
            f"Property '{property_id}' was not found",
            status_code=status.HTTP_404_NOT_FOUND,
        )


class UnauthorizedError(AppError):
    def __init__(
        self,
        message: str = "Authentication required",
        *,
        code: str = "UNAUTHORIZED",
    ) -> None:
        super().__init__(
            code,
            message,
            status_code=status.HTTP_401_UNAUTHORIZED,
            headers={"WWW-Authenticate": "Bearer"},
        )


class ForbiddenError(AppError):
    def __init__(
        self,
        message: str = "Insufficient permissions",
        *,
        code: str = "FORBIDDEN",
    ) -> None:
        super().__init__(code, message, status_code=status.HTTP_403_FORBIDDEN)


class ValidationAppError(AppError):
    def __init__(self, message: str, *, details: list[Any] | None = None) -> None:
        super().__init__(
            "VALIDATION_ERROR",
            message,
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            details=details,
        )


class RateLimitedError(AppError):
    def __init__(self, message: str = "Too many requests", *, retry_after: int = 60) -> None:
        super().__init__(
            "RATE_LIMIT_EXCEEDED",
            message,
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            headers={"Retry-After": str(retry_after)},
        )


class SearchUnavailableError(AppError):
    def __init__(self, message: str = "Search backend is unavailable") -> None:
        super().__init__(
            "SEARCH_UNAVAILABLE",
            message,
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        )


class IndexNotReadyError(AppError):
    def __init__(self, message: str = "Search index is not ready") -> None:
        super().__init__(
            "INDEX_NOT_READY",
            message,
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        )


def default_code_for_status(status_code: int) -> str:
    return STATUS_CODE_MAP.get(status_code, "INTERNAL_ERROR" if status_code >= 500 else "ERROR")


def _headers(extra: dict[str, str] | None = None) -> dict[str, str]:
    headers = dict(extra or {})
    request_id = get_request_id()
    if request_id:
        headers[REQUEST_ID_HEADER] = request_id
    return headers


def error_response(
    *,
    status_code: int,
    code: str,
    message: str,
    details: list[Any] | None = None,
    headers: dict[str, str] | None = None,
) -> ORJSONResponse:
    return ORJSONResponse(
        status_code=status_code,
        content=error_envelope(code, message, details),
        headers=_headers(headers),
    )


def _format_validation_details(
    exc: RequestValidationError | ValidationError,
) -> list[dict[str, Any]]:
    details: list[dict[str, Any]] = []
    for err in exc.errors():
        location = ".".join(str(part) for part in err.get("loc", ()) if part != "body") or "body"
        details.append(
            {
                "field": location,
                "message": err.get("msg", "Invalid value"),
                "type": err.get("type", "value_error"),
            }
        )
    return details


def register_exception_handlers(app: FastAPI) -> None:
    """Attach every handler that produces the contract error envelope."""

    @app.exception_handler(AppError)
    async def _app_error_handler(_request: Request, exc: AppError) -> ORJSONResponse:
        if exc.status_code >= 500:
            log.error("app_error", code=exc.code, message=exc.message, status=exc.status_code)
        else:
            log.warning("app_error", code=exc.code, message=exc.message, status=exc.status_code)
        return error_response(
            status_code=exc.status_code,
            code=exc.code,
            message=exc.message,
            details=exc.details,
            headers=exc.headers,
        )

    @app.exception_handler(StarletteHTTPException)
    async def _http_exception_handler(
        _request: Request, exc: StarletteHTTPException
    ) -> ORJSONResponse:
        detail = exc.detail
        code = default_code_for_status(exc.status_code)
        message = "An error occurred"
        details: list[Any] = []

        if isinstance(detail, dict):
            code = str(detail.get("code", code))
            message = str(detail.get("message", message))
            raw_details = detail.get("details", [])
            details = list(raw_details) if isinstance(raw_details, list) else [raw_details]
        elif isinstance(detail, str) and detail:
            message = detail

        headers = dict(getattr(exc, "headers", None) or {})
        log.warning("http_error", code=code, message=message, status=exc.status_code)
        return error_response(
            status_code=exc.status_code,
            code=code,
            message=message,
            details=details,
            headers=headers,
        )

    @app.exception_handler(HTTPException)
    async def _fastapi_http_exception_handler(
        request: Request, exc: HTTPException
    ) -> ORJSONResponse:
        return await _http_exception_handler(request, exc)

    @app.exception_handler(RequestValidationError)
    async def _request_validation_handler(
        _request: Request, exc: RequestValidationError
    ) -> ORJSONResponse:
        details = _format_validation_details(exc)
        log.warning("validation_error", details=details)
        return error_response(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            code="VALIDATION_ERROR",
            message="Request validation failed",
            details=details,
        )

    @app.exception_handler(ValidationError)
    async def _pydantic_validation_handler(
        _request: Request, exc: ValidationError
    ) -> ORJSONResponse:
        details = _format_validation_details(exc)
        log.error("response_validation_error", details=details)
        return error_response(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            code="INTERNAL_ERROR",
            message="Response validation failed",
            details=details,
        )

    @app.exception_handler(NotFoundError)
    async def _es_not_found_handler(_request: Request, exc: NotFoundError) -> ORJSONResponse:
        log.warning("elasticsearch_not_found", message=str(exc))
        return error_response(
            status_code=status.HTTP_404_NOT_FOUND,
            code="NOT_FOUND",
            message="The requested document or index does not exist",
        )

    @app.exception_handler(ApiError)
    async def _es_api_error_handler(_request: Request, exc: ApiError) -> ORJSONResponse:
        es_status = int(getattr(exc, "status_code", 502) or 502)
        upstream_status = es_status if 400 <= es_status < 500 else status.HTTP_502_BAD_GATEWAY
        log.error("elasticsearch_api_error", status=es_status, message=str(exc))
        return error_response(
            status_code=upstream_status,
            code="SEARCH_BACKEND_ERROR",
            message="Elasticsearch rejected the request",
            details=[str(exc)],
        )

    @app.exception_handler(TransportError)
    async def _es_transport_error_handler(_request: Request, exc: TransportError) -> ORJSONResponse:
        log.error("elasticsearch_transport_error", message=str(exc))
        return error_response(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            code="SEARCH_UNAVAILABLE",
            message="Search backend is unavailable",
        )

    @app.exception_handler(PyMongoError)
    async def _mongo_error_handler(_request: Request, exc: PyMongoError) -> ORJSONResponse:
        log.error("mongo_error", message=str(exc))
        return error_response(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            code="DATABASE_UNAVAILABLE",
            message="Listing database is unavailable",
        )

    @app.exception_handler(Exception)
    async def _unhandled_handler(_request: Request, exc: Exception) -> ORJSONResponse:
        log.exception("unhandled_error", error=str(exc), error_type=type(exc).__name__)
        return error_response(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            code="INTERNAL_ERROR",
            message="An unexpected error occurred",
        )
