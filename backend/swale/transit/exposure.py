"""Subway station flood exposure and street danger zones.

Exposure is measured at street entrances, where water gets into the subway. It is rule-based like the
basin ranking: each factor is a 0-1 value with a knowledge type and the evidence behind it, and factors
without data are listed as missing, never counted as zero. A score describes exposure in heavy rain,
not current flooding; live conditions come from MTA alerts and the weather.

Danger zones are the places where flooding is mapped, simulated or has been measured, with the
subway entrances inside each one.
"""

from __future__ import annotations

import math
from datetime import datetime
from typing import Any

import numpy as np
import shapely
import shapely.geometry
from shapely.ops import unary_union

from swale.core.geo import BBox, _transformer, to_state_plane
from swale.core.timeutil import iso_z
from swale.db import queries as q
from swale.db.geometry import to_geojson
from swale.risk.ranking import FLOOD_CATEGORIES, HALF_LIFE_DAYS, LOOKBACK, PREDICTED_VALUE

METHOD_VERSION = "station-exposure-v1"
MARGIN_DEG = 0.003
DEP_SCENARIO = "dep_moderate_current"
DEP_NEAR_FT = 30.0
SENSOR_FT = 500.0
REPORT_FT = 300.0
SIM_FT = 150.0
SIM_ZONE_BUFFER_FT = 60.0
MEASURED_ZONE_FT = 250.0
DEP_VALUE = {"deep": 1.0, "nuisance": 0.5}
FACTORS = {  # id: (label, weight, knowledge type, definition)
    "dep_flood_map_at_entrance": ("Entrance inside DEP's mapped flooding", 0.30, "predicted",
                                  "Any entrance within 30 ft of NYC DEP's Moderate-storm (2.13 in/hr) flood map: deep 1.0, nuisance 0.5, outside 0."),
    "measured_flooding_nearby": ("FloodNet measured flooding near an entrance", 0.30, "observed",
                                 "Deepest flood in 24 months at a non-tidal FloodNet sensor within 500 ft of an entrance: min(1, depth / 12 in). "
                                 "Missing when no sensor is that close."),
    "flood_reports_nearby": ("Flooding reports near the entrances", 0.20, "reported",
                             "311 flooding, clogged-basin, sewer-backup and manhole-overflow reports within 300 ft of an entrance, "
                             "24 months, recency-weighted: 1 - exp(-weighted count / 5)."),
    "simulated_ponding_at_entrance": ("Simulated ponding at an entrance", 0.20, "predicted",
                                      "Worst risk class of catch basins within 150 ft of an entrance in the selected Swale run: "
                                      "deep 1.0, nuisance 0.6, minor 0.25. Missing when no run is selected."),
}
TIERS = {"high": 50.0, "medium": 25.0}
CAVEATS = [
    "Exposure in heavy rain, not current flooding. MTA does not publish station flood sensors.",
    "Entrance positions come from MTA's 2024 inventory; entrance height and flood barriers are not public.",
    "DEP's map and Swale's simulation are models; FloodNet depths are street measurements, not inside stations.",
]
# Swale rule for how close today's rain is to the storms these zones assume. NYC DEP says most of the city's
# sewers were built to carry about 1.75 in/hr; 0.5 in/hr is Swale's own early-warning threshold.
SEWER_DESIGN_IN_HR = 1.75
WATCH_IN_HR = 0.5
FLOOD_ALERT_WORDS = ("Flash Flood", "Flood", "Coastal Flood")


def _sp(lons: list[float], lats: list[float]) -> Any:
    x, y = to_state_plane(lons, lats)
    return shapely.points(x, y)


def _poly_sp(geojson: dict[str, Any]) -> Any:
    tr = _transformer("EPSG:4326", "EPSG:2263")
    return shapely.transform(shapely.geometry.shape(geojson), lambda xy: np.column_stack(tr.transform(xy[:, 0], xy[:, 1])))


def _poly_wgs(geom_sp: Any) -> dict[str, Any]:
    tr = _transformer("EPSG:2263", "EPSG:4326")
    return shapely.geometry.mapping(shapely.transform(geom_sp, lambda xy: np.column_stack(tr.transform(xy[:, 0], xy[:, 1]))))


def _recency(at: datetime, now: datetime) -> float:
    return 0.5 ** (max((now - at).total_seconds(), 0) / 86400 / HALF_LIFE_DAYS)


