"""Elasticsearch responses -> the JSON shapes the web app consumes.

Every function here is pure. Hits become `PropertyCard`-shaped dictionaries
(`title.en/ar`, `specs`, `paymentPlan`, `geo.lat/lng`), aggregation buckets
become labelled facet buckets, and completion-suggester options become typed
`{text, type, id, slug}` suggestions.

Facet labels are enriched from the shared `seed/` reference data (CONTRACT §9)
when it is available, and fall back to whatever the index itself carries.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping, Sequence
from typing import Any

from app.core.logging import get_logger
from app.schemas.search import SuggestionType
from app.services import reference_data
from app.services.geo import haversine_km, web_point

log = get_logger("search-svc.mapper")

__all__ = [
    "humanize_enum",
    "map_clusters",
    "map_facets",
    "map_fallback_suggestions",
    "map_hit",
    "map_hits",
    "map_suggestions",
    "total_hits",
]


# ---------------------------------------------------------------------- hits


def total_hits(response: Mapping[str, Any]) -> int:
    """`hits.total.value` (ES 8 returns an object, older clients a bare int)."""
    total = (response.get("hits") or {}).get("total")
    if isinstance(total, Mapping):
        return int(total.get("value", 0) or 0)
    return int(total or 0)


def map_hit(hit: Mapping[str, Any], *, origin: Mapping[str, float] | None = None) -> dict[str, Any]:
    """One `_source` document, reshaped for the web `PropertyCard`."""
    source: Mapping[str, Any] = hit.get("_source") or {}
    geo = web_point(source.get("geo"))

    result: dict[str, Any] = {
        "id": str(source.get("id") or hit.get("_id") or ""),
        "slug": source.get("slug"),
        "referenceNo": source.get("referenceNo"),
        "title": {"en": source.get("title_en"), "ar": source.get("title_ar")},
        "price": source.get("price"),
        "currency": source.get("currency") or "EGP",
        "pricePerMeter": source.get("pricePerMeter"),
        "propertyType": source.get("propertyType"),
        "saleType": source.get("saleType"),
        "status": source.get("status"),
        "finishing": source.get("finishing"),
        "specs": {
            "bedrooms": source.get("bedrooms"),
            "bathrooms": source.get("bathrooms"),
            "areaSqm": source.get("areaSqm"),
            "gardenSqm": source.get("gardenSqm"),
            "floor": source.get("floor"),
            "parkingSpots": source.get("parkingSpots"),
        },
        "paymentPlan": {
            "downPaymentPercent": source.get("downPaymentPercent"),
            "downPaymentAmount": source.get("downPaymentAmount"),
            "installmentYears": source.get("installmentYears"),
            "monthlyInstallment": source.get("monthlyInstallment"),
            "deliveryDate": source.get("deliveryDate"),
        },
        "areaId": source.get("areaId"),
        "areaName": source.get("areaName"),
        "areaSlug": source.get("areaSlug"),
        "city": source.get("city"),
        "compoundId": source.get("compoundId"),
        "compoundName": source.get("compoundName"),
        "compoundSlug": source.get("compoundSlug"),
        "developerId": source.get("developerId"),
        "developerName": source.get("developerName"),
        "developerSlug": source.get("developerSlug"),
        "amenities": list(source.get("amenities") or []),
        "primaryImage": source.get("primaryImage"),
        "isFeatured": bool(source.get("isFeatured")),
        "geo": geo,
        "publishedAt": source.get("publishedAt"),
        "score": hit.get("_score"),
    }

    description_en = source.get("description_en")
    description_ar = source.get("description_ar")
    if description_en or description_ar:
        result["description"] = {"en": description_en, "ar": description_ar}

    highlight = hit.get("highlight")
    if highlight:
        result["highlight"] = {key: list(value) for key, value in dict(highlight).items()}

    if origin and geo:
        result["distanceKm"] = round(
            haversine_km(float(origin["lat"]), float(origin["lng"]), geo["lat"], geo["lng"]), 2
        )
    return result


def map_hits(
    response: Mapping[str, Any],
    *,
    origin: Mapping[str, float] | None = None,
) -> list[dict[str, Any]]:
    hits = (response.get("hits") or {}).get("hits") or []
    return [map_hit(hit, origin=origin) for hit in hits]


# -------------------------------------------------------------------- facets


def _buckets(agg: Mapping[str, Any] | None) -> list[dict[str, Any]]:
    if not agg:
        return []
    inner = agg.get("buckets")
    buckets = inner.get("buckets") if isinstance(inner, Mapping) else agg.get("buckets")
    return [bucket for bucket in (buckets or []) if isinstance(bucket, dict)]


def _simple_facet(
    agg: Mapping[str, Any] | None,
    *,
    labels: Mapping[str, Mapping[str, str]] | None = None,
    humanize: bool = True,
) -> list[dict[str, Any]]:
    """Terms buckets -> `[{value, label, labelAr, slug, count}]`."""
    facets: list[dict[str, Any]] = []
    for bucket in _buckets(agg):
        raw = bucket.get("key_as_string") or bucket.get("key")
        value = str(raw)
        entry: dict[str, Any] = {
            "value": value,
            "label": humanize_enum(value) if humanize else value,
            "count": int(bucket.get("doc_count", 0) or 0),
        }
        label = (labels or {}).get(value)
        if label:
            entry["label"] = label.get("en") or entry["label"]
            entry["labelAr"] = label.get("ar") or None
            entry["slug"] = label.get("slug") or None
        facets.append(entry)
    return facets


def _relation_facet(
    agg: Mapping[str, Any] | None,
    *,
    labels: Mapping[str, Mapping[str, str]] | None = None,
    name_key: str = "en",
) -> list[dict[str, Any]]:
    """Id buckets carrying a nested `name` terms sub-aggregation."""
    facets: list[dict[str, Any]] = []
    for bucket in _buckets(agg):
        value = str(bucket.get("key"))
        nested = bucket.get("name") or {}
        nested_buckets = nested.get("buckets") or []
        indexed_name = str(nested_buckets[0].get("key")) if nested_buckets else None

        reference = (labels or {}).get(value) or {}
        entry = {
            "value": value,
            "label": indexed_name or reference.get(name_key) or reference.get("name") or value,
            "count": int(bucket.get("doc_count", 0) or 0),
        }
        if reference.get("ar"):
            entry["labelAr"] = reference["ar"]
        if reference.get("slug"):
            entry["slug"] = reference["slug"]
        facets.append(entry)
    return facets


def humanize_enum(value: str) -> str:
    """`semi_finished` -> `Semi Finished`; numbers are left untouched."""
    text = str(value)
    if not text or text.isdigit():
        return text
    return text.replace("_", " ").replace("-", " ").title()


def _stats(agg: Mapping[str, Any] | None) -> dict[str, Any]:
    stats = (agg or {}).get("stats") or {}
    return {
        "min": stats.get("min"),
        "max": stats.get("max"),
        "avg": round(stats["avg"], 2) if isinstance(stats.get("avg"), int | float) else None,
        "count": int(stats.get("count", 0) or 0),
    }


def _price_histogram(agg: Mapping[str, Any] | None, interval: float) -> list[dict[str, Any]]:
    histogram = (agg or {}).get("histogram") or {}
    buckets = histogram.get("buckets") or []
    bars: list[dict[str, Any]] = []
    for bucket in buckets:
        if not isinstance(bucket, Mapping):
            continue
        key = float(bucket.get("key", 0) or 0)
        bars.append(
            {
                "key": key,
                "min": key,
                "max": key + interval,
                "count": int(bucket.get("doc_count", 0) or 0),
            }
        )
    return bars


def _reference_maps() -> dict[str, dict[str, Any]]:
    """Seed-derived labels; an unavailable seed simply means no enrichment."""
    try:
        return {
            "areas": dict(reference_data.area_name_map()),
            "amenities": dict(reference_data.amenity_label_map()),
            "developers": dict(reference_data.developer_map()),
            "compounds": dict(reference_data.compound_map()),
        }
    except Exception as exc:  # pragma: no cover - seed volume is optional
        log.warning("reference_data_unavailable", error=str(exc))
        return {"areas": {}, "amenities": {}, "developers": {}, "compounds": {}}


def map_facets(
    aggregations: Mapping[str, Any] | None,
    *,
    price_interval: float,
) -> dict[str, Any]:
    """Aggregation payload -> the sidebar facet set."""
    aggs = aggregations or {}
    reference = _reference_maps()

    price_agg = aggs.get("price") or {}
    return {
        "total": int((aggs.get("total") or {}).get("doc_count", 0) or 0),
        "propertyType": _simple_facet(aggs.get("propertyType")),
        "saleType": _simple_facet(aggs.get("saleType")),
        "status": _simple_facet(aggs.get("status")),
        "finishing": _simple_facet(aggs.get("finishing")),
        "bedrooms": _simple_facet(aggs.get("bedrooms"), humanize=False),
        "bathrooms": _simple_facet(aggs.get("bathrooms"), humanize=False),
        "amenities": _simple_facet(aggs.get("amenities"), labels=reference["amenities"]),
        "areas": _relation_facet(aggs.get("areas"), labels=reference["areas"]),
        "compounds": _relation_facet(
            aggs.get("compounds"), labels=reference["compounds"], name_key="name"
        ),
        "developers": _relation_facet(
            aggs.get("developers"), labels=reference["developers"], name_key="name"
        ),
        "price": {
            "stats": _stats(price_agg),
            "interval": price_interval,
            "histogram": _price_histogram(price_agg, price_interval),
        },
        "areaSqm": _stats(aggs.get("areaSqm")),
        "deliveryYear": _simple_facet(aggs.get("deliveryYear"), humanize=False),
        "installmentYears": _simple_facet(aggs.get("installmentYears"), humanize=False),
    }


# --------------------------------------------------------------- suggestions

#: Which `_source` fields identify a suggestion of each type.
SUGGESTION_SOURCES: dict[str, tuple[str, str, str]] = {
    # type -> (text field, id field, slug field)
    SuggestionType.PROPERTY.value: ("title_en", "id", "slug"),
    SuggestionType.COMPOUND.value: ("compoundName", "compoundId", "compoundSlug"),
    SuggestionType.DEVELOPER.value: ("developerName", "developerId", "developerSlug"),
    SuggestionType.AREA.value: ("areaName", "areaId", "areaSlug"),
}


def map_suggestions(
    response: Mapping[str, Any],
    *,
    limit: int,
    types: Iterable[str] = (),
) -> list[dict[str, Any]]:
    """Merge the per-type completion suggesters into one deduped, ranked list."""
    suggest = response.get("suggest") or {}
    collected: list[tuple[float, dict[str, Any]]] = []

    for suggestion_type in types or SUGGESTION_SOURCES:
        for block in suggest.get(suggestion_type) or []:
            for option in (block or {}).get("options") or []:
                entry = _suggestion_from_option(option, suggestion_type)
                if entry is not None:
                    collected.append((float(option.get("_score", 0) or 0), entry))

    collected.sort(key=lambda item: item[0], reverse=True)
    return _dedupe_suggestions([entry for _, entry in collected], limit=limit)


def _suggestion_from_option(
    option: Mapping[str, Any],
    suggestion_type: str,
) -> dict[str, Any] | None:
    source: Mapping[str, Any] = option.get("_source") or {}
    text_field, id_field, slug_field = SUGGESTION_SOURCES.get(
        suggestion_type, ("title_en", "id", "slug")
    )
    # The completion option text is the matched input; prefer it, because a
    # property doc may match on its Arabic title while `title_en` also exists.
    text = str(option.get("text") or source.get(text_field) or "").strip()
    if not text:
        return None
    identifier = source.get(id_field)
    if not identifier and suggestion_type == SuggestionType.PROPERTY.value:
        identifier = option.get("_id")
    return {
        "text": text,
        "type": suggestion_type,
        "id": str(identifier) if identifier else None,
        "slug": source.get(slug_field),
    }


def map_fallback_suggestions(
    response: Mapping[str, Any],
    *,
    limit: int,
) -> list[dict[str, Any]]:
    """Turn plain search hits into property suggestions (suggester miss path)."""
    entries: list[dict[str, Any]] = []
    for hit in (response.get("hits") or {}).get("hits") or []:
        source = hit.get("_source") or {}
        text = source.get("title_en") or source.get("title_ar")
        if not text:
            continue
        entries.append(
            {
                "text": str(text),
                "type": SuggestionType.PROPERTY.value,
                "id": str(source.get("id") or hit.get("_id") or ""),
                "slug": source.get("slug"),
            }
        )
    return _dedupe_suggestions(entries, limit=limit)


def _dedupe_suggestions(
    entries: Sequence[Mapping[str, Any]],
    *,
    limit: int,
) -> list[dict[str, Any]]:
    seen: set[tuple[str, str]] = set()
    unique: list[dict[str, Any]] = []
    for entry in entries:
        key = (str(entry.get("type")), str(entry.get("id") or entry.get("text", "")).lower())
        text_key = (str(entry.get("type")), str(entry.get("text", "")).strip().lower())
        if key in seen or text_key in seen:
            continue
        seen.add(key)
        seen.add(text_key)
        unique.append(dict(entry))
        if len(unique) >= limit:
            break
    return unique


# ----------------------------------------------------------------- map/geo


def map_clusters(aggregations: Mapping[str, Any] | None) -> list[dict[str, Any]]:
    """`geotile_grid` buckets -> `[{key, count, centroid, avgPrice, ...}]`."""
    buckets = ((aggregations or {}).get("clusters") or {}).get("buckets") or []
    clusters: list[dict[str, Any]] = []
    for bucket in buckets:
        if not isinstance(bucket, Mapping):
            continue
        centroid = web_point((bucket.get("centroid") or {}).get("location"))
        if centroid is None:
            continue
        price = bucket.get("price") or {}
        average = price.get("avg")
        clusters.append(
            {
                "key": str(bucket.get("key")),
                "count": int(bucket.get("doc_count", 0) or 0),
                "centroid": centroid,
                "avgPrice": round(average, 2) if isinstance(average, int | float) else None,
                "minPrice": price.get("min"),
                "maxPrice": price.get("max"),
            }
        )
    clusters.sort(key=lambda cluster: cluster["count"], reverse=True)
    return clusters
