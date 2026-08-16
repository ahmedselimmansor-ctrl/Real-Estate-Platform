"""Read-only access to the shared `seed/` dataset (CONTRACT §9).

The directory is bind-mounted read-only at `/app/seed` (see docker-compose:
`./seed:/app/seed:ro`). It gives search-svc two things:

* lookup tables the listing document does not carry (area slugs, amenity labels)
* a bootstrap corpus so search works before api-core finishes seeding Mongo
"""

from __future__ import annotations

import threading
from pathlib import Path
from typing import Any

import orjson

from app.core.config import get_settings
from app.core.logging import get_logger

log = get_logger("search-svc.seed")

PROPERTIES_FILE = "properties.json"
AREAS_FILE = "areas.json"
DEVELOPERS_FILE = "developers.json"
COMPOUNDS_FILE = "compounds.json"
AMENITIES_FILE = "amenities.json"

_lock = threading.Lock()
_cache: dict[str, list[dict[str, Any]]] = {}


def seed_dir() -> Path:
    return Path(get_settings().SEED_DIR)


def seed_file(name: str) -> Path:
    return seed_dir() / name


def load_seed_file(name: str, *, refresh: bool = False) -> list[dict[str, Any]]:
    """Load and memoise one seed JSON array (empty list when missing/invalid)."""
    if not refresh and name in _cache:
        return _cache[name]

    path = seed_file(name)
    with _lock:
        if not refresh and name in _cache:
            return _cache[name]
        if not path.is_file():
            log.warning("seed_file_missing", file=str(path))
            _cache[name] = []
            return _cache[name]
        try:
            payload = orjson.loads(path.read_bytes())
        except (orjson.JSONDecodeError, OSError) as exc:
            log.error("seed_file_unreadable", file=str(path), error=str(exc))
            _cache[name] = []
            return _cache[name]

        records = (
            [item for item in payload if isinstance(item, dict)]
            if isinstance(payload, list)
            else []
        )
        _cache[name] = records
        log.info("seed_file_loaded", file=path.name, records=len(records))
        return records


def clear_cache() -> None:
    with _lock:
        _cache.clear()


def load_seed_properties(*, refresh: bool = False) -> list[dict[str, Any]]:
    """The 180 seeded listings (identical shape to the Mongo documents)."""
    return load_seed_file(PROPERTIES_FILE, refresh=refresh)


def load_areas(*, refresh: bool = False) -> list[dict[str, Any]]:
    return load_seed_file(AREAS_FILE, refresh=refresh)


def load_developers(*, refresh: bool = False) -> list[dict[str, Any]]:
    return load_seed_file(DEVELOPERS_FILE, refresh=refresh)


def load_compounds(*, refresh: bool = False) -> list[dict[str, Any]]:
    return load_seed_file(COMPOUNDS_FILE, refresh=refresh)


def load_amenities(*, refresh: bool = False) -> list[dict[str, Any]]:
    return load_seed_file(AMENITIES_FILE, refresh=refresh)


def area_slug_map() -> dict[str, str]:
    """`{areaId: slug}` — the listing document only carries the area *name*."""
    return {
        str(area["id"]): str(area["slug"])
        for area in load_areas()
        if area.get("id") and area.get("slug")
    }


def area_name_map() -> dict[str, dict[str, str]]:
    """`{areaId: {"en": .., "ar": .., "slug": ..}}` for facet labels."""
    return {
        str(area["id"]): {
            "en": str(area.get("nameEn", "")),
            "ar": str(area.get("nameAr", "")),
            "slug": str(area.get("slug", "")),
        }
        for area in load_areas()
        if area.get("id")
    }


def amenity_label_map() -> dict[str, dict[str, str]]:
    """`{amenitySlug: {"en": .., "ar": .., "icon": .., "category": ..}}`."""
    return {
        str(amenity["slug"]): {
            "en": str(amenity.get("nameEn", "")),
            "ar": str(amenity.get("nameAr", "")),
            "icon": str(amenity.get("icon", "")),
            "category": str(amenity.get("category", "")),
        }
        for amenity in load_amenities()
        if amenity.get("slug")
    }


def developer_map() -> dict[str, dict[str, str]]:
    """`{developerId: {"name": .., "slug": .., "logoUrl": ..}}`."""
    return {
        str(dev["id"]): {
            "name": str(dev.get("name", "")),
            "slug": str(dev.get("slug", "")),
            "logoUrl": str(dev.get("logoUrl", "")),
        }
        for dev in load_developers()
        if dev.get("id")
    }


def compound_map() -> dict[str, dict[str, str]]:
    """`{compoundId: {"name": .., "slug": .., "areaId": .., "developerId": ..}}`."""
    return {
        str(compound["id"]): {
            "name": str(compound.get("name", "")),
            "slug": str(compound.get("slug", "")),
            "areaId": str(compound.get("areaId", "")),
            "developerId": str(compound.get("developerId", "")),
        }
        for compound in load_compounds()
        if compound.get("id")
    }


def seed_available() -> bool:
    """True when the seed directory contains the property corpus."""
    return seed_file(PROPERTIES_FILE).is_file()
