"""Redis client, response cache and sliding-window rate limiter.

Key namespaces are the ones fixed by CONTRACT §2:

    cache:search:{hash}              TTL 60s   (search responses)
    ratelimit:{scope}:{ip|userId}    TTL window

Redis is treated as a *best effort* dependency: if it is down the cache misses
and the rate limiter fails open, so search keeps serving from Elasticsearch.
"""

from __future__ import annotations

import functools
import hashlib
import time
from collections.abc import Awaitable, Callable, Iterable
from typing import Annotated, Any, TypeVar

import orjson
import redis.asyncio as aioredis
from fastapi import Depends, Request
from redis.asyncio import Redis
from redis.exceptions import RedisError

from app.core.config import get_settings
from app.core.errors import RateLimitedError
from app.core.logging import get_logger
from app.core.security import AuthenticatedUser, optional_user

log = get_logger("search-svc.redis")

CACHE_NAMESPACE = "cache:search"
RATE_LIMIT_NAMESPACE = "ratelimit"

#: Where `app.services.runs` mirrors index-run reports.
REINDEX_BOOKKEEPING_PREFIX = f"{CACHE_NAMESPACE}:reindex"

#: Keys that live inside the cache namespace but are *bookkeeping*, not cached
#: responses — a post-reindex cache flush must leave them alone (otherwise the
#: run that triggered the flush would erase its own report).
CACHE_PROTECTED_PREFIXES: tuple[str, ...] = (REINDEX_BOOKKEEPING_PREFIX,)

T = TypeVar("T")

_redis: Redis | None = None


# --------------------------------------------------------------------- client


def get_redis() -> Redis:
    """Process-wide async Redis client (lazily created)."""
    global _redis
    if _redis is None:
        settings = get_settings()
        _redis = aioredis.from_url(
            settings.REDIS_URL,
            encoding="utf-8",
            decode_responses=True,
            socket_timeout=2.0,
            socket_connect_timeout=2.0,
            health_check_interval=30,
            retry_on_timeout=True,
        )
        log.info("redis_client_created", url=settings.REDIS_URL)
    return _redis


async def close_redis() -> None:
    """Close the shared client (graceful shutdown)."""
    global _redis
    if _redis is not None:
        try:
            await _redis.aclose()
        except Exception as exc:  # pragma: no cover - shutdown best effort
            log.warning("redis_close_failed", error=str(exc))
        finally:
            _redis = None
            log.info("redis_client_closed")


async def ping_redis() -> bool:
    """True when Redis answers PING."""
    try:
        return bool(await get_redis().ping())
    except (RedisError, OSError) as exc:
        log.warning("redis_ping_failed", error=str(exc))
        return False


# ---------------------------------------------------------------------- cache


def _stable_dumps(value: Any) -> bytes:
    return orjson.dumps(value, option=orjson.OPT_SORT_KEYS, default=str)


def build_cache_key(prefix: str, payload: Any, *, namespace: str = CACHE_NAMESPACE) -> str:
    """`cache:search:{prefix}:{hash}` — deterministic for equal payloads."""
    digest = hashlib.sha1(_stable_dumps(payload)).hexdigest()[:20]  # noqa: S324 - cache key only
    return f"{namespace}:{prefix}:{digest}" if prefix else f"{namespace}:{digest}"


async def cache_get(key: str) -> Any | None:
    if not get_settings().CACHE_ENABLED:
        return None
    try:
        raw = await get_redis().get(key)
    except (RedisError, OSError) as exc:
        log.warning("cache_get_failed", key=key, error=str(exc))
        return None
    if raw is None:
        return None
    try:
        return orjson.loads(raw)
    except orjson.JSONDecodeError:
        log.warning("cache_decode_failed", key=key)
        return None


async def cache_set(key: str, value: Any, ttl: int) -> bool:
    if not get_settings().CACHE_ENABLED:
        return False
    try:
        await get_redis().set(key, _stable_dumps(value), ex=max(1, int(ttl)))
        return True
    except (RedisError, OSError, TypeError) as exc:
        log.warning("cache_set_failed", key=key, error=str(exc))
        return False


async def cache_delete(*keys: str) -> int:
    if not keys:
        return 0
    try:
        return int(await get_redis().delete(*keys))
    except (RedisError, OSError) as exc:
        log.warning("cache_delete_failed", error=str(exc))
        return 0


async def invalidate_namespace(pattern: str = f"{CACHE_NAMESPACE}:*") -> int:
    """SCAN-and-delete every cached search response (used after (re)indexing).

    Keys under `CACHE_PROTECTED_PREFIXES` (index-run reports) survive the sweep.
    """
    removed = 0
    try:
        client = get_redis()
        async for key in client.scan_iter(match=pattern, count=500):
            if str(key).startswith(CACHE_PROTECTED_PREFIXES):
                continue
            removed += int(await client.delete(key))
    except (RedisError, OSError) as exc:
        log.warning("cache_invalidate_failed", pattern=pattern, error=str(exc))
        return removed
    if removed:
        log.info("cache_invalidated", pattern=pattern, keys=removed)
    return removed


