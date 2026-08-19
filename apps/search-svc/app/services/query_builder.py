"""Composes every Elasticsearch query the public endpoints issue.

Pure functions: they take a validated `SearchFilters` and return plain DSL
dictionaries, which makes the whole query layer unit-testable without a cluster
(see `tests/test_query_builder.py`).

Anatomy of a search body
------------------------
``bool.must``    the free-text `multi_match` (`best_fields`, `fuzziness: AUTO`)
                 or `match_all` when `q` is absent
``bool.filter``  one clause per structured facet — non-scoring, cacheable
``bool.should``  ranking signals only: featured listings, recency (gauss decay
                 on `publishedAt`) and price proximity to the caller's budget
``sort``         the requested order, always with a stable `id` tiebreaker

Faceted search
--------------
Every filter clause is tagged with the *facet group* it belongs to, so
`build_facets_body()` can compute each facet's counts against the current
filters **minus that facet's own field** — the behaviour users expect from a
filter sidebar (selecting "villa" must not collapse the property-type list).
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from typing import Any

from app.schemas.search import MapFilters, SearchFilters, SortOption
from app.services.geo import BoundingBox, bbox_from_string, es_point, precision_for_bbox

__all__ = [
    "FACET_FIELD_GROUPS",
    "FILTER_GROUPS",
    "SOURCE_FIELDS",
    "TEXT_FIELDS",
    "bounding_box",
    "build_autocomplete_body",
    "build_facets_body",
    "build_filter_list",
    "build_highlight",
    "build_map_body",
    "build_map_points_body",
    "build_query",
    "build_search_body",
    "build_should_boosts",
    "build_similar_body",
    "build_similar_fallback_body",
    "build_sort",
    "build_text_query",
    "filter_clauses",
    "search_kwargs",
    "similar_price_filter",
    "similar_should_clauses",
]

# --------------------------------------------------------------------- text

#: Field boosts for the free-text query (bilingual, relations included).
TEXT_FIELDS: tuple[str, ...] = (
    "title_en^3",
    "title_ar^3",
    "description_en",
    "description_ar",
    "compoundName^2",
    "developerName^2",
    "areaName^2",
)

#: `_source` projection — exactly what the web `PropertyCard` renders.
SOURCE_FIELDS: tuple[str, ...] = (
    "id",
    "slug",
    "referenceNo",
    "title_en",
    "title_ar",
    "description_en",
    "description_ar",
    "price",
    "currency",
    "pricePerMeter",
    "propertyType",
    "saleType",
    "status",
    "finishing",
    "bedrooms",
    "bathrooms",
    "areaSqm",
    "gardenSqm",
    "floor",
    "parkingSpots",
    "downPaymentPercent",
    "downPaymentAmount",
    "installmentYears",
    "monthlyInstallment",
    "deliveryDate",
    "areaId",
    "areaName",
    "areaSlug",
    "city",
    "compoundId",
    "compoundName",
    "compoundSlug",
    "developerId",
    "developerName",
    "developerSlug",
    "amenities",
    "primaryImage",
    "isFeatured",
    "geo",
    "publishedAt",
)

#: Lighter projection used by the map and autocomplete responses.
MAP_SOURCE_FIELDS: tuple[str, ...] = (
    "id",
    "slug",
    "title_en",
    "title_ar",
    "price",
    "currency",
    "propertyType",
    "saleType",
    "bedrooms",
    "bathrooms",
    "areaSqm",
    "areaName",
    "compoundName",
    "developerName",
    "primaryImage",
    "isFeatured",
    "geo",
)

SUGGEST_SOURCE_FIELDS: tuple[str, ...] = (
    "id",
    "slug",
    "title_en",
    "title_ar",
    "areaId",
    "areaName",
    "areaSlug",
    "compoundId",
    "compoundName",
    "compoundSlug",
    "developerId",
    "developerName",
    "developerSlug",
)

#: Deterministic order in which filter clauses are emitted (keeps tests stable).
FILTER_GROUPS: tuple[str, ...] = (
    "propertyType",
    "saleType",
    "status",
    "finishing",
    "bedrooms",
    "bathrooms",
    "price",
    "areaSqm",
    "areaId",
    "compoundId",
    "developerId",
    "amenities",
    "delivery",
    "downPayment",
    "installment",
    "geo",
    "bbox",
)

#: Facet name -> the filter group it must ignore when counting (self-exclusion).
FACET_FIELD_GROUPS: dict[str, str] = {
    "propertyType": "propertyType",
    "saleType": "saleType",
    "status": "status",
    "finishing": "finishing",
    "bedrooms": "bedrooms",
    "bathrooms": "bathrooms",
    "amenities": "amenities",
    "areas": "areaId",
    "compounds": "compoundId",
    "developers": "developerId",
    "price": "price",
    "areaSqm": "areaSqm",
    "deliveryYear": "delivery",
    "installmentYears": "installment",
}

# Ranking knobs ------------------------------------------------------------
FEATURED_BOOST = 1.4
RECENCY_BOOST = 1.2
RECENCY_SCALE = "90d"
RECENCY_OFFSET = "7d"
RECENCY_DECAY = 0.5
BUDGET_BOOST = 1.3
BUDGET_DECAY = 0.5

#: Default price-histogram bar width in EGP (1M EGP reads well for Cairo stock).
DEFAULT_PRICE_INTERVAL = 1_000_000.0
AMENITY_FACET_SIZE = 30
RELATION_FACET_SIZE = 50
SIMILAR_PRICE_BAND = 0.25


def build_text_query(q: str | None) -> dict[str, Any]:
    """`multi_match` over the bilingual fields, or `match_all` when `q` is empty."""
    if not q:
        return {"match_all": {}}
    return {
        "multi_match": {
            "query": q,
            "fields": list(TEXT_FIELDS),
            "type": "best_fields",
            "operator": "or",
            "fuzziness": "AUTO",
            "prefix_length": 1,
            "max_expansions": 50,
            "minimum_should_match": "2<70%",
            "tie_breaker": 0.2,
        }
    }


def build_highlight() -> dict[str, Any]:
    """Highlight config for the title/description fields."""
    return {
        "pre_tags": ["<mark>"],
        "post_tags": ["</mark>"],
        "require_field_match": False,
        "fields": {
            "title_en": {"number_of_fragments": 0},
            "title_ar": {"number_of_fragments": 0},
            "description_en": {"fragment_size": 160, "number_of_fragments": 1},
            "description_ar": {"fragment_size": 160, "number_of_fragments": 1},
        },
    }


# ------------------------------------------------------------------ filters


def filter_clauses(filters: SearchFilters) -> dict[str, list[dict[str, Any]]]:
    """Structured filters grouped by facet, so a facet can drop its own group."""
    groups: dict[str, list[dict[str, Any]]] = {}

    if filters.propertyType:
        groups["propertyType"] = [{"terms": {"propertyType": list(filters.propertyType)}}]
    if filters.saleType:
        groups["saleType"] = [{"term": {"saleType": filters.saleType}}]
    if filters.status:
        groups["status"] = [{"term": {"status": filters.status}}]
    if filters.finishing:
        groups["finishing"] = [{"terms": {"finishing": list(filters.finishing)}}]
    if filters.bedrooms:
        groups["bedrooms"] = [{"terms": {"bedrooms": list(filters.bedrooms)}}]
    if filters.bathrooms:
        groups["bathrooms"] = [{"terms": {"bathrooms": list(filters.bathrooms)}}]

    price_range = _range_body(filters.minPrice, filters.maxPrice)
    if price_range:
        groups["price"] = [{"range": {"price": price_range}}]

    area_range = _range_body(filters.minArea, filters.maxArea)
    if area_range:
        groups["areaSqm"] = [{"range": {"areaSqm": area_range}}]

    if filters.areaId:
        groups["areaId"] = [{"terms": {"areaId": list(filters.areaId)}}]
    if filters.compoundId:
        groups["compoundId"] = [{"terms": {"compoundId": list(filters.compoundId)}}]
    if filters.developerId:
        groups["developerId"] = [{"terms": {"developerId": list(filters.developerId)}}]
    if filters.amenities:
        # AND semantics: the listing must carry every selected amenity.
        groups["amenities"] = [{"term": {"amenities": amenity}} for amenity in filters.amenities]

    if filters.deliveryBefore is not None:
        groups["delivery"] = [
            {"range": {"deliveryDate": {"lte": filters.deliveryBefore.isoformat()}}}
        ]
    if filters.maxDownPayment is not None:
        groups["downPayment"] = [{"range": {"downPaymentPercent": {"lte": filters.maxDownPayment}}}]
    if filters.minInstallmentYears is not None:
        groups["installment"] = [
            {"range": {"installmentYears": {"gte": filters.minInstallmentYears}}}
        ]

    if filters.has_geo:
        groups["geo"] = [
            {
                "geo_distance": {
                    "distance": f"{filters.radiusKm:g}km",
                    "geo": es_point(float(filters.lat or 0.0), float(filters.lng or 0.0)),
                }
            }
        ]

    if isinstance(filters, MapFilters):
        bbox = bounding_box(filters)
        groups["bbox"] = [{"geo_bounding_box": {"geo": bbox.as_es_bounds()}}]

    return groups


def _range_body(minimum: float | None, maximum: float | None) -> dict[str, float] | None:
    body: dict[str, float] = {}
    if minimum is not None:
        body["gte"] = float(minimum)
    if maximum is not None:
        body["lte"] = float(maximum)
    return body or None


def build_filter_list(
    filters: SearchFilters,
    *,
    exclude: Iterable[str] = (),
) -> list[dict[str, Any]]:
    """Flatten the grouped clauses in `FILTER_GROUPS` order, minus `exclude`."""
    skipped = set(exclude)
    groups = filter_clauses(filters)
    clauses: list[dict[str, Any]] = []
    for group in FILTER_GROUPS:
        if group in skipped:
            continue
        clauses.extend(groups.get(group, []))
    return clauses


def bounding_box(filters: MapFilters) -> BoundingBox:
    """Parse the `bbox` query parameter of `GET /map`."""
    return bbox_from_string(filters.bbox)


# ----------------------------------------------------------------- boosting


def build_should_boosts(filters: SearchFilters) -> list[dict[str, Any]]:
    """Non-filtering ranking signals: featured, recency decay, budget proximity."""
    should: list[dict[str, Any]] = [
        {"term": {"isFeatured": {"value": True, "boost": FEATURED_BOOST}}},
        {
            "function_score": {
                "query": {"match_all": {}},
                "functions": [
                    {
                        "gauss": {
                            "publishedAt": {
                                "origin": "now",
                                "scale": RECENCY_SCALE,
                                "offset": RECENCY_OFFSET,
                                "decay": RECENCY_DECAY,
                            }
                        }
                    }
                ],
                "boost_mode": "replace",
                "boost": RECENCY_BOOST,
            }
        },
    ]

    budget = _budget_curve(filters.minPrice, filters.maxPrice)
    if budget is not None:
        origin, scale = budget
        should.append(
            {
                "function_score": {
                    "query": {"match_all": {}},
                    "functions": [
                        {
                            "gauss": {
                                "price": {
                                    "origin": origin,
                                    "scale": scale,
                                    "decay": BUDGET_DECAY,
                                }
                            }
                        }
                    ],
                    "boost_mode": "replace",
                    "boost": BUDGET_BOOST,
                }
            }
        )
    return should


def _budget_curve(
    min_price: float | None,
    max_price: float | None,
) -> tuple[float, float] | None:
    """`(origin, scale)` of the gauss curve that rewards on-budget listings."""
    if min_price is not None and max_price is not None:
        origin = (float(min_price) + float(max_price)) / 2.0
        scale = max((float(max_price) - float(min_price)) / 2.0, 1.0)
    elif max_price is not None:
        origin = float(max_price)
        scale = max(float(max_price) * 0.25, 1.0)
    elif min_price is not None:
        origin = float(min_price) * 1.25
        scale = max(float(min_price) * 0.5, 1.0)
    else:
        return None
    return round(origin, 2), round(scale, 2)


# -------------------------------------------------------------------- query


def build_query(
    filters: SearchFilters,
    *,
    exclude_filters: Iterable[str] = (),
    with_boosts: bool = True,
) -> dict[str, Any]:
    """The `bool` query: text `must`, structured `filter`, ranking `should`."""
    query: dict[str, Any] = {
        "bool": {
            "must": [build_text_query(filters.q)],
            "filter": build_filter_list(filters, exclude=exclude_filters),
        }
    }
    if with_boosts:
        query["bool"]["should"] = build_should_boosts(filters)
        # `should` clauses only influence the score — never membership.
        query["bool"]["minimum_should_match"] = 0
    return query


SORT_SPECS: dict[str, list[dict[str, Any]]] = {
    SortOption.RELEVANCE.value: [{"_score": {"order": "desc"}}],
    SortOption.PRICE_ASC.value: [{"price": {"order": "asc", "missing": "_last"}}],
    SortOption.PRICE_DESC.value: [{"price": {"order": "desc", "missing": "_last"}}],
    SortOption.NEWEST.value: [{"publishedAt": {"order": "desc", "missing": "_last"}}],
    SortOption.AREA_DESC.value: [{"areaSqm": {"order": "desc", "missing": "_last"}}],
}

#: Deterministic tiebreaker so pagination never repeats or skips a listing.
SORT_TIEBREAKER: dict[str, Any] = {"id": {"order": "asc"}}


def build_sort(sort: SortOption | str | None) -> list[dict[str, Any]]:
    """Sort clauses for the requested order, always ending with the tiebreaker."""
    key = str(sort.value if isinstance(sort, SortOption) else (sort or SortOption.RELEVANCE.value))
    spec = SORT_SPECS.get(key, SORT_SPECS[SortOption.RELEVANCE.value])
    return [*spec, dict(SORT_TIEBREAKER)]


def build_search_body(
    filters: SearchFilters,
    *,
    from_: int = 0,
    size: int = 20,
    source_fields: Iterable[str] = SOURCE_FIELDS,
) -> dict[str, Any]:
    """Complete search body for `GET /api/search`."""
    body: dict[str, Any] = {
        "query": build_query(filters),
        "sort": build_sort(filters.sort),
        "from": max(0, int(from_)),
        "size": max(0, int(size)),
        "track_total_hits": True,
        "_source": {"includes": list(source_fields)},
    }
    if filters.has_text:
        body["highlight"] = build_highlight()
    return body


def search_kwargs(body: Mapping[str, Any]) -> dict[str, Any]:
    """Adapt a DSL body to `AsyncElasticsearch.search(**kwargs)` (`from` -> `from_`)."""
    kwargs = dict(body)
    if "from" in kwargs:
        kwargs["from_"] = kwargs.pop("from")
    return kwargs


# ------------------------------------------------------------------- facets


def _scoped_filter(filters: SearchFilters, group: str | None) -> dict[str, Any]:
    """`filter` aggregation scope: every clause except the facet's own group."""
    clauses = build_filter_list(filters, exclude=() if group is None else (group,))
    if not clauses:
        return {"match_all": {}}
    return {"bool": {"filter": clauses}}