def _context(db: Any, bbox: BBox, now: datetime, run_key: str | None) -> dict[str, Any]:
    padded = BBox(bbox.w - MARGIN_DEG, bbox.s - MARGIN_DEG, bbox.e + MARGIN_DEG, bbox.n + MARGIN_DEG)
    from swale.db.connection import run_one
    from swale.ingest.dep_flood_maps import features_in_bbox

    dep_loaded = bool(run_one(db, "SELECT id FROM flood_map_feature WHERE scenario_code = $sc LIMIT 1;", {"sc": DEP_SCENARIO}))
    dep = [p for p in features_in_bbox(db, DEP_SCENARIO, padded) if p["depth_class"] in DEP_VALUE] if dep_loaded else []
    sensors = [s for s in q.page_in_bbox(db, "sensor", padded, limit=1000).records if not s.get("tidally_influenced")]
    stats = q.flood_event_stats(db, [s["sensor_id"] for s in sensors], now - LOOKBACK, now)
    sensors = [s for s in sensors if s["sensor_id"] in stats]
    where, params = q.incident_filters(categories=FLOOD_CATEGORIES, since=now - LOOKBACK, until=now)
    reports = q.page_in_bbox(db, "incident", padded, limit=100000, where=where, vars=params).records
    results = []
    if run_key:
        results = q.page_in_bbox(db, "flood_result", padded, limit=20000, where="run = $run",
                                 vars={"run": q.rid("simulation_run", run_key)}).records
    return {"dep_loaded": dep_loaded, "dep": dep, "dep_sp": [_poly_sp(to_geojson(p["geom"])) for p in dep],
            "sensors": sensors, "stats": stats, "reports": reports, "results": results}


