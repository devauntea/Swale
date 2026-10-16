"""Temporal-holdout validation of the ranking against what actually happened afterwards.

Rank every basin as of a cutoff date using only evidence from before it, then check the
following window for real outcomes: a new DEP-confirmed obstruction at the basin, a new
flood-related 311 report linked to it, or a FloodNet sensor within 500 ft measuring a flood.
Report precision at several cut-offs against the area-wide base rate (lift). Simulation
results are left out: they have no date and would leak.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

from swale.core.geo import BBox, to_state_plane
from swale.db import queries as q
from swale.risk.ranking import FLOOD_CATEGORIES, METHOD_VERSION, SENSOR_RADIUS_FT, rank

OUTCOMES = {
    "dep_obstruction": "DEP's resolution recorded an obstruction at the basin",
    "flood_report": "a flood-related 311 report was linked to the basin",
    "measured_flood": "a non-tidal FloodNet sensor within 500 ft measured a flood",
}


def _outcomes(db: Any, bbox: BBox, keys: list[str], basins: dict[str, dict[str, Any]], start: datetime, end: datetime) -> dict[str, dict[str, bool]]:
    hits = {k: {o: False for o in OUTCOMES} for k in keys}
    where, params = q.incident_filters(since=start, until=end)
    for inc in q.page_in_bbox(db, "incident", bbox, limit=100000, where=where, vars=params, fetch_links=True).records:
        for link in inc.get("links") or []:
            key = link["out"].id
            if key not in hits:
                continue
            if inc["verification_status"] == "agency_found_obstruction":
                hits[key]["dep_obstruction"] = True
            if inc["category"] in FLOOD_CATEGORIES:
                hits[key]["flood_report"] = True
    sensors = [s for s in q.page_in_bbox(db, "sensor", bbox, limit=1000).records if not s.get("tidally_influenced")]
    flooded = q.flood_event_stats(db, [s["sensor_id"] for s in sensors], start, end)
    wet = [s for s in sensors if s["sensor_id"] in flooded]
    if wet:
        import shapely

        sx, sy = to_state_plane([s["lon"] for s in wet], [s["lat"] for s in wet])
        bx, by = to_state_plane([basins[k]["lon"] for k in keys], [basins[k]["lat"] for k in keys])
        tree = shapely.STRtree(shapely.points(sx, sy))
        idx, _ = tree.query_nearest(shapely.points(bx, by), max_distance=SENSOR_RADIUS_FT, return_distance=True)
        for i in set(idx[0].tolist()):
            hits[keys[i]]["measured_flood"] = True
    return hits


def validate(db: Any, bbox: BBox, *, cutoff: datetime, window_days: int = 365, cutoffs: tuple[int, ...] = (10, 25, 50, 100)) -> dict[str, Any]:
    end = cutoff + timedelta(days=window_days)
    ranked = rank(db, bbox, now=cutoff, limit=100000)["items"]
    keys = [it["basin"]["id"].id for it in ranked]
    basins = {it["basin"]["id"].id: it["basin"] for it in ranked}
    hits = _outcomes(db, bbox, keys, basins, cutoff, end)
    any_hit = {k: any(v.values()) for k, v in hits.items()}
    n = len(keys)
    base = {o: sum(hits[k][o] for k in keys) / n for o in OUTCOMES} if n else {}
    base["any"] = sum(any_hit.values()) / n if n else 0.0
    scored = [k for k, it in zip(keys, ranked) if it["score"] > 0]
    rows = []
    for top in cutoffs:
        if top > len(scored):
            continue
        sel = keys[:top]
        row = {"top_n": top, "any": sum(any_hit[k] for k in sel) / top}
        row.update({o: sum(hits[k][o] for k in sel) / top for o in OUTCOMES})
        row["lift_any"] = round(row["any"] / base["any"], 2) if base["any"] else None
        rows.append({k: (round(v, 3) if isinstance(v, float) else v) for k, v in row.items()})
    return {
        "method_version": METHOD_VERSION,
        "cutoff": cutoff.isoformat().replace("+00:00", "Z"),
        "window_end": end.isoformat().replace("+00:00", "Z"),
        "basins_ranked": n,
        "basins_with_evidence_at_cutoff": len(scored),
        "outcomes": OUTCOMES,
        "base_rate": {k: round(v, 3) for k, v in base.items()},
        "precision_at": rows,
        "notes": [
            "Ranks use only evidence dated before the cutoff; outcomes come only from after it.",
            "The simulation factor is excluded (results have no date), so this validates the evidence-based part of the score.",
            "Sample sizes are small; treat lift as indicative, not proof.",
        ],
    }
