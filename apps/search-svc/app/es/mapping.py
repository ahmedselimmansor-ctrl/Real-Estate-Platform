"""The `properties_v1` index definition (CONTRACT §3).

Index: ``properties_v1``  •  Alias: ``properties``

Analysis
--------
``topchoice_english``      standard tokenizer + possessive/english stemming + english stopwords
``topchoice_arabic``       standard tokenizer + arabic_normalization + arabic_stem + arabic stopwords
``autocomplete``      edge-ngram (2..20) index-time analyzer, latin + arabic normalised
``autocomplete_search`` the same chain *without* the edge-ngram filter (search-time)
``slug``              keyword normalizer (lowercase + asciifolding)

Field layout
------------
Multi-fields follow the contract: ``title_en.std`` (plain standard analysis),
``title_ar.ar`` (arabic analysis) and ``*.autocomplete`` for type-ahead.
``geo`` is a ``geo_point`` written as ``{"lat": .., "lon": ..}``; ``suggest`` is a
``completion`` field with ``type`` / ``areaId`` category contexts so one index
serves property, compound, developer and area suggestions.
"""

from __future__ import annotations

import copy
from typing import Any

# --------------------------------------------------------------------- names

INDEX_ALIAS = "properties"
INDEX_VERSION = "properties_v1"

ANALYZER_ENGLISH = "topchoice_english"
ANALYZER_ARABIC = "topchoice_arabic"
ANALYZER_AUTOCOMPLETE = "autocomplete"
ANALYZER_AUTOCOMPLETE_SEARCH = "autocomplete_search"
NORMALIZER_SLUG = "slug"

SUGGEST_FIELD = "suggest"
SUGGEST_CONTEXT_TYPE = "type"
SUGGEST_CONTEXT_AREA = "areaId"

#: Suggestion categories carried in the `type` completion context.
SUGGESTION_TYPES: tuple[str, ...] = ("property", "compound", "developer", "area")

#: Fields the contract requires on every indexed document (CONTRACT §3).
REQUIRED_CONTRACT_FIELDS: tuple[str, ...] = (
    "id",
    "slug",
    "title_en",
    "title_ar",
    "description_en",
    "description_ar",
    "propertyType",
    "saleType",
    "status",
    "finishing",
    "price",
    "pricePerMeter",
    "downPaymentPercent",
    "installmentYears",
    "deliveryDate",
    "bedrooms",
    "bathrooms",
    "areaSqm",
    "areaId",
    "areaName",
    "city",
    "compoundId",
    "compoundName",
    "developerId",
    "developerName",
    "amenities",
    "geo",
    "isFeatured",
    "publishedAt",
    "primaryImage",
    "suggest",
)

# ------------------------------------------------------------------ analysis

ANALYSIS: dict[str, Any] = {
    "filter": {
        "english_possessive_stemmer": {"type": "stemmer", "language": "possessive_english"},
        "english_stop": {"type": "stop", "stopwords": "_english_"},
        "english_stemmer": {"type": "stemmer", "language": "english"},
        "arabic_stop": {"type": "stop", "stopwords": "_arabic_"},
        "arabic_stemmer": {"type": "stemmer", "language": "arabic"},
        "autocomplete_edge_ngram": {
            "type": "edge_ngram",
            "min_gram": 2,
            "max_gram": 20,
        },
    },
    "normalizer": {
        NORMALIZER_SLUG: {
            "type": "custom",
            "char_filter": [],
            "filter": ["lowercase", "asciifolding"],
        }
    },
    "analyzer": {
        ANALYZER_ENGLISH: {
            "type": "custom",
            "tokenizer": "standard",
            "char_filter": ["html_strip"],
            "filter": [
                "english_possessive_stemmer",
                "lowercase",
                "asciifolding",
                "english_stop",
                "english_stemmer",
            ],
        },
        ANALYZER_ARABIC: {
            "type": "custom",
            "tokenizer": "standard",
            "char_filter": ["html_strip"],
            "filter": [
                "lowercase",
                "decimal_digit",
                "arabic_normalization",
                "arabic_stop",
                "arabic_stemmer",
            ],
        },
        ANALYZER_AUTOCOMPLETE: {
            "type": "custom",
            "tokenizer": "standard",
            "filter": [
                "lowercase",
                "asciifolding",
                "decimal_digit",
                "arabic_normalization",
                "autocomplete_edge_ngram",
            ],
        },
        ANALYZER_AUTOCOMPLETE_SEARCH: {
            "type": "custom",
            "tokenizer": "standard",
            "filter": [
                "lowercase",
                "asciifolding",
                "decimal_digit",
                "arabic_normalization",
            ],
        },
    },
}

