"""Validation rules of the public query parameters (CONTRACT §6)."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.schemas.search import (
    DEFAULT_RADIUS_KM,
    MAX_RESULT_WINDOW,
    AutocompleteParams,
    MapFilters,
    SearchFilters,
    SearchQuery,
    SortOption,
    SuggestionType,
)


def test_defaults_are_permissive() -> None:
    filters = SearchFilters()

    assert filters.q is None
    assert filters.propertyType == []
    assert filters.sort is SortOption.RELEVANCE
    assert filters.has_geo is False
    assert filters.has_text is False


def test_list_params_accept_repeated_and_comma_separated_values() -> None:
    repeated = SearchFilters(propertyType=["villa", "apartment"], bedrooms=[3, 2])
    csv = SearchFilters(propertyType="villa,apartment", bedrooms="3,2")

    assert repeated.propertyType == csv.propertyType == ["apartment", "villa"]
    assert repeated.bedrooms == csv.bedrooms == [2, 3]


def test_multi_value_params_are_deduplicated_and_ordered() -> None:
    filters = SearchFilters(amenities=["pool", "gym", "pool"], areaId=["b", "a", "b"])

    assert filters.amenities == ["gym", "pool"]
    assert filters.areaId == ["a", "b"]


def test_enum_values_follow_the_contract() -> None:
    with pytest.raises(ValidationError):
        SearchFilters(propertyType=["mansion"])
    with pytest.raises(ValidationError):
        SearchFilters(saleType="lease")
    with pytest.raises(ValidationError):
        SearchFilters(finishing=["painted"])
    with pytest.raises(ValidationError):
        SearchFilters(status="draft")


def test_inverted_ranges_are_rejected() -> None:
    with pytest.raises(ValidationError):
        SearchFilters(minPrice=9_000_000, maxPrice=1_000_000)
    with pytest.raises(ValidationError):
        SearchFilters(minArea=400, maxArea=120)


def test_geo_requires_both_coordinates() -> None:
    with pytest.raises(ValidationError):
        SearchFilters(lat=30.0304)
    with pytest.raises(ValidationError):
        SearchFilters(radiusKm=10)


def test_radius_defaults_once_a_centre_is_given() -> None:
    filters = SearchFilters(lat=30.0304, lng=31.4913)

    assert filters.radiusKm == DEFAULT_RADIUS_KM
    assert filters.origin == {"lat": 30.0304, "lng": 31.4913}


def test_room_counts_stay_within_a_sane_range() -> None:
    with pytest.raises(ValidationError):
        SearchFilters(bedrooms=[99])


def test_cache_payload_is_order_independent() -> None:
    left = SearchQuery(filters=SearchFilters(amenities=["gym", "pool"]), page=1, limit=20)
    right = SearchQuery(filters=SearchFilters(amenities=["pool", "gym"]), page=1, limit=20)

    assert left.cache_payload() == right.cache_payload()


def test_cache_payload_tracks_pagination_and_facets() -> None:
    base = SearchQuery(filters=SearchFilters(), page=1, limit=20)
    page_two = SearchQuery(filters=SearchFilters(), page=2, limit=20)
    with_facets = SearchQuery(filters=SearchFilters(), page=1, limit=20, withFacets=True)

    assert base.cache_payload() != page_two.cache_payload()
    assert base.cache_payload() != with_facets.cache_payload()


def test_deep_pagination_is_detected() -> None:
    assert SearchQuery(filters=SearchFilters(), page=500, limit=20).window_exceeded is False
    assert SearchQuery(filters=SearchFilters(), page=501, limit=20).window_exceeded is True
    assert SearchQuery(filters=SearchFilters(), page=500, limit=20).offset + 20 == MAX_RESULT_WINDOW


def test_map_filters_require_a_bbox() -> None:
    with pytest.raises(ValidationError):
        MapFilters()

    filters = MapFilters(bbox="31.20,29.90,31.70,30.20")
    assert filters.maxPoints == 200
    assert filters.precision is None


def test_autocomplete_defaults_to_every_suggestion_type() -> None:
    params = AutocompleteParams(q="palm")

    assert params.limit == 10
    assert set(params.types) == {t.value for t in SuggestionType}


def test_autocomplete_type_can_be_restricted() -> None:
    params = AutocompleteParams(q="palm", type="compound,developer")

    assert params.types == ("compound", "developer")


def test_autocomplete_rejects_an_empty_prefix() -> None:
    with pytest.raises(ValidationError):
        AutocompleteParams(q="   ")
