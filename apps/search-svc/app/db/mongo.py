"""MongoDB access layer.

CONTRACT §2: the canonical property document lives in Mongo and is owned by
`api-core`. search-svc **reads** it to build the Elasticsearch index and never
writes business data back.
"""

from __future__ import annotations

import re
from typing import Any

from bson import ObjectId
from bson.errors import InvalidId
from motor.motor_asyncio import (
    AsyncIOMotorClient,
    AsyncIOMotorCollection,
    AsyncIOMotorDatabase,
)
from pymongo.errors import PyMongoError

from app.core.config import get_settings
from app.core.logging import get_logger

log = get_logger("search-svc.mongo")

_client: AsyncIOMotorClient | None = None

_OBJECT_ID_RE = re.compile(r"^[0-9a-fA-F]{24}$")
_UUID_RE = re.compile(
    r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
)


def get_mongo_client() -> AsyncIOMotorClient:
    """Process-wide Motor client (lazily created)."""
    global _client
    if _client is None:
        settings = get_settings()
        _client = AsyncIOMotorClient(
            settings.MONGO_URI,
            serverSelectionTimeoutMS=settings.MONGO_TIMEOUT_MS,
            connectTimeoutMS=settings.MONGO_TIMEOUT_MS,
            uuidRepresentation="standard",
            appname="topchoice-search-svc",
            tz_aware=True,
        )
        log.info("mongo_client_created", uri=_redact_uri(settings.MONGO_URI))
    return _client


def get_database() -> AsyncIOMotorDatabase:
    """The `topchoice` database (name taken from `MONGO_URI`)."""
    return get_mongo_client()[get_settings().mongo_db_name]


def get_properties_collection() -> AsyncIOMotorCollection:
    """The canonical `properties` collection."""
    return get_database()[get_settings().MONGO_PROPERTIES_COLLECTION]


async def close_mongo() -> None:
    """Close the shared client (graceful shutdown)."""
    global _client
    if _client is not None:
        try:
            _client.close()
        finally:
            _client = None
            log.info("mongo_client_closed")


async def ping_mongo() -> bool:
    """True when Mongo answers `ping`."""
    try:
        await get_mongo_client().admin.command("ping")
        return True
    except (PyMongoError, OSError) as exc:
        log.warning("mongo_ping_failed", error=str(exc))
        return False


async def count_properties(include_deleted: bool = False) -> int:
    """Number of live listings in Mongo (0 when unreachable)."""
    try:
        return int(
            await get_properties_collection().count_documents(
                {} if include_deleted else live_filter()
            )
        )
    except (PyMongoError, OSError) as exc:
        log.warning("mongo_count_failed", error=str(exc))
        return 0


def live_filter() -> dict[str, Any]:
    """Filter excluding soft-deleted listings."""
    return {"deletedAt": None}


def to_object_id(value: str) -> ObjectId | None:
    """Parse a 24-hex string into an ObjectId (None when not one)."""
    if not value or not _OBJECT_ID_RE.match(value):
        return None
    try:
        return ObjectId(value)
    except (InvalidId, TypeError):
        return None


def is_uuid_like(value: str) -> bool:
    return bool(value and _UUID_RE.match(value))


def identifier_query(identifier: str) -> dict[str, Any]:
    """Match a listing by property UUID, Mongo `_id`, `mongoId` or `slug`.

    api-core stores the seeded UUID in `property_index.id` while Mongo keys the
    document by an ObjectId, so both forms (plus the slug) must resolve.
    """
    identifier = (identifier or "").strip()
    clauses: list[dict[str, Any]] = [{"id": identifier}, {"slug": identifier}]

    object_id = to_object_id(identifier)
    if object_id is not None:
        clauses.append({"_id": object_id})
        clauses.append({"mongoId": identifier})
    else:
        clauses.append({"_id": identifier})

    return {"$or": clauses}


def _redact_uri(uri: str) -> str:
    return re.sub(r"://([^:]+):([^@]+)@", "://***:***@", uri)