def cached(
    key: str,
    ttl: int | None = None,
    *,
    namespace: str = CACHE_NAMESPACE,
    skip: Callable[..., bool] | None = None,
) -> Callable[[Callable[..., Awaitable[T]]], Callable[..., Awaitable[T]]]:
    """Cache an async function's JSON-serializable result under `cache:search:*`.

    Example:
        @cached("results", ttl=60)
        async def run_search(query: dict) -> dict: ...
    """

    def decorator(func: Callable[..., Awaitable[T]]) -> Callable[..., Awaitable[T]]:
        @functools.wraps(func)
        async def wrapper(*args: Any, **kwargs: Any) -> T:
            settings = get_settings()
            effective_ttl = settings.SEARCH_CACHE_TTL if ttl is None else ttl
            if not settings.CACHE_ENABLED or (skip is not None and skip(*args, **kwargs)):
                return await func(*args, **kwargs)

            cache_key = build_cache_key(
                f"{key}:{func.__name__}",
                {"args": [a for a in args if _is_serializable(a)], "kwargs": kwargs},
                namespace=namespace,
            )
            hit = await cache_get(cache_key)
            if hit is not None:
                log.debug("cache_hit", key=cache_key)
                return hit  # type: ignore[return-value]

            result = await func(*args, **kwargs)
            await cache_set(cache_key, result, effective_ttl)
            log.debug("cache_store", key=cache_key, ttl=effective_ttl)
            return result

        return wrapper

    return decorator


def _is_serializable(value: Any) -> bool:
    return isinstance(value, str | int | float | bool | list | dict | tuple | type(None))


# --------------------------------------------------------------- rate limiter


async def sliding_window_hit(
    key: str,
    *,
    limit: int,
    window_seconds: int,
) -> tuple[bool, int, int]:
    """Record a hit in a sorted-set sliding window.

    Returns `(allowed, remaining, retry_after_seconds)`. Fails open when Redis is
    unreachable so a cache outage never takes search down.
    """
    now_ms = int(time.time() * 1000)
    window_ms = max(1, window_seconds) * 1000
    member = f"{now_ms}-{time.perf_counter_ns()}"

    try:
        client = get_redis()
        async with client.pipeline(transaction=True) as pipe:
            pipe.zremrangebyscore(key, 0, now_ms - window_ms)
            pipe.zadd(key, {member: now_ms})
            pipe.zcard(key)
            pipe.expire(key, window_seconds)
            results = await pipe.execute()
        used = int(results[2])
    except (RedisError, OSError) as exc:
        log.warning("rate_limit_unavailable", key=key, error=str(exc))
        return True, limit, 0

    if used > limit:
        try:
            await get_redis().zrem(key, member)
        except (RedisError, OSError):  # pragma: no cover - best effort rollback
            pass
        return False, 0, window_seconds
    return True, max(0, limit - used), 0


def client_identifier(request: Request, user: AuthenticatedUser | None) -> str:
    """User id when authenticated, otherwise the (proxy-aware) client IP."""
    if user is not None:
        return f"user:{user.id}"
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        return f"ip:{forwarded.split(',')[0].strip()}"
    real_ip = request.headers.get("x-real-ip")
    if real_ip:
        return f"ip:{real_ip.strip()}"
    return f"ip:{request.client.host if request.client else 'unknown'}"


class RateLimiter:
    """FastAPI dependency enforcing `ratelimit:{scope}:{ip|userId}` (CONTRACT §2)."""

    def __init__(self, scope: str, *, limit: int | None = None, window_seconds: int | None = None):
        self.scope = scope
        self._limit = limit
        self._window = window_seconds

    @property
    def limit(self) -> int:
        if self._limit is not None:
            return self._limit
        return get_settings().RATE_LIMIT_SEARCH_MAX

    @property
    def window(self) -> int:
        if self._window is not None:
            return self._window
        return get_settings().RATE_LIMIT_SEARCH_WINDOW

    async def __call__(
        self,
        request: Request,
        user: Annotated[AuthenticatedUser | None, Depends(optional_user)] = None,
    ) -> None:
        await self._enforce(request, user)

    async def _enforce(
        self, request: Request, user: AuthenticatedUser | None = None
    ) -> None:
        settings = get_settings()
        if not settings.RATE_LIMIT_ENABLED:
            return

        identity = client_identifier(request, user)
        key = f"{RATE_LIMIT_NAMESPACE}:{self.scope}:{identity}"
        allowed, remaining, retry_after = await sliding_window_hit(
            key, limit=self.limit, window_seconds=self.window
        )
        request.state.rate_limit_remaining = remaining
        request.state.rate_limit_limit = self.limit
        if not allowed:
            log.warning("rate_limited", scope=self.scope, identity=identity, limit=self.limit)
            raise RateLimitedError(
                f"Rate limit of {self.limit} requests per {self.window}s exceeded",
                retry_after=retry_after or self.window,
            )


def rate_limiter(
    scope: str, *, limit: int | None = None, window_seconds: int | None = None
) -> Callable[..., Awaitable[None]]:
    """FastAPI dependency enforcing a named rate limit.

    Returns a **function**, not a :class:`RateLimiter` instance. FastAPI resolves
    a dependency's annotations against ``call.__globals__``; a class instance has
    no ``__globals__``, so under ``from __future__ import annotations`` the
    ``request: Request`` hint stays an unresolved string and FastAPI tries to
    turn it into a request body. A closure carries this module's globals, so the
    hints resolve correctly.
    """
    limiter = RateLimiter(scope, limit=limit, window_seconds=window_seconds)

    async def dependency(
        request: Request,
        user: Annotated[AuthenticatedUser | None, Depends(optional_user)] = None,
    ) -> None:
        await limiter._enforce(request, user)

    dependency.__name__ = f"rate_limit_{scope.replace(':', '_')}"
    return dependency


def rate_limit_headers(request: Request) -> Iterable[tuple[str, str]]:
    """Expose the limiter budget on the response (used by the middleware)."""
    limit = getattr(request.state, "rate_limit_limit", None)
    remaining = getattr(request.state, "rate_limit_remaining", None)
    if limit is None or remaining is None:
        return ()
    return (("X-RateLimit-Limit", str(limit)), ("X-RateLimit-Remaining", str(remaining)))
