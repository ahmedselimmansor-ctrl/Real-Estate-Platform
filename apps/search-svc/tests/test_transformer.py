"""Mongo document -> Elasticsearch document transformation."""

from __future__ import annotations

from datetime import UTC, date, datetime
from typing import Any

import pytest

from app.es.mapping import REQUIRED_CONTRACT_FIELDS, SUGGESTION_TYPES, mapped_field_names
from app.services.transformer import (
    build_suggest,
    extract_geo_point,
    is_indexable,
    resolve_document_id,
    slugify,
    transform_many,
    transform_property,
)

NOW = datetime(2026, 8, 14, tzinfo=UTC)


# ------------------------------------------------------------------ helpers


def test_slugify_handles_names_and_noise():
    assert slugify("New Cairo") == "new-cairo"
    assert slugify("North Coast (Sahel)") == "north-coast-sahel"
    assert slugify("6th of October") == "6th-of-october"
    assert slugify("   ") is None
    assert slugify(None) is None


def test_resolve_document_id_prefers_the_property_uuid(contract_property):
    assert resolve_document_id(contract_property) == contract_property["id"]

    without_uuid = {k: v for k, v in contract_property.items() if k != "id"}
    assert resolve_document_id(without_uuid) == contract_property["_id"]

    assert resolve_document_id({}) is None


def test_is_indexable_rejects_soft_deleted_documents(contract_property):
    assert is_indexable(contract_property) is True

    deleted = {**contract_property, "deletedAt": "2026-02-01T00:00:00.000Z"}
    assert is_indexable(deleted) is False
    assert is_indexable({"title": {"en": "no id"}}) is False


def test_extract_geo_point_swaps_geojson_coordinates():
    assert extract_geo_point({"type": "Point", "coordinates": [31.4913, 30.0304]}) == {
        "lat": 30.0304,
        "lon": 31.4913,
    }
    assert extract_geo_point({"lat": 30.0304, "lng": 31.4913}) == {
        "lat": 30.0304,
        "lon": 31.4913,
    }
    assert extract_geo_point([31.4913, 30.0304]) == {"lat": 30.0304, "lon": 31.4913}
    assert extract_geo_point({"coordinates": [999.0, 999.0]}) is None
    assert extract_geo_point(None) is None
    assert extract_geo_point({}) is None


# --------------------------------------------------------------- transform


def test_transform_contract_example(contract_property):
    doc = transform_property(contract_property, media_base_url="https://cdn.test", now=NOW)

    assert doc["id"] == contract_property["id"]
    assert doc["mongoId"] == contract_property["mongoId"]
    assert doc["slug"] == "palm-hills-new-cairo-3br-apartment-a12"
    assert doc["referenceNo"] == "NWY-1042"

    assert doc["title_en"] == "3 Bedroom Apartment in Palm Hills"
    assert doc["title_ar"] == "شقة 3 غرف في بالم هيلز"
    assert doc["description_en"] == "Bright corner unit."

    assert doc["propertyType"] == "apartment"
    assert doc["saleType"] == "primary"
    assert doc["status"] == "available"
    assert doc["finishing"] == "semi_finished"

    assert doc["price"] == 8500000
    assert doc["pricePerMeter"] == 47222
    assert doc["currency"] == "EGP"
    assert doc["downPaymentPercent"] == 10
    assert doc["downPaymentAmount"] == 850000
    assert doc["installmentYears"] == 8
    assert doc["monthlyInstallment"] == 88541
    assert doc["deliveryDate"] == "2027-06-30"
    assert doc["deliveryYear"] == 2027

    assert doc["bedrooms"] == 3
    assert doc["bathrooms"] == 3
    assert doc["areaSqm"] == 180.0
    assert doc["floor"] == 5
    assert doc["parkingSpots"] == 1
    assert doc["hasParking"] is True
    assert doc["hasGarden"] is False

    assert doc["areaId"] == contract_property["location"]["areaId"]
    assert doc["areaName"] == "New Cairo"
    assert doc["areaSlug"] == "new-cairo"
    assert doc["city"] == "Cairo"
    assert doc["governorate"] == "Cairo"
    assert doc["geo"] == {"lat": 30.0304, "lon": 31.4913}

    assert doc["compoundId"] == contract_property["compound"]["id"]
    assert doc["compoundName"] == "Palm Hills New Cairo"
    assert doc["compoundSlug"] == "palm-hills-new-cairo"
    assert doc["developerName"] == "Palm Hills Developments"
    assert doc["developerSlug"] == "palm-hills"

    # duplicates removed, order preserved
    assert doc["amenities"] == ["pool", "gym", "security", "clubhouse"]
    assert doc["amenitiesCount"] == 4

    assert doc["isFeatured"] is True
    assert doc["isDelivered"] is False
    assert doc["primaryImage"] == "https://cdn.example.com/1.jpg"
    assert doc["imagesCount"] == 2
    assert doc["stats"] == {"views": 10, "favorites": 2, "leads": 1}
    assert doc["popularity"] == 10 + 2 * 3 + 1 * 5
    assert doc["publishedAt"] == "2026-01-10T00:00:00.000Z"
    assert doc["indexedAt"]


