"""Embedding providers.

Primary: ``tongyi-embedding-vision-flash`` on Alibaba Cloud Model Studio
(DashScope), called through its **OpenAI-compatible** endpoint —
``POST ${DASHSCOPE_BASE_URL}/embeddings`` with ``Authorization: Bearer
${DASHSCOPE_API_KEY}`` — producing ``EMBEDDING_DIM`` (1024) dimensional vectors.

Fallback: :class:`HashEmbeddingProvider`, a deterministic hashed bag-of-features
encoder used **only** when ``DASHSCOPE_API_KEY`` is absent, so the entire stack
runs keyless in development. It is lexical, not semantic — retrieval still works
because hybrid search fuses it with Postgres full-text ranking.
"""

from __future__ import annotations

import asyncio
import hashlib
import math
import re
import time
from collections import Counter
from collections.abc import Sequence

from app.core.config import Settings, get_settings
from app.core.errors import UpstreamError
from app.core.logging import get_logger
from app.providers.base import EmbeddingResult
from app.providers.http import ProviderHttpClient
from app.providers.vectors import fit_dimension, l2_normalize

logger = get_logger("rag-svc.provider.embeddings")

#: DashScope accepts at most 10 inputs per embedding request.
MAX_BATCH_SIZE = 10

#: Word characters across Latin digits/letters and the Arabic script blocks
#: (Arabic, Arabic Supplement, Extended-A and the presentation forms).
_TOKEN_RE = re.compile(
    "[0-9A-Za-z"
    "\u0600-\u06ff"  # Arabic
    "\u0750-\u077f"  # Arabic Supplement
    "\u08a0-\u08ff"  # Arabic Extended-A
    "\ufb50-\ufdff"  # Arabic Presentation Forms-A
    "\ufe70-\ufeff"  # Arabic Presentation Forms-B
    "]+",
    re.UNICODE,
)


def tokenize(text: str) -> list[str]:
    """Lowercase word tokenisation that keeps Arabic script intact."""
    return [token.lower() for token in _TOKEN_RE.findall(text or "")]


class DashScopeEmbeddingProvider:
    """OpenAI-compatible embeddings on DashScope."""

    name = "dashscope"

    def __init__(self, settings: Settings | None = None) -> None:
        cfg = settings or get_settings()
        self._settings = cfg
        self.model = cfg.embedding_model
        self.dim = cfg.embedding_dim
        self.available = True
        self._batch_size = min(max(1, cfg.rag_embedding_batch_size), MAX_BATCH_SIZE)
        self._concurrency = max(1, cfg.rag_embedding_concurrency)
        self._send_dimensions = True
        self._http = ProviderHttpClient(
            base_url=cfg.dashscope_base_url,
            api_key=cfg.dashscope_api_key,
            provider="dashscope-embeddings",
            timeout=cfg.rag_http_timeout,
            max_retries=cfg.rag_http_max_retries,
            backoff_seconds=cfg.rag_http_backoff_seconds,
            max_connections=cfg.rag_http_max_connections,
        )

    # --- public API -------------------------------------------------------
    async def embed_documents(self, texts: Sequence[str]) -> EmbeddingResult:
        cleaned = [_prepare(text) for text in texts]
        if not cleaned:
            return EmbeddingResult(vectors=[], model=self.model, provider=self.name)

        batches = [
            cleaned[index : index + self._batch_size]
            for index in range(0, len(cleaned), self._batch_size)
        ]
        semaphore = asyncio.Semaphore(self._concurrency)
        started = time.perf_counter()

        async def _run(batch: list[str]) -> tuple[list[list[float]], int]:
            async with semaphore:
                return await self._embed_batch(batch)

        results = await asyncio.gather(*(_run(batch) for batch in batches))

        vectors: list[list[float]] = []
        total_tokens = 0
        for batch_vectors, tokens in results:
            vectors.extend(batch_vectors)
            total_tokens += tokens

        logger.info(
            "embeddings_generated",
            provider=self.name,
            model=self.model,
            inputs=len(cleaned),
            batches=len(batches),
            total_tokens=total_tokens,
            latency_ms=round((time.perf_counter() - started) * 1000, 2),
        )
        return EmbeddingResult(
            vectors=vectors,
            model=self.model,
            provider=self.name,
            total_tokens=total_tokens,
        )

    async def embed_query(self, text: str) -> list[float]:
        result = await self.embed_documents([text])
        if not result.vectors:
            raise UpstreamError("Embedding provider returned no vector", code="EMBEDDING_EMPTY")
        return result.vectors[0]

    async def aclose(self) -> None:
        await self._http.aclose()

    # --- internals --------------------------------------------------------
    async def _embed_batch(self, batch: Sequence[str]) -> tuple[list[list[float]], int]:
        payload: dict[str, object] = {
            "model": self.model,
            "input": list(batch),
            "encoding_format": "float",
        }
        if self._send_dimensions:
            payload["dimensions"] = self.dim

        try:
            body = await self._http.post_json(
                "/embeddings", payload, operation="embeddings"
            )
        except UpstreamError as exc:
            # Some model revisions reject the optional `dimensions` parameter.
            if self._send_dimensions and "dimension" in str(exc).lower():
                logger.warning("embeddings_retry_without_dimensions", model=self.model)
                self._send_dimensions = False
                payload.pop("dimensions", None)
                body = await self._http.post_json(
                    "/embeddings", payload, operation="embeddings"
                )
            else:
                raise

        data = body.get("data")
        if not isinstance(data, list) or not data:
            raise UpstreamError(
                "DashScope embeddings response contained no data",
                code="EMBEDDING_BAD_RESPONSE",
            )

        ordered = sorted(data, key=lambda item: int(item.get("index", 0)))
        vectors: list[list[float]] = []
        for item in ordered:
            embedding = item.get("embedding")
            if not isinstance(embedding, list) or not embedding:
                raise UpstreamError(
                    "DashScope embeddings response contained an empty vector",
                    code="EMBEDDING_BAD_RESPONSE",
                )
            vectors.append(l2_normalize(fit_dimension(embedding, self.dim)))

        if len(vectors) != len(batch):
            raise UpstreamError(
                f"DashScope returned {len(vectors)} vectors for {len(batch)} inputs",
                code="EMBEDDING_COUNT_MISMATCH",
            )

        usage = body.get("usage") or {}
        total_tokens = int(usage.get("total_tokens") or usage.get("input_tokens") or 0)
        return vectors, total_tokens


