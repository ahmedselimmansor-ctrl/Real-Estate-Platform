"""Loader contract shared by every ingestion source.

A loader turns one upstream source (Mongo listings, a seed file, a web page)
into :class:`~app.ingestion.documents.RawDocument` objects. It never touches the
database and never embeds anything — that is the pipeline's job — which keeps
loaders trivially unit-testable and offline.

Rendered documents deliberately contain **no markdown headings**: a listing or a
FAQ entry is one coherent passage, and the chunker treats headings as hard
boundaries (see :mod:`app.ingestion.chunker`). Only the URL loader, which
ingests real pages, emits headings.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass, field
from typing import Protocol, runtime_checkable

from app.ingestion.documents import RawDocument

#: Languages rendered for every file-backed source.
DEFAULT_LANGS: tuple[str, ...] = ("en", "ar")


@dataclass(slots=True)
class IngestOptions:
    """Everything POST /api/chat/ingest can ask a loader to do."""

    ids: list[str] = field(default_factory=list)
    urls: list[str] = field(default_factory=list)
    langs: tuple[str, ...] = DEFAULT_LANGS
    limit: int | None = None
    #: Re-embed even when the checksum is unchanged.
    force: bool = False
    #: Delete stored documents the loader no longer produces.
    prune: bool = False

    def wants(self, lang: str) -> bool:
        return lang in self.langs

    def selected(self, *candidates: str | None) -> bool:
        """True when no id filter is set, or one of ``candidates`` matches it."""
        if not self.ids:
            return True
        wanted = {value.lower() for value in self.ids if value}
        return any(candidate and candidate.lower() in wanted for candidate in candidates)


@runtime_checkable
class Loader(Protocol):
    """Produces the documents for one ``source``."""

    source: str
    #: ``rag_documents.source_type`` written for this loader's documents.
    source_type: str
    #: Whether stale documents may be pruned after a full (unfiltered) run.
    prunable: bool

    async def load(self, options: IngestOptions) -> list[RawDocument]: ...


def apply_limit(documents: Sequence[RawDocument], limit: int | None) -> list[RawDocument]:
    """Trim to ``limit`` *source records* (all language variants kept together)."""
    items = list(documents)
    if not limit or limit <= 0:
        return items
    seen: list[str] = []
    kept: list[RawDocument] = []
    for document in items:
        base = document.metadata.get("recordId") or document.source_id.rsplit(":", 1)[0]
        if base not in seen:
            if len(seen) >= limit:
                continue
            seen.append(base)
        kept.append(document)
    return kept


def language_source_id(record_id: str, lang: str) -> str:
    """``<record id>:<lang>`` — the natural key of one rendered variant."""
    return f"{record_id}:{lang}"
