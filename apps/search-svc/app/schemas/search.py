"""Query parameters and response models for the public search endpoints.

CONTRACT §6 (search-svc) fixes the parameter names, so the pydantic field names
are the query-string names verbatim (camelCase, no aliases):

    q, propertyType[], saleType, minPrice, maxPrice, bedrooms[], bathrooms[],
    minArea, maxArea, areaId[], compoundId[], developerId[], amenities[],
    finishing[], status, deliveryBefore, maxDownPayment, minInstallmentYears,
    lat, lng, radiusKm, sort, page, limit

Repeated params (`?bedrooms=2&bedrooms=3`) and comma-separated params
(`?bedrooms=2,3`) are both accepted; every multi-value field is de-duplicated and
sorted so two spellings of the same filter share one cache entry.
"""

from __future__ import annotations

from datetime import date
from enum import StrEnum
from typing import Any, Literal, Self

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

# ---------------------------------------------------------------- enums (§3)

PROPERTY_TYPES: tuple[str, ...] = (
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
)
SALE_TYPES: tuple[str, ...] = ("primary", "resale", "rent")
STATUSES: tuple[str, ...] = ("available", "reserved", "sold", "off_plan", "delivered")
FINISHINGS: tuple[str, ...] = ("core_shell", "semi_finished", "fully_finished", "furnished")

PropertyType = Literal[
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
]
SaleType = Literal["primary", "resale", "rent"]
PropertyStatus = Literal["available", "reserved", "sold", "off_plan", "delivered"]
Finishing = Literal["core_shell", "semi_finished", "fully_finished", "furnished"]


class SortOption(StrEnum):
    """`sort` values allowed by CONTRACT §6."""

    RELEVANCE = "relevance"
    PRICE_ASC = "price_asc"
    PRICE_DESC = "price_desc"
    NEWEST = "newest"
    AREA_DESC = "area_desc"


class SuggestionType(StrEnum):
    """Source of an autocomplete suggestion."""

    PROPERTY = "property"
    COMPOUND = "compound"
    DEVELOPER = "developer"
    AREA = "area"


class MapMode(StrEnum):
    CLUSTERS = "clusters"
    POINTS = "points"


#: Elasticsearch `index.max_result_window` (see `app.es.mapping.index_settings`).
MAX_RESULT_WINDOW = 10000
#: Bumped whenever the cached payload shape changes, so stale entries are ignored.
CACHE_SCHEMA_VERSION = "v1"

MAX_RADIUS_KM = 500.0
DEFAULT_RADIUS_KM = 5.0


# ------------------------------------------------------------------- helpers


def _split_multi(value: Any) -> Any:
    """Accept `?a=1&a=2`, `?a=1,2` and a bare `?a=1` for list-valued params."""
    if value is None:
        return None
    if isinstance(value, str):
        return [piece.strip() for piece in value.split(",") if piece.strip()]
    if isinstance(value, list | tuple | set):
        flattened: list[Any] = []
        for item in value:
            if isinstance(item, str):
                flattened.extend(piece.strip() for piece in item.split(",") if piece.strip())
            elif item is not None:
                flattened.append(item)
        return flattened
    return value


def _dedupe_sorted(values: list[Any]) -> list[Any]:
    """Stable, order-independent representation used for cache keys."""
    return sorted(set(values), key=str)


# ------------------------------------------------------------ query params


