"""Catch basins: the observed DEP inventory."""

from __future__ import annotations

from typing import Any
from urllib.parse import quote

from fastapi import APIRouter, Depends, Query

from swale.api.deps import get_db
from swale.api.geojson import catch_basin_feature, collection, freshness
from swale.api.models import CatchBasinCollection, CatchBasinFeature
from swale.api.params import DEFAULT_LIMIT, MAX_LIMIT, decode_cursor, feature_key, parse_bbox
from swale.api.problems import Problem
from swale.db import queries as q

router = APIRouter()


@router.get("/catch-basins", response_model=CatchBasinCollection)
def list_catch_basins(
    bbox: str = Query(..., description="minLon,minLat,maxLon,maxLat (WGS84)"),
    limit: int = Query(DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
    cursor: str | None = Query(None, description="meta.next_cursor from the previous page"),
    db: Any = Depends(get_db),
) -> dict[str, Any]:
    box = parse_bbox(bbox)
    page = q.page_in_bbox(db, "catch_basin", box, limit=limit, after=decode_cursor(cursor))
    sources = [s for s in freshness(q.data_sources(db)) if s["id"] == "nyc_catch_basins"]
    return collection([catch_basin_feature(r) for r in page.records], layer="catch_basins", bbox=box, filters={},
                      limit=limit, next_after=page.next_after, sources=sources)


@router.get("/catch-basins/{basin_id}", response_model=CatchBasinFeature)
def get_catch_basin(basin_id: str, db: Any = Depends(get_db)) -> dict[str, Any]:
    rec = q.get_record(db, "catch_basin", feature_key(basin_id, "catch_basin"))
    if rec is None:
        raise Problem(404, "not-found", "Not found", f"no catch basin with id {basin_id}")
    feature = catch_basin_feature(rec)
    feature["links"] = {"incidents": f"/api/v1/incidents?basin={quote(feature['id'])}"}
    return feature
