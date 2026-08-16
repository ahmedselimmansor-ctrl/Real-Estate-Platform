"""The unit of ingestion: a rendered, natural-language source document."""

from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from typing import Any

import orjson


@dataclass(slots=True)
class RawDocument:
    """A document to embed, before chunking.

    ``source_type`` + ``source_id`` is the natural key used for idempotent
    upserts into ``rag_documents``; ``checksum`` decides whether the existing
    chunks can be kept.
    """

    source_type: str
    source_id: str
    title: str
    text: str
    lang: str = "en"
    uri: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)

    @property
    def checksum(self) -> str:
        """Stable SHA-256 over everything that would change the chunks."""
        payload = orjson.dumps(
            {
                "source_type": self.source_type,
                "source_id": self.source_id,
                "title": self.title,
                "lang": self.lang,
                "uri": self.uri,
                "text": self.text,
                "metadata": self.metadata,
            },
            option=orjson.OPT_SORT_KEYS,
        )
        return hashlib.sha256(payload).hexdigest()

    def is_empty(self) -> bool:
        return not self.text.strip()

    def describe(self) -> str:
        return f"{self.source_type}:{self.source_id}"


def document_metadata(**values: Any) -> dict[str, Any]:
    """Drop ``None`` values so JSONB metadata stays compact and filterable."""
    return {key: value for key, value in values.items() if value is not None and value != ""}
