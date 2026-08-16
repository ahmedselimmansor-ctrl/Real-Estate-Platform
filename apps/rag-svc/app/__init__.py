"""Nawy clone — RAG chat service (``rag-svc``).

FastAPI + LangGraph service owning the chatbot: ingestion into pgvector,
hybrid retrieval, reranking, generation and chat memory (docs/CONTRACT.md §1).
"""

from app.core.config import SERVICE_NAME, SERVICE_VERSION

__all__ = ["SERVICE_NAME", "SERVICE_VERSION", "__version__"]

__version__ = SERVICE_VERSION
