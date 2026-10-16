"""MTA subway stations (data.ny.gov 39hk-dx4f) and entrances (i9wp-a4ja), clipped to an area.

Both are MTA inventory: where stations and street entrances are (observed). Entrances matter for flooding:
water gets into the subway through street-level stairs and vents, so exposure is measured at entrances.
"""

from __future__ import annotations

import gzip
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import httpx

from swale.core.geo import BBox
from swale.db import queries as q
from swale.db.connection import run
from swale.db.geometry import to_surreal
from swale.sources.registry import DataSource
from swale.sources.socrata import USER_AGENT

STATIONS = DataSource(
    key="mta_subway_stations", name="MTA Subway Stations", publisher="Metropolitan Transportation Authority (MTA)",
    dataset="39hk-dx4f", id_column="gtfs_stop_id", cadence="As needed", crs="EPSG:4326",
    time_semantics="Current inventory", stale_after=timedelta(days=365), required_columns=("gtfs_stop_id", "stop_name"),
    known_limitations=("One row per station per line; a complex (e.g. Jay St-MetroTech) can have several rows.",),
    license_note="NY Open Data Terms of Use apply.", domain="https://data.ny.gov",
)
ENTRANCES = DataSource(
    key="mta_subway_entrances", name="MTA Subway Entrances and Exits: 2024", publisher="Metropolitan Transportation Authority (MTA)",
    dataset="i9wp-a4ja", id_column="gtfs_stop_id", cadence="Annually", crs="EPSG:4326",
    time_semantics="Inventory as of 2024", stale_after=timedelta(days=730), required_columns=("gtfs_stop_id", "entrance_latitude"),
    known_limitations=("Entrance positions are points; the dataset has no entrance elevation or flood-barrier information.",),
    license_note="NY Open Data Terms of Use apply.", domain="https://data.ny.gov",
)


def _get(url: str) -> list[dict[str, Any]]:
    r = httpx.get(url, params={"$limit": 5000}, headers={"User-Agent": USER_AGENT}, timeout=60)
    r.raise_for_status()
    return r.json()


def fetch(bbox: BBox) -> dict[str, Any]:
    """Download both datasets and keep the stations with at least one entrance (or the station point) in ``bbox``."""
    stations = _get(f"{STATIONS.domain}/resource/{STATIONS.dataset}.json")
    entrances = _get(f"{ENTRANCES.domain}/resource/{ENTRANCES.dataset}.json")
    inside = lambda lon, lat: bbox.w <= lon <= bbox.e and bbox.s <= lat <= bbox.n  # noqa: E731
    keep_ent = [e for e in entrances if inside(float(e["entrance_longitude"]), float(e["entrance_latitude"]))]
    ids = {e["gtfs_stop_id"] for e in keep_ent}
    keep_st = [s for s in stations if s["gtfs_stop_id"] in ids or inside(float(s["gtfs_longitude"]), float(s["gtfs_latitude"]))]
    ids |= {s["gtfs_stop_id"] for s in keep_st}
    return {"fetched_at": datetime.now(timezone.utc).isoformat(), "clipped_to": bbox.as_list(),
            "stations": keep_st, "entrances": [e for e in entrances if e["gtfs_stop_id"] in ids]}


def write_snapshot(data: dict[str, Any], path: Path) -> None:
    path.write_bytes(gzip.compress(json.dumps(data, separators=(",", ":")).encode(), mtime=0))


def read_snapshot(path: Path) -> dict[str, Any] | None:
    return json.loads(gzip.decompress(path.read_bytes())) if path.exists() else None


def _routes(s: str | None) -> list[str]:
    return [r for r in (s or "").split() if r]


def load(db: Any, data: dict[str, Any], area_code: str, now: datetime) -> dict[str, int]:
    from swale.ingest.pipeline import source_doc

    fetched = datetime.fromisoformat(data["fetched_at"])
    for src in (STATIONS, ENTRANCES):
        q.upsert_merge(db, "data_source", src.key, {**source_doc(src), "last_success_at": now, "last_fetched_at": fetched})
    run(db, "DELETE subway_entrance WHERE area_ids CONTAINS $area; DELETE subway_station WHERE area_ids CONTAINS $area;", {"area": area_code})
    stations = []
    for s in data["stations"]:
        lon, lat = float(s["gtfs_longitude"]), float(s["gtfs_latitude"])
        stations.append((s["gtfs_stop_id"], {
            "gtfs_stop_id": s["gtfs_stop_id"], "station_id": s.get("station_id"), "complex_id": s.get("complex_id"),
            "name": s["stop_name"], "line": s.get("line"), "division": s.get("division"), "routes": _routes(s.get("daytime_routes")),
            "structure": s.get("structure"), "ada": int(s.get("ada") or 0),
            "north_label": s.get("north_direction_label"), "south_label": s.get("south_direction_label"),
            "geom": to_surreal({"type": "Point", "coordinates": [lon, lat]}), "lon": lon, "lat": lat, "area_ids": [area_code],
            "knowledge_type": "observed", "source": q.rid("data_source", STATIONS.key), "source_url": STATIONS.record_url(s["gtfs_stop_id"]),
            "ingested_at": now,
        }))
    entrances = []
    for i, e in enumerate(sorted(data["entrances"], key=lambda e: (e["gtfs_stop_id"], e["entrance_latitude"], e["entrance_longitude"]))):
        lon, lat = float(e["entrance_longitude"]), float(e["entrance_latitude"])
        entrances.append((f"{e['gtfs_stop_id']}_{i}", {
            "station": q.rid("subway_station", e["gtfs_stop_id"]), "gtfs_stop_id": e["gtfs_stop_id"], "complex_id": e.get("complex_id"),
            "station_name": e["stop_name"], "entrance_type": e.get("entrance_type"),
            "entry_allowed": e.get("entry_allowed") == "YES", "exit_allowed": e.get("exit_allowed") == "YES",
            "routes": _routes(e.get("daytime_routes")),
            "geom": to_surreal({"type": "Point", "coordinates": [lon, lat]}), "lon": lon, "lat": lat, "area_ids": [area_code],
            "knowledge_type": "observed", "source": q.rid("data_source", ENTRANCES.key), "source_url": ENTRANCES.record_url(e["gtfs_stop_id"]),
            "ingested_at": now,
        }))
    q.upsert_many(db, "subway_station", stations)
    q.upsert_many(db, "subway_entrance", entrances)
    return {"stations": len(stations), "entrances": len(entrances)}
