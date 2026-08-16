"""Hybrid retrieval: pgvector ANN + Postgres full-text, fused and reranked.

    1. dense recall   — cosine ANN over ``rag_chunks.embedding`` (HNSW), top RAG_TOP_K
    2. lexical recall — ``ts_rank_cd`` over ``to_tsvector('simple', content)`` (GIN), top RAG_TOP_K
    3. fusion         — Reciprocal Rank Fusion of the two rankings
    4. rerank         — ``qwen3-rerank`` (or the offline BM25 fallback) down to RAG_RERANK_TOP_N

Metadata prefilters parsed from the question (price band, area, property type,
bedrooms) are pushed into both SQL branches so recall is not wasted on listings
the user has already excluded. Every step degrades instead of failing: if the
embedding provider is down the lexical half still answers, and vice versa.
"""

from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass, field
from typing import Any

import orjson
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.core.config import Settings, get_settings
from app.core.errors import ApiError
from app.core.logging import get_logger
from app.db.session import Database, get_database
from app.db.sql import vector_param
from app.providers.registry import ProviderBundle, build_providers
from app.retrieval.filters import QueryFilters, parse_query_filters
from app.retrieval.fusion import rank_positions, reciprocal_rank_fusion
from app.retrieval.models import RetrievedChunk

logger = get_logger("rag-svc.retrieval")

_SELECT_COLUMNS = """
    c.id            AS chunk_id,
    c.document_id   AS document_id,
    c.content       AS content,
    c.ordinal       AS ordinal,
    c.token_count   AS token_count,
    c.metadata      AS metadata,
    d.source_type   AS source_type,
    d.source_id     AS source_id,
    d.title         AS title,
    d.uri           AS uri,
    d.lang          AS lang
"""

_VECTOR_SQL = f"""
SELECT {_SELECT_COLUMNS},
       1 - (c.embedding <=> {vector_param("query_vector")}) AS score
FROM rag_chunks c
JOIN rag_documents d ON d.id = c.document_id
WHERE c.embedding IS NOT NULL
  {{filters}}
ORDER BY c.embedding <=> {vector_param("query_vector")}
LIMIT :limit
"""

_TEXT_SQL = f"""
SELECT {_SELECT_COLUMNS},
       ts_rank_cd(
           to_tsvector('simple', c.content),
           websearch_to_tsquery('simple', :text_query)
       ) AS score
FROM rag_chunks c
JOIN rag_documents d ON d.id = c.document_id
WHERE to_tsvector('simple', c.content) @@ websearch_to_tsquery('simple', :text_query)
  {{filters}}
ORDER BY score DESC
LIMIT :limit
"""


@dataclass(slots=True)
class RetrievalResult:
    """Everything one retrieval pass produced, including diagnostics."""

    chunks: list[RetrievedChunk] = field(default_factory=list)
    filters: QueryFilters = field(default_factory=QueryFilters)
    vector_candidates: int = 0
    text_candidates: int = 0
    fused_candidates: int = 0
    reranked: bool = False
    degraded: bool = False
    latency_ms: float = 0.0

    def as_sources(self) -> list[dict[str, Any]]:
        return [chunk.as_source() for chunk in self.chunks]

    def describe(self) -> dict[str, Any]:
        return {
            "vectorCandidates": self.vector_candidates,
            "textCandidates": self.text_candidates,
            "fusedCandidates": self.fused_candidates,
            "returned": len(self.chunks),
            "reranked": self.reranked,
            "degraded": self.degraded,
            "latencyMs": round(self.latency_ms, 2),
            "filters": self.filters.as_dict(),
        }