class SearchFilters(BaseModel):
    """The full structured filter set of `GET /api/search` (CONTRACT §6).

    Bound by FastAPI as query parameters; also reused verbatim by `/facets`,
    `/map` and `/similar/{id}`.
    """

    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    # --- free text ----------------------------------------------------------
    q: str | None = Field(
        default=None,
        max_length=200,
        description="Full-text query (English or Arabic)",
    )

    # --- classification -----------------------------------------------------
    propertyType: list[PropertyType] = Field(
        default_factory=list,
        description="apartment|villa|townhouse|twinhouse|duplex|penthouse|studio|chalet|"
        "office|retail|clinic",
    )
    saleType: SaleType | None = Field(default=None, description="primary|resale|rent")
    status: PropertyStatus | None = Field(
        default=None,
        description="available|reserved|sold|off_plan|delivered",
    )
    finishing: list[Finishing] = Field(
        default_factory=list,
        description="core_shell|semi_finished|fully_finished|furnished",
    )

    # --- money (EGP) --------------------------------------------------------
    minPrice: float | None = Field(default=None, ge=0, description="Minimum price in EGP")
    maxPrice: float | None = Field(default=None, ge=0, description="Maximum price in EGP")

    # --- specs --------------------------------------------------------------
    bedrooms: list[int] = Field(default_factory=list, description="Exact bedroom counts")
    bathrooms: list[int] = Field(default_factory=list, description="Exact bathroom counts")
    minArea: float | None = Field(default=None, ge=0, description="Minimum built-up area (sqm)")
    maxArea: float | None = Field(default=None, ge=0, description="Maximum built-up area (sqm)")

    # --- relations ----------------------------------------------------------
    areaId: list[str] = Field(default_factory=list, description="Area UUIDs")
    compoundId: list[str] = Field(default_factory=list, description="Compound UUIDs")
    developerId: list[str] = Field(default_factory=list, description="Developer UUIDs")
    amenities: list[str] = Field(
        default_factory=list,
        description="Amenity slugs — a listing must have ALL of them",
    )

    # --- payment plan -------------------------------------------------------
    deliveryBefore: date | None = Field(
        default=None,
        description="Only listings delivered on or before this date (YYYY-MM-DD)",
    )
    maxDownPayment: float | None = Field(
        default=None,
        ge=0,
        le=100,
        description="Maximum down payment percentage",
    )
    minInstallmentYears: int | None = Field(
        default=None,
        ge=0,
        le=40,
        description="Minimum installment plan length in years",
    )

    # --- geo ----------------------------------------------------------------
    lat: float | None = Field(default=None, ge=-90, le=90, description="Latitude of the centre")
    lng: float | None = Field(default=None, ge=-180, le=180, description="Longitude of the centre")
    radiusKm: float | None = Field(
        default=None,
        gt=0,
        le=MAX_RADIUS_KM,
        description=f"Radius around lat/lng in km (default {DEFAULT_RADIUS_KM:g})",
    )

    # --- ordering -----------------------------------------------------------
    sort: SortOption = Field(
        default=SortOption.RELEVANCE,
        description="relevance|price_asc|price_desc|newest|area_desc",
    )

    # ------------------------------------------------------------ validators

    @field_validator("q", mode="before")
    @classmethod
    def _clean_query(cls, value: Any) -> Any:
        if value is None:
            return None
        text = str(value).strip()
        return text or None

    @field_validator(
        "propertyType",
        "finishing",
        "areaId",
        "compoundId",
        "developerId",
        "amenities",
        "bedrooms",
        "bathrooms",
        mode="before",
    )
    @classmethod
    def _accept_csv(cls, value: Any) -> Any:
        return _split_multi(value)

    @field_validator(
        "propertyType", "finishing", "areaId", "compoundId", "developerId", "amenities"
    )
    @classmethod
    def _normalise_strings(cls, value: list[str]) -> list[str]:
        return _dedupe_sorted([item for item in value if item])

    @field_validator("bedrooms", "bathrooms")
    @classmethod
    def _normalise_counts(cls, value: list[int]) -> list[int]:
        for item in value:
            if item < 0 or item > 20:
                raise ValueError("room counts must be between 0 and 20")
        return sorted(set(value))

    @model_validator(mode="after")
    def _check_ranges(self) -> Self:
        if (
            self.minPrice is not None
            and self.maxPrice is not None
            and self.minPrice > self.maxPrice
        ):
            raise ValueError("minPrice must be less than or equal to maxPrice")
        if self.minArea is not None and self.maxArea is not None and self.minArea > self.maxArea:
            raise ValueError("minArea must be less than or equal to maxArea")
        if (self.lat is None) != (self.lng is None):
            raise ValueError("lat and lng must be provided together")
        if self.lat is not None and self.radiusKm is None:
            self.radiusKm = DEFAULT_RADIUS_KM
        if self.lat is None and self.radiusKm is not None:
            raise ValueError("radiusKm requires lat and lng")
        return self

    # -------------------------------------------------------------- helpers

    @property
    def has_geo(self) -> bool:
        return self.lat is not None and self.lng is not None

    @property
    def has_text(self) -> bool:
        return bool(self.q)

    @property
    def origin(self) -> dict[str, float] | None:
        """`{lat, lng}` centre used to annotate hits with `distanceKm`."""
        if not self.has_geo:
            return None
        return {"lat": float(self.lat or 0.0), "lng": float(self.lng or 0.0)}

    def normalised(self) -> dict[str, Any]:
        """Deterministic dict used as the cache-key payload."""
        return self.model_dump(mode="json", exclude_none=True, exclude_defaults=False)


