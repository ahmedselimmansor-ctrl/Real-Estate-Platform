"""Read-only MongoDB access.

The canonical property document lives in Mongo and is owned by **api-core**;
rag-svc only ever reads it (CONTRACT §2). When Mongo is unavailable — or has not
been seeded yet — the ingestion loaders fall back to ``seed/properties.json``.
"""

from __future__ import annotations

from typing import Any

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from pymongo.errors import ConfigurationError, PyMongoError

from app.core.config import Settings, get_settings
from app.core.logging import get_logger

logger = get_logger("rag-svc.mongo")

PROPERTIES_COLLECTION = "properties"


class MongoReader:
    """Thin, failure-tolerant reader over the ``topchoice`` Mongo database."""

    def __init__(self, settings: Settings | None = None) -> None:
        self._settings = settings or get_settings()
        self._client: AsyncIOMotorClient | None = None

    # --- lifecycle --------------------------------------------------------
    def _connect(self) -> AsyncIOMotorClient:
        if self._client is None:
            self._client = AsyncIOMotorClient(
                self._settings.mongo_uri,
                serverSelectionTimeoutMS=self._settings.mongo_timeout_ms,
                connectTimeoutMS=self._settings.mongo_timeout_ms,
                uuidRepresentation="standard",
            )
        return self._client

    @property
    def database(self) -> AsyncIOMotorDatabase:
        client = self._connect()
        try:
            default_db = client.get_default_database()
        except ConfigurationError:
            default_db = None
        return default_db if default_db is not None else client["topchoice"]

    async def close(self) -> None:
        if self._client is not None:
            self._client.close()
            self._client = None

    # --- reads ------------------------------------------------------------
    async def ping(self) -> bool:
        try:
            await self._connect().admin.command("ping")
            return True
        except (PyMongoError, OSError) as exc:
            logger.warning("mongo_unreachable", error=str(exc))
            return False

    async def fetch_properties(
        self, ids: list[str] | None = None, limit: int | None = None
    ) -> list[dict[str, Any]] | None:
        """Return listing documents, or ``None`` when Mongo cannot be used.

        ``None`` (as opposed to ``[]``) tells the loader to fall back to the
        shared seed file.
        """
        query: dict[str, Any] = {"deletedAt": None}
        if ids:
            query = {"$and": [query, {"$or": [{"slug": {"$in": ids}}, {"id": {"$in": ids}}]}]}
        try:
            collection = self.database[PROPERTIES_COLLECTION]
            cursor = collection.find(query)
            if limit:
                cursor = cursor.limit(limit)
            documents = await cursor.to_list(length=limit or 5000)
        except (PyMongoError, OSError) as exc:
            logger.warning("mongo_fetch_failed", collection=PROPERTIES_COLLECTION, error=str(exc))
            return None
        if not documents:
            logger.info("mongo_empty_collection", collection=PROPERTIES_COLLECTION)
            return None
        return [_normalise(document) for document in documents]


def _normalise(document: dict[str, Any]) -> dict[str, Any]:
    """Make a Mongo document JSON-safe and shaped like ``seed/properties.json``."""
    normalised = dict(document)
    raw_id = normalised.pop("_id", None)
    if raw_id is not None and not normalised.get("mongoId"):
        normalised["mongoId"] = str(raw_id)
    if not normalised.get("id"):
        normalised["id"] = str(raw_id) if raw_id is not None else ""
    for key in ("publishedAt", "createdAt", "updatedAt", "deletedAt"):
        value = normalised.get(key)
        if value is not None and hasattr(value, "isoformat"):
            normalised[key] = value.isoformat()
    return normalised


_reader: MongoReader | None = None


def get_mongo_reader() -> MongoReader:
    """Process-wide :class:`MongoReader` singleton."""
    global _reader
    if _reader is None:
        _reader = MongoReader()
    return _reader
