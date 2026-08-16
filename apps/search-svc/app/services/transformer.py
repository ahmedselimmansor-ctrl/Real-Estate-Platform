"""Mongo listing document -> Elasticsearch `properties_v1` document.

Pure functions only: no I/O, no globals, no settings lookups — everything the
transform needs is passed in. That keeps it trivially testable and safe to run
inside a bulk generator.

Input is the canonical Mongo document from CONTRACT §3 (or the equivalent
`seed/properties.json` record, which uses `id` + `mongoId` instead of `_id`).
"""

from __future__ import annotations

import re
import unicodedata
from collections.abc import Iterable, Mapping
from datetime import UTC, date, datetime
from typing import Any

from app.es.mapping import (
    SUGGEST_CONTEXT_AREA,
    SUGGEST_CONTEXT_TYPE,
)

__all__ = [
    "transform_property",
    "transform_many",
    "is_indexable",
    "resolve_document_id",
    "slugify",
    "SUGGEST_WEIGHTS",
]

#: Base type-ahead weights per suggestion category.
SUGGEST_WEIGHTS: dict[str, int] = {
    "area": 50,
    "compound": 45,
    "developer": 40,
    "property": 20,
}

FEATURED_SUGGEST_BONUS = 10

_SLUG_STRIP = re.compile(r"[^a-z0-9]+")
_MULTI_DASH = re.compile(r"-{2,}")


# --------------------------------------------------------------------- utils


def slugify(value: str | None) -> str | None:
    """`"New Cairo"` -> `"new-cairo"` (ASCII fallback for Arabic-only names)."""
    if not value:
        return None
    normalized = unicodedata.normalize("NFKD", str(value))
    ascii_only = normalized.encode("ascii", "ignore").decode("ascii").lower()
    slug = _MULTI_DASH.sub("-", _SLUG_STRIP.sub("-", ascii_only)).strip("-")
    return slug or None


def _get(source: Any, *path: str, default: Any = None) -> Any:
    """Safe nested lookup: `_get(doc, "price", "amount")`."""
    current: Any = source
    for key in path:
        if isinstance(current, Mapping):
            current = current.get(key)
        else:
            return default
        if current is None:
            return default
    return current if current is not None else default


def _to_int(value: Any, default: int | None = None) -> int | None:
    if value is None or isinstance(value, bool):
        return default
    try:
        return int(round(float(value)))
    except (TypeError, ValueError):
        return default


def _to_float(value: Any, default: float | None = None) -> float | None:
    if value is None or isinstance(value, bool):
        return default
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _to_bool(value: Any, default: bool = False) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "y"}
    if isinstance(value, int | float):
        return bool(value)
    return default


def _clean_text(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _to_iso(value: Any) -> str | None:
    """Normalize datetimes/dates/strings/epochs to an ES-friendly ISO string."""
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        aware = value if value.tzinfo else value.replace(tzinfo=UTC)
        return aware.astimezone(UTC).isoformat().replace("+00:00", "Z")
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, int | float) and not isinstance(value, bool):
        return (
            datetime.fromtimestamp(float(value) / 1000.0, tz=UTC)
            .isoformat()
            .replace("+00:00", "Z")
        )
    text = str(value).strip()
    return text or None


def _year_of(iso_value: str | None) -> int | None:
    if not iso_value or len(iso_value) < 4:
        return None
    try:
        return int(iso_value[:4])
    except ValueError:
        return None


def _is_past(iso_value: str | None, *, now: datetime) -> bool:
    if not iso_value:
        return False
    candidate = iso_value.replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(candidate)
    except ValueError:
        try:
            parsed = datetime.fromisoformat(candidate[:10])
        except ValueError:
            return False
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    return parsed <= now