class HybridSearcher:
    """Dense + lexical retrieval over ``rag_chunks``."""

    def __init__(
        self,
        database: Database | None = None,
        providers: ProviderBundle | None = None,
        settings: Settings | None = None,
    ) -> None:
        self._settings = settings or get_settings()
        self._database = database or get_database()
        self._providers = providers or build_providers(self._settings)

    # --- public API -------------------------------------------------------
    async def search(
        self,
        query: str,
        *,
        top_k: int | None = None,
        top_n: int | None = None,
        filters: QueryFilters | None = None,
        parse_filters: bool = True,
        rerank: bool = True,
    ) -> RetrievalResult:
        """Retrieve the best ``top_n`` chunks for ``query``."""
        started = time.perf_counter()
        cleaned = " ".join((query or "").split())
        if not cleaned:
            return RetrievalResult(filters=filters or QueryFilters())

        effective_k = max(1, top_k or self._settings.rag_top_k)
        effective_n = max(1, top_n or self._settings.rag_rerank_top_n)
        parsed = parse_query_filters(cleaned) if parse_filters else QueryFilters()
        effective_filters = parsed.merge(filters)

        where_sql, params = build_filter_sql(effective_filters)

        vector_rows, text_rows = await asyncio.gather(
            self._vector_search(cleaned, effective_k, where_sql, params),
            self._text_search(cleaned, effective_k, where_sql, params),
        )

        result = RetrievalResult(
            filters=effective_filters,
            vector_candidates=len(vector_rows),
            text_candidates=len(text_rows),
        )
        if not vector_rows and not text_rows:
            result.latency_ms = (time.perf_counter() - started) * 1000
            logger.info("retrieval_empty", query_chars=len(cleaned), **result.describe())
            return result

        candidates = self._fuse(vector_rows, text_rows)
        result.fused_candidates = len(candidates)

        shortlist = candidates[: max(effective_n, self._settings.rag_rerank_candidates)]
        if rerank and shortlist:
            shortlist = await self._rerank(cleaned, shortlist, effective_n)
            result.reranked = True

        selected = [
            chunk for chunk in shortlist[:effective_n] if chunk.score >= self._settings.rag_min_score
        ]
        result.chunks = selected
        result.degraded = not (
            self._providers.embeddings.available and self._providers.rerank.available
        )
        result.latency_ms = (time.perf_counter() - started) * 1000
        logger.info("retrieval_completed", query_chars=len(cleaned), **result.describe())
        return result

    # --- branches ---------------------------------------------------------
    async def _vector_search(
        self, query: str, limit: int, where_sql: str, params: dict[str, Any]
    ) -> list[RetrievedChunk]:
        try:
            vector = await self._providers.embeddings.embed_query(query)
        except ApiError as exc:
            logger.warning("vector_branch_skipped", reason=exc.message)
            return []

        statement = text(_VECTOR_SQL.format(filters=where_sql))
        payload = {
            **params,
            "query_vector": [float(value) for value in vector],
            "limit": limit,
        }
        rows = await self._execute(statement, payload, branch="vector")
        return [_row_to_chunk(row, vector_score=float(row["score"] or 0.0)) for row in rows]

    async def _text_search(
        self, query: str, limit: int, where_sql: str, params: dict[str, Any]
    ) -> list[RetrievedChunk]:
        statement = text(_TEXT_SQL.format(filters=where_sql))
        payload = {**params, "text_query": query, "limit": limit}
        rows = await self._execute(statement, payload, branch="text")
        return [_row_to_chunk(row, text_score=float(row["score"] or 0.0)) for row in rows]

    async def _execute(
        self, statement: Any, params: dict[str, Any], *, branch: str
    ) -> list[Any]:
        try:
            async with self._database.session() as session:
                if branch == "vector":
                    await _tune_ann(session, self._settings)
                result = await session.execute(statement, params)
                return list(result.mappings().all())
        except (SQLAlchemyError, OSError) as exc:
            logger.error("retrieval_query_failed", branch=branch, error=str(exc))
            return []

    # --- fusion + rerank --------------------------------------------------
    def _fuse(
        self, vector_rows: list[RetrievedChunk], text_rows: list[RetrievedChunk]
    ) -> list[RetrievedChunk]:
        by_id: dict[str, RetrievedChunk] = {}
        for chunk in (*vector_rows, *text_rows):
            existing = by_id.get(chunk.chunk_id)
            if existing is None:
                by_id[chunk.chunk_id] = chunk
                continue
            existing.vector_score = existing.vector_score or chunk.vector_score
            existing.text_score = existing.text_score or chunk.text_score

        vector_ids = [chunk.chunk_id for chunk in vector_rows]
        text_ids = [chunk.chunk_id for chunk in text_rows]
        vector_positions = rank_positions(vector_ids)
        text_positions = rank_positions(text_ids)

        fused = reciprocal_rank_fusion(
            [vector_ids, text_ids],
            k=self._settings.rag_rrf_k,
            weights=[
                self._settings.rag_rrf_weight_vector,
                self._settings.rag_rrf_weight_text,
            ],
        )

        ordered: list[RetrievedChunk] = []
        for chunk_id, score in fused:
            chunk = by_id.get(chunk_id)
            if chunk is None:  # pragma: no cover - ids come from the same rows
                continue
            chunk.fusion_score = score
            chunk.score = score
            chunk.vector_rank = vector_positions.get(chunk_id)
            chunk.text_rank = text_positions.get(chunk_id)
            ordered.append(chunk)
        return ordered

    async def _rerank(
        self, query: str, candidates: list[RetrievedChunk], top_n: int
    ) -> list[RetrievedChunk]:
        documents = [_rerank_document(chunk) for chunk in candidates]
        try:
            response = await self._providers.rerank.rerank(query, documents, top_n)
        except ApiError as exc:
            logger.warning("rerank_skipped", reason=exc.message)
            return candidates

        reranked: list[RetrievedChunk] = []
        for item in response.results:
            if item.index < 0 or item.index >= len(candidates):
                continue
            chunk = candidates[item.index]
            chunk.rerank_score = float(item.score)
            chunk.score = float(item.score)
            reranked.append(chunk)

        if not reranked:  # pragma: no cover - providers always return something
            return candidates

        # Keep any candidate the reranker dropped as a deterministic tail so a
        # short top_n never starves the caller.
        chosen = {id(chunk) for chunk in reranked}
        tail = [chunk for chunk in candidates if id(chunk) not in chosen]
        return reranked + tail