class SearchQueryParams(SearchFilters):
    """`GET /api/search` — the standard filters plus the facets toggle.

    The flag lives *inside* the model rather than beside it because FastAPI only
    treats a Pydantic model as a query-parameter model when it is the endpoint's
    sole query parameter. With a second query param present the model is
    validated as an ordinary scalar and every request fails with
    "filters: Field required".
    """

    facets: bool = Field(
        default=False,
        description="Also compute the filter-sidebar facets for this result set",
    )


class MapFilters(SearchFilters):
    """`GET /api/search/map` — the standard filters plus a viewport."""

    bbox: str = Field(
        description="Viewport as minLng,minLat,maxLng,maxLat",
        examples=["31.20,29.90,31.70,30.20"],
    )
    precision: int | None = Field(
        default=None,
        ge=1,
        le=16,
        description="Override the derived geotile_grid precision",
    )
    maxPoints: int = Field(
        default=200,
        ge=1,
        le=1000,
        description="Return individual points instead of clusters below this many matches",
    )


class AutocompleteParams(BaseModel):
    """`GET /api/search/autocomplete` query parameters."""

    model_config = ConfigDict(extra="ignore")

    q: str = Field(min_length=1, max_length=100, description="Prefix to complete")
    limit: int = Field(default=10, ge=1, le=25, description="Maximum suggestions")
    type: list[SuggestionType] = Field(
        default_factory=list,
        description="Restrict to property|compound|developer|area",
    )

    @field_validator("q", mode="before")
    @classmethod
    def _clean(cls, value: Any) -> Any:
        return str(value).strip() if value is not None else value

    @field_validator("type", mode="before")
    @classmethod
    def _accept_csv(cls, value: Any) -> Any:
        return _split_multi(value)

    @property
    def types(self) -> tuple[str, ...]:
        if self.type:
            return tuple(dict.fromkeys(str(item) for item in self.type))
        return tuple(str(item) for item in SuggestionType)


class SearchQuery(BaseModel):
    """Filters + pagination — the exact unit the response cache is keyed on."""

    model_config = ConfigDict(extra="ignore")

    filters: SearchFilters
    page: int = Field(default=1, ge=1)
    limit: int = Field(default=20, ge=1, le=100)
    withFacets: bool = False

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.limit

    @property
    def window_exceeded(self) -> bool:
        """True when `from + size` would break `index.max_result_window`."""
        return self.offset + self.limit > MAX_RESULT_WINDOW

    def cache_payload(self) -> dict[str, Any]:
        return {
            "v": CACHE_SCHEMA_VERSION,
            "filters": self.filters.normalised(),
            "page": self.page,
            "limit": self.limit,
            "facets": self.withFacets,
        }


# --------------------------------------------------------- response models


class LocalizedText(BaseModel):
    """Bilingual string pair (CONTRACT §3 `title` / `description`)."""

    en: str | None = None
    ar: str | None = None


class GeoPoint(BaseModel):
    """Web-facing coordinate pair (Elasticsearch stores `{lat, lon}`)."""

    lat: float
    lng: float


class PropertySpecs(BaseModel):
    bedrooms: int | None = None
    bathrooms: int | None = None
    areaSqm: float | None = None
    gardenSqm: float | None = None
    floor: int | None = None
    parkingSpots: int | None = None


class PaymentPlanSummary(BaseModel):
    downPaymentPercent: float | None = None
    downPaymentAmount: int | None = None
    installmentYears: int | None = None
    monthlyInstallment: int | None = None
    deliveryDate: str | None = None


