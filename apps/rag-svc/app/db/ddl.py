"""Raw DDL that SQLAlchemy's ``create_all`` cannot express portably.

Kept in one place so the Alembic migration and the ``python -m app.db.init``
bootstrap create *exactly* the same objects (CONTRACT §2):

* the ``vector`` extension,
* the HNSW index used for cosine ANN search over ``rag_chunks.embedding``,
* the GIN index over ``to_tsvector('simple', content)`` powering the lexical
  half of hybrid search,
* a GIN index over ``rag_chunks.metadata`` for the retrieval prefilters.

``simple`` is used as the text-search configuration on purpose: the corpus is
bilingual (English + Arabic) and Postgres ships no Arabic stemmer, so a
language-specific configuration would silently drop Arabic terms. The search
query must use the identical expression for the index to be picked up.
"""

from __future__ import annotations

#: Text-search configuration shared by the index and the query builder.
TS_CONFIG = "simple"

CREATE_EXTENSION_VECTOR = 'CREATE EXTENSION IF NOT EXISTS "vector"'

CREATE_HNSW_INDEX = """
CREATE INDEX IF NOT EXISTS ix_rag_chunks_embedding_hnsw
    ON rag_chunks USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64)
"""

CREATE_CONTENT_TSV_INDEX = f"""
CREATE INDEX IF NOT EXISTS ix_rag_chunks_content_tsv
    ON rag_chunks USING gin (to_tsvector('{TS_CONFIG}', content))
"""

CREATE_METADATA_GIN_INDEX = """
CREATE INDEX IF NOT EXISTS ix_rag_chunks_metadata_gin
    ON rag_chunks USING gin (metadata jsonb_path_ops)
"""

CREATE_DOCUMENT_METADATA_GIN_INDEX = """
CREATE INDEX IF NOT EXISTS ix_rag_documents_metadata_gin
    ON rag_documents USING gin (metadata jsonb_path_ops)
"""

DROP_INDEX_STATEMENTS = (
    "DROP INDEX IF EXISTS ix_rag_documents_metadata_gin",
    "DROP INDEX IF EXISTS ix_rag_chunks_metadata_gin",
    "DROP INDEX IF EXISTS ix_rag_chunks_content_tsv",
    "DROP INDEX IF EXISTS ix_rag_chunks_embedding_hnsw",
)

#: Executed after ``Base.metadata.create_all`` / after the Alembic table DDL.
POST_CREATE_STATEMENTS = (
    CREATE_HNSW_INDEX,
    CREATE_CONTENT_TSV_INDEX,
    CREATE_METADATA_GIN_INDEX,
    CREATE_DOCUMENT_METADATA_GIN_INDEX,
)