# --------------------------------------------------------------------------
async def _tune_ann(session: Any, settings: Settings) -> None:
    """Widen the HNSW search list so RAG_TOP_K recall stays high."""
    try:
        ef_search = max(40, settings.rag_top_k * 4)
        await session.execute(text(f"SET LOCAL hnsw.ef_search = {int(ef_search)}"))
    except SQLAlchemyError as exc:  # pragma: no cover - older pgvector builds
        logger.debug("hnsw_tuning_unavailable", error=str(exc))


def build_filter_sql(filters: QueryFilters) -> tuple[str, dict[str, Any]]:
    """Render the prefilters as an SQL fragment plus its bound parameters.

    Listing constraints are wrapped so they only apply to ``type='property'``
    chunks — an FAQ answer must not disappear because the user named a budget.
    """
    params: dict[str, Any] = {}
    clauses: list[str] = []
    listing_clauses: list[str] = []

    if filters.max_price is not None:
        listing_clauses.append(
            "(c.metadata->'price') <= to_jsonb(CAST(:max_price AS double precision))"
        )
        params["max_price"] = float(filters.max_price)
    if filters.min_price is not None:
        listing_clauses.append(
            "(c.metadata->'price') >= to_jsonb(CAST(:min_price AS double precision))"
        )
        params["min_price"] = float(filters.min_price)
    if filters.property_type:
        listing_clauses.append("c.metadata->>'propertyType' = :property_type")
        params["property_type"] = filters.property_type
    if filters.bedrooms is not None:
        listing_clauses.append("(c.metadata->'bedrooms') = to_jsonb(CAST(:bedrooms AS integer))")
        params["bedrooms"] = int(filters.bedrooms)
    if filters.compound:
        listing_clauses.append("lower(c.metadata->>'compound') = :compound")
        params["compound"] = filters.compound.lower()
    if filters.developer:
        listing_clauses.append("lower(c.metadata->>'developer') = :developer")
        params["developer"] = filters.developer.lower()

    area_clauses: list[str] = []
    if filters.area:
        area_clauses.append("lower(c.metadata->>'area') = :area_name")
        params["area_name"] = filters.area.lower()
    if filters.area_id:
        area_clauses.append("c.metadata->>'areaId' = :area_id")
        params["area_id"] = filters.area_id
    if area_clauses:
        listing_clauses.append("(" + " OR ".join(area_clauses) + ")")

    if listing_clauses:
        clauses.append(
            "AND (COALESCE(c.metadata->>'type', '') <> 'property' OR ("
            + " AND ".join(listing_clauses)
            + "))"
        )

    if filters.source_types:
        clauses.append("AND d.source_type = ANY(CAST(:source_types AS text[]))")
        params["source_types"] = list(filters.source_types)
    if filters.lang:
        clauses.append("AND d.lang = :lang")
        params["lang"] = filters.lang

    return "\n  ".join(clauses), params


def _as_dict(value: Any) -> dict[str, Any]:
    """JSONB comes back as a dict (SQLAlchemy) or a string (raw driver)."""
    if isinstance(value, dict):
        return value
    if isinstance(value, (str, bytes)):
        try:
            decoded = orjson.loads(value)
        except orjson.JSONDecodeError:
            return {}
        return decoded if isinstance(decoded, dict) else {}
    return {}


def _row_to_chunk(
    row: Any, *, vector_score: float | None = None, text_score: float | None = None
) -> RetrievedChunk:
    return RetrievedChunk(
        chunk_id=str(row["chunk_id"]),
        document_id=str(row["document_id"]),
        content=str(row["content"] or ""),
        ordinal=int(row["ordinal"] or 0),
        token_count=int(row["token_count"] or 0),
        source_type=str(row["source_type"] or "unknown"),
        source_id=str(row["source_id"] or ""),
        title=str(row["title"] or ""),
        uri=row["uri"],
        lang=str(row["lang"] or "en"),
        metadata=_as_dict(row["metadata"]),
        vector_score=vector_score,
        text_score=text_score,
    )


def _rerank_document(chunk: RetrievedChunk) -> str:
    """Give the reranker the title as well — chunks are often mid-document."""
    title = chunk.title.strip()
    content = chunk.content.strip()
    return f"{title}\n{content}" if title and not content.startswith(title) else content
