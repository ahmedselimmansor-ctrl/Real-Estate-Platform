"""Catalogue documents: compounds, developers and areas (from ``seed/``).

These give the chatbot the context a listing alone cannot answer — what a
compound offers, who built it, and what an area is like — in both languages.
"""

from __future__ import annotations

import functools
from typing import Any

from app.core.config import get_settings
from app.core.logging import get_logger
from app.ingestion.documents import RawDocument, document_metadata
from app.ingestion.formatting import (
    PROPERTY_TYPE_LABELS,
    format_area,
    format_egp,
    format_number,
    join_list,
    label,
    percent,
)
from app.ingestion.loaders.base import IngestOptions, apply_limit, language_source_id
from app.ingestion.seed_files import (
    AMENITIES,
    AREAS,
    COMPOUNDS,
    DEVELOPERS,
    index_by_id,
    load_json,
)

logger = get_logger("rag-svc.loader.catalog")


def _base_url() -> str:
    return get_settings().frontend_url.rstrip("/")


def _text(value: Any, lang: str) -> str:
    if isinstance(value, dict):
        return str(value.get(lang) or value.get("en") or "").strip()
    return str(value or "").strip()


@functools.lru_cache(maxsize=1)
def _amenity_index() -> dict[str, dict[str, Any]]:
    try:
        return index_by_id(load_json(AMENITIES))
    except Exception as exc:  # noqa: BLE001 - cosmetic lookup
        logger.warning("amenity_index_unavailable", error=str(exc))
        return {}


@functools.lru_cache(maxsize=1)
def _developer_index() -> dict[str, dict[str, Any]]:
    try:
        return index_by_id(load_json(DEVELOPERS))
    except Exception as exc:  # noqa: BLE001
        logger.warning("developer_index_unavailable", error=str(exc))
        return {}


@functools.lru_cache(maxsize=1)
def _area_index() -> dict[str, dict[str, Any]]:
    try:
        return index_by_id(load_json(AREAS))
    except Exception as exc:  # noqa: BLE001
        logger.warning("area_index_unavailable", error=str(exc))
        return {}


# --------------------------------------------------------------- compounds --
def render_compound(record: dict[str, Any], lang: str = "en") -> str:
    developer = _developer_index().get(str(record.get("developerId") or ""), {})
    area = _area_index().get(str(record.get("areaId") or ""), {})
    amenities = [
        _amenity_index().get(str(amenity_id), {}) for amenity_id in record.get("amenityIds") or []
    ]
    amenity_names = [
        str(amenity.get("nameAr" if lang == "ar" else "nameEn") or "")
        for amenity in amenities
        if amenity
    ]
    unit_types = [
        label(PROPERTY_TYPE_LABELS, unit_type, lang) for unit_type in record.get("unitTypes") or []
    ]

    name = str(record.get("nameAr") if lang == "ar" else record.get("name") or "")
    area_name = str(area.get("nameAr" if lang == "ar" else "nameEn") or "")
    developer_name = str(
        developer.get("nameAr" if lang == "ar" else "name") or developer.get("name") or ""
    )

    if lang == "ar":
        lines = [
            f"كومباوند {name} في {area_name} من تطوير {developer_name}.",
            f"تبدأ الأسعار من {format_egp(record.get('startingPrice'), lang)} "
            f"وتصل إلى {format_egp(record.get('maxPrice'), lang)}، "
            f"والمساحات من {format_area(record.get('minAreaSqm'), lang)} "
            f"حتى {format_area(record.get('maxAreaSqm'), lang)}.",
            f"نظام السداد: مقدم {percent(record.get('downPaymentPercent'))} "
            f"وتقسيط على {record.get('installmentYears')} سنوات، "
            f"والتسليم في {record.get('deliveryYear')}.",
        ]
        if unit_types:
            lines.append(f"أنواع الوحدات المتاحة: {join_list(unit_types, lang)}.")
        if amenity_names:
            lines.append(f"المرافق: {join_list(amenity_names, lang)}.")
        description = _text(record.get("description"), "ar")
        if description:
            lines.append(description)
        lines.append(f"رابط الكومباوند: {_base_url()}/compounds/{record.get('slug', '')}")
    else:
        lines = [
            f"{name} is a compound in {area_name} developed by {developer_name}.",
            f"Prices start at {format_egp(record.get('startingPrice'), lang)} and reach "
            f"{format_egp(record.get('maxPrice'), lang)}, with unit areas from "
            f"{format_area(record.get('minAreaSqm'), lang)} to "
            f"{format_area(record.get('maxAreaSqm'), lang)}.",
            f"Payment plan: {percent(record.get('downPaymentPercent'))} down payment over "
            f"{record.get('installmentYears')} years, with delivery in "
            f"{record.get('deliveryYear')}.",
        ]
        if unit_types:
            lines.append(f"Unit types available: {join_list(unit_types, lang)}.")
        if amenity_names:
            lines.append(f"Facilities: {join_list(amenity_names, lang)}.")
        description = _text(record.get("description"), "en")
        if description:
            lines.append(description)
        lines.append(f"Compound page: {_base_url()}/compounds/{record.get('slug', '')}")
    return "\n".join(line for line in lines if line.strip())


