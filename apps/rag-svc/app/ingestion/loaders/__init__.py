"""Ingestion sources, keyed by the ``source`` field of POST /api/chat/ingest."""

from __future__ import annotations

from app.core.errors import ValidationError
from app.ingestion.loaders.base import DEFAULT_LANGS, IngestOptions, Loader
from app.ingestion.loaders.catalog import area_loader, compound_loader, developer_loader
from app.ingestion.loaders.faq import FaqLoader
from app.ingestion.loaders.properties import PropertyLoader
from app.ingestion.loaders.url import UrlLoader

#: Sources that can be ingested individually.
LOADERS: dict[str, Loader] = {
    "properties": PropertyLoader(),
    "faq": FaqLoader(),
    "compounds": compound_loader(),
    "developers": developer_loader(),
    "areas": area_loader(),
    "url": UrlLoader(),
}

#: ``all`` fans out to every source that needs no request payload.
BULK_SOURCES: tuple[str, ...] = ("properties", "faq", "compounds", "developers", "areas")

#: Everything POST /api/chat/ingest accepts for ``source``.
INGEST_SOURCES: tuple[str, ...] = (*LOADERS.keys(), "all")


def get_loader(source: str) -> Loader:
    try:
        return LOADERS[source]
    except KeyError as exc:
        raise ValidationError(
            f"Unknown ingestion source '{source}'",
            details=[{"field": "source", "allowed": list(INGEST_SOURCES)}],
        ) from exc


def expand_sources(source: str) -> list[str]:
    """``all`` -> every bulk source; anything else -> itself."""
    if source == "all":
        return list(BULK_SOURCES)
    get_loader(source)
    return [source]


__all__ = [
    "BULK_SOURCES",
    "DEFAULT_LANGS",
    "INGEST_SOURCES",
    "LOADERS",
    "IngestOptions",
    "Loader",
    "expand_sources",
    "get_loader",
]
