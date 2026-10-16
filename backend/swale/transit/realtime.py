"""Live subway service for an area from MTA's keyless GTFS-realtime feeds and service-alert feed.

Three kinds of information, kept apart:
- arrival predictions (predicted: when MTA expects each train),
- train positions (observed: where MTA's systems last saw each train),
- service alerts (observed: MTA's own statement of current conditions, e.g. delays or flooding).
Delays are computed, not reported: predicted arrival minus the scheduled arrival of the same trip.
"""

from __future__ import annotations

import re
import statistics
import threading
import time
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any, Iterable

import httpx

from swale.sources.socrata import USER_AGENT
from swale.transit.schedule import Schedule

BASE = "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/"
ALERTS_URL = BASE + "camsys%2Fsubway-alerts.json"
FEEDS = {  # route -> feed path
    **{r: "nyct%2Fgtfs-ace" for r in ("A", "C", "E", "H", "FS")},
    **{r: "nyct%2Fgtfs-bdfm" for r in ("B", "D", "F", "FX", "M")},
    "G": "nyct%2Fgtfs-g", "J": "nyct%2Fgtfs-jz", "Z": "nyct%2Fgtfs-jz", "L": "nyct%2Fgtfs-l",
    **{r: "nyct%2Fgtfs-nqrw" for r in ("N", "Q", "R", "W")},
    **{r: "nyct%2Fgtfs" for r in ("1", "2", "3", "4", "5", "5X", "6", "6X", "7", "7X", "GS")},
    "SI": "nyct%2Fgtfs-si",
}
WINDOW = timedelta(minutes=30)
CACHE_S = 30
FLOOD_WORDS = re.compile(r"\b(flood\w*|water condition\w*|water main|standing water|heavy rain)\b", re.I)
STATUSES = ("normal", "alert", "delayed", "flooding_reported", "no_service")
DELAY_MIN = 5  # a station counts as delayed when its median train is at least this late
REDUCED = 0.6  # ... or when fewer than 60% of scheduled trains are predicted
_cache: dict[str, tuple[float, Any]] = {}
_lock = threading.Lock()


