"""Metadata prefilters parsed out of the user's question.

"3 bedroom apartments in New Cairo under 8 million" carries three hard
constraints that no embedding should be trusted with. Parsing them up front and
pushing them into the SQL ``WHERE`` clause keeps the recall budget
(``RAG_TOP_K``) spent on candidates that actually satisfy the request.

Filters are applied **only to listing chunks** (``metadata->>'type' =
'property'``): an FAQ answer about instalment plans must still surface for
"apartments in New Cairo under 8 million", so non-listing chunks pass through
untouched.

Both languages are supported, including Arabic-Indic digits (٥ مليون) and the
usual Egyptian phrasings (``أقل من``, ``في حدود``, ``ميزانية``).
"""

from __future__ import annotations

import functools
import re
from dataclasses import dataclass, field
from typing import Any

from app.core.logging import get_logger
from app.ingestion.seed_files import AREAS, load_json

logger = get_logger("rag-svc.retrieval.filters")

#: Arabic-Indic digits and separators -> ASCII.
_DIGIT_TRANSLATION = str.maketrans(
    {
        "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4",
        "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
        "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4",
        "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9",
        "٫": ".", "٬": ",", "،": ",",
    }
)

_MULTIPLIERS: dict[str, int] = {
    "k": 1_000,
    "thousand": 1_000,
    "thousands": 1_000,
    "ألف": 1_000,
    "الف": 1_000,
    "آلاف": 1_000,
    "الاف": 1_000,
    "m": 1_000_000,
    "mn": 1_000_000,
    "mio": 1_000_000,
    "million": 1_000_000,
    "millions": 1_000_000,
    "مليون": 1_000_000,
    "ملايين": 1_000_000,
    "bn": 1_000_000_000,
    "billion": 1_000_000_000,
    "مليار": 1_000_000_000,
}

_NUMBER = r"(?P<num>\d+(?:[.,]\d+)*)"
_UNIT = (
    r"(?:\s*(?P<unit>million|millions|mio|mn|m|k|thousand|thousands|bn|billion|"
    r"مليون|ملايين|ألف|الف|آلاف|الاف|مليار))?"
)
_CURRENCY = r"(?:\s*(?:egp|le|pound|pounds|جنيه|جم))?"
_AMOUNT = _CURRENCY + r"\s*" + _NUMBER + _UNIT + _CURRENCY

_MAX_KEYWORDS = (
    r"under|below|less\s+than|up\s+to|no\s+more\s+than|at\s+most|max(?:imum)?|"
    r"cheaper\s+than|within|أقل\s+من|اقل\s+من|حتى|في\s+حدود|بحد\s+أقصى|ما\s+يزيد\s+عن"
)
_MIN_KEYWORDS = (
    r"over|above|more\s+than|at\s+least|starting\s+(?:from|at)|min(?:imum)?|"
    r"أكثر\s+من|اكثر\s+من|فوق|بداية\s+من|ابتداء\s+من|لا\s+يقل\s+عن"
)
_BUDGET_KEYWORDS = r"budget|afford|price\s+range|ميزانية|بميزانية|ميزانيتي"

_MAX_RE = re.compile(rf"(?:{_MAX_KEYWORDS})\s*{_AMOUNT}", re.IGNORECASE | re.UNICODE)
_MIN_RE = re.compile(rf"(?:{_MIN_KEYWORDS})\s*{_AMOUNT}", re.IGNORECASE | re.UNICODE)
_BUDGET_RE = re.compile(
    rf"(?:{_BUDGET_KEYWORDS})[^0-9]{{0,16}}{_AMOUNT}", re.IGNORECASE | re.UNICODE
)
_RANGE_RE = re.compile(
    r"(?:between|from|من)\s*"
    + _CURRENCY
    + r"\s*(?P<low>\d+(?:[.,]\d+)*)"
    + r"(?:\s*(?P<low_unit>million|mn|m|k|thousand|bn|billion|مليون|ألف|الف|مليار))?"
    + r"\s*(?:and|to|-|–|إلى|الى|و)\s*"
    + _CURRENCY
    + r"\s*(?P<high>\d+(?:[.,]\d+)*)"
    + r"(?:\s*(?P<high_unit>million|mn|m|k|thousand|bn|billion|مليون|ألف|الف|مليار))?",
    re.IGNORECASE | re.UNICODE,
)

#: Text that follows a number and proves it is an *area*, not a price.
_AREA_UNIT_RE = re.compile(r"^\s*(?:²|2\b|sq\s*m|sqm|m2|met(?:er|re)s?|متر|م2)", re.IGNORECASE)

#: Smallest number accepted as an EGP price when no magnitude word is present.
_MIN_BARE_PRICE = 100_000

