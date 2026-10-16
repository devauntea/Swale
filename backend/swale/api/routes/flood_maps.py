"""DEP stormwater flood maps (an authoritative model: predicted) and comparison with Swale runs."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Query

from swale.api.deps import get_db
from swale.api.geojson import API_VERSION, collection, freshness
from swale.api.params import feature_key, parse_bbox
from swale.api.problems import Problem
from swale.core.timeutil import iso_z
from swale.db import queries as q
from swale.db.geometry import to_geojson
from swale.ingest import dep_flood_maps as dep

router = APIRouter()


@router.get("/flood-maps")
def list_flood_maps(
    bbox: str = Query(..., description="minLon,minLat,maxLon,maxLat (WGS84)"),
    scenario: str = Query("dep_moderate_current", description="dep_moderate_current | dep_moderate_2050 | dep_extreme_2080"),
    db: Any = Depends(get_db),
) -> dict[str, Any]:
    box = parse_bbox(bbox)
    rows = dep.features_in_bbox(db, scenario, box)
    features = [{
        "type": "Feature", "id": str(r["id"]), "geometry": to_geojson(r["geom"]),
        "properties": {"layer": "dep_flood_maps", "knowledge_type": "predicted", "scenario_code": r["scenario_code"],
                       "scenario_label": r["scenario_label"], "intensity_in_hr": r["intensity_in_hr"], "sea_level": r["sea_level"],
                       "depth_class": r["depth_class"], "category": r["category"], "area_ft2": r["area_ft2"],
                       "note": "NYC DEP model of potential flooding (areas of 0.25 acres or more), not observations.",
                       "source": {"id": dep.SOURCE.key, "dataset": "9i7c-xyvv", "record_id": scenario, "url": r["source_url"]},
                       "ingested_at": iso_z(r["ingested_at"])},
    } for r in rows]
    return collection(features, layer="dep_flood_maps", bbox=box, filters={"scenario": scenario}, limit=len(features), next_after=None,
                      sources=[s for s in freshness(q.data_sources(db)) if s["id"] == dep.SOURCE.key])


@router.get("/simulation-runs/{run_id}/compare-dep")
def compare_with_dep(run_id: str, db: Any = Depends(get_db)) -> dict[str, Any]:
    key = feature_key(run_id, "simulation_run")
    run = q.get_record(db, "simulation_run", key)
    if run is None:
        raise Problem(404, "not-found", "Not found", f"no simulation run {run_id}")
    if run["status"] != "succeeded":
        raise Problem(409, "run-not-finished", "Run not finished", f"run {run_id} is {run['status']}")
    scenario = q.get_record(db, "rainfall_scenario", run["scenario"].id)
    match = dep.MATCHING_MAP.get(scenario["peak_in_hr"]) if scenario and scenario["kind"] == "design_storm" else None
    if match is None:
        return {"api_version": API_VERSION, "available": False,
                "reason": "DEP publishes maps for 1.77, 2.13 and 3.66 in/hr only; the 3.66 map includes 2080 sea level rise, so it is not a like-for-like comparison."}
    return {"api_version": API_VERSION, "run_id": str(run["id"]), "scenario_label": scenario["name"], **dep.compare_run(db, key, run["area_id"], match)}
