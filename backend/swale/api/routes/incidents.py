"""Incidents: 311 reports (reported), with DEP's own outcome where one exists."""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends, Query

from swale.api.deps import get_db
from swale.api.geojson import collection, freshness, incident_feature
from swale.api.models import IncidentCollection, IncidentFeature
from swale.api.params import DEFAULT_LIMIT, MAX_LIMIT, decode_cursor, feature_key, parse_bbox, require_utc, split_list
from swale.api.problems import Problem
from swale.core.timeutil import iso_z, utcnow
from swale.core.trust import Verification
from swale.db import queries as q
from swale.ingest.taxonomy_311 import CATEGORY_LABELS

router = APIRouter()
DEFAULT_LOOKBACK = timedelta(days=365)


@router.get("/incidents", response_model=IncidentCollection)
def list_incidents(
    bbox: str = Query(..., description="minLon,minLat,maxLon,maxLat (WGS84)"),
    category: str | None = Query(None, description="comma-separated categories"),
    verification: str | None = Query(None, description="comma-separated verification statuses"),
    since: datetime | None = Query(None, description="ISO-8601 with offset; default 365 days ago"),
    until: datetime | None = Query(None, description="ISO-8601 with offset"),
    basin: str | None = Query(None, description="a catch_basin id; only incidents linked to it"),
    limit: int = Query(DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
    cursor: str | None = Query(None, description="meta.next_cursor from the previous page"),
    db: Any = Depends(get_db),
) -> dict[str, Any]:
    box = parse_bbox(bbox)
    categories = split_list(category, allowed=CATEGORY_LABELS, param="category")
    statuses = split_list(verification, allowed=[v.value for v in Verification], param="verification")
    since_utc = require_utc(since, "since") or utcnow() - DEFAULT_LOOKBACK
    until_utc = require_utc(until, "until")
    basin_key = feature_key(basin, "catch_basin", param="basin") if basin else None
    where, params = q.incident_filters(categories=categories, statuses=statuses, since=since_utc, until=until_utc, basin=basin_key)
    page = q.page_in_bbox(db, "incident", box, limit=limit, after=decode_cursor(cursor), where=where, vars=params, fetch_links=True)
    filters = {"category": categories or None, "verification": statuses or None, "since": iso_z(since_utc), "until": iso_z(until_utc), "basin": basin}
    sources = [s for s in freshness(q.data_sources(db)) if s["id"] == "nyc311"]
    return collection([incident_feature(r) for r in page.records], layer="incidents", bbox=box,
                      filters={k: v for k, v in filters.items() if v is not None}, limit=limit, next_after=page.next_after, sources=sources)


@router.get("/incidents/{incident_id}", response_model=IncidentFeature)
def get_incident(incident_id: str, db: Any = Depends(get_db)) -> dict[str, Any]:
    rec = q.get_record(db, "incident", feature_key(incident_id, "incident"), fetch_links=True)
    if rec is None:
        raise Problem(404, "not-found", "Not found", f"no incident with id {incident_id}")
    return incident_feature(rec, include_source_fields=True)
