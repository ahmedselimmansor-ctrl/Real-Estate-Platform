"""Reciprocal Rank Fusion.

RRF merges the dense (pgvector cosine) and lexical (Postgres full-text) result
lists without needing their scores to share a scale:

    score(d) = Σ_r  weight_r / (k + rank_r(d))          rank is 1-based

``k`` (``RAG_RRF_K``, default 60) damps the top of each list so a document that
appears in *both* rankings outranks one that only tops a single ranking — which
is exactly the behaviour hybrid search needs on a bilingual corpus where the
lexical side is strong for names/references and the dense side for paraphrases.
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import TypeVar

K = TypeVar("K")

DEFAULT_RRF_K = 60


def reciprocal_rank_fusion(
    rankings: Sequence[Sequence[K]],
    *,
    k: int = DEFAULT_RRF_K,
    weights: Sequence[float] | None = None,
) -> list[tuple[K, float]]:
    """Fuse ranked id lists into one ``(key, score)`` list, best first.

    Ties are broken deterministically: better best-rank first, then first
    appearance across the input rankings.
    """
    if not rankings:
        return []

    effective_weights = list(weights) if weights is not None else [1.0] * len(rankings)
    if len(effective_weights) != len(rankings):
        raise ValueError("weights must have one entry per ranking")

    damping = max(1, int(k))
    scores: dict[K, float] = {}
    best_rank: dict[K, int] = {}
    first_seen: dict[K, int] = {}
    order = 0

    for ranking, weight in zip(rankings, effective_weights, strict=True):
        seen_in_ranking: set[K] = set()
        rank = 0
        for key in ranking:
            if key in seen_in_ranking:
                continue  # a ranking must not reward the same id twice
            seen_in_ranking.add(key)
            rank += 1
            scores[key] = scores.get(key, 0.0) + weight / (damping + rank)
            if key not in best_rank or rank < best_rank[key]:
                best_rank[key] = rank
            if key not in first_seen:
                first_seen[key] = order
                order += 1

    return sorted(
        ((key, score) for key, score in scores.items()),
        key=lambda item: (-item[1], best_rank[item[0]], first_seen[item[0]]),
    )


def rank_positions(ranking: Sequence[K]) -> dict[K, int]:
    """``key -> 1-based position`` (first occurrence wins)."""
    positions: dict[K, int] = {}
    for index, key in enumerate(ranking, start=1):
        positions.setdefault(key, index)
    return positions
