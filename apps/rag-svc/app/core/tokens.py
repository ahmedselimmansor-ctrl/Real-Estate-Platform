"""Token counting.

``tiktoken`` is used when its BPE files are available (the Docker image warms
the cache at build time). Every other environment — an air-gapped CI box, a
laptop without network — falls back to a deterministic heuristic estimator so
chunking never fails and never blocks on a download.
"""

from __future__ import annotations

import functools
import re
import threading
from typing import Any

from app.core.config import Settings, get_settings
from app.core.logging import get_logger

logger = get_logger("rag-svc.tokens")

_ARABIC_RE = re.compile(
    "[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]"
)
_WHITESPACE_RE = re.compile(r"\s+")

#: Rough characters-per-token ratios, measured against cl100k_base.
_LATIN_CHARS_PER_TOKEN = 4.0
_ARABIC_CHARS_PER_TOKEN = 2.0


class TokenCounter:
    """Counts tokens with tiktoken, or estimates them when it is unavailable."""

    def __init__(self, settings: Settings | None = None) -> None:
        cfg = settings or get_settings()
        self._encoding_name = cfg.rag_tiktoken_encoding
        self._enabled = cfg.rag_use_tiktoken
        self._encoding: Any | None = None
        self._loaded = False
        self._lock = threading.Lock()

    # --- encoding ---------------------------------------------------------
    @property
    def encoding(self) -> Any | None:
        if self._loaded or not self._enabled:
            return self._encoding
        with self._lock:
            if self._loaded:
                return self._encoding
            self._loaded = True
            try:
                import tiktoken

                self._encoding = tiktoken.get_encoding(self._encoding_name)
                logger.info("tiktoken_loaded", encoding=self._encoding_name)
            except Exception as exc:  # noqa: BLE001 - any failure must degrade, not crash
                logger.warning(
                    "tiktoken_unavailable",
                    encoding=self._encoding_name,
                    error=str(exc),
                    fallback="heuristic",
                )
                self._encoding = None
        return self._encoding

    @property
    def exact(self) -> bool:
        """True when counts come from a real BPE encoding."""
        return self.encoding is not None

    # --- counting ---------------------------------------------------------
    def count(self, text: str) -> int:
        if not text:
            return 0
        encoding = self.encoding
        if encoding is not None:
            try:
                return len(encoding.encode(text, disallowed_special=()))
            except Exception:  # noqa: BLE001 - never fail a request over counting
                return estimate_tokens(text)
        return estimate_tokens(text)

    def count_many(self, texts: list[str]) -> list[int]:
        return [self.count(text) for text in texts]

    def truncate(self, text: str, max_tokens: int) -> str:
        """Cut ``text`` down to at most ``max_tokens`` tokens on a word boundary."""
        if max_tokens <= 0 or not text:
            return ""
        if self.count(text) <= max_tokens:
            return text
        encoding = self.encoding
        if encoding is not None:
            try:
                tokens = encoding.encode(text, disallowed_special=())
                return encoding.decode(tokens[:max_tokens])
            except Exception:  # noqa: BLE001
                pass
        words = text.split()
        low, high = 0, len(words)
        while low < high:
            mid = (low + high + 1) // 2
            if self.count(" ".join(words[:mid])) <= max_tokens:
                low = mid
            else:
                high = mid - 1
        return " ".join(words[:low])


def estimate_tokens(text: str) -> int:
    """Script-aware heuristic token estimate (deterministic, offline)."""
    if not text:
        return 0
    normalized = _WHITESPACE_RE.sub(" ", text).strip()
    if not normalized:
        return 0
    arabic_chars = len(_ARABIC_RE.findall(normalized))
    other_chars = max(0, len(normalized) - arabic_chars)
    estimate = arabic_chars / _ARABIC_CHARS_PER_TOKEN + other_chars / _LATIN_CHARS_PER_TOKEN
    words = normalized.count(" ") + 1
    return max(1, int(round(max(estimate, words * 0.75))))


@functools.lru_cache(maxsize=1)
def get_token_counter() -> TokenCounter:
    """Process-wide token counter."""
    return TokenCounter()