def compound_metadata(record: dict[str, Any], lang: str) -> dict[str, Any]:
    developer = _developer_index().get(str(record.get("developerId") or ""), {})
    area = _area_index().get(str(record.get("areaId") or ""), {})
    return document_metadata(
        type="compound",
        compoundId=str(record.get("id") or ""),
        slug=record.get("slug"),
        title=str(record.get("nameAr") if lang == "ar" else record.get("name") or ""),
        compound=record.get("name"),
        area=area.get("nameEn"),
        areaId=record.get("areaId"),
        developer=developer.get("name"),
        developerId=record.get("developerId"),
        startingPrice=record.get("startingPrice"),
        maxPrice=record.get("maxPrice"),
        deliveryYear=record.get("deliveryYear"),
        installmentYears=record.get("installmentYears"),
        downPaymentPercent=record.get("downPaymentPercent"),
        unitTypes=list(record.get("unitTypes") or []),
        url=f"{_base_url()}/compounds/{record.get('slug', '')}",
        lang=lang,
        recordId=str(record.get("id") or ""),
    )


# -------------------------------------------------------------- developers --
def render_developer(record: dict[str, Any], lang: str = "en") -> str:
    name = str(record.get("nameAr") if lang == "ar" else record.get("name") or "")
    if lang == "ar":
        lines = [
            f"{name} مطور عقاري مصري تأسس عام {record.get('foundedYear')} "
            f"ولديه {record.get('projectsCount')} مشروعات على منصة توب تشويس.",
        ]
        description = _text(record.get("description"), "ar")
        if description:
            lines.append(description)
        if record.get("phone"):
            lines.append(f"خط خدمة العملاء: {record.get('phone')}.")
        if record.get("website"):
            lines.append(f"الموقع الرسمي: {record.get('website')}.")
        lines.append(f"صفحة المطور: {_base_url()}/developers/{record.get('slug', '')}")
    else:
        lines = [
            f"{name} is an Egyptian real-estate developer founded in "
            f"{record.get('foundedYear')} with {record.get('projectsCount')} projects "
            "listed on TopChoice.",
        ]
        description = _text(record.get("description"), "en")
        if description:
            lines.append(description)
        if record.get("phone"):
            lines.append(f"Customer hotline: {record.get('phone')}.")
        if record.get("website"):
            lines.append(f"Official website: {record.get('website')}.")
        lines.append(f"Developer page: {_base_url()}/developers/{record.get('slug', '')}")
    return "\n".join(line for line in lines if line.strip())


def developer_metadata(record: dict[str, Any], lang: str) -> dict[str, Any]:
    return document_metadata(
        type="developer",
        developerId=str(record.get("id") or ""),
        slug=record.get("slug"),
        title=str(record.get("nameAr") if lang == "ar" else record.get("name") or ""),
        developer=record.get("name"),
        foundedYear=record.get("foundedYear"),
        projectsCount=record.get("projectsCount"),
        url=f"{_base_url()}/developers/{record.get('slug', '')}",
        lang=lang,
        recordId=str(record.get("id") or ""),
    )


