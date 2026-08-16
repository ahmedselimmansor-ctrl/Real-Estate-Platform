"""Structured JSON logging (CONTRACT §10.6).

All application and third-party (uvicorn / elastic-transport / pymongo) records
go through one structlog pipeline and are rendered as single-line JSON with the
current `X-Request-Id` attached.
"""

from __future__ import annotations

import logging
import sys
from typing import Any

import orjson
import structlog

_CONFIGURED = False

_NOISY_LOGGERS = (
    "uvicorn",
    "uvicorn.error",
    "uvicorn.access",
    "elastic_transport.transport",
    "elasticsearch",
    "pymongo",
    "asyncio",
    "httpx",
    "httpcore",
)


def _orjson_dumps(obj: Any, *, default: Any = None, **_: Any) -> str:
    return orjson.dumps(obj, default=default or str).decode("utf-8")


def _service_context(service: str, version: str, environment: str):
    def processor(_logger: Any, _name: str, event_dict: dict[str, Any]) -> dict[str, Any]:
        event_dict.setdefault("service", service)
        event_dict.setdefault("version", version)
        event_dict.setdefault("env", environment)
        return event_dict

    return processor


def configure_logging(
    *,
    level: str = "INFO",
    json_logs: bool = True,
    service: str = "search-svc",
    version: str = "1.0.0",
    environment: str = "development",
    force: bool = False,
) -> None:
    """Idempotently configure structlog + the stdlib root logger."""
    global _CONFIGURED
    if _CONFIGURED and not force:
        return

    shared_processors: list[Any] = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_log_level,
        structlog.stdlib.add_logger_name,
        structlog.processors.TimeStamper(fmt="iso", utc=True),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.UnicodeDecoder(),
    ]

    structlog.configure(
        processors=[
            *shared_processors,
            structlog.stdlib.ProcessorFormatter.wrap_for_formatter,
        ],
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )

    renderer: Any = (
        structlog.processors.JSONRenderer(serializer=_orjson_dumps)
        if json_logs
        else structlog.dev.ConsoleRenderer(colors=False)
    )

    formatter = structlog.stdlib.ProcessorFormatter(
        foreign_pre_chain=shared_processors,
        processors=[
            _service_context(service, version, environment),
            structlog.processors.format_exc_info,
            structlog.stdlib.ProcessorFormatter.remove_processors_meta,
            renderer,
        ],
    )

    handler = logging.StreamHandler(stream=sys.stdout)
    handler.setFormatter(formatter)

    root = logging.getLogger()
    for existing in list(root.handlers):
        root.removeHandler(existing)
    root.addHandler(handler)
    root.setLevel(level.upper())

    for name in _NOISY_LOGGERS:
        noisy = logging.getLogger(name)
        noisy.handlers = []
        noisy.propagate = True
    logging.getLogger("elastic_transport.transport").setLevel(logging.WARNING)
    logging.getLogger("pymongo").setLevel(logging.WARNING)
    logging.getLogger("httpx").setLevel(logging.WARNING)

    _CONFIGURED = True


def get_logger(name: str | None = None) -> structlog.stdlib.BoundLogger:
    """Return a bound structlog logger."""
    return structlog.stdlib.get_logger(name or "search-svc")
