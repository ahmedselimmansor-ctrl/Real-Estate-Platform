"""SQLAlchemy models for the ``nawy_rag`` database (CONTRACT §2)."""

from app.db.base import Base
from app.db.models.chat import (
    MESSAGE_ROLES,
    TOOL_CALL_STATUSES,
    ChatMessage,
    ChatSummary,
    ChatThread,
    ToolCall,
)
from app.db.models.documents import SOURCE_TYPES, RagChunk, RagDocument
from app.db.models.ingestion import RUN_STATUSES, TERMINAL_RUN_STATUSES, IngestionRun

__all__ = [
    "MESSAGE_ROLES",
    "RUN_STATUSES",
    "SOURCE_TYPES",
    "TERMINAL_RUN_STATUSES",
    "TOOL_CALL_STATUSES",
    "Base",
    "ChatMessage",
    "ChatSummary",
    "ChatThread",
    "IngestionRun",
    "RagChunk",
    "RagDocument",
    "ToolCall",
]