def test_area_slug_lookup_wins_over_slugified_name(contract_property):
    doc = transform_property(
        contract_property,
        area_slugs={contract_property["location"]["areaId"]: "new-cairo-fifth-settlement"},
        now=NOW,
    )
    assert doc["areaSlug"] == "new-cairo-fifth-settlement"


def test_price_per_meter_is_derived_when_missing(contract_property):
    contract_property["price"].pop("pricePerMeter")
    doc = transform_property(contract_property, now=NOW)
    assert doc["pricePerMeter"] == round(8500000 / 180)


def test_delivered_flag_from_status_and_past_delivery(contract_property):
    contract_property["paymentPlan"]["deliveryDate"] = "2024-06-30"
    doc = transform_property(contract_property, now=NOW)
    assert doc["isDelivered"] is True

    contract_property["paymentPlan"]["deliveryDate"] = "2030-06-30"
    contract_property["status"] = "delivered"
    assert transform_property(contract_property, now=NOW)["isDelivered"] is True


def test_datetime_and_date_values_are_normalised(contract_property):
    contract_property["publishedAt"] = datetime(2026, 1, 10, 12, 30, tzinfo=UTC)
    contract_property["paymentPlan"]["deliveryDate"] = date(2027, 6, 30)
    doc = transform_property(contract_property, now=NOW)
    assert doc["publishedAt"] == "2026-01-10T12:30:00Z"
    assert doc["deliveryDate"] == "2027-06-30"


def test_image_key_expands_against_the_media_base_url(contract_property):
    for image in contract_property["media"]["images"]:
        image.pop("url")
    doc = transform_property(contract_property, media_base_url="https://cdn.test/", now=NOW)
    assert doc["primaryImage"] == "https://cdn.test/properties/xx/1.jpg"
    assert doc["images"] == [
        "https://cdn.test/properties/xx/2.jpg",
        "https://cdn.test/properties/xx/1.jpg",
    ]


def test_missing_optional_blocks_do_not_raise():
    doc = transform_property({"id": "abc"}, now=NOW)
    assert doc["id"] == "abc"
    assert doc["geo"] is None
    assert doc["amenities"] == []
    assert doc["images"] == []
    assert doc["primaryImage"] is None
    assert doc["stats"] == {"views": 0, "favorites": 0, "leads": 0}
    assert doc["suggest"] == []
    assert doc["currency"] == "EGP"


def test_transform_many_skips_deleted_documents(contract_property):
    deleted = {**contract_property, "id": "gone", "deletedAt": "2026-02-01T00:00:00.000Z"}
    docs = transform_many([contract_property, deleted])
    assert [d["id"] for d in docs] == [contract_property["id"]]


# ----------------------------------------------------------------- suggest


