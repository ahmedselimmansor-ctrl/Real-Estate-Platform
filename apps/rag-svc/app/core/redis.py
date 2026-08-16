"""Redis client wrapper.

Redis is a *soft* dependency for rag-svc: it backs rate limiting and SSE stream
hand-off (``chat:stream:{threadId}``, CONTRACT §2). When it is unavailable the
service keeps serving — callers degrade to in-process behaviour.
"""

from __future__ import annotations

from typing import Any

import orjson
import redis.asyncio as aioredis
from redis.asyncio import Redis
from redis.exceptions import RedisError

from app.core.config import Settings, get_settings
from app.core.logging import get_logger

logger = get_logger("rag-svc.redis")


class RedisManager:
    """Lazily-connected Redis client that never raises on connection failure."""

    def __init__(self, settings: Settings | None = None) -> None:
        self._settings = settings or get_settings()
        self._client: Redis | None = None
        self._healthy = False

    # --- lifecycle --------------------------------------------------------
    async def connect(self) -> bool:
        """Create the client and ping it once. Returns the health flag."""
        if self._client is None:
            self._client = aioredis.from_url(
                self._settings.redis_url,
                encoding="utf-8",
                decode_responses=True,
                socket_connect_timeout=3,
                socket_timeout=5,
                health_check_interval=30,
                retry_on_timeout=True,
            )
        self._healthy = await self.ping()
        return self._healthy

    async def close(self) -> None:
        if self._client is not None:
            try:
                await self._client.aclose()
            except (RedisError, OSError) as exc:  # pragma: no cover - shutdown path
                logger.warning("redis_close_failed", error=str(exc))
            finally:
                self._client = None
                self._healthy = False

    # --- state ------------------------------------------------------------
    @property
    def client(self) -> Redis | None:
        return self._client

    @property
    def healthy(self) -> bool:
        return self._healthy

    async def ping(self) -> bool:
        if self._client is None:
            return False
        try:
            await self._client.ping()
            self._healthy = True
        except (RedisError, OSError) as exc:
            logger.warning("redis_ping_failed", error=str(exc))
            self._healthy = False
        return self._healthy

    # --- helpers ----------------------------------------------------------
    async def get_json(self, key: str) -> Any | None:
        if self._client is None:
            return None
        try:
            raw = await self._client.get(key)
        except (RedisError, OSError) as exc:
            logger.warning("redis_get_failed", key=key, error=str(exc))
            return None
        if raw is None:
            return None
        try:
            return orjson.loads(raw)
        except orjson.JSONDecodeError:
            return None

    async def set_json(self, key: str, value: Any, ttl: int | None = None) -> bool:
        if self._client is None:
            return False
        try:
            await self._client.set(
                key,
                orjson.dumps(value).decode("utf-8"),
                ex=ttl if ttl is not None else self._settings.redis_ttl_default,
            )
            return True
        except (RedisError, OSError) as exc:
            logger.warning("redis_set_failed", key=key, error=str(exc))
            return False

    async def delete(self, *keys: str) -> int:
        if self._client is None or not keys:
            return 0
        try:
            return int(await self._client.delete(*keys))
        except (RedisError, OSError) as exc:
            logger.warning("redis_delete_failed", error=str(exc))
            return 0

    async def incr_with_expiry(self, key: str, window_seconds: int) -> tuple[int, int]:
        """Atomic sliding-window counter. Returns ``(count, ttl_seconds)``.

        ``(0, window)`` is returned when Redis is unreachable so that callers
        fail open rather than locking users out.
        """
        if self._client is None:
            return 0, window_seconds
        try:
            pipe = self._client.pipeline()
            pipe.incr(key, 1)
            pipe.ttl(key)
            count, ttl = await pipe.execute()
            count = int(count)
            ttl = int(ttl)
            if ttl < 0:
                await self._client.expire(key, window_seconds)
                ttl = window_seconds
            return count, ttl
        except (RedisError, OSError) as exc:
            logger.warning("redis_ratelimit_failed", key=key, error=str(exc))
            return 0, window_seconds


_manager: RedisManager | None = None


def get_redis_manager() -> RedisManager:
    """Process-wide Redis manager singleton."""
    global _manager
    if _manager is None:
        _manager = RedisManager()
    return _manager