_PROPERTY_TYPE_PATTERNS: tuple[tuple[str, str], ...] = (
    ("townhouse", r"town\s*house|townhouses|تاون\s*هاوس"),
    ("twinhouse", r"twin\s*house|twinhouses|توين\s*هاوس"),
    ("penthouse", r"pent\s*house|penthouses|بنتهاوس|بنت\s*هاوس"),
    ("duplex", r"duplex(?:es)?|دوبلكس|دوبليكس"),
    ("chalet", r"chalets?|شاليه|شاليهات"),
    ("studio", r"studios?|استوديو|ستوديو"),
    ("villa", r"villas?|فيلا|فيلل|فلل|فيلات"),
    ("apartment", r"apartments?|flats?|شقة|شقق|شقه"),
    ("office", r"offices?|office\s+space|مكتب|مكاتب|إداري|اداري"),
    ("retail", r"retail|shops?|stores?|محل|محلات|تجاري"),
    ("clinic", r"clinics?|عيادة|عيادات|طبي"),
)

_BEDROOM_RE = re.compile(
    r"(?P<count>\d+)\s*(?:-|\s)?\s*(?:bed(?:room)?s?|br\b|bhk\b|غرف|غرفة|غرفه)",
    re.IGNORECASE | re.UNICODE,
)
_STUDIO_RE = re.compile(r"\bstudio\b|استوديو|ستوديو", re.IGNORECASE | re.UNICODE)
_TWO_ROOMS_AR_RE = re.compile(r"غرفتين|غرفتان")

#: Used when ``seed/areas.json`` is not mounted (slug, english, arabic).
_FALLBACK_AREAS: tuple[tuple[str, str, str], ...] = (
    ("new-cairo", "New Cairo", "القاهرة الجديدة"),
    ("sheikh-zayed", "Sheikh Zayed", "الشيخ زايد"),
    ("north-coast", "North Coast", "الساحل الشمالي"),
    ("new-administrative-capital", "New Administrative Capital", "العاصمة الإدارية"),
    ("6th-of-october", "6th of October", "السادس من أكتوبر"),
    ("mostakbal-city", "Mostakbal City", "مدينة المستقبل"),
    ("madinaty", "Madinaty", "مدينتي"),
    ("el-shorouk", "El Shorouk", "الشروق"),
    ("ain-sokhna", "Ain Sokhna", "العين السخنة"),
    ("maadi", "Maadi", "المعادي"),
    ("zamalek", "Zamalek", "الزمالك"),
    ("new-zayed", "New Zayed", "زايد الجديدة"),
    ("heliopolis", "Heliopolis", "مصر الجديدة"),
    ("ras-el-hekma", "Ras El Hekma", "رأس الحكمة"),
)


@dataclass(slots=True)
class QueryFilters:
    """Structured constraints extracted from (or supplied alongside) a query."""

    min_price: int | None = None
    max_price: int | None = None
    area: str | None = None
    area_id: str | None = None
    property_type: str | None = None
    bedrooms: int | None = None
    compound: str | None = None
    developer: str | None = None
    source_types: list[str] = field(default_factory=list)
    lang: str | None = None

    def is_empty(self) -> bool:
        return not any(
            (
                self.min_price,
                self.max_price,
                self.area,
                self.area_id,
                self.property_type,
                self.bedrooms is not None,
                self.compound,
                self.developer,
                self.source_types,
                self.lang,
            )
        )

    def as_dict(self) -> dict[str, Any]:
        return {
            "minPrice": self.min_price,
            "maxPrice": self.max_price,
            "area": self.area,
            "areaId": self.area_id,
            "propertyType": self.property_type,
            "bedrooms": self.bedrooms,
            "compound": self.compound,
            "developer": self.developer,
            "sourceTypes": self.source_types or None,
            "lang": self.lang,
        }

    def merge(self, other: QueryFilters | None) -> QueryFilters:
        """Overlay explicit caller filters on top of parsed ones."""
        if other is None:
            return self
        return QueryFilters(
            min_price=other.min_price if other.min_price is not None else self.min_price,
            max_price=other.max_price if other.max_price is not None else self.max_price,
            area=other.area or self.area,
            area_id=other.area_id or self.area_id,
            property_type=other.property_type or self.property_type,
            bedrooms=other.bedrooms if other.bedrooms is not None else self.bedrooms,
            compound=other.compound or self.compound,
            developer=other.developer or self.developer,
            source_types=other.source_types or self.source_types,
            lang=other.lang or self.lang,
        )


# --------------------------------------------------------------------------
def normalize(text: str) -> str:
    """Lowercase, ASCII-ify digits and collapse whitespace."""
    return " ".join((text or "").translate(_DIGIT_TRANSLATION).lower().split())


@functools.lru_cache(maxsize=1)
def area_catalogue() -> tuple[tuple[str, str, str], ...]:
    """``(id, english name, arabic name)`` for every known area."""
    try:
        records = load_json(AREAS)
    except Exception as exc:  # noqa: BLE001 - filters must work without the seed dir
        logger.warning("area_catalogue_fallback", error=str(exc))
        return _FALLBACK_AREAS
    catalogue = [
        (
            str(record.get("id") or record.get("slug") or ""),
            str(record.get("nameEn") or ""),
            str(record.get("nameAr") or ""),
        )
        for record in records
        if record.get("nameEn")
    ]
    return tuple(catalogue) or _FALLBACK_AREAS


