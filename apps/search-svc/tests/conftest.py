"""Test bootstrap: environment defaults + shared fixtures.

Environment variables are set **before** `app.*` is imported because
`app.core.config` instantiates the settings singleton at import time.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any


def _repo_root() -> Path:
    """Walk up to the directory holding `seed/`, falling back to the checkout root.

    `parents[3]` assumed the on-disk layout `<repo>/apps/<svc>/tests/`. That
    breaks the moment the service is mounted somewhere shallower (a container at
    `/work`, CI at `/src`), raising IndexError before a single test can run.
    """
    here = Path(__file__).resolve()
    for candidate in here.parents:
        if (candidate / "seed" / "properties.json").is_file():
            return candidate
    return here.parents[min(3, len(here.parents) - 1)]


REPO_ROOT = _repo_root()
SEED_DIR = REPO_ROOT / "seed"
if not SEED_DIR.is_dir():  # inside the container the seed volume is mounted here
    SEED_DIR = Path("/app/seed")

os.environ.setdefault("APP_ENV", "test")
os.environ.setdefault("LOG_LEVEL", "WARNING")
os.environ.setdefault("LOG_JSON", "false")
os.environ.setdefault("SEED_DIR", str(SEED_DIR))
os.environ.setdefault("ELASTICSEARCH_URL", "http://localhost:9200")
os.environ.setdefault("MONGO_URI", "mongodb://localhost:27017/topchoice")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379")
os.environ.setdefault("JWT_ACCESS_SECRET", "test-access-secret-min-32-chars-long-000000")
os.environ.setdefault("INTERNAL_SERVICE_TOKEN", "test-internal-token")

import pytest  # noqa: E402

CONTRACT_PROPERTY: dict[str, Any] = {
    "_id": "6512c0ffee1234567890abcd",
    "id": "cccb864c-9dc1-5e61-bd8d-cbcf60be81b8",
    "mongoId": "6512c0ffee1234567890abcd",
    "slug": "palm-hills-new-cairo-3br-apartment-a12",
    "referenceNo": "TC-1042",
    "title": {
        "en": "3 Bedroom Apartment in Palm Hills",
        "ar": "شقة 3 غرف في بالم هيلز",
    },
    "description": {"en": "Bright corner unit.", "ar": "وحدة ركنية مضيئة."},
    "propertyType": "apartment",
    "saleType": "primary",
    "status": "available",
    "finishing": "semi_finished",
    "price": {"amount": 8500000, "currency": "EGP", "pricePerMeter": 47222},
    "paymentPlan": {
        "downPaymentPercent": 10,
        "installmentYears": 8,
        "monthlyInstallment": 88541,
        "deliveryDate": "2027-06-30",
    },
    "specs": {
        "bedrooms": 3,
        "bathrooms": 3,
        "areaSqm": 180,
        "gardenSqm": 0,
        "floor": 5,
        "parkingSpots": 1,
    },
    "location": {
        "areaId": "b47dcd29-cff0-5bd0-b7dd-03def1acf3b2",
        "areaName": "New Cairo",
        "city": "Cairo",
        "governorate": "Cairo",
        "address": "90th North St.",
        "geo": {"type": "Point", "coordinates": [31.4913, 30.0304]},
    },
    "compound": {
        "id": "1a63850a-81c8-5c83-a7d6-3c0b69fd93f9",
        "name": "Palm Hills New Cairo",
        "slug": "palm-hills-new-cairo",
    },
    "developer": {
        "id": "fbbdfc50-271a-535e-814b-30585c974062",
        "name": "Palm Hills Developments",
        "slug": "palm-hills",
        "logoUrl": "https://cdn.example.com/palm-hills.png",
    },
    "amenities": ["pool", "gym", "security", "clubhouse", "pool"],
    "media": {
        "images": [
            {
                "url": "https://cdn.example.com/2.jpg",
                "key": "properties/xx/2.jpg",
                "width": 1600,
                "height": 900,
                "isPrimary": False,
                "order": 1,
            },
            {
                "url": "https://cdn.example.com/1.jpg",
                "key": "properties/xx/1.jpg",
                "width": 1600,
                "height": 900,
                "isPrimary": True,
                "order": 0,
            },
        ],
        "floorPlans": [{"url": "https://cdn.example.com/plan.jpg", "label": "Type A"}],
        "videoUrl": None,
        "tourUrl": None,
    },
    "stats": {"views": 10, "favorites": 2, "leads": 1},
    "isFeatured": True,
    "publishedAt": "2026-01-10T00:00:00.000Z",
    "createdAt": "2026-01-01T00:00:00.000Z",
    "updatedAt": "2026-01-12T00:00:00.000Z",
    "deletedAt": None,
}


def _load_seed(seed_dir: Path, filename: str) -> list[dict[str, Any]]:
    """Read a seed file, failing rather than skipping when it is absent.

    These used to `pytest.skip`, which meant a checkout that had lost `seed/`
    produced a green run with two tests quietly missing. The seed is committed
    to the repository, so its absence is a broken setup, not an optional
    dependency — and a green build that skipped the assertions is worse than a
    red one that explains itself.
    """
    path = seed_dir / filename
    if not path.is_file():
        raise FileNotFoundError(
            f"seed dataset missing at {path}. The suite asserts against the committed "
            f"seed/ directory; check SEED_DIR or the working directory."
        )
    return json.loads(path.read_text(encoding="utf-8"))


@pytest.fixture(scope="session")
def seed_dir() -> Path:
    return SEED_DIR


@pytest.fixture(scope="session")
def seed_properties(seed_dir: Path) -> list[dict[str, Any]]:
    return _load_seed(seed_dir, "properties.json")


@pytest.fixture(scope="session")
def seed_areas(seed_dir: Path) -> list[dict[str, Any]]:
    return _load_seed(seed_dir, "areas.json")


@pytest.fixture(scope="session")
def area_slugs(seed_areas: list[dict[str, Any]]) -> dict[str, str]:
    return {area["id"]: area["slug"] for area in seed_areas}


@pytest.fixture
def contract_property() -> dict[str, Any]:
    return json.loads(json.dumps(CONTRACT_PROPERTY))
