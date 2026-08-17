"""Async SQLAlchemy engine/session management for the ``topchoice_rag`` database."""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.core.config import Settings, get_settings
from app.core.logging import get_logger

logger = get_logger("rag-svc.db")


class Database:
    """Owns the async engine and session factory for the service lifetime."""

    def __init__(self, settings: Settings | None = None) -> None:
        self._settings = settings or get_settings()
        self._engine: AsyncEngine | None = None
        self._sessionmaker: async_sessionmaker[AsyncSession] | None = None
        self._healthy = False

    # --- engine -----------------------------------------------------------
    @property
    def engine(self) -> AsyncEngine:
        if self._engine is None:
            self._engine = create_async_engine(
                self._settings.async_database_url,
                echo=self._settings.rag_db_echo,
                pool_pre_ping=True,
                pool_size=self._settings.rag_db_pool_size,
                max_overflow=self._settings.rag_db_max_overflow,
                pool_timeout=self._settings.rag_db_pool_timeout,
                pool_recycle=1800,
                future=True,
            )
        return self._engine

    @property
    def sessionmaker(self) -> async_sessionmaker[AsyncSession]:
        if self._sessionmaker is None:
            self._sessionmaker = async_sessionmaker(
                bind=self.engine,
                expire_on_commit=False,
                autoflush=False,
                class_=AsyncSession,
            )
        return self._sessionmaker

    @property
    def healthy(self) -> bool:
        return self._healthy

    # --- sessions ---------------------------------------------------------
    @asynccontextmanager
    async def session(self) -> AsyncIterator[AsyncSession]:
        """Transactional scope: commits on success, rolls back on failure."""
        async with self.sessionmaker() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    # --- health -----------------------------------------------------------
    async def check(self) -> bool:
        """Live ``SELECT 1``. Used by /health/ready and at startup."""
        try:
            async with self.engine.connect() as conn:
                await conn.execute(text("SELECT 1"))
            self._healthy = True
        except (SQLAlchemyError, OSError) as exc:
            logger.warning("postgres_unreachable", error=str(exc))
            self._healthy = False
        return self._healthy

    async def dispose(self) -> None:
        if self._engine is not None:
            await self._engine.dispose()
            self._engine = None
            self._sessionmaker = None
            self._healthy = False


_database: Database | None = None


def get_database() -> Database:
    """Process-wide :class:`Database` singleton."""
    global _database
    if _database is None:
        _database = Database()
    return _database


async def get_session() -> AsyncIterator[AsyncSession]:
    """FastAPI dependency yielding a transactional :class:`AsyncSession`."""
    async with get_database().session() as session:
        yield session