def _to_amount(raw: str, unit: str | None, tail: str) -> int | None:
    """Convert ``("8,5", "million", " egp")`` into ``8_500_000``."""
    if raw.count(",") == 1 and len(raw.rsplit(",", 1)[1]) != 3:
        cleaned = raw.replace(",", ".")  # "8,5 million" — comma as a decimal mark
    else:
        cleaned = raw.replace(",", "")  # "8,500,000" — comma as a group separator
    try:
        value = float(cleaned)
    except ValueError:
        return None

    key = (unit or "").strip().lower()
    if key in ("m", "mn", "mio") and _AREA_UNIT_RE.match(tail):
        return None  # "under 200 m²" is an area, not a price
    multiplier = _MULTIPLIERS.get(key, 1)
    if not key and _AREA_UNIT_RE.match(tail):
        return None

    amount = int(round(value * multiplier))
    if multiplier == 1 and amount < _MIN_BARE_PRICE:
        return None
    return amount if amount > 0 else None


def _amount_from_match(match: re.Match[str], text: str) -> int | None:
    return _to_amount(match.group("num"), match.group("unit"), text[match.end() :])


def parse_price_range(text: str) -> tuple[int | None, int | None]:
    """Extract ``(min_price, max_price)`` in EGP from a natural-language query."""
    normalized = normalize(text)

    range_match = _RANGE_RE.search(normalized)
    if range_match:
        low = _to_amount(
            range_match.group("low"),
            range_match.group("low_unit") or range_match.group("high_unit"),
            "",
        )
        high = _to_amount(
            range_match.group("high"), range_match.group("high_unit"), normalized[range_match.end() :]
        )
        if low is not None and high is not None:
            return (min(low, high), max(low, high))

    minimum: int | None = None
    maximum: int | None = None

    max_match = _MAX_RE.search(normalized)
    if max_match:
        maximum = _amount_from_match(max_match, normalized)

    min_match = _MIN_RE.search(normalized)
    if min_match:
        minimum = _amount_from_match(min_match, normalized)

    if maximum is None and minimum is None:
        budget_match = _BUDGET_RE.search(normalized)
        if budget_match:
            maximum = _amount_from_match(budget_match, normalized)

    if minimum is not None and maximum is not None and minimum > maximum:
        minimum, maximum = maximum, minimum
    return minimum, maximum


def parse_property_type(text: str) -> str | None:
    """Return the CONTRACT §3 ``propertyType`` mentioned in the query, if any."""
    normalized = normalize(text)
    for property_type, pattern in _PROPERTY_TYPE_PATTERNS:
        if re.search(pattern, normalized, re.IGNORECASE | re.UNICODE):
            return property_type
    return None


def parse_bedrooms(text: str) -> int | None:
    normalized = normalize(text)
    match = _BEDROOM_RE.search(normalized)
    if match:
        try:
            count = int(match.group("count"))
        except ValueError:  # pragma: no cover - regex guarantees digits
            return None
        return count if 0 <= count <= 12 else None
    if _TWO_ROOMS_AR_RE.search(normalized):
        return 2
    if _STUDIO_RE.search(normalized):
        return 0
    return None


def parse_area(text: str) -> tuple[str | None, str | None]:
    """Return ``(area name, area id)`` for the longest area name in the query."""
    normalized = normalize(text)
    best: tuple[int, str, str] | None = None
    for area_id, name_en, name_ar in area_catalogue():
        for candidate in (name_en, name_ar):
            if not candidate:
                continue
            needle = normalize(candidate)
            if needle and needle in normalized and (best is None or len(needle) > best[0]):
                best = (len(needle), name_en, area_id)
    if best is None:
        return None, None
    return best[1], best[2]



#: "8 million", "8m", "8,000,000" -> 8_000_000. Unlike `parse_price_range` this
#: needs no "under"/"from" cue: a financing question states a bare figure ("the
#: monthly payment on 8 million"), which is a price all the same.
_STATED_AMOUNT_RE = re.compile(
    r"(\d[\d,.]*)\s*(million|m\b|mn\b|\u0645\u0644\u064a\u0648\u0646)?", re.IGNORECASE
)


def parse_stated_amount(text: str) -> int | None:
    """The first money-shaped figure in the text, in EGP, or None."""
    for match in _STATED_AMOUNT_RE.finditer(normalize(text or "")):
        raw, unit = match.group(1), (match.group(2) or "").lower()
        try:
            value = float(raw.replace(",", ""))
        except ValueError:
            continue
        if unit:
            value *= 1_000_000
        # A bare small number is a bedroom count or a term, not a price.
        if value >= 100_000:
            return int(value)
    return None

def parse_query_filters(query: str) -> QueryFilters:
    """Parse every supported constraint out of a natural-language query."""
    minimum, maximum = parse_price_range(query)
    area_name, area_id = parse_area(query)
    filters = QueryFilters(
        min_price=minimum,
        max_price=maximum,
        area=area_name,
        area_id=area_id,
        property_type=parse_property_type(query),
        bedrooms=parse_bedrooms(query),
    )
    if not filters.is_empty():
        logger.debug("query_filters_parsed", **filters.as_dict())
    return filters
