"""Aggregations behind `GET /api/search/facets` (and `?facets=true`).

Proper faceted search: every bucket list is counted against the caller's filters
**minus the facet's own field**. Selecting `propertyType=villa` must not shrink
the property-type list to a single entry — otherwise a user can never widen a
choice without clearing it first.

That is achieved with one `filter` aggregation per facet inside a single
`size: 0` request: the top-level query keeps only the free-text part, and each
facet re-applies its own scoped subset of `build_filter_list()`.
"""

from __future__ import annotations

from typing import Any

from app.schemas.search import SearchFilters
from app.services.query_builder import build_filter_list, build_text_query

__all__ = [
    "AMENITY_FACET_SIZE",
    "DEFAULT_PRICE_INTERVAL",
    "FACET_FIELD_GROUPS",
    "RELATION_FACET_SIZE",
    "build_facets_body",
    "facet_scope",
]

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

#: Default price-histogram bar width in EGP (1M EGP reads well for Cairo stock).
DEFAULT_PRICE_INTERVAL = 1_000_000.0
AMENITY_FACET_SIZE = 30
RELATION_FACET_SIZE = 50
ENUM_FACET_SIZE = 20


def facet_scope(filters: SearchFilters, group: str | None) -> dict[str, Any]:
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
    return {"filter": facet_scope(filters, group), "aggs": aggs}


def _terms(field: str, *, size: int, order: dict[str, str] | None = None) -> dict[str, Any]:
    body: dict[str, Any] = {"field": field, "size": size, "min_doc_count": 1}
    if order:
        body["order"] = order
    return {"terms": body}


def _relation_terms(id_field: str, name_field: str) -> dict[str, Any]:
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
    """One `size: 0` request producing every sidebar bucket."""
    ascending = {"_key": "asc"}
    return {
        "size": 0,
        "track_total_hits": True,
        "query": {"bool": {"must": [build_text_query(filters.q)]}},
        "aggs": {
            # Doc count of the fully filtered result set.
            "total": {"filter": facet_scope(filters, None)},
            "propertyType": _facet_agg(
                filters,
                FACET_FIELD_GROUPS["propertyType"],
                {"buckets": _terms("propertyType", size=ENUM_FACET_SIZE)},
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
                {"buckets": _terms("bedrooms", size=ENUM_FACET_SIZE, order=ascending)},
            ),
            "bathrooms": _facet_agg(
                filters,
                FACET_FIELD_GROUPS["bathrooms"],
                {"buckets": _terms("bathrooms", size=ENUM_FACET_SIZE, order=ascending)},
            ),
            "amenities": _facet_agg(
                filters,
                FACET_FIELD_GROUPS["amenities"],
                {"buckets": _terms("amenities", size=amenities_size)},
            ),
            "areas": _facet_agg(
                filters,
                FACET_FIELD_GROUPS["areas"],
                {"buckets": _relation_terms("areaId", "areaName.keyword")},
            ),
            "compounds": _facet_agg(
                filters,
                FACET_FIELD_GROUPS["compounds"],
                {"buckets": _relation_terms("compoundId", "compoundName.keyword")},
            ),
            "developers": _facet_agg(
                filters,
                FACET_FIELD_GROUPS["developers"],
                {"buckets": _relation_terms("developerId", "developerName.keyword")},
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
                {"buckets": _terms("installmentYears", size=25, order=ascending)},
            ),
        },
    }
