"""AsyncElasticsearch factory with retry/backoff."""

from __future__ import annotations

from elasticsearch import AsyncElasticsearch, TransportError
from tenacity import (
    AsyncRetrying,
    RetryError,
    retry_if_exception_type,
    stop_after_delay,
    wait_exponential,
)

from app.core.config import Settings, get_settings
from app.core.logging import get_logger

log = get_logger("search-svc.es")

_client: AsyncElasticsearch | None = None


def create_es_client(settings: Settings | None = None) -> AsyncElasticsearch:
    """Build a fresh client (used by tests and by the singleton below)."""
    cfg = settings or get_settings()
    kwargs: dict = {
        "hosts": [cfg.ELASTICSEARCH_URL],
        "request_timeout": cfg.ES_REQUEST_TIMEOUT,
        "max_retries": cfg.ES_MAX_RETRIES,
        "retry_on_timeout": True,
        "http_compress": True,
    }
    # Only pass credentials when both are configured — the client rejects None.
    basic_auth = cfg.elasticsearch_basic_auth
    if basic_auth is not None:
        kwargs["basic_auth"] = basic_auth
    return AsyncElasticsearch(**kwargs)


def get_es() -> AsyncElasticsearch:
    """Process-wide AsyncElasticsearch client (lazily created)."""
    global _client
    if _client is None:
        cfg = get_settings()
        _client = create_es_client(cfg)
        log.info("es_client_created", url=cfg.ELASTICSEARCH_URL)
    return _client


async def close_es() -> None:
    """Close the shared client (graceful shutdown)."""
    global _client
    if _client is not None:
        try:
            await _client.close()
        except Exception as exc:  # pragma: no cover - shutdown best effort
            log.warning("es_close_failed", error=str(exc))
        finally:
            _client = None
            log.info("es_client_closed")


async def ping_es(client: AsyncElasticsearch | None = None) -> bool:
    """True when the cluster answers."""
    try:
        return bool(await (client or get_es()).ping())
    except (TransportError, OSError) as exc:
        log.warning("es_ping_failed", error=str(exc))
        return False


async def cluster_health(client: AsyncElasticsearch | None = None) -> dict:
    """Raw `_cluster/health` payload (empty dict when unreachable)."""
    try:
        response = await (client or get_es()).cluster.health()
        return dict(response)
    except (TransportError, OSError) as exc:
        log.warning("es_cluster_health_failed", error=str(exc))
        return {}


async def wait_for_elasticsearch(
    client: AsyncElasticsearch | None = None,
    *,
    max_wait_seconds: int | None = None,
) -> bool:
    """Block until the cluster responds, with exponential backoff (tenacity).

    Returns False instead of raising when the deadline passes, so the service can
    still boot (and report `degraded` on `/health/ready`) while ES warms up.
    """
    es = client or get_es()
    deadline = max_wait_seconds or get_settings().ES_STARTUP_MAX_WAIT_SECONDS

    async def _ping_once() -> bool:
        if not await es.ping():
            raise ConnectionError("Elasticsearch is not answering ping")
        return True

    try:
        async for attempt in AsyncRetrying(
            stop=stop_after_delay(deadline),
            wait=wait_exponential(multiplier=0.5, min=0.5, max=5),
            retry=retry_if_exception_type((TransportError, ConnectionError, OSError)),
            reraise=True,
        ):
            with attempt:
                await _ping_once()
                log.info("es_connected", attempt=attempt.retry_state.attempt_number)
                return True
    except (RetryError, TransportError, ConnectionError, OSError) as exc:
        log.error("es_unreachable", error=str(exc), waited_seconds=deadline)
        return False
    return False
