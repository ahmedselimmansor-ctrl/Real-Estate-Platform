"""Unit tests for the Elasticsearch DSL produced by `app.services.query_builder`.

No cluster is involved: the builders are pure functions, so the generated query
can be asserted field by field. The two behaviours that matter most are the
filter composition (text + price + geo + amenities + sort) and the "exclude the
facet's own filter" rule that makes multi-select facets usable.
"""

from __future__ import annotations

from datetime import date
from typing import Any

import pytest

from app.schemas.search import MapFilters, SearchFilters, SortOption
from app.services import query_builder as qb
from app.services.geo import bbox_from_string, precision_for_bbox

CAIRO_LAT = 30.0304
CAIRO_LNG = 31.4913


def make_filters(**kwargs: Any) -> SearchFilters:
    return SearchFilters(**kwargs)


def clause_fields(clauses: list[dict[str, Any]]) -> set[str]:
    """`[{"terms": {"propertyType": [...]}}]` -> `{"propertyType"}`."""
    fields: set[str] = set()
    for clause in clauses:
        for body in clause.values():
            if isinstance(body, dict):
                fields.update(body.keys())
    return fields


# ------------------------------------------------------------------ text


def test_empty_query_uses_match_all() -> None:
    assert qb.build_text_query(None) == {"match_all": {}}
    assert qb.build_text_query("") == {"match_all": {}}


def test_text_query_uses_best_fields_with_contract_boosts() -> None:
    query = qb.build_text_query("Palm Hills New Cairo")
    multi_match = query["multi_match"]

    assert multi_match["type"] == "best_fields"
    assert multi_match["fuzziness"] == "AUTO"
    assert multi_match["fields"] == [
        "title_en^3",
        "title_ar^3",
        "description_en",
        "description_ar",
        "compoundName^2",
        "developerName^2",
        "areaName^2",
    ]


def test_highlight_is_added_only_with_a_text_query() -> None:
    with_text = qb.build_search_body(make_filters(q="villa"), size=10)
    without_text = qb.build_search_body(make_filters(), size=10)

    assert set(with_text["highlight"]["fields"]) == {
        "title_en",
        "title_ar",
        "description_en",
        "description_ar",
    }
    assert "highlight" not in without_text


# ---------------------------------------------------------------- filters


def test_structured_filters_are_grouped_by_facet() -> None:
    filters = make_filters(
        propertyType=["villa"],
        saleType="primary",
        status="available",
        finishing=["fully_finished"],
        bedrooms=[3, 4],
        bathrooms=[3],
        minPrice=5_000_000,
        maxPrice=15_000_000,
        minArea=150,
        maxArea=400,
        areaId=["b47dcd29-cff0-5bd0-b7dd-03def1acf3b2"],
        compoundId=["1a63850a-81c8-5c83-a7d6-3c0b69fd93f9"],
        developerId=["fbbdfc50-271a-535e-814b-30585c974062"],
        amenities=["pool", "gym"],
        deliveryBefore=date(2028, 12, 31),
        maxDownPayment=15,
        minInstallmentYears=8,
        lat=CAIRO_LAT,
        lng=CAIRO_LNG,
        radiusKm=10,
    )
    groups = qb.filter_clauses(filters)

    assert groups["propertyType"] == [{"terms": {"propertyType": ["villa"]}}]
    assert groups["saleType"] == [{"term": {"saleType": "primary"}}]
    assert groups["status"] == [{"term": {"status": "available"}}]
    assert groups["bedrooms"] == [{"terms": {"bedrooms": [3, 4]}}]
    assert groups["price"] == [{"range": {"price": {"gte": 5_000_000.0, "lte": 15_000_000.0}}}]
    assert groups["areaSqm"] == [{"range": {"areaSqm": {"gte": 150.0, "lte": 400.0}}}]
    assert groups["delivery"] == [{"range": {"deliveryDate": {"lte": "2028-12-31"}}}]
    assert groups["downPayment"] == [{"range": {"downPaymentPercent": {"lte": 15.0}}}]
    assert groups["installment"] == [{"range": {"installmentYears": {"gte": 8}}}]
    assert groups["geo"] == [
        {"geo_distance": {"distance": "10km", "geo": {"lat": CAIRO_LAT, "lon": CAIRO_LNG}}}
    ]