def _facet_agg(
    filters: SearchFilters,
    group: str | None,
    aggs: dict[str, Any],
) -> dict[str, Any]:
    return {"filter": _scoped_filter(filters, group), "aggs": aggs}


def _terms(field: str, *, size: int, order: dict[str, str] | None = None) -> dict[str, Any]:
    body: dict[str, Any] = {"field": field, "size": size, "min_doc_count": 1}
    if order:
        body["order"] = order
    return {"terms": body}


def _relation_facet(id_field: str, name_field: str) -> dict[str, Any]:
    """Terms on the UUID with the display name pulled from the index itself."""
    agg = _terms(id_field, size=RELATION_FACET_SIZE)
    agg["aggs"] = {"name": _terms(name_field, size=1)}
    return agg


def build_facets_body(
    filters: SearchFilters,
    *,
    price_interval: float = DEFAULT_PRICE_INTERVAL,
    amenities_size: int = AMENITY_FACET_SIZE,
) -> dict[str, Any]:
    """One `size: 0` request producing every sidebar bucket.

    The top-level query carries only the free-text part; each facet re-applies
    the structured filters **minus its own group** inside a `filter` aggregation,
    which is what makes multi-select facets keep showing their siblings.
    """
    return {
        "size": 0,
        "track_total_hits": True,
        "query": {"bool": {"must": [build_text_query(filters.q)]}},
        "aggs": {
            "total": {"filter": _scoped_filter(filters, None)},
            "propertyType": _facet_agg(
                filters,
                FACET_FIELD_GROUPS["propertyType"],
                {"buckets": _terms("propertyType", size=20)},
            ),
            "saleType": _facet_agg(
                filters,
                FACET_FIELD_GROUPS["saleType"],
                {"buckets": _terms("saleType", size=10)},
            ),
            "status": _facet_agg(
                filters,
                FACET_FIELD_GROUPS["status"],
                {"buckets": _terms("status", size=10)},
            ),
            "finishing": _facet_agg(
                filters,
                FACET_FIELD_GROUPS["finishing"],
                {"buckets": _terms("finishing", size=10)},
            ),
            "bedrooms": _facet_agg(
                filters,
                FACET_FIELD_GROUPS["bedrooms"],
                {"buckets": _terms("bedrooms", size=20, order={"_key": "asc"})},
            ),
            "bathrooms": _facet_agg(
                filters,
                FACET_FIELD_GROUPS["bathrooms"],
                {"buckets": _terms("bathrooms", size=20, order={"_key": "asc"})},
            ),
            "amenities": _facet_agg(
                filters,
                FACET_FIELD_GROUPS["amenities"],
                {"buckets": _terms("amenities", size=amenities_size)},
            ),
            "areas": _facet_agg(
                filters,
                FACET_FIELD_GROUPS["areas"],
                {"buckets": _relation_facet("areaId", "areaName.keyword")},
            ),
            "compounds": _facet_agg(
                filters,
                FACET_FIELD_GROUPS["compounds"],
                {"buckets": _relation_facet("compoundId", "compoundName.keyword")},
            ),
            "developers": _facet_agg(
                filters,
                FACET_FIELD_GROUPS["developers"],
                {"buckets": _relation_facet("developerId", "developerName.keyword")},
            ),
            "price": _facet_agg(
                filters,
                FACET_FIELD_GROUPS["price"],
                {
                    "stats": {"stats": {"field": "price"}},
                    "histogram": {
                        "histogram": {
                            "field": "price",
                            "interval": float(price_interval),
                            "min_doc_count": 1,
                        }
                    },
                },
            ),
            "areaSqm": _facet_agg(
                filters,
                FACET_FIELD_GROUPS["areaSqm"],
                {"stats": {"stats": {"field": "areaSqm"}}},
            ),
            "deliveryYear": _facet_agg(
                filters,
                FACET_FIELD_GROUPS["deliveryYear"],
                {
                    "buckets": {
                        "date_histogram": {
                            "field": "deliveryDate",
                            "calendar_interval": "year",
                            "format": "yyyy",
                            "min_doc_count": 1,
                        }
                    }
                },
            ),
            "installmentYears": _facet_agg(
                filters,
                FACET_FIELD_GROUPS["installmentYears"],
                {"buckets": _terms("installmentYears", size=25, order={"_key": "asc"})},
            ),
        },
    }


