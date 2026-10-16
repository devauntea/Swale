"""Subway: stations and entrances (observed), live trains, delays and alerts, station flood exposure (inferred)
and street danger zones (predicted or observed)."""

from __future__ import annotations

import threading
from datetime import timedelta
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, Query

from swale.api.deps import get_db
from swale.api.geojson import API_VERSION, collection, freshness
from swale.api.params import feature_key, parse_bbox
from swale.api.problems import Problem
from swale.config import BACKEND_DIR
from swale.core.geo import BBox
from swale.core.timeutil import iso_z, utcnow
from swale.db import queries as q
from swale.db.connection import run_one
from swale.db.geometry import to_geojson
from swale.transit import exposure, realtime
from swale.transit.schedule import Schedule

router = APIRouter()
POLL_EVERY = timedelta(seconds=60)
_schedules: dict[str, tuple[float, Schedule | None]] = {}
_sched_lock = threading.Lock()


def schedule_for(area_id: str, sample_dir: Path = BACKEND_DIR / "sample_data") -> Schedule | None:
    path = sample_dir / area_id.lower() / "subway_schedule.json.gz"
    mtime = path.stat().st_mtime if path.exists() else 0.0
    with _sched_lock:
        hit = _schedules.get(area_id)
        if hit and hit[0] == mtime:
            return hit[1]
        sched = Schedule.from_file(path)
        _schedules[area_id] = (mtime, sched)
        return sched


def _area(db: Any, area_id: str) -> dict[str, Any]:
    area = q.get_record(db, "area", area_id)
    if area is None:
        raise Problem(404, "not-found", "Not found", f"no area {area_id}")
    return area


def _run(db: Any, run_id: str | None) -> tuple[str | None, str | None]:
    if not run_id:
        return None, None
    key = feature_key(run_id, "simulation_run", param="run_id")
    run = q.get_record(db, "simulation_run", key)
    if run is None:
        raise Problem(404, "not-found", "Not found", f"no simulation run {run_id}")
    if run["status"] != "succeeded":
        raise Problem(409, "run-not-finished", "Run not finished", f"run {run_id} is {run['status']}")
    scen = q.get_record(db, "rainfall_scenario", run["scenario"].id)
    return key, (scen or {}).get("name")


def _weather(area: dict[str, Any]) -> dict[str, Any] | None:
    from swale.weather.nws import weather_now

    w, s, e, n = area["bbox"]
    try:
        return weather_now((s + n) / 2, (w + e) / 2, hours=24)
    except Exception:  # noqa: BLE001 - the rain level then reads "unknown"
        return None


def _station_sources(db: Any) -> list[dict[str, Any]]:
    return [s for s in freshness(q.data_sources(db)) if s["id"] in ("mta_subway_stations", "mta_subway_entrances")]


@router.get("/subway/stations")
def list_stations(bbox: str = Query(..., description="minLon,minLat,maxLon,maxLat (WGS84)"), db: Any = Depends(get_db)) -> dict[str, Any]:
    box = parse_bbox(bbox)
    rows = q.page_in_bbox(db, "subway_station", box, limit=1000).records
    features = [{"type": "Feature", "id": f"subway_station:{r['gtfs_stop_id']}", "geometry": to_geojson(r["geom"]), "properties": {
        "layer": "subway_stations", "knowledge_type": "observed", "gtfs_stop_id": r["gtfs_stop_id"], "name": r["name"], "routes": r["routes"],
        "line": r.get("line"), "structure": r.get("structure"), "ada": r["ada"], "complex_id": r.get("complex_id"),
        "source": {"id": "mta_subway_stations", "dataset": "39hk-dx4f", "record_id": r["gtfs_stop_id"], "url": r["source_url"]},
    }} for r in rows]
    return collection(features, layer="subway_stations", bbox=box, filters={}, limit=1000, next_after=None, sources=_station_sources(db))