def station_exposure(db: Any, bbox: BBox, *, now: datetime, run_key: str | None = None) -> dict[str, Any]:
    stations = q.page_in_bbox(db, "subway_station", bbox, limit=1000).records
    entrances = q.page_in_bbox(db, "subway_entrance", BBox(bbox.w - MARGIN_DEG, bbox.s - MARGIN_DEG, bbox.e + MARGIN_DEG, bbox.n + MARGIN_DEG),
                               limit=5000).records
    if not stations:
        return {"items": [], "method_version": METHOD_VERSION}
    ctx = _context(db, bbox, now, run_key)
    by_station: dict[str, list[dict[str, Any]]] = {}
    for e in entrances:
        by_station.setdefault(e["gtfs_stop_id"], []).append(e)

    items = []
    for s in stations:
        sid = s["gtfs_stop_id"]
        ents = by_station.get(sid) or [{"id": s["id"], "lon": s["lon"], "lat": s["lat"], "_station_point": True}]
        pts = _sp([e["lon"] for e in ents], [e["lat"] for e in ents])
        factors, missing = [], []

        def add(fid: str, value: float, evidence: list[str], explanation: str) -> None:
            label, weight, kt, _ = FACTORS[fid]
            factors.append({"id": fid, "label": label, "knowledge_type": kt, "value": round(value, 3), "weight": weight,
                            "contribution": 0.0, "evidence_ids": evidence, "explanation": explanation})

        # DEP's mapped flooding at the entrances.
        if ctx["dep_loaded"]:
            hits: list[tuple[int, int]] = []
            if ctx["dep_sp"]:
                ei, pi = shapely.STRtree(ctx["dep_sp"]).query(pts, predicate="dwithin", distance=DEP_NEAR_FT)
                hits = list(zip(ei.tolist(), pi.tolist()))
            best = max((DEP_VALUE[ctx["dep"][p]["depth_class"]] for _, p in hits), default=0.0)
            n_ent = len({e for e, _ in hits})
            add("dep_flood_map_at_entrance", best, sorted({str(ctx["dep"][p]["id"]) for _, p in hits})[:5],
                f"{n_ent} of {len(ents)} entrance(s) within {DEP_NEAR_FT:g} ft of DEP-mapped "
                f"{'deep' if best == 1.0 else 'nuisance' if best else ''} flooding".replace("  ", " ") if n_ent
                else f"None of {len(ents)} entrance(s) is inside DEP's mapped flooding")
        else:
            missing.append({"id": "dep_flood_map_at_entrance", "reason": "DEP Stormwater Flood Map not loaded (run `swale flood-maps`)"})

        # FloodNet measured floods near an entrance.
        near = []
        for sensor in ctx["sensors"]:
            d = float(shapely.distance(pts, _sp([sensor["lon"]], [sensor["lat"]])[0]).min())
            if d <= SENSOR_FT:
                near.append((sensor, d))
        if near:
            sensor, d = max(near, key=lambda sd: ctx["stats"][sd[0]["sensor_id"]]["max_depth_in"])
            depth = float(ctx["stats"][sensor["sensor_id"]]["max_depth_in"])
            add("measured_flooding_nearby", min(1.0, depth / 12.0), [str(sensor["id"])],
                f"FloodNet sensor {sensor['name']} ({d:.0f} ft from an entrance) measured up to {depth:.1f} in")
        else:
            missing.append({"id": "measured_flooding_nearby", "reason": "no non-tidal FloodNet sensor with recent floods within 500 ft"})

        # 311 flooding reports near an entrance.
        if ctx["reports"]:
            rp = _sp([r["lon"] for r in ctx["reports"]], [r["lat"] for r in ctx["reports"]])
            _, ri = shapely.STRtree(rp).query(pts, predicate="dwithin", distance=REPORT_FT)
            close = sorted({int(i) for i in ri.tolist()}, key=lambda i: ctx["reports"][i]["reported_at"], reverse=True)
        else:
            close = []
        w = sum(_recency(ctx["reports"][i]["reported_at"], now) for i in close)
        add("flood_reports_nearby", 1 - math.exp(-w / 5), [str(ctx["reports"][i]["id"]) for i in close[:5]],
            f"{len(close)} flooding-related 311 report(s) within {REPORT_FT:g} ft in 24 months")

        # Simulated ponding at basins near an entrance.
        if run_key:
            res = ctx["results"]
            worst, ev = 0.0, []
            if res:
                _, ri = shapely.STRtree(_sp([r["lon"] for r in res], [r["lat"] for r in res])).query(pts, predicate="dwithin", distance=SIM_FT)
                for i in set(ri.tolist()):
                    v = PREDICTED_VALUE.get(res[i]["risk_class"], 0.0)
                    if v > worst:
                        worst, ev = v, [str(res[i]["id"])]
            cls = next((k for k, v in PREDICTED_VALUE.items() if v == worst), None)
            add("simulated_ponding_at_entrance", worst, ev,
                f"Worst simulated ponding within {SIM_FT:g} ft of an entrance: {cls}" if cls else "No simulated ponding near the entrances")
        else:
            missing.append({"id": "simulated_ponding_at_entrance", "reason": "no simulation run selected (pass run_id)"})

        total_w = sum(f["weight"] for f in factors)
        for f in factors:
            f["contribution"] = round(100 * f["weight"] * f["value"] / total_w, 2) if total_w else 0.0
        score = round(sum(f["contribution"] for f in factors), 1)
        items.append({"station": s, "entrances": [e for e in ents if not e.get("_station_point")], "score": score,
                      "tier": "high" if score >= TIERS["high"] else "medium" if score >= TIERS["medium"] else "low",
                      "factors": factors, "missing_factors": missing})
    items.sort(key=lambda it: (-it["score"], it["station"]["gtfs_stop_id"]))
    return {"items": items, "method_version": METHOD_VERSION}


def rain_level(weather: dict[str, Any] | None) -> dict[str, Any]:
    """How close the forecast is to the storms the zones assume (Swale rule; see module constants)."""
    if not weather:
        return {"level": "unknown", "reason": "live weather not requested or unavailable"}
    peak = weather["forecast"]["peak_rate_in_hr"]
    alerts = [a for a in weather.get("alerts", []) if any(w in (a.get("event") or "") for w in FLOOD_ALERT_WORDS)]
    if any("Warning" in (a.get("event") or "") for a in alerts) or peak >= SEWER_DESIGN_IN_HR:
        level = "warning"
    elif alerts or peak >= WATCH_IN_HR:
        level = "watch"
    else:
        level = "low"
    return {"level": level, "forecast_peak_in_hr": peak, "peak_at": weather["forecast"].get("peak_at"),
            "flood_alerts": [a["event"] for a in alerts], "sewer_design_in_hr": SEWER_DESIGN_IN_HR, "watch_in_hr": WATCH_IN_HR,
            "rule": f"warning at {SEWER_DESIGN_IN_HR} in/hr (DEP's typical sewer design capacity) or an NWS flood warning; "
                    f"watch at {WATCH_IN_HR} in/hr or any NWS flood watch or advisory; otherwise low.",
            "observed_now": (weather.get("observation") or {}).get("description")}


