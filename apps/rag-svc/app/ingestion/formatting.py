"""Bilingual formatting helpers for the Egyptian real-estate domain.

Numbers are formatted by hand (no ``Intl``/locale dependency) so rendered
documents — and therefore document checksums — are byte-identical on every
machine, which keeps re-ingestion idempotent.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Any

#: propertyType -> (english, arabic)   — CONTRACT §3 enums
PROPERTY_TYPE_LABELS: dict[str, tuple[str, str]] = {
    "apartment": ("apartment", "شقة"),
    "villa": ("villa", "فيلا"),
    "townhouse": ("townhouse", "تاون هاوس"),
    "twinhouse": ("twinhouse", "توين هاوس"),
    "duplex": ("duplex", "دوبلكس"),
    "penthouse": ("penthouse", "بنتهاوس"),
    "studio": ("studio", "استوديو"),
    "chalet": ("chalet", "شاليه"),
    "office": ("office", "مكتب إداري"),
    "retail": ("retail unit", "محل تجاري"),
    "clinic": ("clinic", "عيادة"),
}

FINISHING_LABELS: dict[str, tuple[str, str]] = {
    "core_shell": ("core and shell", "على المحارة"),
    "semi_finished": ("semi-finished", "نصف تشطيب"),
    "fully_finished": ("fully finished", "تشطيب كامل"),
    "furnished": ("fully finished and furnished", "مفروش بالكامل"),
}

STATUS_LABELS: dict[str, tuple[str, str]] = {
    "available": ("available", "متاحة"),
    "reserved": ("reserved", "محجوزة"),
    "sold": ("sold", "مباعة"),
    "off_plan": ("off-plan / under construction", "تحت الإنشاء"),
    "delivered": ("delivered", "تم التسليم"),
}

SALE_TYPE_LABELS: dict[str, tuple[str, str]] = {
    "primary": ("primary (direct from the developer)", "أولي من المطور"),
    "resale": ("resale", "إعادة بيع"),
    "rent": ("rent", "إيجار"),
}

MONTHS_EN = (
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
)

MONTHS_AR = (
    "يناير",
    "فبراير",
    "مارس",
    "أبريل",
    "مايو",
    "يونيو",
    "يوليو",
    "أغسطس",
    "سبتمبر",
    "أكتوبر",
    "نوفمبر",
    "ديسمبر",
)


def label(table: dict[str, tuple[str, str]], key: str | None, lang: str = "en") -> str:
    """Look up a bilingual enum label, falling back to a humanised key."""
    if not key:
        return ""
    pair = table.get(key)
    if pair is None:
        return key.replace("_", " ")
    return pair[1] if lang == "ar" else pair[0]


def group_digits(value: int) -> str:
    """``8500000`` -> ``8,500,000`` (locale-independent)."""
    negative = value < 0
    digits = str(abs(int(value)))
    groups: list[str] = []
    while len(digits) > 3:
        groups.insert(0, digits[-3:])
        digits = digits[:-3]
    groups.insert(0, digits)
    formatted = ",".join(groups)
    return f"-{formatted}" if negative else formatted


def format_number(value: Any) -> str:
    try:
        return group_digits(int(round(float(value))))
    except (TypeError, ValueError):
        return "0"


def format_egp(value: Any, lang: str = "en") -> str:
    """``8500000`` -> ``8,500,000 EGP`` / ``8,500,000 جنيه``."""
    amount = format_number(value)
    return f"{amount} جنيه" if lang == "ar" else f"{amount} EGP"


def format_area(value: Any, lang: str = "en") -> str:
    """``180`` -> ``180 m²`` / ``180 متر مربع``."""
    amount = format_number(value)
    return f"{amount} متر مربع" if lang == "ar" else f"{amount} m²"


def parse_date(value: Any) -> date | None:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if not isinstance(value, str) or not value.strip():
        return None
    text = value.strip().replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(text).date()
    except ValueError:
        try:
            return datetime.strptime(text[:10], "%Y-%m-%d").date()
        except ValueError:
            return None


def format_month_year(value: Any, lang: str = "en") -> str:
    """``2027-06-30`` -> ``June 2027`` / ``يونيو 2027``."""
    parsed = parse_date(value)
    if parsed is None:
        return ""
    months = MONTHS_AR if lang == "ar" else MONTHS_EN
    return f"{months[parsed.month - 1]} {parsed.year}"


def format_quarter(value: Any, lang: str = "en") -> str:
    """``2027-06-30`` -> ``Q2 2027`` / ``الربع الثاني 2027``."""
    parsed = parse_date(value)
    if parsed is None:
        return ""
    quarter = (parsed.month - 1) // 3 + 1
    if lang == "ar":
        names = ("الأول", "الثاني", "الثالث", "الرابع")
        return f"الربع {names[quarter - 1]} {parsed.year}"
    return f"Q{quarter} {parsed.year}"


def join_list(values: list[str], lang: str = "en") -> str:
    """``[a, b, c]`` -> ``a, b and c`` / ``a، b و c``."""
    cleaned = [value for value in values if value]
    if not cleaned:
        return ""
    if len(cleaned) == 1:
        return cleaned[0]
    if lang == "ar":
        return "، ".join(cleaned[:-1]) + f" و{cleaned[-1]}"
    return ", ".join(cleaned[:-1]) + f" and {cleaned[-1]}"


def bedroom_phrase(bedrooms: Any, lang: str = "en") -> str:
    """``3`` -> ``3-bedroom`` / ``3 غرف``."""
    try:
        count = int(bedrooms)
    except (TypeError, ValueError):
        return ""
    if lang == "ar":
        if count == 0:
            return "استوديو"
        if count == 1:
            return "غرفة واحدة"
        if count == 2:
            return "غرفتين"
        return f"{count} غرف"
    if count == 0:
        return "studio"
    return f"{count}-bedroom"


def percent(value: Any) -> str:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return ""
    if number.is_integer():
        return f"{int(number)}%"
    return f"{number:.1f}%"