class HashEmbeddingProvider:
    """Deterministic offline embeddings (no API key required).

    Features are word unigrams, word bigrams and character 3-grams, hashed with
    blake2b into ``dim`` buckets with a signed contribution (the hashing trick).
    Sublinear term-frequency weighting and L2 normalisation make the result a
    usable lexical vector: identical texts embed identically on every machine
    and every process, which keeps ``checksum``-based re-ingestion idempotent.
    """

    name = "offline-hash"

    def __init__(self, settings: Settings | None = None, dim: int | None = None) -> None:
        cfg = settings or get_settings()
        self._settings = cfg
        self.model = "offline-hash-v1"
        self.dim = dim or cfg.embedding_dim
        self.available = False

    async def embed_documents(self, texts: Sequence[str]) -> EmbeddingResult:
        vectors = [self.encode(text) for text in texts]
        logger.debug(
            "embeddings_generated_offline",
            provider=self.name,
            inputs=len(vectors),
            dim=self.dim,
        )
        return EmbeddingResult(
            vectors=vectors,
            model=self.model,
            provider=self.name,
            total_tokens=0,
            degraded=True,
        )

    async def embed_query(self, text: str) -> list[float]:
        return self.encode(text)

    async def aclose(self) -> None:
        return None

    # --- encoding ---------------------------------------------------------
    def encode(self, text: str) -> list[float]:
        tokens = tokenize(text)
        if not tokens:
            return [0.0] * self.dim

        features: Counter[str] = Counter()
        features.update(tokens)
        features.update(
            f"{first}_{second}" for first, second in zip(tokens, tokens[1:], strict=False)
        )
        for token in tokens:
            if len(token) >= 4:
                features.update(token[i : i + 3] for i in range(len(token) - 2))

        vector = [0.0] * self.dim
        for feature, count in features.items():
            digest = hashlib.blake2b(feature.encode("utf-8"), digest_size=8).digest()
            position = int.from_bytes(digest[:4], "big") % self.dim
            sign = 1.0 if digest[4] & 1 else -1.0
            vector[position] += sign * (1.0 + math.log(count))

        return l2_normalize(vector)


def _prepare(text: str) -> str:
    """Normalise whitespace and guard against empty inputs (providers 400 on '')."""
    cleaned = " ".join((text or "").split())
    return cleaned or " "


def build_embedding_provider(settings: Settings | None = None):
    """Pick DashScope when a key is configured, otherwise the offline encoder."""
    cfg = settings or get_settings()
    if cfg.dashscope_enabled:
        logger.info("embedding_provider_selected", provider="dashscope", model=cfg.embedding_model)
        return DashScopeEmbeddingProvider(cfg)
    logger.warning(
        "embedding_provider_fallback",
        provider="offline-hash",
        reason="DASHSCOPE_API_KEY is not configured",
    )
    return HashEmbeddingProvider(cfg)