# ------------------------------------------------------------- autocomplete


def build_autocomplete_body(
    q: str,
    *,
    size: int = 10,
    types: Iterable[str] = ("property", "compound", "developer", "area"),
    suggest_field: str = "suggest",
) -> dict[str, Any]:
    """One completion suggester per suggestion type (the `type` category context).

    Running four named suggesters — instead of one — is what lets the response
    label every hit with the source it came from without a second lookup.
    """
    suggest: dict[str, Any] = {}
    for suggestion_type in types:
        suggest[suggestion_type] = {
            "prefix": q,
            "completion": {
                "field": suggest_field,
                "size": size,
                "skip_duplicates": True,
                "fuzzy": {"fuzziness": "AUTO", "min_length": 4, "prefix_length": 1},
                "contexts": {"type": [suggestion_type]},
            },
        }
    return {
        "size": 0,
        "_source": {"includes": list(SUGGEST_SOURCE_FIELDS)},
        "suggest": suggest,
    }


def build_autocomplete_fallback_body(q: str, *, size: int = 10) -> dict[str, Any]:
    """Edge-ngram search used when the completion suggester returns nothing."""
    return {
        "size": size,
        "track_total_hits": False,
        "_source": {"includes": list(SUGGEST_SOURCE_FIELDS)},
        "query": {
            "multi_match": {
                "query": q,
                "type": "best_fields",
                "fields": [
                    "title_en.autocomplete^3",
                    "title_ar.autocomplete^3",
                    "compoundName.autocomplete^2",
                    "developerName.autocomplete^2",
                    "areaName.autocomplete^2",
                ],
                "operator": "and",
            }
        },
    }


