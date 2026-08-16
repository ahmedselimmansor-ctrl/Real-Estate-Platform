"""SQL fragments shared by the write path (ingestion) and the read path (retrieval).

Vectors are bound as ``double precision[]`` and cast to ``vector`` in SQL:

    CAST(:embedding AS double precision[])::vector

pgvector registers ``double precision[] -> vector`` as an implicit cast, so this
is exact, index-friendly (``ORDER BY embedding <=> $1 LIMIT k`` still uses the
HNSW index) and — unlike binding a bare ``vector`` parameter — works identically
under asyncpg and psycopg without a driver-side codec.
"""

from __future__ import annotations

from collections.abc import Sequence

from app.db.ddl import TS_CONFIG


def vector_param(name: str) -> str:
    """SQL for a bound parameter that must reach Postgres as a ``vector``."""
    return f"CAST(:{name} AS double precision[])::vector"


def to_vector_param(values: Sequence[float] | None) -> list[float] | None:
    """Coerce a vector into the plain ``list[float]`` the driver can encode."""
    if values is None:
        return None
    return [float(value) for value in values]


#: Full-text expression — must match the GIN index in :mod:`app.db.ddl` exactly
#: or Postgres will fall back to a sequential scan.
TSVECTOR_EXPR = f"to_tsvector('{TS_CONFIG}', c.content)"

#: ``websearch_to_tsquery`` never raises on user input (unlike ``to_tsquery``).
TSQUERY_EXPR = f"websearch_to_tsquery('{TS_CONFIG}', :text_query)"
