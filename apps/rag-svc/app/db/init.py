"""Idempotent schema bootstrap.

    python -m app.db.init

Alembic (``alembic upgrade head``) is the canonical migration path; this module
is the self-bootstrapping fallback that runs at startup so ``docker compose up``
works with zero manual steps (CONTRACT §10.9). Everything here is safe to run
repeatedly and concurrently:

1. create the ``nawy_rag`` database if the server does not have it yet,
2. ``CREATE EXTENSION IF NOT EXISTS vector``,
3. ``Base.metadata.create_all`` (tables + b-tree indexes),
4. the raw DDL from :mod:`app.db.ddl` (HNSW / tsvector / JSONB GIN indexes),
5. stamp the Alembic version table so a later ``alembic upgrade`` is a no-op.
"""

from __future__ import annotations

import asyncio

from sqlalchemy import text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import ProgrammingError, SQLAlchemyError
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import Settings, get_settings
from app.core.logging import configure_logging, get_logger
from app.db import ddl
from app.db.models import Base
from app.db.session import Database, get_database

logger = get_logger("rag-svc.db.init")

#: Must match the single migration in alembic/versions.
ALEMBIC_HEAD_REVISION = "0001_initial_rag_schema"


async def ensure_database_exists(settings: Settings | None = None) -> bool:
    """Create the target database when the Postgres server lacks it.

    Returns ``True`` when the database exists (or was created).
    """
    cfg = settings or get_settings()
    url = make_url(cfg.async_database_url)
    target = url.database
    if not target:
        return False

    maintenance_url = url.set(database="postgres")
    engine = create_async_engine(
        maintenance_url, isolation_level="AUTOCOMMIT", poolclass=NullPool
    )
    try:
        async with engine.connect() as conn:
            exists = await conn.scalar(
                text("SELECT 1 FROM pg_database WHERE datname = :name"), {"name": target}
            )
            if exists:
                return True
            logger.info("creating_database", database=target)
            await conn.execute(text(f'CREATE DATABASE "{target}"'))
            return True
    except ProgrammingError as exc:
        # Insufficient privileges — the DBA/init script owns database creation.
        logger.warning("database_create_denied", database=target, error=str(exc))
        return False
    except (SQLAlchemyError, OSError) as exc:
        logger.warning("database_create_failed", database=target, error=str(exc))
        return False
    finally:
        await engine.dispose()


async def create_schema(database: Database | None = None) -> None:
    """Create extension, tables and indexes. Idempotent."""
    db = database or get_database()
    async with db.engine.begin() as conn:
        await conn.execute(text(ddl.CREATE_EXTENSION_VECTOR))
        await conn.run_sync(Base.metadata.create_all)
        for statement in ddl.POST_CREATE_STATEMENTS:
            await conn.execute(text(statement))
    logger.info(
        "schema_ready",
        tables=sorted(Base.metadata.tables.keys()),
    )


async def stamp_alembic(database: Database | None = None) -> None:
    """Record the head revision so Alembic does not try to re-create tables."""
    db = database or get_database()
    async with db.engine.begin() as conn:
        await conn.execute(
            text(
                "CREATE TABLE IF NOT EXISTS alembic_version "
                "(version_num VARCHAR(32) NOT NULL, "
                "CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num))"
            )
        )
        current = await conn.scalar(text("SELECT version_num FROM alembic_version LIMIT 1"))
        if current is None:
            await conn.execute(
                text("INSERT INTO alembic_version (version_num) VALUES (:rev)"),
                {"rev": ALEMBIC_HEAD_REVISION},
            )


async def bootstrap(settings: Settings | None = None, database: Database | None = None) -> bool:
    """Full best-effort bootstrap. Never raises — returns success as a bool."""
    cfg = settings or get_settings()
    db = database or get_database()
    try:
        await ensure_database_exists(cfg)
        await create_schema(db)
        await stamp_alembic(db)
        await db.check()
        return True
    except (SQLAlchemyError, OSError) as exc:
        logger.error("schema_bootstrap_failed", error=str(exc), error_type=type(exc).__name__)
        return False


async def _main() -> int:
    settings = get_settings()
    configure_logging(settings.log_level)
    ok = await bootstrap(settings)
    await get_database().dispose()
    if ok:
        logger.info("db_init_complete")
        return 0
    logger.error("db_init_failed")
    return 1


def main() -> None:
    raise SystemExit(asyncio.run(_main()))


if __name__ == "__main__":  # pragma: no cover - CLI entry point
    main()