def _dedupe(values: Iterable[Any]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        text = _clean_text(value)
        if text and text not in seen:
            seen.add(text)
            result.append(text)
    return result


# ------------------------------------------------------------------ document


def resolve_document_id(doc: Mapping[str, Any]) -> str | None:
    """The Elasticsearch `_id`: the property UUID when present, else Mongo `_id`.

    `seed/properties.json` carries the stable UUID in `id` (mirrored to Postgres
    `property_index.id`), which is what every other service references.
    """
    for key in ("id", "propertyId", "uuid"):
        value = _clean_text(doc.get(key))
        if value:
            return value
    mongo_id = doc.get("_id")
    if mongo_id is not None:
        return str(mongo_id)
    return None


def is_indexable(doc: Mapping[str, Any]) -> bool:
    """False for soft-deleted listings (`deletedAt` set) or id-less documents."""
    if doc.get("deletedAt"):
        return False
    return resolve_document_id(doc) is not None


def _primary_image(images: list[Mapping[str, Any]], media_base_url: str | None) -> str | None:
    if not images:
        return None
    primary = next((img for img in images if _to_bool(img.get("isPrimary"))), None)
    if primary is None:
        primary = min(images, key=lambda img: _to_int(img.get("order"), 0) or 0)
    return _image_url(primary, media_base_url)


def _image_url(image: Mapping[str, Any], media_base_url: str | None) -> str | None:
    url = _clean_text(image.get("url"))
    if url:
        return url
    key = _clean_text(image.get("key"))
    if key and media_base_url:
        return f"{media_base_url.rstrip('/')}/{key.lstrip('/')}"
    return key


def _suggest_entry(
    text: str | None,
    *,
    suggestion_type: str,
    weight: int,
    area_id: str | None,
) -> dict[str, Any] | None:
    cleaned = _clean_text(text)
    if not cleaned:
        return None
    contexts: dict[str, list[str]] = {SUGGEST_CONTEXT_TYPE: [suggestion_type]}
    if area_id:
        contexts[SUGGEST_CONTEXT_AREA] = [area_id]
    return {
        "input": [cleaned],
        "weight": max(1, weight),
        "contexts": contexts,
    }


def build_suggest(
    *,
    title_en: str | None,
    title_ar: str | None,
    compound_name: str | None,
    developer_name: str | None,
    area_name: str | None,
    area_id: str | None,
    is_featured: bool = False,
) -> list[dict[str, Any]]:
    """Completion inputs: listing titles + compound + developer + area.

    Each entry carries its own `type` context so `/api/search/autocomplete` can
    return typed suggestions (`property` | `compound` | `developer` | `area`)
    from this single index.
    """
    property_weight = SUGGEST_WEIGHTS["property"] + (FEATURED_SUGGEST_BONUS if is_featured else 0)
    candidates = [
        _suggest_entry(
            title_en, suggestion_type="property", weight=property_weight, area_id=area_id
        ),
        _suggest_entry(
            title_ar, suggestion_type="property", weight=property_weight, area_id=area_id
        ),
        _suggest_entry(
            compound_name,
            suggestion_type="compound",
            weight=SUGGEST_WEIGHTS["compound"],
            area_id=area_id,
        ),
        _suggest_entry(
            developer_name,
            suggestion_type="developer",
            weight=SUGGEST_WEIGHTS["developer"],
            area_id=area_id,
        ),
        _suggest_entry(
            area_name, suggestion_type="area", weight=SUGGEST_WEIGHTS["area"], area_id=area_id
        ),
    ]
    return [entry for entry in candidates if entry is not None]


def transform_property(
    doc: Mapping[str, Any],
    *,
    area_slugs: Mapping[str, str] | None = None,
    media_base_url: str | None = None,
    indexed_at: datetime | None = None,
    now: datetime | None = None,
) -> dict[str, Any]:
    """Flatten a Mongo listing into the `properties_v1` document.

    Args:
        doc: canonical Mongo/seed property document.
        area_slugs: optional `{areaId: slug}` map (from `seed/areas.json`); the
            listing document does not carry the area slug.
        media_base_url: public base URL used to expand S3 keys when an image has
            no absolute URL (``S3_PUBLIC_BASE_URL`` / CloudFront).
        indexed_at: value written to `indexedAt` (defaults to now, UTC).
        now: reference time for `isDelivered` (defaults to now, UTC).
    """
    reference_now = now or datetime.now(tz=UTC)
    stamp = indexed_at or reference_now

    doc_id = resolve_document_id(doc) or ""
    mongo_id = _clean_text(doc.get("mongoId")) or (
        str(doc["_id"]) if doc.get("_id") is not None else None
    )

    title_en = _clean_text(_get(doc, "title", "en"))
    title_ar = _clean_text(_get(doc, "title", "ar"))
    description_en = _clean_text(_get(doc, "description", "en"))
    description_ar = _clean_text(_get(doc, "description", "ar"))

    area_sqm = _to_float(_get(doc, "specs", "areaSqm"))
    garden_sqm = _to_float(_get(doc, "specs", "gardenSqm"), 0.0)
    parking_spots = _to_int(_get(doc, "specs", "parkingSpots"), 0) or 0

    price = _to_float(_get(doc, "price", "amount"))
    price_per_meter = _to_int(_get(doc, "price", "pricePerMeter"))
    if price_per_meter is None and price and area_sqm:
        price_per_meter = int(round(price / area_sqm))

    down_payment_percent = _to_float(_get(doc, "paymentPlan", "downPaymentPercent"))
    down_payment_amount = None
    if price is not None and down_payment_percent is not None:
        down_payment_amount = int(round(price * down_payment_percent / 100.0))

    delivery_date = _to_iso(_get(doc, "paymentPlan", "deliveryDate"))
    status = _clean_text(doc.get("status"))

    area_id = _clean_text(_get(doc, "location", "areaId"))
    area_name = _clean_text(_get(doc, "location", "areaName"))
    area_slug = None
    if area_id and area_slugs:
        area_slug = _clean_text(area_slugs.get(area_id))
    if not area_slug:
        area_slug = slugify(area_name)

    images_raw = _get(doc, "media", "images", default=[]) or []
    images: list[Mapping[str, Any]] = [img for img in images_raw if isinstance(img, Mapping)]
    image_urls = [url for url in (_image_url(img, media_base_url) for img in images) if url]

    amenities = _dedupe(doc.get("amenities") or [])
    is_featured = _to_bool(doc.get("isFeatured"))

    views = _to_int(_get(doc, "stats", "views"), 0) or 0
    favorites = _to_int(_get(doc, "stats", "favorites"), 0) or 0
    leads = _to_int(_get(doc, "stats", "leads"), 0) or 0

    compound_name = _clean_text(_get(doc, "compound", "name"))
    developer_name = _clean_text(_get(doc, "developer", "name"))

    es_doc: dict[str, Any] = {
        # identity
        "id": doc_id,
        "mongoId": mongo_id,
        "slug": _clean_text(doc.get("slug")),
        "referenceNo": _clean_text(doc.get("referenceNo")),
        # text
        "title_en": title_en,
        "title_ar": title_ar,
        "description_en": description_en,
        "description_ar": description_ar,
        # enums
        "propertyType": _clean_text(doc.get("propertyType")),
        "saleType": _clean_text(doc.get("saleType")),
        "status": status,
        "finishing": _clean_text(doc.get("finishing")),
        # money
        "price": price,
        "pricePerMeter": price_per_meter,
        "currency": _clean_text(_get(doc, "price", "currency")) or "EGP",
        "downPaymentPercent": down_payment_percent,
        "downPaymentAmount": down_payment_amount,
        "installmentYears": _to_int(_get(doc, "paymentPlan", "installmentYears")),
        "monthlyInstallment": _to_int(_get(doc, "paymentPlan", "monthlyInstallment")),
        "deliveryDate": delivery_date,
        "deliveryYear": _year_of(delivery_date),
        # specs
        "bedrooms": _to_int(_get(doc, "specs", "bedrooms"), 0),
        "bathrooms": _to_int(_get(doc, "specs", "bathrooms"), 0),
        "areaSqm": area_sqm,
        "gardenSqm": garden_sqm,
        "floor": _to_int(_get(doc, "specs", "floor")),
        "parkingSpots": parking_spots,
        # location
        "areaId": area_id,
        "areaName": area_name,
        "areaSlug": area_slug,
        "city": _clean_text(_get(doc, "location", "city")),
        "governorate": _clean_text(_get(doc, "location", "governorate")),
        "address": _clean_text(_get(doc, "location", "address")),
        "geo": extract_geo_point(_get(doc, "location", "geo")),
        # relations
        "compoundId": _clean_text(_get(doc, "compound", "id")),
        "compoundName": compound_name,
        "compoundSlug": _clean_text(_get(doc, "compound", "slug")) or slugify(compound_name),
        "developerId": _clean_text(_get(doc, "developer", "id")),
        "developerName": developer_name,
        "developerSlug": _clean_text(_get(doc, "developer", "slug")) or slugify(developer_name),
        "developerLogo": _clean_text(_get(doc, "developer", "logoUrl")),
        # amenities
        "amenities": amenities,
        "amenitiesCount": len(amenities),
        # flags / derived
        "isFeatured": is_featured,
        "isDelivered": status == "delivered" or _is_past(delivery_date, now=reference_now),
        "hasGarden": bool(garden_sqm and garden_sqm > 0),
        "hasParking": parking_spots > 0,
        "popularity": views + favorites * 3 + leads * 5,
        # media
        "primaryImage": _primary_image(images, media_base_url),
        "images": image_urls[:10],
        "imagesCount": len(images),
        # stats
        "stats": {"views": views, "favorites": favorites, "leads": leads},
        # timestamps
        "publishedAt": _to_iso(doc.get("publishedAt")),
        "createdAt": _to_iso(doc.get("createdAt")),
        "updatedAt": _to_iso(doc.get("updatedAt")),
        "indexedAt": _to_iso(stamp),
        # type-ahead
        "suggest": build_suggest(
            title_en=title_en,
            title_ar=title_ar,
            compound_name=compound_name,
            developer_name=developer_name,
            area_name=area_name,
            area_id=area_id,
            is_featured=is_featured,
        ),
    }
    return es_doc


def extract_geo_point(geo: Any) -> dict[str, float] | None:
    """GeoJSON `[lng, lat]` (or `{lat, lng}`) -> Elasticsearch `{"lat", "lon"}`."""
    if not geo:
        return None
    if isinstance(geo, Mapping):
        coordinates = geo.get("coordinates")
        if isinstance(coordinates, list | tuple) and len(coordinates) >= 2:
            lng = _to_float(coordinates[0])
            lat = _to_float(coordinates[1])
        else:
            lat = _to_float(geo.get("lat", geo.get("latitude")))
            lng = _to_float(geo.get("lon", geo.get("lng", geo.get("longitude"))))
    elif isinstance(geo, list | tuple) and len(geo) >= 2:
        lng = _to_float(geo[0])
        lat = _to_float(geo[1])
    else:
        return None

    if lat is None or lng is None:
        return None
    if not (-90.0 <= lat <= 90.0) or not (-180.0 <= lng <= 180.0):
        return None
    return {"lat": lat, "lon": lng}


def transform_many(
    docs: Iterable[Mapping[str, Any]],
    *,
    area_slugs: Mapping[str, str] | None = None,
    media_base_url: str | None = None,
    indexed_at: datetime | None = None,
) -> list[dict[str, Any]]:
    """Transform every indexable document, skipping soft-deleted ones."""
    return [
        transform_property(
            doc,
            area_slugs=area_slugs,
            media_base_url=media_base_url,
            indexed_at=indexed_at,
        )
        for doc in docs
        if is_indexable(doc)
    ]
