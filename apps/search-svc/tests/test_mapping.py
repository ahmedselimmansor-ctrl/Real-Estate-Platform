"""Validity of the `properties_v1` index definition (CONTRACT §3)."""

from __future__ import annotations

import json

from app.es.index_manager import index_version_number, next_version_name
from app.es.mapping import (
    ANALYZER_ARABIC,
    ANALYZER_AUTOCOMPLETE,
    ANALYZER_AUTOCOMPLETE_SEARCH,
    ANALYZER_ENGLISH,
    INDEX_ALIAS,
    INDEX_VERSION,
    NORMALIZER_SLUG,
    PROPERTIES,
    REQUIRED_CONTRACT_FIELDS,
    SUGGEST_CONTEXT_AREA,
    SUGGEST_CONTEXT_TYPE,
    SUGGEST_FIELD,
    index_definition,
    index_mappings,
    index_settings,
)

BUILT_IN_ANALYZERS = {"standard", "simple", "whitespace", "keyword", "stop"}
BUILT_IN_FILTERS = {
    "lowercase",
    "asciifolding",
    "decimal_digit",
    "arabic_normalization",
    "trim",
}


def _analysis() -> dict:
    return index_settings()["analysis"]


def _defined_analyzers() -> set[str]:
    return set(_analysis()["analyzer"]) | BUILT_IN_ANALYZERS


# ------------------------------------------------------------------- names


def test_contract_index_and_alias_names():
    assert INDEX_VERSION == "properties_v1"
    assert INDEX_ALIAS == "properties"


def test_next_version_name_rolls_the_suffix():
    assert next_version_name("properties_v1") == "properties_v2"
    assert next_version_name("properties_v9") == "properties_v10"
    assert next_version_name("properties") == "properties_v2"
    assert index_version_number("properties_v7") == 7
    assert index_version_number("properties") == 1


# ------------------------------------------------------------------ fields


def test_every_required_contract_field_is_mapped():
    missing = [field for field in REQUIRED_CONTRACT_FIELDS if field not in PROPERTIES]
    assert not missing, f"unmapped contract fields: {missing}"


def test_geo_is_a_geo_point():
    assert PROPERTIES["geo"] == {"type": "geo_point"}


def test_money_and_numeric_field_types():
    assert PROPERTIES["price"]["type"] == "scaled_float"
    assert PROPERTIES["price"]["scaling_factor"] == 100
    assert PROPERTIES["pricePerMeter"]["type"] == "long"
    assert PROPERTIES["monthlyInstallment"]["type"] == "long"
    assert PROPERTIES["installmentYears"]["type"] == "integer"
    assert PROPERTIES["bedrooms"]["type"] == "integer"
    assert PROPERTIES["bathrooms"]["type"] == "integer"
    assert PROPERTIES["areaSqm"]["type"] == "float"


def test_date_fields():
    for field in ("deliveryDate", "publishedAt", "createdAt", "updatedAt", "indexedAt"):
        assert PROPERTIES[field]["type"] == "date", field
    assert "yyyy-MM-dd" in PROPERTIES["deliveryDate"]["format"]


def test_enum_and_id_fields_are_keywords():
    for field in (
        "id",
        "propertyType",
        "saleType",
        "status",
        "finishing",
        "areaId",
        "compoundId",
        "developerId",
        "city",
        "governorate",
    ):
        assert PROPERTIES[field]["type"] == "keyword", field


def test_amenities_is_a_flat_keyword_array_not_nested():
    assert PROPERTIES["amenities"] == {"type": "keyword"}
    assert all(field.get("type") != "nested" for field in PROPERTIES.values())


def test_slug_fields_use_the_slug_normalizer():
    for field in ("slug", "areaSlug", "compoundSlug", "developerSlug", "referenceNo"):
        assert PROPERTIES[field]["type"] == "keyword", field
        assert PROPERTIES[field]["normalizer"] == NORMALIZER_SLUG, field

    normalizer = _analysis()["normalizer"][NORMALIZER_SLUG]
    assert normalizer["type"] == "custom"
    assert "lowercase" in normalizer["filter"]


# --------------------------------------------------------------- multifields


def test_title_multi_fields_match_the_contract():
    title_en = PROPERTIES["title_en"]
    assert title_en["type"] == "text"
    assert title_en["analyzer"] == ANALYZER_ENGLISH
    assert title_en["fields"]["std"]["analyzer"] == "standard"
    assert title_en["fields"]["autocomplete"]["analyzer"] == ANALYZER_AUTOCOMPLETE

    title_ar = PROPERTIES["title_ar"]
    assert title_ar["type"] == "text"
    assert title_ar["fields"]["ar"]["analyzer"] == ANALYZER_ARABIC
    assert title_ar["fields"]["autocomplete"]["analyzer"] == ANALYZER_AUTOCOMPLETE


def test_name_fields_expose_keyword_and_autocomplete_subfields():
    for field in ("areaName", "compoundName", "developerName"):
        mapping = PROPERTIES[field]
        assert mapping["type"] == "text", field
        assert mapping["fields"]["keyword"]["type"] == "keyword", field
        assert mapping["fields"]["autocomplete"]["analyzer"] == ANALYZER_AUTOCOMPLETE, field


