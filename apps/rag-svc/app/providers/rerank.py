"""Rerank providers.

Primary: ``qwen3-rerank`` on DashScope, called through the **native** endpoint

    POST ${DASHSCOPE_NATIVE_BASE_URL}/services/rerank/text-rerank/text-rerank
    {"model": …, "input": {"query": …, "documents": [...]},
     "parameters": {"top_n": …, "return_documents": false}}

The response only carries indexes and scores, which are mapped back onto the
caller's candidate list.

Fallback: :class:`LexicalRerankProvider`, an in-process BM25 scorer used only
when ``DASHSCOPE_API_KEY`` is absent.
"""

from __future__ import annotations

import math
import time
from collections import Counter
from collections.abc import Sequence

from app.core.config import Settings, get_settings
from app.core.errors import UpstreamError
from app.core.logging import get_logger
from app.providers.base import RerankResponse, RerankResult
from app.providers.embeddings import tokenize
from app.providers.http import ProviderHttpClient

logger = get_logger("rag-svc.provider.rerank")

RERANK_PATH = "/services/rerank/text-rerank/text-rerank"

BM25_K1 = 1.5
BM25_B = 0.75


class DashScopeRerankProvider:
    """``qwen3-rerank`` over the DashScope native API."""

    name = "dashscope"

    def __init__(self, settings: Settings | None = None) -> None:
        cfg = settings or get_settings()
        self._settings = cfg
        self.model = cfg.rerank_model
        self.available = True
        self._max_documents = max(1, cfg.rag_rerank_max_documents)
        self._max_chars = max(200, cfg.rag_rerank_max_chars)
        self._http = ProviderHttpClient(
            base_url=cfg.dashscope_native_base_url,
            api_key=cfg.dashscope_api_key,
            provider="dashscope-rerank",
            timeout=cfg.rag_http_timeout,
            max_retries=cfg.rag_http_max_retries,
            backoff_seconds=cfg.rag_http_backoff_seconds,
            max_connections=cfg.rag_http_max_connections,
        )
        self._fallback = LexicalRerankProvider(cfg)

    async def rerank(
        self, query: str, documents: Sequence[str], top_n: int
    ) -> RerankResponse:
        if not documents:
            return RerankResponse(results=[], model=self.model, provider=self.name)

        candidates = list(documents[: self._max_documents])
        payload = {
            "model": self.model,
            "input": {
                "query": query[: self._max_chars],
                "documents": [doc[: self._max_chars] for doc in candidates],
            },
            "parameters": {
                "top_n": min(max(1, top_n), len(candidates)),
                "return_documents": False,
            },
        }

        started = time.perf_counter()
        try:
            body = await self._http.post_json(RERANK_PATH, payload, operation="rerank")
        except UpstreamError as exc:
            logger.warning("rerank_failed_using_lexical", error=str(exc))
            response = await self._fallback.rerank(query, candidates, top_n)
            response.degraded = True
            return response

        results = _parse_results(body, len(candidates))
        if not results:
            logger.warning("rerank_empty_response_using_lexical", model=self.model)
            response = await self._fallback.rerank(query, candidates, top_n)
            response.degraded = True
            return response

        usage = body.get("usage") or {}
        logger.info(
            "rerank_completed",
            provider=self.name,
            model=self.model,
            candidates=len(candidates),
            returned=len(results),
            total_tokens=int(usage.get("total_tokens") or 0),
            latency_ms=round((time.perf_counter() - started) * 1000, 2),
        )
        return RerankResponse(
            results=results[:top_n], model=self.model, provider=self.name
        )

    async def aclose(self) -> None:
        await self._http.aclose()


class LexicalRerankProvider:
    """Deterministic BM25 reranking — the keyless fallback."""

    name = "offline-bm25"

    def __init__(self, settings: Settings | None = None) -> None:
        self._settings = settings or get_settings()
        self.model = "offline-bm25-v1"
        self.available = False

    async def rerank(
        self, query: str, documents: Sequence[str], top_n: int
    ) -> RerankResponse:
        scores = self.score(query, documents)
        ranked = sorted(
            (RerankResult(index=index, score=score) for index, score in enumerate(scores)),
            key=lambda item: item.score,
            reverse=True,
        )
        logger.debug(
            "rerank_completed_offline",
            provider=self.name,
            candidates=len(documents),
            returned=min(top_n, len(ranked)),
        )
        return RerankResponse(
            results=ranked[: max(1, top_n)],
            model=self.model,
            provider=self.name,
            degraded=True,
        )

    async def aclose(self) -> None:
        return None

    # --- scoring ----------------------------------------------------------
    def score(self, query: str, documents: Sequence[str]) -> list[float]:
        """BM25 scores normalised into ``[0, 1]``."""
        query_terms = tokenize(query)
        tokenized = [tokenize(document) for document in documents]
        if not query_terms or not tokenized:
            return [0.0] * len(documents)

        doc_count = len(tokenized)
        avg_length = sum(len(tokens) for tokens in tokenized) / doc_count or 1.0
        document_frequency: Counter[str] = Counter()
        for tokens in tokenized:
            document_frequency.update(set(tokens))

        raw_scores: list[float] = []
        for tokens in tokenized:
            counts = Counter(tokens)
            length = len(tokens) or 1
            score = 0.0
            for term in query_terms:
                frequency = counts.get(term, 0)
                if not frequency:
                    continue
                df = document_frequency.get(term, 0)
                idf = math.log(1.0 + (doc_count - df + 0.5) / (df + 0.5))
                denominator = frequency + BM25_K1 * (
                    1 - BM25_B + BM25_B * length / avg_length
                )
                score += idf * (frequency * (BM25_K1 + 1)) / denominator
            raw_scores.append(score)

        highest = max(raw_scores)
        if highest <= 0:
            return [0.0] * len(documents)
        return [round(score / highest, 6) for score in raw_scores]


def _parse_results(body: dict, candidate_count: int) -> list[RerankResult]:
    """Map the DashScope rerank payload back onto candidate indexes."""
    output = body.get("output") or {}
    raw_results = output.get("results")
    if not isinstance(raw_results, list):
        return []

    results: list[RerankResult] = []
    for item in raw_results:
        if not isinstance(item, dict):
            continue
        try:
            index = int(item.get("index", -1))
        except (TypeError, ValueError):
            continue
        if index < 0 or index >= candidate_count:
            continue
        score = item.get("relevance_score", item.get("score", 0.0))
        try:
            results.append(RerankResult(index=index, score=float(score)))
        except (TypeError, ValueError):
            continue

    results.sort(key=lambda item: item.score, reverse=True)
    return results


def build_rerank_provider(settings: Settings | None = None):
    """DashScope when a key is configured, otherwise BM25."""
    cfg = settings or get_settings()
    if cfg.dashscope_enabled:
        logger.info("rerank_provider_selected", provider="dashscope", model=cfg.rerank_model)
        return DashScopeRerankProvider(cfg)
    logger.warning(
        "rerank_provider_fallback",
        provider="offline-bm25",
        reason="DASHSCOPE_API_KEY is not configured",
    )
    return LexicalRerankProvider(cfg)
