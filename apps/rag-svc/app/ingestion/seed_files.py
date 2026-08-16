"""Access to the shared ``seed/`` dataset (CONTRACT §9).

The directory is mounted read-only at ``/app/seed`` in docker-compose. Files are
parsed once and cached — they are static, deterministic fixtures.
"""

from __future__ import annotations

import functools
from pathlib import Path
from typing import Any

import orjson

from app.core.config import get_settings
from app.core.errors import ApiError
from app.core.logging import get_logger

logger = get_logger("rag-svc.seed")

AMENITIES = "amenities.json"
AREAS = "areas.json"
COMPOUNDS = "compounds.json"
DEVELOPERS = "developers.json"
FAQ = "faq.json"
PROPERTIES = "properties.json"


class SeedFileMissingError(ApiError):
    def __init__(self, path: Path) -> None:
        super().__init__(
            "SEED_FILE_MISSING",
            f"Seed file not found: {path}. Mount ./seed into the container "
            "(see docker-compose.yml) or set SEED_DIR.",
            status_code=503,
        )


def seed_dir() -> Path:
    return Path(get_settings().seed_dir)


def load_json(filename: str) -> list[dict[str, Any]]:
    """Read one seed file. Results are cached per absolute path."""
    path = seed_dir() / filename
    return _load_cached(str(path.resolve() if path.exists() else path))


@functools.lru_cache(maxsize=16)
def _load_cached(path_str: str) -> list[dict[str, Any]]:
    path = Path(path_str)
    if not path.is_file():
        logger.error("seed_file_missing", path=path_str)
        raise SeedFileMissingError(path)
    with path.open("rb") as handle:
        data = orjson.loads(handle.read())
    if not isinstance(data, list):
        raise ApiError(
            "SEED_FILE_INVALID",
            f"Seed file {path.name} must contain a JSON array",
            status_code=500,
        )
    logger.info("seed_file_loaded", file=path.name, records=len(data))
    return data


def index_by_id(records: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    return {str(record["id"]): record for record in records if record.get("id")}


def index_by_slug(records: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    return {str(record["slug"]): record for record in records if record.get("slug")}


def clear_cache() -> None:
    """Drop the parsed-file cache (used by tests and after a re-seed)."""
    _load_cached.cache_clear()