def test_amenities_use_and_semantics() -> None:
    filters = make_filters(amenities=["pool", "gym", "security"])
    clauses = qb.filter_clauses(filters)["amenities"]

    # One clause per amenity: a listing must carry all of them.
    assert clauses == [
        {"term": {"amenities": "gym"}},
        {"term": {"amenities": "pool"}},
        {"term": {"amenities": "security"}},
    ]


def test_open_ended_price_range_emits_a_single_bound() -> None:
    assert qb.filter_clauses(make_filters(minPrice=3_000_000))["price"] == [
        {"range": {"price": {"gte": 3_000_000.0}}}
    ]
    assert qb.filter_clauses(make_filters(maxPrice=9_000_000))["price"] == [
        {"range": {"price": {"lte": 9_000_000.0}}}
    ]


def test_no_filters_produces_an_empty_filter_list() -> None:
    assert qb.build_filter_list(make_filters()) == []


def test_filter_list_is_emitted_in_a_stable_order() -> None:
    filters = make_filters(
        amenities=["pool"],
        propertyType=["villa"],
        minPrice=1_000_000,
    )
    clauses = qb.build_filter_list(filters)

    assert clauses == [
        {"terms": {"propertyType": ["villa"]}},
        {"range": {"price": {"gte": 1_000_000.0}}},
        {"term": {"amenities": "pool"}},
    ]


# ------------------------------------------------------------------ boosts


def test_should_boosts_cover_featured_and_recency() -> None:
    should = qb.build_should_boosts(make_filters())

    assert should[0] == {"term": {"isFeatured": {"value": True, "boost": qb.FEATURED_BOOST}}}
    decay = should[1]["function_score"]["functions"][0]["gauss"]["publishedAt"]
    assert decay["origin"] == "now"
    assert decay["scale"] == qb.RECENCY_SCALE
    # Only two signals without a budget.
    assert len(should) == 2


def test_budget_adds_a_price_proximity_curve() -> None:
    should = qb.build_should_boosts(make_filters(minPrice=4_000_000, maxPrice=8_000_000))
    curve = should[-1]["function_score"]["functions"][0]["gauss"]["price"]

    assert curve["origin"] == 6_000_000.0
    assert curve["scale"] == 2_000_000.0


def test_should_clauses_never_restrict_membership() -> None:
    query = qb.build_query(make_filters(q="villa"))
    assert query["bool"]["minimum_should_match"] == 0


# -------------------------------------------------------------------- sort


@pytest.mark.parametrize(
    ("sort", "expected_first"),
    [
        (SortOption.RELEVANCE, {"_score": {"order": "desc"}}),
        (SortOption.PRICE_ASC, {"price": {"order": "asc", "missing": "_last"}}),
        (SortOption.PRICE_DESC, {"price": {"order": "desc", "missing": "_last"}}),
        (SortOption.NEWEST, {"publishedAt": {"order": "desc", "missing": "_last"}}),
        (SortOption.AREA_DESC, {"areaSqm": {"order": "desc", "missing": "_last"}}),
    ],
)
def test_every_sort_option_ends_with_a_stable_tiebreaker(
    sort: SortOption, expected_first: dict[str, Any]
) -> None:
    clauses = qb.build_sort(sort)

    assert clauses[0] == expected_first
    assert clauses[-1] == {"id": {"order": "asc"}}


def test_unknown_sort_falls_back_to_relevance() -> None:
    assert qb.build_sort("not-a-sort") == qb.build_sort(SortOption.RELEVANCE)


# ----------------------------------------------- representative full query


def test_full_body_for_text_price_geo_amenities_and_sort() -> None:
    filters = make_filters(
        q="villa sea view",
        minPrice=5_000_000,
        maxPrice=12_000_000,
        amenities=["pool", "beach_access"],
        lat=31.0409,
        lng=28.4200,
        radiusKm=25,
        sort=SortOption.PRICE_ASC,
    )
    body = qb.build_search_body(filters, from_=40, size=20)
    bool_query = body["query"]["bool"]

    assert body["from"] == 40
    assert body["size"] == 20
    assert body["track_total_hits"] is True
    assert body["_source"]["includes"] == list(qb.SOURCE_FIELDS)

    assert bool_query["must"] == [qb.build_text_query("villa sea view")]
    assert bool_query["filter"] == [
        {"range": {"price": {"gte": 5_000_000.0, "lte": 12_000_000.0}}},
        {"term": {"amenities": "beach_access"}},
        {"term": {"amenities": "pool"}},
        {"geo_distance": {"distance": "25km", "geo": {"lat": 31.0409, "lon": 28.42}}},
    ]
    assert body["sort"] == [
        {"price": {"order": "asc", "missing": "_last"}},
        {"id": {"order": "asc"}},
    ]
    assert "highlight" in body


