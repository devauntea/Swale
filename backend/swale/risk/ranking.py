"""Rule-based inspection priority for catch basins (method risk-v1).

Every factor is a 0-1 value with a knowledge type and the evidence IDs behind it. A basin's
score is 100 * sum(weight * value) / sum(weight) over the factors that have data; factors
without data are listed as missing, never counted as zero. No AI is involved in scoring.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any

import shapely

from swale.core.geo import BBox, to_state_plane
from swale.core.timeutil import iso_z
from swale.db import queries as q

METHOD_VERSION = "risk-v1"
LOOKBACK = timedelta(days=730)
HALF_LIFE_DAYS = 180.0
SENSOR_RADIUS_FT = 500.0
MARGIN_DEG = 0.003  # pad the bbox so links and sensors just outside the view still count (~250-330 m)
FLOOD_CATEGORIES = {"catch_basin_clogged", "street_flooding", "highway_flooding", "sewer_backup", "manhole_overflow"}
PREDICTED_VALUE = {"deep": 1.0, "nuisance": 0.6, "minor": 0.25}


@dataclass(frozen=True)
class Factor:
    id: str
    label: str
    weight: float
    knowledge_type: str
    definition: str


FACTORS = (
    Factor("confirmed_obstruction_history", "DEP found this basin obstructed", 0.30, "observed",
           "DEP resolutions recording an obstruction on complaints linked to this basin (link inferred, within 150 ft), "
           "last 24 months, recency-weighted (180-day half-life): value = 1 - exp(-weighted count)."),
    Factor("predicted_flooding", "Floods in the selected simulation", 0.25, "predicted",
           "Risk class of this basin in the chosen SWMM demonstrator run: deep 1.0, nuisance 0.6, minor 0.25, not flooded 0. "
           "Missing when no run is selected."),
    Factor("observed_flooding_nearby", "FloodNet measured street flooding nearby", 0.20, "observed",
           "Deepest flood in the last 24 months at a non-tidal FloodNet sensor within 500 ft: value = min(1, depth / 12 in). "
           "Missing when no sensor is within 500 ft."),
    Factor("recent_flood_reports", "Recent flooding and clogged-basin reports", 0.15, "reported",
           "311 complaints about clogged basins, street or highway flooding, sewer backups or manhole overflows linked to this "
           "basin, last 24 months, recency-weighted: value = 1 - exp(-weighted count / 3)."),
    Factor("confirmed_surcharge_history", "DEP confirmed rain overwhelmed the sewer here", 0.10, "observed",
           "DEP resolutions confirming surcharge due to rain on complaints linked to this basin, last 24 months, "
           "recency-weighted: value = 1 - exp(-weighted count)."),
)
TIERS = {"high": 50.0, "medium": 25.0}
CAVEATS = [
    "Decision support, not an engineering assessment or an official alert.",
    "Complaints are reports; only DEP's own resolution text counts as a confirmed obstruction.",
    "Simulation results come from a schematic, uncalibrated model and are predictions, not observations.",
]


def methodology() -> dict[str, Any]:
    return {
        "method_version": METHOD_VERSION,
        "factors": [{"id": f.id, "label": f.label, "weight": f.weight, "knowledge_type": f.knowledge_type, "definition": f.definition} for f in FACTORS],
        "score": "100 * sum(weight * value) / sum(weight) over factors with data",
        "tiers": {"high": ">= 50", "medium": ">= 25", "low": "< 25"},
        "lookback_days": LOOKBACK.days,
        "caveats": CAVEATS,
    }


def _recency(at: datetime, now: datetime) -> float:
    return 0.5 ** (max((now - at).total_seconds(), 0) / 86400 / HALF_LIFE_DAYS)


def rank(db: Any, bbox: BBox, *, now: datetime, run_key: str | None = None, limit: int = 50) -> dict[str, Any]:
    since = now - LOOKBACK
    padded = BBox(bbox.w - MARGIN_DEG, bbox.s - MARGIN_DEG, bbox.e + MARGIN_DEG, bbox.n + MARGIN_DEG)
    basins = q.page_in_bbox(db, "catch_basin", bbox, limit=20000).records
    if not basins:
        return {"items": [], "data_as_of": {}}
    keys = [b["id"].id for b in basins]

    # Linked complaints (incidents near the view, with their nearest-basin link).
    where, params = q.incident_filters(since=since)
    incidents = q.page_in_bbox(db, "incident", padded, limit=100000, where=where, vars=params, fetch_links=True).records
    by_basin: dict[str, list[dict[str, Any]]] = {}
    for inc in incidents:
        for link in inc.get("links") or []:
            by_basin.setdefault(link["out"].id, []).append(inc)

    # FloodNet sensors near each basin (non-tidal only), with their deepest recent event.
    sensors = [s for s in q.page_in_bbox(db, "sensor", padded, limit=1000).records if not s.get("tidally_influenced")]
    stats = q.flood_event_stats(db, [s["sensor_id"] for s in sensors], since)
    sensors = [s for s in sensors if s["sensor_id"] in stats]
    sensor_near: dict[str, list[tuple[dict[str, Any], float]]] = {}
    if sensors:
        sx, sy = to_state_plane([s["lon"] for s in sensors], [s["lat"] for s in sensors])
        bx, by = to_state_plane([b["lon"] for b in basins], [b["lat"] for b in basins])
        tree = shapely.STRtree(shapely.points(sx, sy))
        (bi, si), dist = tree.query_nearest(shapely.points(bx, by), max_distance=SENSOR_RADIUS_FT, return_distance=True, all_matches=True)
        for i, j, d in zip(bi, si, dist):
            sensor_near.setdefault(keys[i], []).append((sensors[j], float(d)))

    # Predicted flooding from the chosen run.
    results: dict[str, dict[str, Any]] = {}
    if run_key:
        run_rec = q.rid("simulation_run", run_key)
        for r in q.page_in_bbox(db, "flood_result", bbox, limit=20000, where="run = $run", vars={"run": run_rec}).records:
            results[r["basin"].id] = r

    items = []
    for b in basins:
        key = b["id"].id
        linked = by_basin.get(key, [])
        factors, missing = [], []

        def add(fid: str, value: float, evidence: list[str], explanation: str, unit: str | None = None) -> None:
            f = next(x for x in FACTORS if x.id == fid)
            factors.append({"id": fid, "label": f.label, "knowledge_type": f.knowledge_type, "value": round(value, 3), "unit": unit,
                            "weight": f.weight, "contribution": 0.0, "evidence_ids": evidence, "explanation": explanation})

        found = sorted((i for i in linked if i["verification_status"] == "agency_found_obstruction"), key=lambda i: i["reported_at"], reverse=True)
        w = sum(_recency(i["reported_at"], now) for i in found)
        add("confirmed_obstruction_history", 1 - math.exp(-w), [str(i["id"]) for i in found[:5]],
            f"{len(found)} DEP obstruction finding(s) in 24 months" + (f", latest {iso_z(found[0]['reported_at'])[:10]}" if found else ""))

        if run_key:
            r = results.get(key)
            add("predicted_flooding", PREDICTED_VALUE.get(r["risk_class"], 0.0) if r else 0.0, [str(r["id"])] if r else [],
                f"{r['risk_class']} ponding ({r['max_ponded_depth_in']} in, {r['flood_volume_ft3']} ft³) in the selected run" if r else "Not flooded in the selected run")
        else:
            missing.append({"id": "predicted_flooding", "reason": "no simulation run selected (pass run_id)"})

        near = sensor_near.get(key, [])
        if near:
            best_sensor, best_dist = max(near, key=lambda sd: stats[sd[0]["sensor_id"]]["max_depth_in"])
            depth = float(stats[best_sensor["sensor_id"]]["max_depth_in"])
            add("observed_flooding_nearby", min(1.0, depth / 12.0), [str(best_sensor["id"])],
                f"FloodNet sensor {best_sensor['name']} ({best_dist:.0f} ft away) measured up to {depth:.1f} in", "in")
        else:
            missing.append({"id": "observed_flooding_nearby", "reason": "no non-tidal FloodNet sensor with recent events within 500 ft"})

        reports = sorted((i for i in linked if i["category"] in FLOOD_CATEGORIES), key=lambda i: i["reported_at"], reverse=True)
        w = sum(_recency(i["reported_at"], now) for i in reports)
        add("recent_flood_reports", 1 - math.exp(-w / 3), [str(i["id"]) for i in reports[:5]], f"{len(reports)} flood-related report(s) in 24 months")

        surcharge = sorted((i for i in linked if i["verification_status"] == "capacity_surcharge"), key=lambda i: i["reported_at"], reverse=True)
        w = sum(_recency(i["reported_at"], now) for i in surcharge)
        add("confirmed_surcharge_history", 1 - math.exp(-w), [str(i["id"]) for i in surcharge[:5]], f"{len(surcharge)} DEP-confirmed rain surcharge(s) in 24 months")

        total_w = sum(f["weight"] for f in factors)
        for f in factors:
            f["contribution"] = round(100 * f["weight"] * f["value"] / total_w, 2)
        score = round(sum(f["contribution"] for f in factors), 1)
        items.append({"basin": b, "score": score, "factors": factors, "missing_factors": missing})

    items.sort(key=lambda it: (-it["score"], it["basin"]["id"].id))
    for n, it in enumerate(items, start=1):
        it["rank"] = n
        it["tier"] = "high" if it["score"] >= TIERS["high"] else "medium" if it["score"] >= TIERS["medium"] else "low"
    return {"items": items[:limit], "ranked": len(items)}