# ------------------------------------------------------------------ mappings


def _autocomplete_field() -> dict[str, Any]:
    return {
        "type": "text",
        "analyzer": ANALYZER_AUTOCOMPLETE,
        "search_analyzer": ANALYZER_AUTOCOMPLETE_SEARCH,
    }


def _name_field(copy_to: str | None = None) -> dict[str, Any]:
    """Analyzed name with an aggregatable `.keyword` and an `.autocomplete` sub-field."""
    field: dict[str, Any] = {
        "type": "text",
        "analyzer": ANALYZER_ENGLISH,
        "fields": {
            "keyword": {"type": "keyword", "ignore_above": 256},
            "autocomplete": _autocomplete_field(),
        },
    }
    if copy_to:
        field["copy_to"] = copy_to
    return field


PROPERTIES: dict[str, Any] = {
    # --- identity -----------------------------------------------------------
    "id": {"type": "keyword"},
    "mongoId": {"type": "keyword"},
    "slug": {"type": "keyword", "normalizer": NORMALIZER_SLUG},
    "referenceNo": {"type": "keyword", "normalizer": NORMALIZER_SLUG},
    # --- bilingual text -----------------------------------------------------
    "title_en": {
        "type": "text",
        "analyzer": ANALYZER_ENGLISH,
        "copy_to": "all_en",
        "fields": {
            "std": {"type": "text", "analyzer": "standard"},
            "autocomplete": _autocomplete_field(),
            "keyword": {"type": "keyword", "ignore_above": 512},
        },
    },
    "title_ar": {
        "type": "text",
        "analyzer": "standard",
        "copy_to": "all_ar",
        "fields": {
            "ar": {"type": "text", "analyzer": ANALYZER_ARABIC},
            "autocomplete": _autocomplete_field(),
            "keyword": {"type": "keyword", "ignore_above": 512},
        },
    },
    "description_en": {
        "type": "text",
        "analyzer": ANALYZER_ENGLISH,
        "copy_to": "all_en",
    },
    "description_ar": {
        "type": "text",
        "analyzer": "standard",
        "copy_to": "all_ar",
        "fields": {"ar": {"type": "text", "analyzer": ANALYZER_ARABIC}},
    },
    # catch-all targets fed by copy_to (single-field multi_match target)
    "all_en": {"type": "text", "analyzer": ANALYZER_ENGLISH},
    "all_ar": {"type": "text", "analyzer": ANALYZER_ARABIC},
    # --- enums (CONTRACT §3) ------------------------------------------------
    "propertyType": {"type": "keyword"},
    "saleType": {"type": "keyword"},
    "status": {"type": "keyword"},
    "finishing": {"type": "keyword"},
    # --- money (EGP integers) ----------------------------------------------
    "price": {"type": "scaled_float", "scaling_factor": 100},
    "pricePerMeter": {"type": "long"},
    "currency": {"type": "keyword"},
    "downPaymentPercent": {"type": "float"},
    "downPaymentAmount": {"type": "long"},
    "installmentYears": {"type": "integer"},
    "monthlyInstallment": {"type": "long"},
    "deliveryDate": {
        "type": "date",
        "format": "strict_date_optional_time||yyyy-MM-dd||epoch_millis",
    },
    "deliveryYear": {"type": "integer"},
    # --- specs --------------------------------------------------------------
    "bedrooms": {"type": "integer"},
    "bathrooms": {"type": "integer"},
    "areaSqm": {"type": "float"},
    "gardenSqm": {"type": "float"},
    "floor": {"type": "integer"},
    "parkingSpots": {"type": "integer"},
    # --- location -----------------------------------------------------------
    "areaId": {"type": "keyword"},
    "areaName": _name_field("all_en"),
    "areaSlug": {"type": "keyword", "normalizer": NORMALIZER_SLUG},
    "city": {"type": "keyword", "copy_to": "all_en"},
    "governorate": {"type": "keyword", "copy_to": "all_en"},
    "address": {"type": "text", "analyzer": ANALYZER_ENGLISH, "copy_to": "all_en"},
    "geo": {"type": "geo_point"},
    # --- relations ----------------------------------------------------------
    "compoundId": {"type": "keyword"},
    "compoundName": _name_field("all_en"),
    "compoundSlug": {"type": "keyword", "normalizer": NORMALIZER_SLUG},
    "developerId": {"type": "keyword"},
    "developerName": _name_field("all_en"),
    "developerSlug": {"type": "keyword", "normalizer": NORMALIZER_SLUG},
    "developerLogo": {"type": "keyword", "index": False, "doc_values": False},
    # --- amenities (flat keyword array — no nested docs) --------------------
    "amenities": {"type": "keyword"},
    "amenitiesCount": {"type": "integer"},
    # --- flags / derived ----------------------------------------------------
    "isFeatured": {"type": "boolean"},
    "isDelivered": {"type": "boolean"},
    "hasGarden": {"type": "boolean"},
    "hasParking": {"type": "boolean"},
    "popularity": {"type": "long"},
    # --- media --------------------------------------------------------------
    "primaryImage": {"type": "keyword", "index": False, "doc_values": False},
    "images": {"type": "keyword", "index": False, "doc_values": False},
    "imagesCount": {"type": "integer"},
    # --- stats --------------------------------------------------------------
    "stats": {
        "type": "object",
        "properties": {
            "views": {"type": "long"},
            "favorites": {"type": "long"},
            "leads": {"type": "long"},
        },
    },
    # --- timestamps ---------------------------------------------------------
    "publishedAt": {"type": "date"},
    "createdAt": {"type": "date"},
    "updatedAt": {"type": "date"},
    "indexedAt": {"type": "date"},
    # --- type-ahead ---------------------------------------------------------
    SUGGEST_FIELD: {
        # `standard` (not the completion default `simple`) so digits survive —
        # "3 Bedroom" and "TC-1042" stay type-ahead friendly.
        "type": "completion",
        "analyzer": "standard",
        "search_analyzer": "standard",
        "preserve_separators": True,
        "preserve_position_increments": True,
        "max_input_length": 100,
        "contexts": [
            {"name": SUGGEST_CONTEXT_TYPE, "type": "category"},
            {"name": SUGGEST_CONTEXT_AREA, "type": "category"},
        ],
    },
}

