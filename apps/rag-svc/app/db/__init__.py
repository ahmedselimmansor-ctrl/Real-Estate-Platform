"""Persistence layer for the ``topchoice_rag`` database (CONTRACT §2)."""

from app.db.session import Database, get_database, get_session

__all__ = ["Database", "get_database", "get_session"]
