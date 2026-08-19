"""Token-aware chunking.

Targets ~``RAG_CHUNK_TOKENS`` (500) token chunks with ~``RAG_CHUNK_OVERLAP_TOKENS``
(80) tokens of overlap, and it never splits mid-sentence when it can avoid it:

* markdown headings are hard boundaries — a chunk never spans two sections, and
  the heading path is prepended so an isolated chunk still reads in context;
* inside a section, text is accumulated sentence by sentence (line by line for
  bullet lists) until the budget is reached;
* the next chunk restarts with the trailing sentences of the previous one, up to
  the overlap budget, so answers that straddle a boundary stay retrievable;
* a single sentence longer than the budget is hard-split on word boundaries.

Both English and Arabic are handled: sentence terminators include ``؟`` / ``۔``,
and token counting is script-aware (see :mod:`app.core.tokens`).
"""

from __future__ import annotations

import re
from collections.abc import Iterator, Sequence
from dataclasses import dataclass, field
from typing import Any

from app.core.config import Settings, get_settings
from app.core.tokens import TokenCounter, get_token_counter

HEADING_RE = re.compile(r"^(#{1,6})\s+(.+?)\s*#*$")
SENTENCE_SPLIT_RE = re.compile(r"(?<=[.!?؟۔…])[\s ]+")
WHITESPACE_RE = re.compile(r"[ \t ]+")


@dataclass(slots=True)
class Chunk:
    """One embeddable slice of a document."""

    ordinal: int
    content: str
    token_count: int
    heading: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


def split_sentences(line: str) -> list[str]:
    """Split a single line into sentences (English + Arabic terminators)."""
    cleaned = WHITESPACE_RE.sub(" ", line).strip()
    if not cleaned:
        return []
    return [part.strip() for part in SENTENCE_SPLIT_RE.split(cleaned) if part.strip()]


def iter_sections(text: str) -> Iterator[tuple[tuple[str, ...], list[str]]]:
    """Yield ``(heading_path, sentences)`` for every markdown section."""
    heading_stack: list[str] = []
    current_path: tuple[str, ...] = ()
    units: list[str] = []

    for raw_line in (text or "").splitlines():
        line = raw_line.rstrip()
        heading = HEADING_RE.match(line.strip())
        if heading:
            if units:
                yield current_path, units
                units = []
            level = len(heading.group(1))
            title = heading.group(2).strip()
            heading_stack = heading_stack[: level - 1]
            heading_stack.append(title)
            current_path = tuple(heading_stack)
            continue
        if not line.strip():
            continue
        units.extend(split_sentences(line))

    if units:
        yield current_path, units


