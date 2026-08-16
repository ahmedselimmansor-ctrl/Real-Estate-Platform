"""Typed retrieval results.

:class:`RetrievedChunk` is the single currency of the retrieval layer: hybrid
search returns it, the chat graph puts it in the prompt, and
:meth:`RetrievedChunk.as_source` renders it for the SSE ``sources`` event and the
``chat_messages.sources`` JSONB column (CONTRACT §2, §6).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

#: Longest snippet echoed back to the browser in a `sources` event.
SNIPPET_CHARS = 320


@dataclass(slots=True)
class RetrievedChunk:
    """One chunk returned by hybrid search, with its provenance and scores."""

    chunk_id: str
    document_id: str
    content: str
    ordinal: int = 0
    token_count: int = 0
    source_type: str = "unknown"
    source_id: str = ""
    title: str = ""
    uri: str | None = None
    lang: str = "en"
    metadata: dict[str, Any] = field(default_factory=dict)

    #: Final score used for ordering (rerank score when available).
    score: float = 0.0
    vector_score: float | None = None
    text_score: float | None = None
    fusion_score: float | None = None
    rerank_score: float | None = None
    vector_rank: int | None = None
    text_rank: int | None = None

    # --- derived ----------------------------------------------------------
    @property
    def url(self) -> str | None:
        return str(self.metadata.get("url") or "") or self.uri

    @property
    def snippet(self) -> str:
        text = " ".join(self.content.split())
        if len(text) <= SNIPPET_CHARS:
            return text
        return text[: SNIPPET_CHARS - 1].rstrip() + "…"

    def as_source(self) -> dict[str, Any]:
        """Citation payload for the API (camelCase, CONTRACT §4 conventions)."""
        payload: dict[str, Any] = {
            "chunkId": self.chunk_id,
            "documentId": self.document_id,
            "type": self.source_type,
            "title": self.title or str(self.metadata.get("title") or ""),
            "url": self.url,
            "lang": self.lang,
            "score": round(float(self.score), 6),
            "snippet": self.snippet,
        }
        for key in (
            "propertyId",
            "slug",
            "price",
            "currency",
            "area",
            "compound",
            "developer",
            "propertyType",
            "bedrooms",
            "areaSqm",
            "image",
        ):
            value = self.metadata.get(key)
            if value is not None:
                payload[key] = value
        return payload

    def as_context(self, index: int) -> str:
        """Numbered context block handed to the generation model."""
        header = self.title or self.source_type
        location = self.url or self.uri or ""
        suffix = f" ({location})" if location else ""
        return f"[{index}] {header}{suffix}\n{self.content.strip()}"
