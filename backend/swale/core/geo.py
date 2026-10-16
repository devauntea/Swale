"""Bounding boxes, NYC coverage, polygon membership and NYC State Plane (EPSG:2263) conversion."""

from __future__ import annotations

import math
from collections.abc import Iterable, Iterator, Sequence
from dataclasses import dataclass
from functools import lru_cache
from typing import Any

import numpy as np
import shapely
from pyproj import Transformer
from shapely.geometry import shape

STATE_PLANE = "EPSG:2263"  # NAD83 / New York Long Island, US survey feet
WGS84 = "EPSG:4326"


class BBoxError(ValueError):
    """An invalid bbox. ``code`` is machine-readable and goes into API problem responses."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


@dataclass(frozen=True)
class BBox:
    w: float
    s: float
    e: float
    n: float

    @classmethod
    def parse(cls, text: str) -> BBox:
        parts = text.split(",")
        if len(parts) != 4:
            raise BBoxError("wrong_arity", "bbox must be minLon,minLat,maxLon,maxLat")
        try:
            w, s, e, n = (float(p) for p in parts)
        except ValueError:
            raise BBoxError("not_a_number", "bbox values must be numbers") from None
        if not all(math.isfinite(v) for v in (w, s, e, n)):
            raise BBoxError("not_finite", "bbox values must be finite numbers")
        if not (-180 <= w <= 180 and -180 <= e <= 180 and -90 <= s <= 90 and -90 <= n <= 90):
            raise BBoxError("out_of_range", "longitudes must be within ±180 and latitudes within ±90")
        if w >= e:
            raise BBoxError("inverted_lon", "minLon must be less than maxLon")
        if s >= n:
            raise BBoxError("inverted_lat", "minLat must be less than maxLat")
        return cls(w, s, e, n)

    def contains(self, lon: float, lat: float) -> bool:
        return self.w <= lon <= self.e and self.s <= lat <= self.n

    def intersects(self, other: BBox) -> bool:
        return self.w <= other.e and other.w <= self.e and self.s <= other.n and other.s <= self.n

    def as_list(self) -> list[float]:
        return [self.w, self.s, self.e, self.n]


#: Rough NYC extent used for coverage checks (WGS84 degrees).
NYC = BBox(-74.27, 40.49, -73.68, 40.92)


def require_coverage(bbox: BBox) -> None:
    if not bbox.intersects(NYC):
        raise BBoxError("outside_coverage", "bbox does not intersect New York City")


def in_nyc(lon: float, lat: float) -> bool:
    return NYC.contains(lon, lat)


def geojson_bbox(geometry: dict[str, Any]) -> BBox:
    """Bounding box of any GeoJSON geometry's coordinates."""
    lons, lats = zip(*_positions(geometry["coordinates"]))
    return BBox(min(lons), min(lats), max(lons), max(lats))


def _positions(coords: Any) -> Iterator[tuple[float, float]]:
    if coords and isinstance(coords[0], (int, float)):
        yield float(coords[0]), float(coords[1])
    else:
        for c in coords:
            yield from _positions(c)


def covers_points(geometry: dict[str, Any], lons: Sequence[float], lats: Sequence[float]) -> list[bool]:
    """For each point: is it inside, or on the boundary of, a GeoJSON (Multi)Polygon?"""
    polygon = shape(geometry)
    shapely.prepare(polygon)
    return shapely.intersects_xy(polygon, np.asarray(lons, dtype=float), np.asarray(lats, dtype=float)).tolist()


@lru_cache(maxsize=4)
def _transformer(source: str, target: str) -> Transformer:
    return Transformer.from_crs(source, target, always_xy=True)


def to_state_plane(lons: Iterable[float], lats: Iterable[float]) -> tuple[np.ndarray, np.ndarray]:
    """WGS84 lon/lat -> EPSG:2263 x/y in US survey feet."""
    xs, ys = _transformer(WGS84, STATE_PLANE).transform(np.asarray(list(lons), dtype=float), np.asarray(list(lats), dtype=float))
    return np.asarray(xs), np.asarray(ys)


def from_state_plane(x_ft: float, y_ft: float) -> tuple[float, float]:
    """EPSG:2263 x/y in US survey feet -> WGS84 (lon, lat)."""
    lon, lat = _transformer(STATE_PLANE, WGS84).transform(x_ft, y_ft)
    return float(lon), float(lat)


def ground_distance_ft(lon1: float, lat1: float, lon2: float, lat2: float) -> float:
    (x1, x2), (y1, y2) = to_state_plane([lon1, lon2], [lat1, lat2])
    return float(math.hypot(x2 - x1, y2 - y1))