class TokenAwareChunker:
    """Splits documents into overlapping, sentence-aligned, token-bounded chunks."""

    def __init__(
        self,
        counter: TokenCounter | None = None,
        *,
        chunk_tokens: int | None = None,
        overlap_tokens: int | None = None,
        min_tokens: int | None = None,
        settings: Settings | None = None,
    ) -> None:
        cfg = settings or get_settings()
        self.counter = counter or get_token_counter()
        self.chunk_tokens = max(32, chunk_tokens or cfg.rag_chunk_tokens)
        requested_overlap = (
            overlap_tokens if overlap_tokens is not None else cfg.rag_chunk_overlap_tokens
        )
        # Overlap must stay well below the budget or chunking cannot progress.
        self.overlap_tokens = max(0, min(requested_overlap, self.chunk_tokens // 2))
        self.min_tokens = max(1, min(min_tokens or cfg.rag_chunk_min_tokens, self.chunk_tokens))

    # --- public API -------------------------------------------------------
    def split(self, text: str, *, metadata: dict[str, Any] | None = None) -> list[Chunk]:
        """Chunk ``text``; every chunk carries a copy of ``metadata``."""
        base_metadata = dict(metadata or {})
        chunks: list[Chunk] = []

        for heading_path, units in iter_sections(text):
            heading = " > ".join(heading_path) if heading_path else None
            prefix = f"{heading}\n" if heading else ""
            prefix_tokens = self.counter.count(prefix)
            budget = max(self.min_tokens, self.chunk_tokens - prefix_tokens)
            overlap_budget = min(self.overlap_tokens, max(0, budget // 2))

            current: list[str] = []
            current_tokens = 0

            for unit in units:
                unit_tokens = self.counter.count(unit)

                if unit_tokens > budget:
                    if current:
                        chunks.append(
                            self._make(len(chunks), prefix, current, heading, base_metadata)
                        )
                        current, current_tokens = [], 0
                    for piece in self._hard_split(unit, budget, overlap_budget):
                        chunks.append(
                            self._make(len(chunks), prefix, [piece], heading, base_metadata)
                        )
                    continue

                if current and current_tokens + unit_tokens > budget:
                    chunks.append(self._make(len(chunks), prefix, current, heading, base_metadata))
                    current, current_tokens = self._overlap_tail(current, overlap_budget)
                    if current and current_tokens + unit_tokens > budget:
                        # The overlap would push the new chunk over budget: drop it.
                        current, current_tokens = [], 0

                current.append(unit)
                current_tokens += unit_tokens

            if current:
                chunks.append(self._make(len(chunks), prefix, current, heading, base_metadata))

        return self._merge_trailing_stub(chunks)

    # --- internals --------------------------------------------------------
    def _make(
        self,
        ordinal: int,
        prefix: str,
        units: Sequence[str],
        heading: str | None,
        metadata: dict[str, Any],
    ) -> Chunk:
        body = " ".join(unit.strip() for unit in units if unit.strip())
        content = f"{prefix}{body}".strip()
        chunk_metadata = dict(metadata)
        chunk_metadata["ordinal"] = ordinal
        if heading:
            chunk_metadata["heading"] = heading
        return Chunk(
            ordinal=ordinal,
            content=content,
            token_count=self.counter.count(content),
            heading=heading,
            metadata=chunk_metadata,
        )

    def _overlap_tail(self, units: list[str], overlap_budget: int) -> tuple[list[str], int]:
        """Trailing sentences of the flushed chunk, within the overlap budget.

        The tail is *duplicated* into the next chunk so a fact that straddles a
        boundary stays retrievable. Progress is still guaranteed: the caller
        drops the tail when it would not leave room for the next sentence.
        """
        if overlap_budget <= 0 or not units:
            return [], 0
        tail: list[str] = []
        total = 0
        for unit in reversed(units):
            unit_tokens = self.counter.count(unit)
            if total + unit_tokens > overlap_budget:
                break
            tail.insert(0, unit)
            total += unit_tokens
        return tail, total

    def _hard_split(self, unit: str, budget: int, overlap_budget: int) -> list[str]:
        """Split an over-long sentence on word boundaries, keeping the overlap."""
        words = unit.split(" ")
        pieces: list[str] = []
        current: list[str] = []
        current_tokens = 0

        for word in words:
            word_tokens = self.counter.count(word) or 1
            if word_tokens > budget:  # pathological single token
                if current:
                    pieces.append(" ".join(current))
                    current, current_tokens = [], 0
                pieces.extend(self._split_by_characters(word, budget))
                continue
            if current and current_tokens + word_tokens > budget:
                pieces.append(" ".join(current))
                current, current_tokens = self._word_overlap(current, overlap_budget)
                if current and current_tokens + word_tokens > budget:
                    current, current_tokens = [], 0
            current.append(word)
            current_tokens += word_tokens

        if current:
            pieces.append(" ".join(current))
        return [piece for piece in pieces if piece.strip()]

    def _word_overlap(self, words: list[str], overlap_budget: int) -> tuple[list[str], int]:
        if overlap_budget <= 0:
            return [], 0
        tail: list[str] = []
        total = 0
        for word in reversed(words):
            word_tokens = self.counter.count(word) or 1
            if total + word_tokens > overlap_budget:
                break
            tail.insert(0, word)
            total += word_tokens
        return tail, total

    def _split_by_characters(self, word: str, budget: int) -> list[str]:
        """Last-resort split for a single token larger than the whole budget."""
        approximate_chars = max(1, budget * 3)
        return [
            word[index : index + approximate_chars]
            for index in range(0, len(word), approximate_chars)
        ]

    def _merge_trailing_stub(self, chunks: list[Chunk]) -> list[Chunk]:
        """Fold a tiny trailing chunk into its predecessor when they fit."""
        if len(chunks) < 2:
            return chunks
        last = chunks[-1]
        previous = chunks[-2]
        if (
            last.token_count >= self.min_tokens
            or last.heading != previous.heading
            or previous.token_count + last.token_count > self.chunk_tokens
        ):
            return chunks

        tail = last.content.removeprefix(previous.heading or "").strip()
        merged_content = f"{previous.content} {tail}".strip()
        chunks[-2] = Chunk(
            ordinal=previous.ordinal,
            content=merged_content,
            token_count=self.counter.count(merged_content),
            heading=previous.heading,
            metadata=previous.metadata,
        )
        chunks.pop()
        return chunks


def chunk_text(
    text: str,
    *,
    metadata: dict[str, Any] | None = None,
    settings: Settings | None = None,
) -> list[Chunk]:
    """Convenience wrapper around :class:`TokenAwareChunker`."""
    return TokenAwareChunker(settings=settings).split(text, metadata=metadata)