@router.get("/subway/entrances")
def list_entrances(bbox: str = Query(..., description="minLon,minLat,maxLon,maxLat (WGS84)"), db: Any = Depends(get_db)) -> dict[str, Any]:
    box = parse_bbox(bbox)
    rows = q.page_in_bbox(db, "subway_entrance", box, limit=5000).records
    features = [{"type": "Feature", "id": f"subway_entrance:{r['id'].id}", "geometry": to_geojson(r["geom"]), "properties": {
        "layer": "subway_entrances", "knowledge_type": "observed", "station_id": f"subway_station:{r['gtfs_stop_id']}", "station_name": r["station_name"],
        "routes": r["routes"], "entrance_type": r.get("entrance_type"), "entry_allowed": r["entry_allowed"], "exit_allowed": r["exit_allowed"],
        "source": {"id": "mta_subway_entrances", "dataset": "i9wp-a4ja", "record_id": r["gtfs_stop_id"], "url": r["source_url"]},
    }} for r in rows]
    return collection(features, layer="subway_entrances", bbox=box, filters={}, limit=5000, next_after=None, sources=_station_sources(db))


def live_board(db: Any, area_id: str) -> dict[str, Any]:
    area = _area(db, area_id)
    stations = q.page_in_bbox(db, "subway_station", BBox(*area["bbox"]), limit=1000).records
    if not stations:
        raise Problem(404, "not-found", "Not found", f"no subway stations loaded for {area_id} (run `swale transit-data`)")
    now = utcnow()
    out = realtime.live(stations, schedule_for(area_id), now=now)
    last = run_one(db, "SELECT polled_at FROM transit_poll WHERE area_id = $a ORDER BY polled_at DESC LIMIT 1;", {"a": area_id})
    if not last or now - last[0]["polled_at"] >= POLL_EVERY:
        q.upsert_many(db, "transit_poll", [(f"{area_id}_{now.strftime('%Y%m%dT%H%M%S')}", {
            "area_id": area_id, "polled_at": now, "feed_times": out["feed_times"], "errors": out["errors"],
            "alerts": [{k: a[k] for k in ("id", "alert_type", "routes", "stops", "mentions_flooding", "header")} for a in out["alerts"]],
            "stations": [{"gtfs_stop_id": s["gtfs_stop_id"], "status": s["status"], "predicted": s["trains_next_30_min"]["predicted"],
                          "scheduled": s["trains_next_30_min"]["scheduled"], "median_delay_min": s["delay_min"]["median"],
                          "max_delay_min": s["delay_min"]["max"]} for s in out["stations"]],
        })])
    return out


@router.get("/subway/live")
def subway_live(area_id: str = Query("BK0601"), db: Any = Depends(get_db)) -> dict[str, Any]:
    return {"api_version": API_VERSION, "area_id": area_id, **live_board(db, area_id)}


@router.get("/subway/history")
def subway_history(area_id: str = Query("BK0601"), hours: int = Query(6, ge=1, le=72), db: Any = Depends(get_db)) -> dict[str, Any]:
    since = utcnow() - timedelta(hours=hours)
    rows = run_one(db, "SELECT polled_at, stations, alerts FROM transit_poll WHERE area_id = $a AND polled_at >= $since ORDER BY polled_at;",
                   {"a": area_id, "since": since})
    polls = [{"polled_at": iso_z(r["polled_at"]),
              "delayed": sum(s["status"] == "delayed" for s in r["stations"]),
              "flooding_reported": sum(s["status"] == "flooding_reported" for s in r["stations"]),
              "alerts": len(r["alerts"]), "stations": r["stations"]} for r in rows]
    return {"api_version": API_VERSION, "area_id": area_id, "hours": hours, "polls": polls,
            "note": "One row per minute at most, recorded whenever /subway/live is called."}


