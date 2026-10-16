"""GeoJSON dicts <-> SurrealDB SDK geometry objects. The SDK rejects plain GeoJSON dicts (verified)."""

from __future__ import annotations

from typing import Any

from surrealdb.data import GeometryLine, GeometryMultiPolygon, GeometryPoint, GeometryPolygon


def point(lon: float, lat: float) -> GeometryPoint:
    return GeometryPoint(lon, lat)


def to_surreal(geojson: dict[str, Any]) -> GeometryPoint | GeometryPolygon | GeometryMultiPolygon:
    kind, coords = geojson["type"], geojson["coordinates"]
    if kind == "Point":
        return GeometryPoint(coords[0], coords[1])
    if kind == "Polygon":
        return _polygon(coords)
    if kind == "MultiPolygon":
        return GeometryMultiPolygon(*(_polygon(p) for p in coords))
    raise ValueError(f"unsupported geometry type: {kind}")


def _polygon(rings: list) -> GeometryPolygon:
    return GeometryPolygon(*(GeometryLine(*(GeometryPoint(c[0], c[1]) for c in ring)) for ring in rings))


def to_geojson(geometry: Any) -> dict[str, Any] | None:
    if geometry is None:
        return None
    if isinstance(geometry, GeometryPoint):
        return {"type": "Point", "coordinates": [geometry.longitude, geometry.latitude]}
    if isinstance(geometry, GeometryPolygon):
        return {"type": "Polygon", "coordinates": _rings(geometry)}
    if isinstance(geometry, GeometryMultiPolygon):
        return {"type": "MultiPolygon", "coordinates": [_rings(p) for p in geometry.geometry_polygons]}
    raise TypeError(f"unsupported geometry: {type(geometry).__name__}")


def _rings(polygon: GeometryPolygon) -> list:
    return [[[p.longitude, p.latitude] for p in line.geometry_points] for line in polygon.geometry_lines]