def test_build_suggest_emits_typed_contextual_entries():
    entries = build_suggest(
        title_en="3 Bedroom Apartment in Palm Hills",
        title_ar="شقة 3 غرف في بالم هيلز",
        compound_name="Palm Hills New Cairo",
        developer_name="Palm Hills Developments",
        area_name="New Cairo",
        area_id="area-1",
        is_featured=True,
    )
    assert len(entries) == 5
    types = [entry["contexts"]["type"][0] for entry in entries]
    assert set(types) <= set(SUGGESTION_TYPES)
    assert types.count("property") == 2

    for entry in entries:
        assert isinstance(entry["input"], list)
        assert entry["input"] and all(isinstance(text, str) for text in entry["input"])
        assert entry["weight"] >= 1
        assert entry["contexts"]["areaId"] == ["area-1"]

    weights = {entry["contexts"]["type"][0]: entry["weight"] for entry in entries}
    assert weights["area"] > weights["property"]
    assert weights["compound"] > weights["property"]


def test_build_suggest_drops_blank_inputs():
    entries = build_suggest(
        title_en=None,
        title_ar="   ",
        compound_name="Mivida",
        developer_name=None,
        area_name="New Cairo",
        area_id=None,
    )
    assert [entry["contexts"]["type"][0] for entry in entries] == ["compound", "area"]
    assert all("areaId" not in entry["contexts"] for entry in entries)


def test_suggest_carries_compound_developer_and_area(contract_property):
    doc = transform_property(contract_property, now=NOW)
    inputs = {entry["input"][0] for entry in doc["suggest"]}
    assert "Palm Hills New Cairo" in inputs
    assert "Palm Hills Developments" in inputs
    assert "New Cairo" in inputs
    assert "3 Bedroom Apartment in Palm Hills" in inputs


# ------------------------------------------------------- against seed data


def test_every_seeded_listing_transforms(seed_properties, area_slugs):
    docs = transform_many(
        seed_properties,
        area_slugs=area_slugs,
        media_base_url="https://nawy-clone-media.s3.eu-central-1.amazonaws.com",
    )
    assert len(docs) == len(seed_properties) == 180

    ids = [doc["id"] for doc in docs]
    assert len(set(ids)) == len(ids)

    mapped = mapped_field_names()
    never_null = {
        field
        for field in REQUIRED_CONTRACT_FIELDS
        if field not in {"description_ar", "description_en"}
    }

    for doc in docs:
        assert set(doc).issubset(mapped), set(doc) - mapped
        for field in never_null:
            assert doc.get(field) is not None, f"{field} missing on {doc['id']}"

        assert doc["geo"] is not None
        assert 22.0 <= doc["geo"]["lat"] <= 32.0  # Egypt
        assert 24.0 <= doc["geo"]["lon"] <= 36.0
        assert 2_000_000 <= doc["price"] <= 95_000_000
        assert doc["propertyType"] in {
            "apartment",
            "villa",
            "townhouse",
            "twinhouse",
            "duplex",
            "penthouse",
            "studio",
            "chalet",
            "office",
            "retail",
            "clinic",
        }
        assert doc["saleType"] in {"primary", "resale", "rent"}
        assert doc["status"] in {"available", "reserved", "sold", "off_plan", "delivered"}
        assert doc["finishing"] in {
            "core_shell",
            "semi_finished",
            "fully_finished",
            "furnished",
        }
        assert doc["amenities"] and all(isinstance(a, str) for a in doc["amenities"])
        assert doc["primaryImage"].startswith("http")
        assert len(doc["suggest"]) == 5
        assert doc["areaSlug"] in set(area_slugs.values())


@pytest.mark.parametrize("field", ["price", "areaSqm", "bedrooms", "bathrooms"])
def test_numeric_fields_are_numbers(seed_properties, field: str):
    doc: dict[str, Any] = transform_property(seed_properties[0])
    assert isinstance(doc[field], int | float)
