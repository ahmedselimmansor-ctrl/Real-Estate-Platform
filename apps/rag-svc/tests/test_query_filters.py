"""Parsing hard constraints (price, area, type, bedrooms) out of a question."""

from __future__ import annotations

import pytest
from app.retrieval.filters import (
    QueryFilters,
    parse_area,
    parse_bedrooms,
    parse_price_range,
    parse_property_type,
    parse_query_filters,
    parse_stated_amount,
)
from app.retrieval.hybrid_search import build_filter_sql


# --- price -----------------------------------------------------------------
@pytest.mark.parametrize(
    ("query", "expected"),
    [
        ("apartments under 8 million", (None, 8_000_000)),
        ("villas below EGP 20m", (None, 20_000_000)),
        ("anything less than 5,500,000 EGP", (None, 5_500_000)),
        ("units over 12 million", (12_000_000, None)),
        ("chalets more than 6m", (6_000_000, None)),
        ("between 5 and 9 million", (5_000_000, 9_000_000)),
        ("from 5m to 9m", (5_000_000, 9_000_000)),
        ("my budget is 7 million", (None, 7_000_000)),
        ("شقق أقل من 8 مليون", (None, 8_000_000)),
        ("فيلات أكثر من 20 مليون جنيه", (20_000_000, None)),
        ("ميزانيتي 6 مليون", (None, 6_000_000)),
        ("شقق حتى ٥ مليون", (None, 5_000_000)),
    ],
)
def test_price_expressions(query: str, expected: tuple[int | None, int | None]) -> None:
    assert parse_price_range(query) == expected


@pytest.mark.parametrize(
    "query",
    [
        "apartments under 200 m²",
        "villas with more than 300 sqm",
        "شقق أقل من 150 متر",
        "three bedroom apartment in New Cairo",
        "apartments under 50",
    ],
)
def test_areas_and_bare_numbers_are_not_read_as_prices(query: str) -> None:
    assert parse_price_range(query) == (None, None)


def test_decimal_millions_are_supported() -> None:
    assert parse_price_range("under 8.5 million") == (None, 8_500_000)
    assert parse_price_range("under 8,5 million") == (None, 8_500_000)


def test_inverted_bounds_are_normalised() -> None:
    minimum, maximum = parse_price_range("more than 9 million and less than 5 million")
    assert (minimum, maximum) == (5_000_000, 9_000_000)


# --- property type ---------------------------------------------------------
@pytest.mark.parametrize(
    ("query", "expected"),
    [
        ("2 bedroom apartment in Zamalek", "apartment"),
        ("standalone villas in Sheikh Zayed", "villa"),
        ("town house for sale", "townhouse"),
        ("twin house in Madinaty", "twinhouse"),
        ("penthouse with a roof", "penthouse"),
        ("chalet on the North Coast", "chalet"),
        ("studio near AUC", "studio"),
        ("عايز شقة في التجمع", "apartment"),
        ("فيلا في الشيخ زايد", "villa"),
        ("شاليه في الساحل الشمالي", "chalet"),
        ("mortgage requirements", None),
    ],
)
def test_property_type_detection(query: str, expected: str | None) -> None:
    assert parse_property_type(query) == expected


def test_townhouse_wins_over_the_generic_house_word() -> None:
    assert parse_property_type("townhouse or twinhouse") == "townhouse"


# --- bedrooms --------------------------------------------------------------
@pytest.mark.parametrize(
    ("query", "expected"),
    [
        ("3 bedroom apartment", 3),
        ("4-bed villa", 4),
        ("2 br flat", 2),
        ("شقة 3 غرف", 3),
        ("شقة غرفتين", 2),
        ("studio for rent", 0),
        ("apartments in New Cairo", None),
    ],
)
def test_bedroom_detection(query: str, expected: int | None) -> None:
    assert parse_bedrooms(query) == expected


# --- areas -----------------------------------------------------------------
def test_area_detection_prefers_the_longest_match() -> None:
    name, area_id = parse_area("apartments in New Cairo under 8 million")
    assert name == "New Cairo"
    assert area_id

    zayed, _ = parse_area("villas in Sheikh Zayed")
    assert zayed == "Sheikh Zayed"


def test_arabic_area_names_resolve_to_the_english_name() -> None:
    name, _ = parse_area("شقق في القاهرة الجديدة")
    assert name == "New Cairo"


def test_unknown_area_returns_nothing() -> None:
    assert parse_area("apartments in Atlantis") == (None, None)


# --- combined --------------------------------------------------------------
def test_full_query_parse() -> None:
    filters = parse_query_filters("3 bedroom apartments in New Cairo under 8 million EGP")
    assert filters.bedrooms == 3
    assert filters.property_type == "apartment"
    assert filters.area == "New Cairo"
    assert filters.max_price == 8_000_000
    assert not filters.is_empty()


def test_plain_question_has_no_filters() -> None:
    filters = parse_query_filters("What documents do I need to register a unit?")
    assert filters.is_empty()
    assert filters.as_dict()["maxPrice"] is None


def test_explicit_filters_override_parsed_ones() -> None:
    parsed = parse_query_filters("apartments in New Cairo under 8 million")
    merged = parsed.merge(QueryFilters(max_price=5_000_000, source_types=["faq"]))
    assert merged.max_price == 5_000_000
    assert merged.area == "New Cairo"
    assert merged.source_types == ["faq"]


# --- SQL rendering ---------------------------------------------------------
def test_empty_filters_render_no_sql() -> None:
    sql, params = build_filter_sql(QueryFilters())
    assert sql == ""
    assert params == {}


def test_listing_filters_are_scoped_to_property_chunks() -> None:
    sql, params = build_filter_sql(
        QueryFilters(max_price=8_000_000, area="New Cairo", property_type="apartment", bedrooms=3)
    )
    assert "COALESCE(c.metadata->>'type', '') <> 'property'" in sql
    assert ":max_price" in sql and params["max_price"] == 8_000_000.0
    assert params["area_name"] == "new cairo"
    assert params["property_type"] == "apartment"
    assert params["bedrooms"] == 3
    assert sql.lstrip().startswith("AND")


def test_source_and_language_filters_are_global() -> None:
    sql, params = build_filter_sql(QueryFilters(source_types=["faq", "property"], lang="ar"))
    assert "d.source_type = ANY(CAST(:source_types AS text[]))" in sql
    assert "d.lang = :lang" in sql
    assert params["source_types"] == ["faq", "property"]
    assert params["lang"] == "ar"


class TestStatedAmount:
    """A financing question states a bare figure with no under/from cue."""

    @pytest.mark.parametrize(
        ("text", "expected"),
        [
            ("What is the monthly payment on 8 million?", 8_000_000),
            ("monthly instalment on 6,500,000", 6_500_000),
            ("12m over 5 years", 12_000_000),
            ("قسط شهري على 8 مليون", 8_000_000),
        ],
    )
    def test_reads_the_amount(self, text: str, expected: int) -> None:
        assert parse_stated_amount(text) == expected

    @pytest.mark.parametrize("text", ["3 bedrooms", "over 7 years", "", "no numbers here"])
    def test_ignores_what_is_not_money(self, text: str) -> None:
        assert parse_stated_amount(text) is None
