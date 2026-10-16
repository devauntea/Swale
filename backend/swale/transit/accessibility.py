"""Station accessibility under flood: MTA elevator and escalator status joined with station flood exposure.

MTA's keyless elevator/escalator feeds list every unit (equipment) and every current or planned outage.
A station is step-free when MTA marks it accessible (ADA); it loses step-free access when an ADA elevator
it depends on is out and MTA lists no redundant unit. Joining that with flood exposure and the danger
zones answers: which accessible stations are both exposed to flooding and short of working elevators.
"""

from __future__ import annotations

import threading
import time
from datetime import datetime, timezone
from typing import Any
from zoneinfo import ZoneInfo

import httpx

from swale.sources.socrata import USER_AGENT

BASE = "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2F"
FEEDS = {"equipment": "nyct_ene_equipments.json", "outages": "nyct_ene.json"}
TZ = ZoneInfo("America/New_York")
CACHE_S = 120
ADA_LABEL = {0: "not accessible", 1: "accessible", 2: "partially accessible"}
_cache: dict[str, tuple[float, Any]] = {}
_lock = threading.Lock()


def _get(name: str, client: httpx.Client) -> Any:
    with _lock:
        hit = _cache.get(name)
        if hit and time.time() - hit[0] < CACHE_S:
            return hit[1]
    data = client.get(BASE + FEEDS[name]).raise_for_status().json()
    with _lock:
        _cache[name] = (time.time(), data)
    return data


def _when(s: str | None) -> str | None:
    if not s:
        return None
    try:
        return datetime.strptime(s, "%m/%d/%Y %I:%M:%S %p").replace(tzinfo=TZ).astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
    except ValueError:
        return None


def station_access(stations: list[dict[str, Any]], equipment: list[dict[str, Any]], outages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_complex: dict[str, list[dict[str, Any]]] = {}
    for e in equipment:  # inactive units (e.g. under capital replacement) are kept: riders still find them out of service
        by_complex.setdefault(str(e.get("stationcomplexid")), []).append(e)
    out_by_unit: dict[str, list[dict[str, Any]]] = {}
    for o in outages:
        out_by_unit.setdefault(o["equipment"], []).append(o)
    rows = []
    for s in stations:
        units = by_complex.get(str(s.get("complex_id")), [])
        # Units at a complex serve all its platforms; keep those whose GTFS stop list names this station, or that name none.
        units = [u for u in units if not u.get("elevatorsgtfsstopid") or s["gtfs_stop_id"] in str(u["elevatorsgtfsstopid"]).split("/")]
        listed = []
        for u in units:
            outs = out_by_unit.get(u["equipmentno"], [])
            now = [o for o in outs if o.get("isupcomingoutage") != "Y"]
            later = [o for o in outs if o.get("isupcomingoutage") == "Y"]
            listed.append({
                "equipment": u["equipmentno"], "type": "elevator" if u["equipmenttype"] == "EL" else "escalator",
                "ada": u.get("ADA") == "Y", "serving": u.get("serving"), "redundant": bool(int(u.get("redundant") or 0)),
                "out_now": bool(now) or u.get("isactive") == "N", "reason": now[0]["reason"] if now else ("inactive in MTA's equipment list" if u.get("isactive") == "N" else None),
                "since": _when(now[0].get("outagedate")) if now else None, "return_expected": _when(now[0].get("estimatedreturntoservice")) if now else None,
                "planned": [{"reason": o["reason"], "from": _when(o.get("outagedate")), "to": _when(o.get("estimatedreturntoservice"))} for o in later],
                "alternative": u.get("alternativeroute"),
            })
        ada = int(s.get("ada") or 0)
        ada_out = [u for u in listed if u["type"] == "elevator" and u["ada"] and u["out_now"] and not u["redundant"]]
        rows.append({
            "gtfs_stop_id": s["gtfs_stop_id"], "station_id": f"subway_station:{s['gtfs_stop_id']}", "name": s["name"], "routes": s["routes"],
            "ada": ADA_LABEL.get(ada, str(ada)), "step_free_now": ada > 0 and not ada_out,
            "lost_step_free": ada > 0 and bool(ada_out),
            "elevators": sum(u["type"] == "elevator" for u in listed), "escalators": sum(u["type"] == "escalator" for u in listed),
            "out_now": [u["equipment"] for u in listed if u["out_now"]],
            "planned_outages": sum(len(u["planned"]) for u in listed), "equipment": listed,
        })
    return rows


def accessibility(stations: list[dict[str, Any]], exposure_by_stop: dict[str, dict[str, Any]], zone_stations: set[str],
                  *, client: httpx.Client | None = None) -> dict[str, Any]:
    http = client or httpx.Client(headers={"User-Agent": USER_AGENT}, timeout=30)
    errors: list[str] = []
    try:
        equipment, outages = _get("equipment", http), _get("outages", http)
    except (httpx.HTTPError, ValueError) as exc:
        equipment, outages, errors = [], [], [f"MTA elevator feeds: {exc}"]
    rows = station_access(stations, equipment, outages)
    for r in rows:
        ex = exposure_by_stop.get(r["gtfs_stop_id"], {})
        r["exposure"] = {"score": ex.get("score"), "tier": ex.get("tier")}
        r["entrance_in_high_danger_zone"] = r["station_id"] in zone_stations
        exposed = r["exposure"]["tier"] in ("high", "medium") or r["entrance_in_high_danger_zone"]
        flags = []
        if r["lost_step_free"]:
            flags.append("step-free access lost: an accessible elevator is out with no backup")
        if r["out_now"] and not r["lost_step_free"]:
            flags.append(f"{len(r['out_now'])} unit(s) out of service")
        if exposed and r["ada"] != "not accessible":
            flags.append("accessible station exposed to flooding")
        r["flags"] = flags
        r["priority"] = ("critical" if r["lost_step_free"] and exposed else
                         "warning" if (r["lost_step_free"] or (exposed and r["out_now"])) else
                         "watch" if exposed or r["out_now"] else "ok")
    order = {"critical": 0, "warning": 1, "watch": 2, "ok": 3}
    rows.sort(key=lambda r: (order[r["priority"]], -(r["exposure"]["score"] or 0)))
    return {
        "stations": rows, "errors": errors,
        "summary": {"stations": len(rows), "step_free_now": sum(r["step_free_now"] for r in rows),
                    "lost_step_free": sum(r["lost_step_free"] for r in rows),
                    "accessible_and_exposed": sum("accessible station exposed to flooding" in r["flags"] for r in rows),
                    "units_out_now": sum(len(r["out_now"]) for r in rows), "critical": sum(r["priority"] == "critical" for r in rows)},
        "knowledge": {"equipment_status": "observed (MTA elevator and escalator feeds)", "exposure": "inferred (station-exposure-v1)"},
        "source": {"publisher": "Metropolitan Transportation Authority", "url": "https://www.mta.info/developers/display-elevators-NYCT"},
    }
