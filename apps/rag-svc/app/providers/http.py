"""Shared HTTP plumbing for model providers.

All provider traffic goes through :class:`ProviderHttpClient`, which owns
timeouts, connection pooling, retry policy (429 + 5xx + transport errors with
exponential backoff and jitter) and structured latency logging.
"""

from __future__ import annotations

import time
from typing import Any

import httpx
from tenacity import (
    AsyncRetrying,
    RetryError,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential_jitter,
)

from app.core.errors import UpstreamError
from app.core.logging import get_logger

logger = get_logger("rag-svc.provider.http")

#: Status codes worth retrying.
RETRY_STATUS_CODES = frozenset({408, 409, 425, 429, 500, 502, 503, 504})


class RetryableHttpError(Exception):
    """Transient upstream failure (rate limit / 5xx / network)."""

    def __init__(self, message: str, status_code: int | None = None) -> None:
        super().__init__(message)
        self.status_code = status_code


class ProviderHttpClient:
    """A lazily-created ``httpx.AsyncClient`` with retries and logging."""

    def __init__(
        self,
        *,
        base_url: str,
        api_key: str,
        provider: str,
        timeout: float = 30.0,
        max_retries: int = 4,
        backoff_seconds: float = 0.5,
        max_connections: int = 32,
        extra_headers: dict[str, str] | None = None,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.provider = provider
        self._api_key = api_key
        self._timeout = timeout
        self._max_retries = max(1, max_retries)
        self._backoff = backoff_seconds
        self._max_connections = max_connections
        self._extra_headers = extra_headers or {}
        self._client: httpx.AsyncClient | None = None

    # --- lifecycle --------------------------------------------------------
    @property
    def client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            headers = {
                "Authorization": f"Bearer {self._api_key}",
                "Content-Type": "application/json",
                "Accept": "application/json",
                "User-Agent": "topchoice-rag-svc/1.0",
                **self._extra_headers,
            }
            self._client = httpx.AsyncClient(
                base_url=self.base_url,
                headers=headers,
                timeout=httpx.Timeout(self._timeout, connect=min(10.0, self._timeout)),
                limits=httpx.Limits(
                    max_connections=self._max_connections,
                    max_keepalive_connections=max(4, self._max_connections // 4),
                ),
            )
        return self._client

    async def aclose(self) -> None:
        if self._client is not None and not self._client.is_closed:
            await self._client.aclose()
        self._client = None

    # --- requests ---------------------------------------------------------
    async def post_json(
        self,
        path: str,
        payload: dict[str, Any],
        *,
        operation: str,
        timeout: float | None = None,
    ) -> dict[str, Any]:
        """POST JSON with retries; returns the decoded JSON body."""
        attempt_number = 0
        started = time.perf_counter()

        async def _once() -> dict[str, Any]:
            nonlocal attempt_number
            attempt_number += 1
            try:
                response = await self.client.post(
                    path,
                    json=payload,
                    timeout=timeout or self._timeout,
                )
            except httpx.TimeoutException as exc:
                raise RetryableHttpError(f"{self.provider} timeout: {exc}") from exc
            except httpx.TransportError as exc:
                raise RetryableHttpError(f"{self.provider} transport error: {exc}") from exc

            if response.status_code in RETRY_STATUS_CODES:
                raise RetryableHttpError(
                    f"{self.provider} returned {response.status_code}: "
                    f"{response.text[:300]}",
                    status_code=response.status_code,
                )
            if response.status_code >= 400:
                raise UpstreamError(
                    f"{self.provider} rejected the request "
                    f"({response.status_code}): {response.text[:300]}",
                    code="PROVIDER_REQUEST_FAILED",
                )
            try:
                return response.json()
            except ValueError as exc:
                raise UpstreamError(
                    f"{self.provider} returned a non-JSON body", code="PROVIDER_BAD_RESPONSE"
                ) from exc

        try:
            async for attempt in AsyncRetrying(
                stop=stop_after_attempt(self._max_retries),
                wait=wait_exponential_jitter(initial=self._backoff, max=8.0),
                retry=retry_if_exception_type(RetryableHttpError),
                reraise=True,
            ):
                with attempt:
                    body = await _once()
                    logger.info(
                        "provider_call",
                        provider=self.provider,
                        operation=operation,
                        path=path,
                        attempts=attempt_number,
                        latency_ms=round((time.perf_counter() - started) * 1000, 2),
                    )
                    return body
        except RetryError as exc:  # pragma: no cover - reraise=True makes this rare
            raise UpstreamError(
                f"{self.provider} unavailable after {self._max_retries} attempts",
                code="PROVIDER_UNAVAILABLE",
                status_code=503,
            ) from exc
        except RetryableHttpError as exc:
            logger.warning(
                "provider_call_failed",
                provider=self.provider,
                operation=operation,
                attempts=attempt_number,
                status=exc.status_code,
                error=str(exc),
                latency_ms=round((time.perf_counter() - started) * 1000, 2),
            )
            raise UpstreamError(
                f"{self.provider} unavailable: {exc}",
                code="PROVIDER_UNAVAILABLE",
                status_code=503,
            ) from exc

        raise UpstreamError(  # pragma: no cover - unreachable, keeps mypy happy
            f"{self.provider} produced no response", code="PROVIDER_UNAVAILABLE", status_code=503
        )