# ----------------------------------------------------------------- similar


#: Boost per relation when ranking "more like this" candidates.
SIMILAR_RELATION_BOOSTS: tuple[tuple[str, float], ...] = (
    ("compoundId", 3.0),
    ("areaId", 2.0),
    ("developerId", 1.5),
    ("propertyType", 1.5),
)

MLT_FIELDS: tuple[str, ...] = ("title_en", "title_ar", "description_en", "description_ar")


def similar_should_clauses(source: Mapping[str, Any]) -> list[dict[str, Any]]:
    """Same compound > same area > same developer > same type."""
    return [
        {"term": {field: {"value": source[field], "boost": boost}}}
        for field, boost in SIMILAR_RELATION_BOOSTS
        if source.get(field)
    ]


def similar_price_filter(
    source: Mapping[str, Any],
    *,
    price_band: float = SIMILAR_PRICE_BAND,
) -> list[dict[str, Any]]:
    """±`price_band` around the source listing's price (default ±25%)."""
    price = source.get("price")
    if not isinstance(price, int | float) or isinstance(price, bool) or price <= 0:
        return []
    return [
        {
            "range": {
                "price": {
                    "gte": round(float(price) * (1.0 - price_band), 2),
                    "lte": round(float(price) * (1.0 + price_band), 2),
                }
            }
        }
    ]