def test_search_kwargs_renames_from_for_the_python_client() -> None:
    kwargs = qb.search_kwargs(qb.build_search_body(make_filters(), from_=20, size=20))

    assert "from" not in kwargs
    assert kwargs["from_"] == 20


# ------------------------------------------------------------------ facets


def test_each_facet_excludes_its_own_filter() -> None:
    filters = make_filters(
        propertyType=["villa"],
        minPrice=5_000_000,
        maxPrice=12_000_000,
        amenities=["pool"],
        areaId=["b47dcd29-cff0-5bd0-b7dd-03def1acf3b2"],
    )
    aggs = qb.build_facets_body(filters)["aggs"]

    property_scope = aggs["propertyType"]["filter"]["bool"]["filter"]
    assert clause_fields(property_scope) == {"price", "areaId", "amenities"}

    price_scope = aggs["price"]["filter"]["bool"]["filter"]
    assert clause_fields(price_scope) == {"propertyType", "areaId", "amenities"}

    areas_scope = aggs["areas"]["filter"]["bool"]["filter"]
    assert clause_fields(areas_scope) == {"propertyType", "price", "amenities"}

    amenities_scope = aggs["amenities"]["filter"]["bool"]["filter"]
    assert clause_fields(amenities_scope) == {"propertyType", "price", "areaId"}


def test_facet_total_applies_every_filter() -> None:
    filters = make_filters(propertyType=["villa"], minPrice=5_000_000)
    aggs = qb.build_facets_body(filters)["aggs"]

    assert clause_fields(aggs["total"]["filter"]["bool"]["filter"]) == {"propertyType", "price"}


def test_facet_scope_is_match_all_when_only_its_own_filter_is_set() -> None:
    aggs = qb.build_facets_body(make_filters(propertyType=["villa"]))["aggs"]

    assert aggs["propertyType"]["filter"] == {"match_all": {}}
    assert aggs["price"]["filter"] == {"bool": {"filter": [{"terms": {"propertyType": ["villa"]}}]}}


def test_facets_request_is_aggregation_only_but_honours_the_text_query() -> None:
    body = qb.build_facets_body(make_filters(q="north coast chalet"))

    assert body["size"] == 0
    assert body["query"]["bool"]["must"] == [qb.build_text_query("north coast chalet")]
    # The text query lives at the top level; structured filters live per facet.
    assert "filter" not in body["query"]["bool"]


def test_facets_cover_every_sidebar_block() -> None:
    aggs = qb.build_facets_body(make_filters())["aggs"]

    assert set(aggs) == {
        "total",
        "propertyType",
        "saleType",
        "status",
        "finishing",
        "bedrooms",
        "bathrooms",
        "amenities",
        "areas",
        "compounds",
        "developers",
        "price",
        "areaSqm",
        "deliveryYear",
        "installmentYears",
    }
    assert aggs["amenities"]["aggs"]["buckets"]["terms"]["size"] == qb.AMENITY_FACET_SIZE
    assert aggs["price"]["aggs"]["stats"] == {"stats": {"field": "price"}}
    assert aggs["price"]["aggs"]["histogram"]["histogram"]["interval"] == qb.DEFAULT_PRICE_INTERVAL
    assert aggs["deliveryYear"]["aggs"]["buckets"]["date_histogram"]["calendar_interval"] == "year"
    assert aggs["areas"]["aggs"]["buckets"]["aggs"]["name"]["terms"]["field"] == "areaName.keyword"


# ----------------------------------------------------------------- similar


def test_similar_body_uses_more_like_this_with_a_price_band() -> None:
    source = {
        "price": 8_000_000,
        "areaId": "area-1",
        "compoundId": "compound-1",
        "developerId": "developer-1",
        "propertyType": "apartment",
    }
    body = qb.build_similar_body(source, index="properties", document_id="prop-1", size=6)
    bool_query = body["query"]["bool"]

    mlt = bool_query["must"][0]["more_like_this"]
    assert mlt["fields"] == ["title_en", "title_ar", "description_en", "description_ar"]
    assert mlt["like"] == [{"_index": "properties", "_id": "prop-1"}]

    assert bool_query["filter"] == [{"range": {"price": {"gte": 6_000_000.0, "lte": 10_000_000.0}}}]
    assert bool_query["must_not"] == [{"ids": {"values": ["prop-1"]}}]
    assert {"term": {"compoundId": {"value": "compound-1", "boost": 3.0}}} in bool_query["should"]
    assert body["size"] == 6