class PropertyHit(BaseModel):
    """One search result, shaped for the web `PropertyCard`."""

    model_config = ConfigDict(extra="ignore")

    id: str
    slug: str | None = None
    referenceNo: str | None = None
    title: LocalizedText = Field(default_factory=LocalizedText)
    description: LocalizedText | None = None
    price: float | None = None
    currency: str = "EGP"
    pricePerMeter: int | None = None
    propertyType: str | None = None
    saleType: str | None = None
    status: str | None = None
    finishing: str | None = None
    specs: PropertySpecs = Field(default_factory=PropertySpecs)
    paymentPlan: PaymentPlanSummary = Field(default_factory=PaymentPlanSummary)
    areaId: str | None = None
    areaName: str | None = None
    areaSlug: str | None = None
    city: str | None = None
    compoundId: str | None = None
    compoundName: str | None = None
    compoundSlug: str | None = None
    developerId: str | None = None
    developerName: str | None = None
    developerSlug: str | None = None
    amenities: list[str] = Field(default_factory=list)
    primaryImage: str | None = None
    isFeatured: bool = False
    geo: GeoPoint | None = None
    publishedAt: str | None = None
    score: float | None = None
    distanceKm: float | None = None
    highlight: dict[str, list[str]] | None = None


class FacetBucket(BaseModel):
    """One aggregation bucket with its display label."""

    value: str
    label: str | None = None
    labelAr: str | None = None
    slug: str | None = None
    count: int = 0


class RangeStats(BaseModel):
    min: float | None = None
    max: float | None = None
    avg: float | None = None
    count: int = 0


class HistogramBucket(BaseModel):
    """One price-histogram bar: `[min, max)` in EGP."""

    key: float
    min: float
    max: float
    count: int = 0


class PriceFacet(BaseModel):
    stats: RangeStats = Field(default_factory=RangeStats)
    interval: float = 0
    histogram: list[HistogramBucket] = Field(default_factory=list)


class FacetSet(BaseModel):
    """Everything the filter sidebar needs, in one payload."""

    total: int = 0
    propertyType: list[FacetBucket] = Field(default_factory=list)
    saleType: list[FacetBucket] = Field(default_factory=list)
    status: list[FacetBucket] = Field(default_factory=list)
    finishing: list[FacetBucket] = Field(default_factory=list)
    bedrooms: list[FacetBucket] = Field(default_factory=list)
    bathrooms: list[FacetBucket] = Field(default_factory=list)
    amenities: list[FacetBucket] = Field(default_factory=list)
    areas: list[FacetBucket] = Field(default_factory=list)
    compounds: list[FacetBucket] = Field(default_factory=list)
    developers: list[FacetBucket] = Field(default_factory=list)
    price: PriceFacet = Field(default_factory=PriceFacet)
    areaSqm: RangeStats = Field(default_factory=RangeStats)
    deliveryYear: list[FacetBucket] = Field(default_factory=list)
    installmentYears: list[FacetBucket] = Field(default_factory=list)


class SearchResults(BaseModel):
    """`data` payload of `GET /api/search`."""

    results: list[PropertyHit] = Field(default_factory=list)
    facets: FacetSet | None = None
    took: int = 0
    maxScore: float | None = None
    cached: bool = False


class Suggestion(BaseModel):
    """`{text, type, id, slug}` (CONTRACT §6)."""

    text: str
    type: str
    id: str | None = None
    slug: str | None = None


class AutocompleteResults(BaseModel):
    suggestions: list[Suggestion] = Field(default_factory=list)


class SimilarResults(BaseModel):
    """`data` payload of `GET /api/search/similar/{id}`."""

    sourceId: str
    strategy: Literal["more_like_this", "fallback"] = "more_like_this"
    results: list[PropertyHit] = Field(default_factory=list)


class MapCluster(BaseModel):
    key: str
    count: int = 0
    centroid: GeoPoint
    avgPrice: float | None = None
    minPrice: float | None = None
    maxPrice: float | None = None


class MapResults(BaseModel):
    """`data` payload of `GET /api/search/map`."""

    mode: MapMode = MapMode.CLUSTERS
    precision: int = 0
    total: int = 0
    bbox: list[float] = Field(default_factory=list)
    clusters: list[MapCluster] = Field(default_factory=list)
    points: list[PropertyHit] = Field(default_factory=list)