def _similar_body(
    *,
    must: list[dict[str, Any]],
    should: list[dict[str, Any]],
    filters: list[dict[str, Any]],
    document_id: str,
    size: int,
    minimum_should_match: int,
) -> dict[str, Any]:
    return {
        "size": max(1, int(size)),
        "track_total_hits": False,
        "_source": {"includes": list(SOURCE_FIELDS)},
        "query": {
            "bool": {
                "must": must,
                "should": should,
                "filter": filters,
                "must_not": [{"ids": {"values": [document_id]}}],
                "minimum_should_match": minimum_should_match,
            }
        },
        "sort": [{"_score": {"order": "desc"}}, dict(SORT_TIEBREAKER)],
    }


def build_similar_body(
    source: Mapping[str, Any],
    *,
    index: str,
    document_id: str,
    size: int = 10,
    price_band: float = SIMILAR_PRICE_BAND,
) -> dict[str, Any]:
    """`more_like_this` on the listing text, fenced by location and price band."""
    return _similar_body(
        must=[
            {
                "more_like_this": {
                    "fields": list(MLT_FIELDS),
                    "like": [{"_index": index, "_id": document_id}],
                    "min_term_freq": 1,
                    "min_doc_freq": 1,
                    "max_query_terms": 25,
                    "minimum_should_match": "20%",
                }
            }
        ],
        should=similar_should_clauses(source),
        filters=similar_price_filter(source, price_band=price_band),
        document_id=document_id,
        size=size,
        minimum_should_match=0,
    )