def test_similar_fallback_requires_a_shared_relation() -> None:
    source = {"price": 4_000_000, "areaId": "area-1"}
    body = qb.build_similar_fallback_body(source, document_id="prop-1")
    bool_query = body["query"]["bool"]

    assert bool_query["must"] == [{"match_all": {}}]
    assert bool_query["minimum_should_match"] == 1
    assert bool_query["should"] == [{"term": {"areaId": {"value": "area-1", "boost": 2.0}}}]


def test_similar_price_filter_is_skipped_without_a_price() -> None:
    assert qb.similar_price_filter({}) == []
    assert qb.similar_price_filter({"price": 0}) == []


# --------------------------------------------------------------------- map


def test_map_body_clusters_inside_the_bounding_box() -> None:
    filters = MapFilters(bbox="31.20,29.90,31.70,30.20", propertyType=["villa"])
    body = qb.build_map_body(filters)
    grid = body["aggs"]["clusters"]["geotile_grid"]

    assert body["size"] == 0
    assert grid["field"] == "geo"
    assert grid["bounds"] == {
        "top_left": {"lat": 30.20, "lon": 31.20},
        "bottom_right": {"lat": 29.90, "lon": 31.70},
    }
    assert body["aggs"]["clusters"]["aggs"]["centroid"] == {"geo_centroid": {"field": "geo"}}
    # The viewport itself becomes a filter clause, next to the normal filters.
    assert {"geo_bounding_box": {"geo": grid["bounds"]}} in body["query"]["bool"]["filter"]
    assert {"terms": {"propertyType": ["villa"]}} in body["query"]["bool"]["filter"]


def test_map_body_has_no_scoring_clauses() -> None:
    body = qb.build_map_body(MapFilters(bbox="31.20,29.90,31.70,30.20"))

    assert "should" not in body["query"]["bool"]


def test_map_precision_follows_the_viewport_span() -> None:
    world = precision_for_bbox(bbox_from_string("-180,-85,180,85"))
    city = precision_for_bbox(bbox_from_string("31.20,29.90,31.70,30.20"))
    street = precision_for_bbox(bbox_from_string("31.400,30.000,31.410,30.010"))

    assert world == 2
    assert world < city < street
    assert street <= 16


def test_map_precision_can_be_overridden() -> None:
    filters = MapFilters(bbox="31.20,29.90,31.70,30.20", precision=9)

    assert qb.build_map_body(filters)["aggs"]["clusters"]["geotile_grid"]["precision"] == 9


def test_map_points_body_returns_card_sources() -> None:
    body = qb.build_map_points_body(MapFilters(bbox="31.20,29.90,31.70,30.20"), size=25)

    assert body["size"] == 25
    assert body["_source"]["includes"] == list(qb.MAP_SOURCE_FIELDS)
    assert body["sort"][-1] == {"id": {"order": "asc"}}


# -------------------------------------------------------------- autocomplete


def test_autocomplete_runs_one_suggester_per_type() -> None:
    body = qb.build_autocomplete_body("pal", size=5)

    assert set(body["suggest"]) == {"property", "compound", "developer", "area"}
    completion = body["suggest"]["compound"]["completion"]
    assert completion["field"] == "suggest"
    assert completion["size"] == 5
    assert completion["skip_duplicates"] is True
    assert completion["contexts"] == {"type": ["compound"]}
    assert body["suggest"]["compound"]["prefix"] == "pal"


def test_autocomplete_can_be_restricted_to_one_type() -> None:
    body = qb.build_autocomplete_body("sod", size=3, types=("developer",))

    assert set(body["suggest"]) == {"developer"}


def test_autocomplete_fallback_uses_the_edge_ngram_fields() -> None:
    body = qb.build_autocomplete_fallback_body("mounta", size=8)
    fields = body["query"]["multi_match"]["fields"]

    assert all(field.split("^")[0].endswith(".autocomplete") for field in fields)
    assert body["size"] == 8
