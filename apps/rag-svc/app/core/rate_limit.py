"""Rate limiting for chat and ingestion endpoints (CONTRACT §10.4).

Keys follow the shared Redis namespace ``ratelimit:{scope}:{ip|userId}``
(CONTRACT §2). Redis is authoritative; when it is unreachable an in-process
fallback window keeps a single instance protected without failing requests.
"""

from __future__ import annotations

import time
from collections import defaultdict
from typing import Annotated

from fastapi import Depends, Request

from app.core.config import get_settings
from app.core.errors import RateLimitedError
from app.core.logging import get_logger
from app.core.redis import get_redis_manager
from app.core.security import AuthUser, optional_user

logger = get_logger("rag-svc.ratelimit")

#: scope -> {identity -> (window_start_epoch, count)}
_local_windows: dict[str, dict[str, tuple[float, int]]] = defaultdict(dict)


def client_identity(request: Request, user: AuthUser | None = None) -> str:
    """Identify the caller: user id when authenticated, else client IP."""
    if user is not None:
        return f"user:{user.id}"
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return f"ip:{forwarded.split(',')[0].strip()}"
    return f"ip:{request.client.host if request.client else 'unknown'}"


def _local_hit(scope: str, identity: str, limit: int, window: int) -> tuple[int, int]:
    now = time.monotonic()
    bucket = _local_windows[scope]
    start, count = bucket.get(identity, (now, 0))
    if now - start >= window:
        start, count = now, 0
    count += 1
    bucket[identity] = (start, count)
    if len(bucket) > 10_000:  # crude bound, dev-only path
        for key, (bucket_start, _) in list(bucket.items()):
            if now - bucket_start >= window:
                bucket.pop(key, None)
    retry_after = max(1, int(window - (now - start)))
    return count, retry_after


async def enforce_rate_limit(
    request: Request,
    scope: str,
    limit: int,
    window: int,
    user: AuthUser | None = None,
) -> None:
    """Raise :class:`RateLimitedError` when ``identity`` exceeds ``limit``."""
    settings = get_settings()
    if not settings.rag_rate_limit_enabled or limit <= 0:
        return

    identity = client_identity(request, user)
    key = f"ratelimit:{scope}:{identity.split(':', 1)[1]}"

    manager = get_redis_manager()
    count, ttl = await manager.incr_with_expiry(key, window)
    if count == 0:  # Redis unavailable — use the in-process window
        count, ttl = _local_hit(scope, identity, limit, window)

    if count > limit:
        logger.warning("rate_limited", scope=scope, identity=identity, count=count, limit=limit)
        raise RateLimitedError(retry_after=max(1, ttl))


def rate_limit(scope: str, limit: int | None = None, window: int | None = None):
    """FastAPI dependency factory applying a named rate limit."""

    async def _dependency(
        request: Request,
        user: Annotated[AuthUser | None, Depends(optional_user)] = None,
    ) -> None:
        settings = get_settings()
        effective_limit = limit if limit is not None else settings.rag_rate_limit_chat
        effective_window = window if window is not None else settings.rag_rate_limit_chat_window
        await enforce_rate_limit(request, scope, effective_limit, effective_window, user)

    return _dependency


def service_rate_limit(scope: str, limit: int | None = None, window: int | None = None):
    """Rate limit for service-token endpoints (no user resolution)."""

    async def _dependency(request: Request) -> None:
        settings = get_settings()
        effective_limit = limit if limit is not None else settings.rag_rate_limit_ingest
        effective_window = window if window is not None else settings.rag_rate_limit_ingest_window
        await enforce_rate_limit(request, scope, effective_limit, effective_window, None)

    return _dependency
