"""Geo helpers shared by the radius, map and distance features.

Pure functions — no I/O, no Elasticsearch, no settings. Coordinates follow the
web convention `{lat, lng}`; Elasticsearch's `geo_point` uses `{lat, lon}`, so
`es_point()` / `web_point()` translate between the two.
"""

from __future__ import annotations

import math
from typing import Any, NamedTuple

__all__ = [
    "BoundingBox",
    "EARTH_RADIUS_KM",
    "bbox_from_string",
    "es_point",
    "haversine_km",
    "precision_for_bbox",
    "web_point",
]

EARTH_RADIUS_KM = 6371.0088

#: geotile_grid precision is a slippy-map zoom level (0 = whole world).
MIN_TILE_PRECISION = 2
MAX_TILE_PRECISION = 16
#: Extra levels added on top of the bbox zoom so a viewport yields a usable grid.
TILE_PRECISION_OFFSET = 2


class BoundingBox(NamedTuple):
    """`bbox=minLng,minLat,maxLng,maxLat` (CONTRACT §6 — `GET /map`)."""

    min_lng: float
    min_lat: float
    max_lng: float
    max_lat: float

    @property
    def lng_span(self) -> float:
        return abs(self.max_lng - self.min_lng)

    @property
    def lat_span(self) -> float:
        return abs(self.max_lat - self.min_lat)

    @property
    def center(self) -> dict[str, float]:
        return {
            "lat": (self.min_lat + self.max_lat) / 2.0,
            "lng": (self.min_lng + self.max_lng) / 2.0,
        }

    def as_es_bounds(self) -> dict[str, dict[str, float]]:
        """Elasticsearch `geo_bounding_box` corners."""
        return {
            "top_left": {"lat": self.max_lat, "lon": self.min_lng},
            "bottom_right": {"lat": self.min_lat, "lon": self.max_lng},
        }

    def as_list(self) -> list[float]:
        return [self.min_lng, self.min_lat, self.max_lng, self.max_lat]


def bbox_from_string(raw: str) -> BoundingBox:
    """Parse `"minLng,minLat,maxLng,maxLat"`, raising `ValueError` when invalid."""
    parts = [piece.strip() for piece in str(raw).split(",") if piece.strip() != ""]
    if len(parts) != 4:
        raise ValueError("bbox must contain exactly 4 comma separated numbers")
    try:
        min_lng, min_lat, max_lng, max_lat = (float(part) for part in parts)
    except ValueError as exc:
        raise ValueError("bbox values must be numbers") from exc

    if not (-180.0 <= min_lng <= 180.0 and -180.0 <= max_lng <= 180.0):
        raise ValueError("bbox longitudes must be between -180 and 180")
    if not (-90.0 <= min_lat <= 90.0 and -90.0 <= max_lat <= 90.0):
        raise ValueError("bbox latitudes must be between -90 and 90")
    if min_lng >= max_lng:
        raise ValueError("bbox minLng must be smaller than maxLng")
    if min_lat >= max_lat:
        raise ValueError("bbox minLat must be smaller than maxLat")
    return BoundingBox(min_lng=min_lng, min_lat=min_lat, max_lng=max_lng, max_lat=max_lat)


def precision_for_bbox(bbox: BoundingBox) -> int:
    """Derive a `geotile_grid` precision from the viewport span.

    A world view (360°) collapses to precision 2 (a 4×4 grid); a neighbourhood
    view (~0.1°, roughly 11 km) lands around precision 14, which is ~4 tiles
    across — enough clusters to be informative without flooding the map.
    """
    span = max(bbox.lng_span, bbox.lat_span, 1e-6)
    zoom = math.log2(360.0 / span)
    precision = int(round(zoom)) + TILE_PRECISION_OFFSET
    return max(MIN_TILE_PRECISION, min(MAX_TILE_PRECISION, precision))


def es_point(lat: float, lng: float) -> dict[str, float]:
    """Web `{lat, lng}` -> Elasticsearch `{lat, lon}`."""
    return {"lat": float(lat), "lon": float(lng)}


def web_point(geo: Any) -> dict[str, float] | None:
    """Elasticsearch `{lat, lon}` (or `[lng, lat]`) -> web `{lat, lng}`."""
    if not geo:
        return None
    if isinstance(geo, dict):
        lat = geo.get("lat", geo.get("latitude"))
        lng = geo.get("lon", geo.get("lng", geo.get("longitude")))
    elif isinstance(geo, list | tuple) and len(geo) >= 2:
        lng, lat = geo[0], geo[1]
    else:
        return None
    try:
        return {"lat": float(lat), "lng": float(lng)}  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None


def haversine_km(
    lat1: float,
    lng1: float,
    lat2: float,
    lng2: float,
) -> float:
    """Great-circle distance in kilometres between two `{lat, lng}` pairs."""
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    d_phi = phi2 - phi1
    d_lambda = math.radians(lng2 - lng1)
    a = math.sin(d_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    return 2 * EARTH_RADIUS_KM * math.asin(math.sqrt(min(1.0, a)))