def test_copy_to_targets_exist():
    for name, mapping in PROPERTIES.items():
        target = mapping.get("copy_to")
        if target:
            targets = [target] if isinstance(target, str) else list(target)
            for item in targets:
                assert item in PROPERTIES, f"{name} copies into unmapped field {item}"
                assert PROPERTIES[item]["type"] == "text"


# ------------------------------------------------------------------ suggest


def test_suggest_is_a_completion_field_with_contexts():
    suggest = PROPERTIES[SUGGEST_FIELD]
    assert suggest["type"] == "completion"
    context_names = [context["name"] for context in suggest["contexts"]]
    assert context_names == [SUGGEST_CONTEXT_TYPE, SUGGEST_CONTEXT_AREA]
    assert all(context["type"] == "category" for context in suggest["contexts"])
    assert suggest["max_input_length"] >= 50


# ----------------------------------------------------------------- analysis


def test_autocomplete_analyzer_uses_edge_ngrams_only_at_index_time():
    analysis = _analysis()
    autocomplete = analysis["analyzer"][ANALYZER_AUTOCOMPLETE]
    assert "autocomplete_edge_ngram" in autocomplete["filter"]

    edge_ngram = analysis["filter"]["autocomplete_edge_ngram"]
    assert edge_ngram["type"] == "edge_ngram"
    assert edge_ngram["min_gram"] >= 1
    assert edge_ngram["max_gram"] <= 25
    assert edge_ngram["max_gram"] > edge_ngram["min_gram"]

    search_analyzer = analysis["analyzer"][ANALYZER_AUTOCOMPLETE_SEARCH]
    assert "autocomplete_edge_ngram" not in search_analyzer["filter"]


def test_english_analyzer_has_stemming_and_stopwords():
    analysis = _analysis()
    english = analysis["analyzer"][ANALYZER_ENGLISH]
    assert english["tokenizer"] == "standard"
    assert "english_stemmer" in english["filter"]
    assert "english_stop" in english["filter"]
    assert analysis["filter"]["english_stemmer"] == {"type": "stemmer", "language": "english"}
    assert analysis["filter"]["english_stop"]["stopwords"] == "_english_"


def test_arabic_analyzer_normalises_stems_and_removes_stopwords():
    analysis = _analysis()
    arabic = analysis["analyzer"][ANALYZER_ARABIC]
    assert "arabic_normalization" in arabic["filter"]
    assert "arabic_stemmer" in arabic["filter"]
    assert "arabic_stop" in arabic["filter"]
    assert analysis["filter"]["arabic_stemmer"] == {"type": "stemmer", "language": "arabic"}
    assert analysis["filter"]["arabic_stop"]["stopwords"] == "_arabic_"


def test_every_referenced_analyzer_and_filter_is_defined():
    analysis = _analysis()
    known_analyzers = _defined_analyzers()
    known_filters = set(analysis["filter"]) | BUILT_IN_FILTERS

    def check_field(name: str, mapping: dict) -> None:
        for key in ("analyzer", "search_analyzer"):
            if key in mapping:
                assert mapping[key] in known_analyzers, f"{name}.{key}={mapping[key]}"
        if "normalizer" in mapping:
            assert mapping["normalizer"] in analysis["normalizer"], name
        for sub_name, sub_mapping in (mapping.get("fields") or {}).items():
            check_field(f"{name}.{sub_name}", sub_mapping)
        for sub_name, sub_mapping in (mapping.get("properties") or {}).items():
            check_field(f"{name}.{sub_name}", sub_mapping)

    for name, mapping in PROPERTIES.items():
        check_field(name, mapping)

    for analyzer_name, analyzer in analysis["analyzer"].items():
        for token_filter in analyzer["filter"]:
            assert token_filter in known_filters, f"{analyzer_name}: {token_filter}"


# ------------------------------------------------------------ create bodies


def test_index_definition_is_json_serialisable_and_complete():
    body = index_definition()
    assert set(body) == {"settings", "mappings", "aliases"}
    assert body["aliases"] == {INDEX_ALIAS: {}}
    assert body["settings"]["index"]["number_of_shards"] == 1
    assert body["settings"]["index"]["number_of_replicas"] == 0
    assert body["mappings"]["dynamic"] is False
    assert body["mappings"]["properties"]["id"]["type"] == "keyword"

    encoded = json.dumps(body, ensure_ascii=False)
    assert json.loads(encoded) == body


def test_index_definition_can_omit_the_alias():
    body = index_definition(alias=None, number_of_replicas=1)
    assert "aliases" not in body
    assert body["settings"]["index"]["number_of_replicas"] == 1


def test_mapping_builders_return_copies():
    first = index_mappings()
    first["properties"]["id"]["type"] = "text"
    assert index_mappings()["properties"]["id"]["type"] == "keyword"

    settings = index_settings()
    settings["analysis"]["analyzer"].clear()
    assert index_settings()["analysis"]["analyzer"]