def build_similar_fallback_body(
    source: Mapping[str, Any],
    *,
    document_id: str,
    size: int = 10,
    price_band: float = SIMILAR_PRICE_BAND,
) -> dict[str, Any]:
    """Location/price/type similarity used when `more_like_this` finds nothing."""
    should = similar_should_clauses(source)
    return _similar_body(
        must=[{"match_all": {}}],
        should=should,
        filters=similar_price_filter(source, price_band=price_band),
        document_id=document_id,
        size=size,
        # Without the text query the relations *are* the similarity signal.
        minimum_should_match=1 if should else 0,
    )


# --------------------------------------------------------------------- map


def build_map_body(
    filters: MapFilters,
    *,
    precision: int | None = None,
    max_clusters: int = 500,
) -> dict[str, Any]:
    """`size: 0` geotile clustering over the requested viewport."""
    bbox = bounding_box(filters)
    resolved = int(precision or filters.precision or precision_for_bbox(bbox))
    return {
        "size": 0,
        "track_total_hits": True,
        "query": build_query(filters, with_boosts=False),
        "aggs": {
            "clusters": {
                "geotile_grid": {
                    "field": "geo",
                    "precision": resolved,
                    "size": max_clusters,
                    "bounds": bbox.as_es_bounds(),
                },
                "aggs": {
                    "centroid": {"geo_centroid": {"field": "geo"}},
                    "price": {"stats": {"field": "price"}},
                },
            }
        },
    }


def build_map_points_body(filters: MapFilters, *, size: int) -> dict[str, Any]:
    """Individual pins, used when the viewport holds few enough listings."""
    return {
        "size": max(1, int(size)),
        "track_total_hits": False,
        "query": build_query(filters, with_boosts=False),
        "sort": [{"isFeatured": {"order": "desc"}}, dict(SORT_TIEBREAKER)],
        "_source": {"includes": list(MAP_SOURCE_FIELDS)},
    }
