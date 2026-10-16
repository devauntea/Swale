"""FloodNet: sensors and the street-flooding events they measured (observed)."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, Query

from swale.api.deps import get_db
from swale.api.geojson import collection, flood_event_feature, freshness, sensor_feature
from swale.api.models import LayerCollection, LayerFeature
from swale.api.params import DEFAULT_LIMIT, MAX_LIMIT, decode_cursor, feature_key, parse_bbox, require_utc
from swale.api.problems import Problem
from swale.core.timeutil import iso_z
from swale.db import queries as q

router = APIRouter()


def _sources(db: Any, *keys: str) -> list[dict[str, Any]]:
    return [s for s in freshness(q.data_sources(db)) if s["id"] in keys]


@router.get("/sensors", response_model=LayerCollection)
def list_sensors(
    bbox: str = Query(..., description="minLon,minLat,maxLon,maxLat (WGS84)"),
    since: datetime | None = Query(None, description="count events from this time (ISO-8601 with offset); default: all"),
    limit: int = Query(DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
    cursor: str | None = None,
    db: Any = Depends(get_db),
) -> dict[str, Any]:
    box = parse_bbox(bbox)
    since_utc = require_utc(since, "since")
    page = q.page_in_bbox(db, "sensor", box, limit=limit, after=decode_cursor(cursor))
    stats = q.flood_event_stats(db, [r["sensor_id"] for r in page.records], since_utc)
    features = [sensor_feature(r, stats.get(r["sensor_id"])) for r in page.records]
    filters = {"since": iso_z(since_utc)} if since_utc else {}
    return collection(features, layer="sensors", bbox=box, filters=filters, limit=limit, next_after=page.next_after,
                      sources=_sources(db, "floodnet_sensors", "floodnet_events"))


@router.get("/flood-observations", response_model=LayerCollection)
def list_flood_observations(
    bbox: str = Query(..., description="minLon,minLat,maxLon,maxLat (WGS84)"),
    since: datetime | None = Query(None, description="ISO-8601 with offset"),
    until: datetime | None = Query(None, description="ISO-8601 with offset"),
    min_depth_in: float | None = Query(None, ge=0),
    include_tidal: bool = Query(True, description="false drops events at tidally influenced sensors"),
    limit: int = Query(DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
    cursor: str | None = None,
    db: Any = Depends(get_db),
) -> dict[str, Any]:
    box = parse_bbox(bbox)
    since_utc, until_utc = require_utc(since, "since"), require_utc(until, "until")
    clauses, params = [], {}
    if since_utc:
        clauses.append("started_at >= $since")
        params["since"] = since_utc
    if until_utc:
        clauses.append("started_at <= $until")
        params["until"] = until_utc
    if min_depth_in is not None:
        clauses.append("max_depth_in >= $min_depth")
        params["min_depth"] = min_depth_in
    if not include_tidal:
        clauses.append("tidally_influenced != true")
    page = q.page_in_bbox(db, "flood_event", box, limit=limit, after=decode_cursor(cursor), where=" AND ".join(clauses), vars=params)
    filters = {"since": iso_z(since_utc), "until": iso_z(until_utc), "min_depth_in": min_depth_in, "include_tidal": include_tidal}
    return collection([flood_event_feature(r) for r in page.records], layer="flood_observations", bbox=box,
                      filters={k: v for k, v in filters.items() if v is not None}, limit=limit, next_after=page.next_after,
                      sources=_sources(db, "floodnet_events"))


@router.get("/flood-observations/{event_id}", response_model=LayerFeature)
def get_flood_observation(event_id: str, db: Any = Depends(get_db)) -> dict[str, Any]:
    rec = q.get_record(db, "flood_event", feature_key(event_id, "flood_event"))
    if rec is None:
        raise Problem(404, "not-found", "Not found", f"no flood observation with id {event_id}")
    return flood_event_feature(rec, include_profile=True)