MAPPINGS: dict[str, Any] = {
    # `false` (not `strict`): unknown keys stay in `_source` instead of failing
    # a bulk request, which keeps indexing resilient to api-core adding fields.
    "dynamic": False,
    "date_detection": False,
    "properties": PROPERTIES,
}


def index_settings(
    *,
    number_of_shards: int = 1,
    number_of_replicas: int = 0,
    refresh_interval: str = "1s",
) -> dict[str, Any]:
    """`settings` body for index creation."""
    return {
        "index": {
            "number_of_shards": number_of_shards,
            "number_of_replicas": number_of_replicas,
            "refresh_interval": refresh_interval,
            "max_result_window": 10000,
            "mapping": {"total_fields": {"limit": 2000}},
        },
        "analysis": copy.deepcopy(ANALYSIS),
    }


def index_mappings() -> dict[str, Any]:
    """`mappings` body for index creation."""
    return copy.deepcopy(MAPPINGS)


def index_definition(
    *,
    alias: str | None = INDEX_ALIAS,
    number_of_shards: int = 1,
    number_of_replicas: int = 0,
    refresh_interval: str = "1s",
) -> dict[str, Any]:
    """Full create-index body: settings + mappings (+ alias)."""
    body: dict[str, Any] = {
        "settings": index_settings(
            number_of_shards=number_of_shards,
            number_of_replicas=number_of_replicas,
            refresh_interval=refresh_interval,
        ),
        "mappings": index_mappings(),
    }
    if alias:
        body["aliases"] = {alias: {}}
    return body


def mapped_field_names() -> set[str]:
    """Top-level field names declared by the mapping."""
    return set(PROPERTIES.keys())
