"""Data-access objects for the ``nawy_rag`` tables."""

from app.db.repositories.documents import DocumentRepository, StoredDocument
from app.db.repositories.ingestion_runs import IngestionRunRepository

__all__ = ["DocumentRepository", "IngestionRunRepository", "StoredDocument"]
