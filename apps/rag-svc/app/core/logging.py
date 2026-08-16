"""Structured JSON logging (CONTRACT §10.6).

Every log line carries the ``X-Request-Id`` of the request that produced it,
bound through :mod:`structlog` context variables by the request middleware.
"""

from __future__ import annotations

import logging
import sys
from typing import Any

import orjson
import structlog

_CONFIGURED = False


def _orjson_dumps(obj: Any, default: Any = None, **_: Any) -> str:
    return orjson.dumps(obj, default=default).decode("utf-8")


def configure_logging(level: str = "INFO", *, json_logs: bool = True) -> None:
    """Configure stdlib logging + structlog once per process."""
    global _CONFIGURED
    if _CONFIGURED:
        return

    log_level = getattr(logging, level.upper(), logging.INFO)

    shared_processors: list[structlog.types.Processor] = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_log_level,
        structlog.processors.TimeStamper(fmt="iso", utc=True),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.UnicodeDecoder(),
    ]

    # `add_logger_name` reads `logger.name`, which only exists on stdlib
    # loggers. Native structlog calls go through `PrintLoggerFactory`, whose
    # `PrintLogger` has no `.name` — so this processor belongs to the
    # stdlib (`foreign_pre_chain`) path only. `get_logger` binds the name
    # explicitly for native calls.
    foreign_processors: list[structlog.types.Processor] = [
        *shared_processors,
        structlog.stdlib.add_logger_name,
    ]

    renderer: structlog.types.Processor
    if json_logs:
        renderer = structlog.processors.JSONRenderer(serializer=_orjson_dumps)
    else:
        renderer = structlog.dev.ConsoleRenderer(colors=True)

    structlog.configure(
        processors=[
            *shared_processors,
            structlog.processors.format_exc_info,
            renderer,
        ],
        wrapper_class=structlog.make_filtering_bound_logger(log_level),
        logger_factory=structlog.PrintLoggerFactory(file=sys.stdout),
        cache_logger_on_first_use=True,
    )

    # Route stdlib loggers (uvicorn, sqlalchemy, httpx) through the same sink.
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(
        structlog.stdlib.ProcessorFormatter(
            foreign_pre_chain=foreign_processors,
            processors=[
                structlog.stdlib.ProcessorFormatter.remove_processors_meta,
                renderer,
            ],
        )
    )
    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(log_level)

    for noisy in ("uvicorn", "uvicorn.error", "uvicorn.access", "httpx", "httpcore"):
        logging.getLogger(noisy).handlers = []
        logging.getLogger(noisy).propagate = True
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)

    _CONFIGURED = True


def get_logger(name: str = "rag-svc") -> structlog.stdlib.BoundLogger:
    """Return a bound structlog logger.

    The name is bound into the event dict explicitly because the native
    structlog path cannot use `structlog.stdlib.add_logger_name` (see
    `configure_logging`).
    """
    return structlog.get_logger(name).bind(logger=name)  # type: ignore[no-any-return]


def bind_request_id(request_id: str) -> None:
    structlog.contextvars.bind_contextvars(request_id=request_id)


def clear_request_context() -> None:
    structlog.contextvars.clear_contextvars()
