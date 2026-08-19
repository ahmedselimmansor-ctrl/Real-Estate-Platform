"""Property listings -> natural-language documents.

Source of truth is the canonical Mongo document owned by api-core; when Mongo is
unreachable or not seeded yet, the loader falls back to the shared
``seed/properties.json`` fixture (CONTRACT §2, §9).

Each listing is rendered the way a consultant would describe it —

    "3-bedroom apartment in Palm Hills New Cairo, New Cairo — 180 m²,
     8,500,000 EGP, 10% down payment over 8 years, delivery June 2027,
     semi-finished. Amenities: swimming pool, gym & fitness centre, …"

— once in English and once in Arabic, so both halves of a bilingual audience
retrieve well.
"""

from __future__ import annotations

import functools
from typing import Any

from app.core.config import get_settings
from app.core.logging import get_logger
from app.db.mongo import get_mongo_reader
from app.ingestion.documents import RawDocument, document_metadata
from app.ingestion.formatting import (
    FINISHING_LABELS,
    PROPERTY_TYPE_LABELS,
    SALE_TYPE_LABELS,
    STATUS_LABELS,
    bedroom_phrase,
    format_area,
    format_egp,
    format_month_year,
    format_quarter,
    join_list,
    label,
    percent,
)
from app.ingestion.loaders.base import IngestOptions, apply_limit, language_source_id
from app.ingestion.seed_files import AMENITIES, PROPERTIES, load_json

logger = get_logger("rag-svc.loader.properties")

SOURCE = "properties"
SOURCE_TYPE = "property"


@functools.lru_cache(maxsize=1)
def _amenity_labels() -> dict[str, tuple[str, str]]:
    """``slug -> (english, arabic)`` from ``seed/amenities.json``."""
    try:
        records = load_json(AMENITIES)
    except Exception as exc:
        logger.warning("amenity_labels_unavailable", error=str(exc))
        return {}
    return {
        str(record.get("slug")): (
            str(record.get("nameEn") or record.get("slug")),
            str(record.get("nameAr") or record.get("nameEn") or record.get("slug")),
        )
        for record in records
        if record.get("slug")
    }


def amenity_names(slugs: list[str], lang: str) -> list[str]:
    labels = _amenity_labels()
    names: list[str] = []
    for slug in slugs or []:
        pair = labels.get(str(slug))
        if pair is None:
            names.append(str(slug).replace("-", " "))
        else:
            names.append(pair[1] if lang == "ar" else pair[0])
    return names


def property_url(listing: dict[str, Any]) -> str:
    base = get_settings().frontend_url.rstrip("/")
    return f"{base}/properties/{listing.get('slug', '')}"


def _bilingual(value: Any, lang: str) -> str:
    if isinstance(value, dict):
        return str(value.get(lang) or value.get("en") or "").strip()
    return str(value or "").strip()


