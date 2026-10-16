"""Inspection priorities: rule-based scores with their factors and evidence (inferred)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Query

from swale.api.deps import get_db
from swale.api.geojson import API_VERSION, collection, freshness
from swale.api.models import LayerCollection
from swale.api.params import feature_key, parse_bbox
from swale.api.problems import Problem
from swale.core.timeutil import iso_z, utcnow
from swale.db import queries as q
from swale.db.geometry import to_geojson
from swale.risk.ranking import CAVEATS, METHOD_VERSION, methodology, rank

router = APIRouter()


@router.get("/risk-rankings/methodology")
def get_methodology() -> dict[str, Any]:
    return {"api_version": API_VERSION, **methodology()}


@router.get("/risk-rankings", response_model=LayerCollection)
def risk_rankings(
    bbox: str = Query(..., description="minLon,minLat,maxLon,maxLat (WGS84)"),
    run_id: str | None = Query(None, description="a succeeded simulation_run id; adds the predicted_flooding factor"),
    limit: int = Query(50, ge=1, le=500),
    db: Any = Depends(get_db),
) -> dict[str, Any]:
    box = parse_bbox(bbox)
    run_key = None
    if run_id:
        run_key = feature_key(run_id, "simulation_run", param="run_id")
        run_rec = q.get_record(db, "simulation_run", run_key)
        if run_rec is None:
            raise Problem(404, "not-found", "Not found", f"no simulation run {run_id}")
        if run_rec["status"] != "succeeded":
            raise Problem(409, "run-not-finished", "Run not finished", f"run {run_id} is {run_rec['status']}")
    now = utcnow()
    out = rank(db, box, now=now, run_key=run_key, limit=limit)
    features = []
    for item in out["items"]:
        b = item["basin"]
        features.append({
            "type": "Feature",
            "id": f"risk:{b['id'].id}",
            "geometry": to_geojson(b["geom"]),
            "properties": {
                "layer": "risk_rankings", "knowledge_type": "inferred", "basin_id": str(b["id"]), "unitid": b["unitid"],
                "area_ids": b["area_ids"], "rank": item["rank"], "score": item["score"], "tier": item["tier"],
                "method_version": METHOD_VERSION, "assessed_at": iso_z(now), "run_id": run_id,
                "factors": item["factors"], "missing_factors": item["missing_factors"], "caveats": CAVEATS,
            },
        })
    body = collection(features, layer="risk_rankings", bbox=box, filters={"run_id": run_id} if run_id else {}, limit=limit,
                      next_after=None, sources=freshness(q.data_sources(db)))
    body["meta"]["ranked"] = out.get("ranked", 0)
    return body