def danger_zones(db: Any, bbox: BBox, *, now: datetime, run_key: str | None = None, run_label: str | None = None) -> list[dict[str, Any]]:
    """Zones where street flooding is mapped by DEP, simulated by Swale, or has been measured, with entrances inside."""
    ctx = _context(db, bbox, now, run_key)
    entrances = q.page_in_bbox(db, "subway_entrance", BBox(bbox.w - MARGIN_DEG, bbox.s - MARGIN_DEG, bbox.e + MARGIN_DEG, bbox.n + MARGIN_DEG),
                               limit=5000).records
    ent_pts = _sp([e["lon"] for e in entrances], [e["lat"] for e in entrances]) if entrances else None
    zones: list[dict[str, Any]] = []

    def entrances_in(geom_sp: Any, within_ft: float = 0.0) -> list[dict[str, Any]]:
        if ent_pts is None:
            return []
        inside = shapely.dwithin(ent_pts, geom_sp, within_ft)
        return [{"entrance_id": f"subway_entrance:{entrances[i]['id'].id}", "station_id": f"subway_station:{entrances[i]['gtfs_stop_id']}",
                 "station_name": entrances[i]["station_name"],
                 "routes": entrances[i]["routes"]} for i in np.flatnonzero(inside).tolist()]

    for p, g in zip(ctx["dep"], ctx["dep_sp"]):
        zones.append({"id": f"zone:{p['id'].id}", "zone_type": "dep_mapped", "knowledge_type": "predicted",
                      "level": "high" if p["depth_class"] == "deep" else "moderate", "geometry": to_geojson(p["geom"]),
                      "assumes": "a 2.13 in/hr storm (NYC DEP Moderate, current sea level)",
                      "explanation": f"NYC DEP maps {'deep and contiguous flooding (1 ft or more)' if p['depth_class'] == 'deep' else 'nuisance flooding (4 in to 1 ft)'} here",
                      "evidence_ids": [str(p["id"])], "entrances": entrances_in(g, DEP_NEAR_FT)})

    flooded = [r for r in ctx["results"] if r["risk_class"] in ("deep", "nuisance")]
    for cls in ("deep", "nuisance"):
        pts = [r for r in flooded if r["risk_class"] == cls]
        if not pts:
            continue
        merged = unary_union(shapely.buffer(_sp([r["lon"] for r in pts], [r["lat"] for r in pts]), SIM_ZONE_BUFFER_FT))
        for i, part in enumerate(shapely.get_parts(merged)):
            members = [str(r["id"]) for r in pts if part.contains(_sp([r["lon"]], [r["lat"]])[0])]
            zones.append({"id": f"zone:sim_{run_key}_{cls}_{i}", "zone_type": "swale_simulated", "knowledge_type": "predicted",
                          "level": "high" if cls == "deep" else "moderate", "geometry": _poly_wgs(part),
                          "assumes": run_label or "the selected Swale run",
                          "explanation": f"{len(members)} catch basin(s) pond {'12 in or more' if cls == 'deep' else '4 to 12 in'} in the Swale simulation",
                          "evidence_ids": members[:10], "entrances": entrances_in(part)})

    for s in ctx["sensors"]:
        depth = float(ctx["stats"][s["sensor_id"]]["max_depth_in"])
        if depth < 4:
            continue
        circle = shapely.buffer(_sp([s["lon"]], [s["lat"]])[0], MEASURED_ZONE_FT)
        zones.append({"id": f"zone:floodnet_{s['sensor_id']}", "zone_type": "measured", "knowledge_type": "observed",
                      "level": "high" if depth >= 12 else "moderate", "geometry": _poly_wgs(circle),
                      "assumes": "past storms (measured, last 24 months)",
                      "explanation": f"FloodNet sensor {s['name']} measured up to {depth:.1f} in of street flooding; zone is {MEASURED_ZONE_FT:g} ft around it",
                      "evidence_ids": [str(s["id"])], "entrances": entrances_in(circle),
                      "last_flood_at": iso_z(ctx["stats"][s["sensor_id"]]["last_event_at"]) if ctx["stats"][s["sensor_id"]].get("last_event_at") else None})
    order = {"high": 0, "moderate": 1}
    return sorted(zones, key=lambda z: (order[z["level"]], -len(z["entrances"]), z["id"]))