def render_property(listing: dict[str, Any], lang: str = "en") -> str:
    """Render one listing as a paragraph a language model can quote verbatim."""
    arabic = lang == "ar"
    specs = listing.get("specs") or {}
    price = listing.get("price") or {}
    plan = listing.get("paymentPlan") or {}
    location = listing.get("location") or {}
    compound = listing.get("compound") or {}
    developer = listing.get("developer") or {}

    type_label = label(PROPERTY_TYPE_LABELS, listing.get("propertyType"), lang)
    finishing = label(FINISHING_LABELS, listing.get("finishing"), lang)
    status = label(STATUS_LABELS, listing.get("status"), lang)
    sale_type = label(SALE_TYPE_LABELS, listing.get("saleType"), lang)
    bedrooms = bedroom_phrase(specs.get("bedrooms"), lang)
    area_sqm = format_area(specs.get("areaSqm"), lang)
    amount = format_egp(price.get("amount"), lang)
    per_meter = format_egp(price.get("pricePerMeter"), lang)
    compound_name = str(compound.get("name") or "")
    area_name = str(location.get("areaName") or "")
    developer_name = str(developer.get("name") or "")
    amenities = join_list(amenity_names(listing.get("amenities") or [], lang), lang)

    down_percent = percent(plan.get("downPaymentPercent"))
    try:
        down_amount = format_egp(
            round(
                float(price.get("amount") or 0) * float(plan.get("downPaymentPercent") or 0) / 100
            ),
            lang,
        )
    except (TypeError, ValueError):  # pragma: no cover - seed data is always numeric
        down_amount = ""
    years = plan.get("installmentYears")
    monthly = format_egp(plan.get("monthlyInstallment"), lang)
    delivery_month = format_month_year(plan.get("deliveryDate"), lang)
    delivery_quarter = format_quarter(plan.get("deliveryDate"), lang)

    lines: list[str] = []

    if arabic:
        lines.append(
            f"{_bilingual(listing.get('title'), 'ar')} "
            f"(كود الوحدة {listing.get('referenceNo', '')})."
        )
        headline = (
            f"{type_label} {bedrooms} في {compound_name} بمنطقة {area_name}، "
            f"مساحة {area_sqm}، بسعر {amount}"
        )
        if down_percent and years:
            headline += f"، مقدم {down_percent} وتقسيط على {years} سنوات"
        if delivery_month:
            headline += f"، التسليم في {delivery_month}"
        if finishing:
            headline += f"، {finishing}"
        lines.append(headline + ".")
        lines.append(
            f"السعر {amount} أي {per_meter} للمتر المربع. "
            f"نوع البيع: {sale_type}. حالة الوحدة: {status}."
        )
        if down_percent and years:
            lines.append(
                f"نظام السداد: مقدم {down_percent}"
                + (f" ({down_amount})" if down_amount else "")
                + f" ثم تقسيط على {years} سنوات بقسط شهري تقريبي {monthly}."
            )
        if delivery_quarter:
            lines.append(f"موعد التسليم {delivery_quarter}.")
        lines.append(
            "المواصفات: "
            + join_list(
                [
                    f"{specs.get('bedrooms', 0)} غرف نوم",
                    f"{specs.get('bathrooms', 0)} حمامات",
                    f"مساحة بناء {area_sqm}",
                    (
                        f"حديقة {format_area(specs.get('gardenSqm'), lang)}"
                        if specs.get("gardenSqm")
                        else ""
                    ),
                    (f"الدور {specs.get('floor')}" if specs.get("floor") else ""),
                    (f"{specs.get('parkingSpots')} جراج" if specs.get("parkingSpots") else ""),
                ],
                lang,
            )
            + "."
        )
        lines.append(
            f"الموقع: كومباوند {compound_name} في {area_name}، "
            f"{location.get('city', '')} - محافظة {location.get('governorate', '')}. "
            f"العنوان: {location.get('address', '')}."
        )
        lines.append(f"المطور العقاري: {developer_name}.")
        if amenities:
            lines.append(f"المرافق والخدمات: {amenities}.")
        description = _bilingual(listing.get("description"), "ar")
        if description:
            lines.append(description)
        lines.append(f"رابط الوحدة: {property_url(listing)}")
    else:
        lines.append(
            f"{_bilingual(listing.get('title'), 'en')} "
            f"(reference {listing.get('referenceNo', '')})."
        )
        headline = (
            f"{bedrooms} {type_label} in {compound_name}, {area_name} — " f"{area_sqm}, {amount}"
        )
        if down_percent and years:
            headline += f", {down_percent} down payment over {years} years"
        if delivery_month:
            headline += f", delivery {delivery_month}"
        if finishing:
            headline += f", {finishing}"
        lines.append(headline + ".")
        lines.append(
            f"Price {amount} ({per_meter} per square metre). "
            f"Sale type: {sale_type}. Status: {status}."
        )
        if down_percent and years:
            lines.append(
                f"Payment plan: {down_percent} down payment"
                + (f" of {down_amount}" if down_amount else "")
                + f", then {years} years of instalments at about {monthly} per month."
            )
        if delivery_quarter:
            lines.append(f"Handover is scheduled for {delivery_quarter}.")
        lines.append(
            "Specifications: "
            + join_list(
                [
                    f"{specs.get('bedrooms', 0)} bedrooms",
                    f"{specs.get('bathrooms', 0)} bathrooms",
                    f"{area_sqm} built-up area",
                    (
                        f"{format_area(specs.get('gardenSqm'), lang)} garden"
                        if specs.get("gardenSqm")
                        else ""
                    ),
                    (f"floor {specs.get('floor')}" if specs.get("floor") else ""),
                    (
                        f"{specs.get('parkingSpots')} parking spot"
                        + ("s" if int(specs.get("parkingSpots") or 0) > 1 else "")
                        if specs.get("parkingSpots")
                        else ""
                    ),
                ],
                lang,
            )
            + "."
        )
        lines.append(
            f"Location: {compound_name} compound in {area_name}, "
            f"{location.get('city', '')}, {location.get('governorate', '')} governorate. "
            f"Address: {location.get('address', '')}."
        )
        lines.append(f"Developer: {developer_name}.")
        if amenities:
            lines.append(f"Amenities: {amenities}.")
        description = _bilingual(listing.get("description"), "en")
        if description:
            lines.append(description)
        lines.append(f"Listing page: {property_url(listing)}")

    return "\n".join(line for line in lines if line.strip())