# ------------------------------------------------------------------- areas --
def render_area(record: dict[str, Any], lang: str = "en") -> str:
    name = str(record.get("nameAr") if lang == "ar" else record.get("nameEn") or "")
    if lang == "ar":
        lines = [
            f"{name} منطقة في {record.get('city')} - محافظة {record.get('governorate')}، "
            f"وبها {format_number(record.get('propertyCount'))} وحدة معروضة على توب تشويس "
            f"بمتوسط سعر متر {format_egp(record.get('avgPricePerMeter'), lang)}.",
        ]
        description = _text(record.get("description"), "ar")
        if description:
            lines.append(description)
        lines.append(f"صفحة المنطقة: {_base_url()}/areas/{record.get('slug', '')}")
    else:
        lines = [
            f"{name} is an area in {record.get('city')}, {record.get('governorate')} "
            f"governorate, with {format_number(record.get('propertyCount'))} units listed on "
            f"TopChoice at an average of {format_egp(record.get('avgPricePerMeter'), lang)} per "
            "square metre.",
        ]
        description = _text(record.get("description"), "en")
        if description:
            lines.append(description)
        lines.append(f"Area page: {_base_url()}/areas/{record.get('slug', '')}")
    return "\n".join(line for line in lines if line.strip())


def area_metadata(record: dict[str, Any], lang: str) -> dict[str, Any]:
    return document_metadata(
        type="area",
        areaId=str(record.get("id") or ""),
        slug=record.get("slug"),
        title=str(record.get("nameAr") if lang == "ar" else record.get("nameEn") or ""),
        area=record.get("nameEn"),
        city=record.get("city"),
        governorate=record.get("governorate"),
        propertyCount=record.get("propertyCount"),
        avgPricePerMeter=record.get("avgPricePerMeter"),
        url=f"{_base_url()}/areas/{record.get('slug', '')}",
        lang=lang,
        recordId=str(record.get("id") or ""),
    )


# ------------------------------------------------------------------ loader --
class SeedCatalogLoader:
    """Generic loader over one seed catalogue file."""

    def __init__(
        self,
        *,
        source: str,
        source_type: str,
        filename: str,
        renderer,
        metadata_builder,
        title_key: tuple[str, str],
    ) -> None:
        self.source = source
        self.source_type = source_type
        self.prunable = True
        self._filename = filename
        self._renderer = renderer
        self._metadata_builder = metadata_builder
        self._title_key = title_key

    def _title(self, record: dict[str, Any], lang: str) -> str:
        key = self._title_key[1] if lang == "ar" else self._title_key[0]
        return str(record.get(key) or record.get(self._title_key[0]) or record.get("slug") or "")

    async def load(self, options: IngestOptions) -> list[RawDocument]:
        records = load_json(self._filename)
        documents: list[RawDocument] = []
        for record in records:
            record_id = str(record.get("id") or "")
            if not record_id or not options.selected(record_id, str(record.get("slug") or "")):
                continue
            for lang in ("en", "ar"):
                if not options.wants(lang):
                    continue
                text = self._renderer(record, lang)
                if not text.strip():
                    continue
                metadata = self._metadata_builder(record, lang)
                documents.append(
                    RawDocument(
                        source_type=self.source_type,
                        source_id=language_source_id(record_id, lang),
                        title=self._title(record, lang),
                        text=text,
                        lang=lang,
                        uri=str(metadata.get("url") or ""),
                        metadata=metadata,
                    )
                )
        documents = apply_limit(documents, options.limit)
        logger.info(
            "catalog_loaded",
            source=self.source,
            records=len(records),
            documents=len(documents),
        )
        return documents


def compound_loader() -> SeedCatalogLoader:
    return SeedCatalogLoader(
        source="compounds",
        source_type="compound",
        filename=COMPOUNDS,
        renderer=render_compound,
        metadata_builder=compound_metadata,
        title_key=("name", "nameAr"),
    )


def developer_loader() -> SeedCatalogLoader:
    return SeedCatalogLoader(
        source="developers",
        source_type="developer",
        filename=DEVELOPERS,
        renderer=render_developer,
        metadata_builder=developer_metadata,
        title_key=("name", "nameAr"),
    )


def area_loader() -> SeedCatalogLoader:
    return SeedCatalogLoader(
        source="areas",
        source_type="area",
        filename=AREAS,
        renderer=render_area,
        metadata_builder=area_metadata,
        title_key=("nameEn", "nameAr"),
    )