@router.get("/subway/flood-exposure")
def flood_exposure(
    area_id: str = Query("BK0601"),
    run_id: str | None = Query(None, description="a succeeded simulation_run id; adds simulated ponding at entrances"),
    live: bool = Query(True, description="merge live MTA status and the NWS rain level"),
    db: Any = Depends(get_db),
) -> dict[str, Any]:
    area = _area(db, area_id)
    box = BBox(*area["bbox"])
    run_key, _ = _run(db, run_id)
    now = utcnow()
    out = exposure.station_exposure(db, box, now=now, run_key=run_key)
    board = {}
    errors: list[str] = []
    if live:
        try:
            lb = live_board(db, area_id)
            board, errors = {s["gtfs_stop_id"]: s for s in lb["stations"]}, lb["errors"]
        except Exception as exc:  # noqa: BLE001 - exposure stands on its own when MTA is unreachable
            errors.append(f"live: {type(exc).__name__}: {exc}")
    rain = exposure.rain_level(_weather(area)) if live else exposure.rain_level(None)
    features = []
    for rank_n, it in enumerate(out["items"], start=1):
        s = it["station"]
        lb = board.get(s["gtfs_stop_id"])
        features.append({"type": "Feature", "id": f"station_exposure:{s['gtfs_stop_id']}", "geometry": to_geojson(s["geom"]), "properties": {
            "layer": "station_flood_exposure", "knowledge_type": "inferred", "station_id": f"subway_station:{s['gtfs_stop_id']}", "name": s["name"], "routes": s["routes"],
            "rank": rank_n, "score": it["score"], "tier": it["tier"], "method_version": out["method_version"], "assessed_at": iso_z(now),
            "run_id": run_id, "entrances": len(it["entrances"]), "factors": it["factors"], "missing_factors": it["missing_factors"],
            "live": {"status": lb["status"], "reasons": lb["reasons"], "trains_next_30_min": lb["trains_next_30_min"],
                     "delay_min": lb["delay_min"], "alert_ids": lb["alert_ids"]} if lb else None,
            "caveats": exposure.CAVEATS,
        }})
    body = collection(features, layer="station_flood_exposure", bbox=box, filters={"run_id": run_id} if run_id else {}, limit=len(features),
                      next_after=None, sources=freshness(q.data_sources(db)))
    body["meta"].update({"rain": rain, "errors": errors,
                         "methodology": {k: {"label": v[0], "weight": v[1], "knowledge_type": v[2], "definition": v[3]} for k, v in exposure.FACTORS.items()}})
    return body


@router.get("/danger-zones")
def get_danger_zones(
    area_id: str = Query("BK0601"),
    run_id: str | None = Query(None, description="a succeeded simulation_run id; adds Swale-simulated zones"),
    weather: bool = Query(True, description="add the NWS rain level"),
    db: Any = Depends(get_db),
) -> dict[str, Any]:
    area = _area(db, area_id)
    box = BBox(*area["bbox"])
    run_key, label = _run(db, run_id)
    now = utcnow()
    zones = exposure.danger_zones(db, box, now=now, run_key=run_key, run_label=label)
    features = [{"type": "Feature", "id": z["id"], "geometry": z["geometry"], "properties": {
        "layer": "danger_zones", **{k: v for k, v in z.items() if k not in ("id", "geometry")}, "entrance_count": len(z["entrances"]),
    }} for z in zones]
    body = collection(features, layer="danger_zones", bbox=box, filters={"run_id": run_id} if run_id else {}, limit=len(features),
                      next_after=None, sources=freshness(q.data_sources(db)))
    stations_at_risk = sorted({e["station_name"] for z in zones if z["level"] == "high" for e in z["entrances"]})
    body["meta"].update({
        "rain": exposure.rain_level(_weather(area) if weather else None),
        "summary": {"zones": len(zones), "high": sum(z["level"] == "high" for z in zones),
                    "with_subway_entrances": sum(bool(z["entrances"]) for z in zones), "stations_with_entrances_in_high_zones": stations_at_risk},
        "note": "Zones show where street flooding is mapped (DEP), simulated (Swale) or has been measured (FloodNet). "
                "They are not live flood extents; meta.rain says how today's forecast compares with the storms they assume.",
    })
    return body