def property_metadata(listing: dict[str, Any], lang: str) -> dict[str, Any]:
    """Retrieval metadata for a listing chunk (drives the search prefilters)."""
    specs = listing.get("specs") or {}
    price = listing.get("price") or {}
    plan = listing.get("paymentPlan") or {}
    location = listing.get("location") or {}
    compound = listing.get("compound") or {}
    developer = listing.get("developer") or {}
    images = ((listing.get("media") or {}).get("images")) or []
    primary = next(
        (image for image in images if image.get("isPrimary")),
        images[0] if images else {},
    )

    return document_metadata(
        type="property",
        propertyId=str(listing.get("id") or listing.get("mongoId") or ""),
        mongoId=listing.get("mongoId"),
        slug=listing.get("slug"),
        referenceNo=listing.get("referenceNo"),
        title=_bilingual(listing.get("title"), lang),
        price=int(price.get("amount") or 0),
        currency=price.get("currency") or "EGP",
        pricePerMeter=int(price.get("pricePerMeter") or 0),
        area=location.get("areaName"),
        areaId=location.get("areaId"),
        city=location.get("city"),
        compound=compound.get("name"),
        compoundId=compound.get("id"),
        compoundSlug=compound.get("slug"),
        developer=developer.get("name"),
        developerId=developer.get("id"),
        developerSlug=developer.get("slug"),
        propertyType=listing.get("propertyType"),
        saleType=listing.get("saleType"),
        status=listing.get("status"),
        finishing=listing.get("finishing"),
        bedrooms=specs.get("bedrooms"),
        bathrooms=specs.get("bathrooms"),
        areaSqm=specs.get("areaSqm"),
        downPaymentPercent=plan.get("downPaymentPercent"),
        installmentYears=plan.get("installmentYears"),
        deliveryDate=plan.get("deliveryDate"),
        isFeatured=bool(listing.get("isFeatured")),
        image=primary.get("url") if isinstance(primary, dict) else None,
        url=property_url(listing),
        lang=lang,
        recordId=str(listing.get("id") or listing.get("slug") or ""),
    )


def build_documents(listing: dict[str, Any], options: IngestOptions) -> list[RawDocument]:
    record_id = str(listing.get("id") or listing.get("slug") or "")
    if not record_id:
        return []
    documents: list[RawDocument] = []
    for lang in ("en", "ar"):
        if not options.wants(lang):
            continue
        text = render_property(listing, lang)
        if not text.strip():
            continue
        documents.append(
            RawDocument(
                source_type=SOURCE_TYPE,
                source_id=language_source_id(record_id, lang),
                title=_bilingual(listing.get("title"), lang)
                or str(listing.get("slug") or record_id),
                text=text,
                lang=lang,
                uri=property_url(listing),
                metadata=property_metadata(listing, lang),
            )
        )
    return documents


async def fetch_listings(options: IngestOptions) -> tuple[list[dict[str, Any]], str]:
    """Listings plus the origin they came from (``mongo`` or ``seed``)."""
    reader = get_mongo_reader()
    listings = await reader.fetch_properties(ids=options.ids or None)
    if listings:
        return listings, "mongo"
    logger.info("properties_from_seed", reason="mongo_unavailable_or_empty")
    records = load_json(PROPERTIES)
    if options.ids:
        wanted = {value.lower() for value in options.ids}
        records = [
            record
            for record in records
            if str(record.get("id", "")).lower() in wanted
            or str(record.get("slug", "")).lower() in wanted
        ]
    return records, "seed"


class PropertyLoader:
    """Renders every non-deleted listing into EN + AR documents."""

    source = SOURCE
    source_type = SOURCE_TYPE
    prunable = True

    async def load(self, options: IngestOptions) -> list[RawDocument]:
        listings, origin = await fetch_listings(options)
        documents: list[RawDocument] = []
        for listing in listings:
            if listing.get("deletedAt"):
                continue
            documents.extend(build_documents(listing, options))
        documents = apply_limit(documents, options.limit)
        logger.info(
            "properties_loaded",
            origin=origin,
            listings=len(listings),
            documents=len(documents),
        )
        return documents