def _iso(dt: datetime | None) -> str | None:
    return dt.astimezone(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z") if dt else None


def _cached(key: str, fn: Any) -> Any:
    with _lock:
        hit = _cache.get(key)
        if hit and time.time() - hit[0] < CACHE_S:
            return hit[1]
    value = fn()
    with _lock:
        _cache[key] = (time.time(), value)
    return value


def fetch_feed(path: str, client: httpx.Client) -> Any:
    from google.transit import gtfs_realtime_pb2

    msg = gtfs_realtime_pb2.FeedMessage()
    msg.ParseFromString(client.get(BASE + path).raise_for_status().content)
    return msg


def _text(translated: dict[str, Any] | None) -> str:
    for t in (translated or {}).get("translation", []):
        if t.get("language") == "en":
            return t.get("text", "")
    return ""


def parse_alerts(body: dict[str, Any], routes: set[str], stops: set[str], now: datetime) -> list[dict[str, Any]]:
    """Active MTA alerts that name one of ``routes`` or ``stops`` (parent stop IDs)."""
    ts = now.timestamp()
    out = []
    for e in body.get("entity", []):
        a = e.get("alert", {})
        periods = a.get("active_period") or [{}]
        if not any(p.get("start", 0) <= ts <= p.get("end", 9e12) for p in periods):
            continue
        ents = a.get("informed_entity", [])
        # An entity that names a stop counts only if the stop is ours; one that names only a route counts for that route.
        hit_stops = sorted({i["stop_id"][:3] for i in ents if i.get("stop_id") and i["stop_id"][:3] in stops})
        hit_routes = sorted({i["route_id"] for i in ents if i.get("route_id") in routes and (not i.get("stop_id") or i["stop_id"][:3] in stops)})
        if not hit_routes and not hit_stops:
            continue
        header, desc = _text(a.get("header_text")), _text(a.get("description_text"))
        meta = a.get("transit_realtime.mercury_alert", {})
        out.append({
            "id": e.get("id"), "alert_type": meta.get("alert_type"), "header": header, "description": desc[:600] or None,
            "routes": hit_routes, "stops": hit_stops, "station_specific": bool(hit_stops),
            "mentions_flooding": bool(FLOOD_WORDS.search(header + " " + desc)),
            "active_from": _iso(datetime.fromtimestamp(min(p.get("start", ts) for p in periods), timezone.utc)),
            "updated_at": _iso(datetime.fromtimestamp(meta["updated_at"], timezone.utc)) if meta.get("updated_at") else None,
            "knowledge_type": "observed", "basis": "MTA service alert",
        })
    return sorted(out, key=lambda a: (not a["mentions_flooding"], a["alert_type"] != "Delays", a["id"] or ""))


def board(stations: list[dict[str, Any]], feeds: dict[str, Any], schedule: Schedule | None, alerts: list[dict[str, Any]],
          now: datetime) -> dict[str, Any]:
    """Per-station arrivals, delays and status, plus the trains currently at or approaching the area's stations."""
    ids = {s["gtfs_stop_id"] for s in stations}
    arrivals: dict[str, list[dict[str, Any]]] = defaultdict(list)
    trains = []
    for msg in feeds.values():
        for e in msg.entity:
            if e.HasField("trip_update"):
                trip = e.trip_update.trip
                for u in e.trip_update.stop_time_update:
                    if u.stop_id[:-1] not in ids:
                        continue
                    t = u.arrival.time or u.departure.time
                    if not t:
                        continue
                    at = datetime.fromtimestamp(t, timezone.utc)
                    if at < now - timedelta(minutes=1) or at > now + WINDOW:
                        continue
                    sched = schedule.scheduled_time(trip.trip_id, trip.start_date, u.stop_id) if schedule else None
                    arrivals[u.stop_id[:-1]].append({
                        "route": trip.route_id, "direction": u.stop_id[-1], "trip_id": trip.trip_id, "predicted_at": _iso(at),
                        "minutes_away": round((at - now).total_seconds() / 60, 1),
                        "scheduled_at": _iso(sched), "delay_min": round((at - sched).total_seconds() / 60, 1) if sched else None,
                    })
            if e.HasField("vehicle") and e.vehicle.stop_id[:-1] in ids:
                v = e.vehicle
                trains.append({"route": v.trip.route_id, "trip_id": v.trip.trip_id, "stop_id": v.stop_id[:-1], "direction": v.stop_id[-1],
                               "status": {0: "incoming_at", 1: "stopped_at", 2: "in_transit_to"}.get(v.current_status, "unknown"),
                               "seen_at": _iso(datetime.fromtimestamp(v.timestamp, timezone.utc)) if v.timestamp else None,
                               "knowledge_type": "observed"})
    out = []
    for s in stations:
        sid = s["gtfs_stop_id"]
        arr = sorted(arrivals.get(sid, []), key=lambda a: a["predicted_at"])
        delays = [a["delay_min"] for a in arr if a["delay_min"] is not None]
        scheduled = len(schedule.arrivals(sid + "N", now, now + WINDOW) + schedule.arrivals(sid + "S", now, now + WINDOW)) \
            if schedule and schedule.covers(now) else None
        st_alerts = [a for a in alerts if sid in a["stops"] or (not a["station_specific"] and set(a["routes"]) & set(s["routes"]))]
        median = round(statistics.median(delays), 1) if delays else None
        status, reasons = "normal", []
        if median is not None and median >= DELAY_MIN:
            status = "delayed"; reasons.append(f"median train {median:g} min late")
        if scheduled and scheduled >= 3 and len(arr) < REDUCED * scheduled:
            status = "delayed"; reasons.append(f"{len(arr)} trains predicted vs {scheduled} scheduled in the next 30 min")
        delay_alerts = [a for a in st_alerts if a["alert_type"] in ("Delays", "Expect Delays", "Severe Delays")]
        if delay_alerts:
            if status == "normal":
                status = "alert"
            reasons.append(f"MTA delay alert on the {', '.join(sorted({r for a in delay_alerts for r in a['routes']}))} line"
                           + ("" if any(a["station_specific"] for a in delay_alerts) else " (may be elsewhere on the line)"))
        if any(a["mentions_flooding"] for a in st_alerts):
            status = "flooding_reported"; reasons.append("MTA alert mentions flooding or water conditions")
        if not arr and not scheduled:
            status = "no_service" if scheduled == 0 else status
        out.append({
            "station_id": f"subway_station:{sid}", "gtfs_stop_id": sid, "name": s["name"], "routes": s["routes"], "lon": s["lon"], "lat": s["lat"],
            "status": status, "reasons": reasons,
            "trains_next_30_min": {"predicted": len(arr), "scheduled": scheduled},
            "delay_min": {"median": median, "max": max(delays) if delays else None, "trains_matched": len(delays)},
            "next": {d: [a for a in arr if a["direction"] == d][:4] for d in ("N", "S")},
            "direction_labels": {"N": s.get("north_label"), "S": s.get("south_label")},
            "alert_ids": [a["id"] for a in st_alerts],
        })
    return {"stations": out, "trains": trains}


def live(stations: list[dict[str, Any]], schedule: Schedule | None, *, now: datetime | None = None,
         client: httpx.Client | None = None) -> dict[str, Any]:
    now = now or datetime.now(timezone.utc)
    http = client or httpx.Client(headers={"User-Agent": USER_AGENT}, timeout=20)
    routes = {r for s in stations for r in s["routes"]}
    paths = sorted({FEEDS[r] for r in routes if r in FEEDS})
    feeds, feed_times, errors = {}, {}, []
    for p in paths:
        try:
            feeds[p] = _cached(p, lambda p=p: fetch_feed(p, http))
            feed_times[p.split("%2F")[-1]] = _iso(datetime.fromtimestamp(feeds[p].header.timestamp, timezone.utc))
        except (httpx.HTTPError, ValueError) as exc:
            errors.append(f"{p}: {exc}")
    try:
        body = _cached("alerts", lambda: http.get(ALERTS_URL).raise_for_status().json())
        alerts = parse_alerts(body, routes, {s["gtfs_stop_id"] for s in stations}, now)
    except (httpx.HTTPError, ValueError) as exc:
        alerts, errors = [], [*errors, f"alerts: {exc}"]
    b = board(stations, feeds, schedule, alerts, now)
    if schedule is None or not schedule.covers(now):
        errors.append("no static schedule covers today: delays and scheduled counts are unavailable (run `swale transit-data`)")
    return {
        "fetched_at": _iso(now), "feed_times": feed_times, **b, "alerts": alerts, "errors": errors,
        "summary": {"stations": len(b["stations"]), "delayed": sum(s["status"] == "delayed" for s in b["stations"]),
                    "alert": sum(s["status"] == "alert" for s in b["stations"]),
                    "flooding_reported": sum(s["status"] == "flooding_reported" for s in b["stations"]),
                    "trains_in_area": len(b["trains"]), "alerts": len(alerts)},
        "knowledge": {"arrivals": "predicted (MTA GTFS-realtime)", "trains": "observed (MTA train positions)",
                      "alerts": "observed (MTA's own statements)", "delays": "computed: predicted minus scheduled arrival"},
        "source": {"publisher": "Metropolitan Transportation Authority", "url": "https://api.mta.info/"},
    }


def stations_routes(stations: Iterable[dict[str, Any]]) -> set[str]:
    return {r for s in stations for r in s["routes"]}
