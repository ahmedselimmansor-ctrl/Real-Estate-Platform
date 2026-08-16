"""Public search endpoints (CONTRACT §6 — search-svc, prefix `/api/search`).

    GET /                    filtered, paginated, cached property search
    GET /autocomplete        typed completion suggestions
    GET /facets              sidebar aggregation buckets
    GET /similar/{id}        more_like_this recommendations
    GET /map                 bbox clustering for the map view

Every response goes through `app.core.envelope`, so the body is always
`{"success": true, "data": ..., "meta"?: {...}}` — errors are turned into
`{"success": false, "error": {...}}` by the handlers registered in
`app.core.errors`.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Path, Query, status
from fastapi.responses import ORJSONResponse

from app.api.deps import PaginationDep, autocomplete_rate_limit, search_rate_limit
from app.core.envelope import ResponseEnvelope, envelope, page_meta
from app.core.errors import AppError, ValidationAppError
from app.core.logging import get_logger
from app.schemas.search import (
    MAX_RESULT_WINDOW,
    AutocompleteParams,
    AutocompleteResults,
    FacetSet,
    MapFilters,
    MapResults,
    SearchFilters,
    SearchQuery,
    SearchQueryParams,
    SearchResults,
    SimilarResults,
)
from app.services.search_service import SearchService, get_search_service

log = get_logger("search-svc.api")

router = APIRouter(tags=["search"])

SearchRateLimit = Depends(search_rate_limit)
AutocompleteRateLimit = Depends(autocomplete_rate_limit)

FiltersDep = Annotated[SearchFilters, Query()]
#: `GET /api/search` only — must be the endpoint's sole query parameter.
SearchParamsDep = Annotated[SearchQueryParams, Query()]
MapFiltersDep = Annotated[MapFilters, Query()]
AutocompleteDep = Annotated[AutocompleteParams, Query()]


def service_dep() -> SearchService:
    return get_search_service()


ServiceDep = Annotated[SearchService, Depends(service_dep)]


class DeepPaginationError(AppError):
    """`from + size` beyond `index.max_result_window` — Elasticsearch would 400."""

    def __init__(self, page: int, limit: int) -> None:
        super().__init__(
            "PAGINATION_LIMIT_EXCEEDED",
            (
                f"page {page} with limit {limit} exceeds the {MAX_RESULT_WINDOW} result window; "
                "narrow the filters instead of paging deeper"
            ),
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            details=[
                {"field": "page", "message": f"page * limit must not exceed {MAX_RESULT_WINDOW}"}
            ],
        )


@router.get(
    "",
    summary="Search properties",
    description=(
        "Full-text + faceted property search. Results are cached for 60s under "
        "`cache:search:*` and keyed on a stable hash of the normalised parameters."
    ),
    dependencies=[SearchRateLimit],
    response_class=ORJSONResponse,
    response_model=ResponseEnvelope[SearchResults],
)
# Registered once, at the prefix root. A second `@router.get("/")` alias used to
# sit here; registering the same endpoint at both "" and "/" stopped FastAPI
# expanding the `SearchFilters` query model into individual parameters, so every
# request 422'd on a missing `filters` field. Starlette's `redirect_slashes`
# already routes `/api/search/` here.
async def search_properties(
    filters: SearchParamsDep,
    pagination: PaginationDep,
    service: ServiceDep,
) -> ORJSONResponse:
    query = SearchQuery(
        filters=filters,
        page=pagination.page,
        limit=pagination.limit,
        withFacets=filters.facets,
    )
    if query.window_exceeded:
        raise DeepPaginationError(query.page, query.limit)

    data, meta = await service.search(query)
    payload = SearchResults.model_validate(data).model_dump(mode="json")
    return ORJSONResponse(
        status_code=status.HTTP_200_OK,
        content=envelope(payload, page_meta(**meta)),
    )


@router.get(
    "/autocomplete",
    summary="Type-ahead suggestions",
    description=(
        "Completion suggester across properties, compounds, developers and areas. "
        "Suggestions are deduplicated, typed by source and cached for 300s."
    ),
    dependencies=[AutocompleteRateLimit],
    response_class=ORJSONResponse,
    response_model=ResponseEnvelope[AutocompleteResults],
)
async def autocomplete(
    params: AutocompleteDep,
    service: ServiceDep,
) -> ORJSONResponse:
    data = await service.autocomplete(params)
    payload = AutocompleteResults.model_validate(data).model_dump(mode="json")
    return ORJSONResponse(status_code=status.HTTP_200_OK, content=envelope(payload))


@router.get(
    "/facets",
    summary="Filter sidebar aggregations",
    description=(
        "One `size: 0` aggregation request. Each facet is counted against the "
        "current filters **minus its own field**, so multi-select filters keep "
        "showing their alternatives."
    ),
    dependencies=[SearchRateLimit],
    response_class=ORJSONResponse,
    response_model=ResponseEnvelope[FacetSet],
)
async def facets(
    filters: FiltersDep,
    service: ServiceDep,
) -> ORJSONResponse:
    data = await service.facets(filters)
    payload = FacetSet.model_validate(data).model_dump(mode="json")
    return ORJSONResponse(status_code=status.HTTP_200_OK, content=envelope(payload))


@router.get(
    "/similar/{property_id}",
    summary="Similar listings",
    description=(
        "`more_like_this` over the listing text, boosted by shared "
        "compound/area/developer and fenced to a ±25% price band."
    ),
    dependencies=[SearchRateLimit],
    response_class=ORJSONResponse,
    response_model=ResponseEnvelope[SimilarResults],
)
async def similar(
    service: ServiceDep,
    property_id: Annotated[
        str,
        Path(min_length=1, max_length=128, description="Property UUID, slug or reference number"),
    ],
    limit: Annotated[int, Query(ge=1, le=50, description="Maximum recommendations")] = 10,
) -> ORJSONResponse:
    data = await service.similar(property_id, limit=limit)
    payload = SimilarResults.model_validate(data).model_dump(mode="json")
    return ORJSONResponse(status_code=status.HTTP_200_OK, content=envelope(payload))


@router.get(
    "/map",
    summary="Clustered map results",
    description=(
        "`geotile_grid` clustering inside `bbox=minLng,minLat,maxLng,maxLat`. "
        "The precision follows the viewport span; when the viewport holds fewer "
        "than `maxPoints` listings the individual pins are returned instead."
    ),
    dependencies=[SearchRateLimit],
    response_class=ORJSONResponse,
    response_model=ResponseEnvelope[MapResults],
)
async def map_search(
    filters: MapFiltersDep,
    service: ServiceDep,
) -> ORJSONResponse:
    try:
        data = await service.map_search(filters)
    except ValueError as exc:
        # `bbox` is parsed lazily so the message can name the offending value.
        raise ValidationAppError(
            str(exc),
            details=[{"field": "bbox", "message": str(exc)}],
        ) from exc
    payload = MapResults.model_validate(data).model_dump(mode="json")
    return ORJSONResponse(status_code=status.HTTP_200_OK, content=envelope(payload))
