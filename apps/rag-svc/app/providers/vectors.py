"""Vector helpers shared by the embedding providers."""

from __future__ import annotations

from collections.abc import Sequence
from typing import cast

import numpy as np


def l2_normalize(vector: Sequence[float]) -> list[float]:
    """Return ``vector`` scaled to unit length (zero vectors are returned as-is).

    Cosine distance in pgvector is cheapest and most stable on unit vectors, so
    every provider normalises before the vector reaches the database.
    """
    array = np.asarray(vector, dtype=np.float32)
    norm = float(np.linalg.norm(array))
    if norm == 0.0 or not np.isfinite(norm):
        return [float(value) for value in array]
    # `tolist()` is typed for any nesting depth; this array is 1-D.
    return cast(list[float], (array / norm).astype(np.float32).tolist())


def cosine_similarity(left: Sequence[float], right: Sequence[float]) -> float:
    """Cosine similarity in ``[-1, 1]`` (0.0 when either side is degenerate)."""
    a = np.asarray(left, dtype=np.float32)
    b = np.asarray(right, dtype=np.float32)
    if a.size == 0 or b.size == 0 or a.size != b.size:
        return 0.0
    denominator = float(np.linalg.norm(a) * np.linalg.norm(b))
    if denominator == 0.0:
        return 0.0
    return float(np.dot(a, b) / denominator)


def fit_dimension(vector: Sequence[float], dim: int) -> list[float]:
    """Pad with zeros / truncate so a vector matches the storage dimension."""
    values = [float(value) for value in vector]
    if len(values) == dim:
        return values
    if len(values) > dim:
        return values[:dim]
    return values + [0.0] * (dim - len(values))
