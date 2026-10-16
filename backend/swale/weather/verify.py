"""Was the forecast right? NWS forecast rain against radar-estimated rain (NOAA MRMS) and rain gauges.

- Forecasts (predicted) are stored each time Swale fetches the NWS gridpoint, keyed by the time NWS issued them.
  A window is checked only against a forecast issued before the window began, so the comparison never uses hindsight.
- Radar (observed, estimated): NOAA's MRMS quantitative precipitation estimate, radar-only, 1 km grid. The image
  service's description says inches, but its raw values are millimetres: checked 2026-10-16 against KNYC, KLGA and
  KJFK gauges (24 h radar 2.6/3.6/1.7 against gauges 3.1/3.1/1.4 mm). Swale converts from mm.
- Gauges (observed): hourly precipitation at NWS stations near the area.
"""

from __future__ import annotations

import json
import threading
import time
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx

from swale.db import queries as q
from swale.db.connection import run_one
from swale.sim.scenarios import _iso_hours
from swale.sources.socrata import USER_AGENT

MRMS = "https://mapservices.weather.noaa.gov/raster/rest/services/obs/mrms_qpe/ImageServer"
WINDOWS = {1: "01H", 6: "06H", 24: "24H", 72: "72H"}
GAUGES = (("KNYC", "Central Park"), ("KJRB", "Downtown Manhattan Heliport"))
MM_PER_IN = 25.4
CLOSE_IN = 0.05  # within this many inches counts as about right
_cache: dict[str, tuple[float, Any]] = {}
_lock = threading.Lock()


def _cached(key: str, ttl: float, fn: Any) -> Any:
    with _lock:
        hit = _cache.get(key)
        if hit and time.time() - hit[0] < ttl:
            return hit[1]
    v = fn()
    with _lock:
        _cache[key] = (time.time(), v)
    return v


def record_forecast(db: Any, area_id: str, weather: dict[str, Any]) -> None:
    issued = weather.get("forecast_issued_at")
    if not issued or not weather.get("qpf_intervals"):
        return
    key = f"{area_id}_{issued}".replace(":", "").replace("-", "").replace("+", "_")
    q.upsert_merge(db, "forecast_snapshot", key, {"area_id": area_id, "issued_at": datetime.fromisoformat(issued),
                                                   "fetched_at": datetime.fromisoformat(weather["fetched_at"].replace("Z", "+00:00")),
                                                   "gridpoint": weather.get("gridpoint"), "intervals": weather["qpf_intervals"],
                                                   "knowledge_type": "predicted", "source": "api.weather.gov"})


def _forecast_in(intervals: list[dict[str, Any]], start: datetime, end: datetime) -> tuple[float, float]:
    """(forecast inches in [start, end), share of the window the forecast covers), spreading each interval evenly."""
    total = covered = 0.0
    for v in intervals:
        s_str, dur = v["valid_time"].split("/")
        s = datetime.fromisoformat(s_str)
        e = s + timedelta(hours=_iso_hours(dur))
        overlap = (min(e, end) - max(s, start)).total_seconds()
        if overlap <= 0:
            continue
        covered += overlap
        total += (v["mm"] or 0.0) / MM_PER_IN * overlap / (e - s).total_seconds()
    return total, covered / (end - start).total_seconds()


def mrms(lon: float, lat: float, client: httpx.Client) -> dict[int, tuple[float, datetime]]:
    out = {}
    for hours, code in WINDOWS.items():
        def fetch(code: str = code) -> tuple[float, datetime]:
            f = client.get(f"{MRMS}/query", params={"where": f"name='conus_QPE_{code}'", "outFields": "objectid,idp_validendtime",
                                                    "orderByFields": "idp_validendtime DESC", "returnGeometry": "false", "f": "json"}
                           ).raise_for_status().json()["features"][0]["attributes"]
            d = client.get(f"{MRMS}/identify", params={
                "geometry": json.dumps({"x": lon, "y": lat, "spatialReference": {"wkid": 4326}}), "geometryType": "esriGeometryPoint",
                "mosaicRule": json.dumps({"mosaicMethod": "esriMosaicLockRaster", "lockRasterIds": [f["objectid"]]}),
                "returnCatalogItems": "false", "f": "json"}).raise_for_status().json()
            return float(d["value"]) / MM_PER_IN, datetime.fromtimestamp(f["idp_validendtime"] / 1000, timezone.utc)
        out[hours] = _cached(f"mrms:{code}:{lon:.3f},{lat:.3f}", 600, fetch)
    return out


def gauges(end: datetime, client: httpx.Client) -> dict[str, dict[int, float | None]]:
    out = {}
    for st, name in GAUGES:
        def fetch(st: str = st) -> list[dict[str, Any]]:
            return client.get(f"https://api.weather.gov/stations/{st}/observations",
                              params={"start": (end - timedelta(hours=72)).isoformat(), "end": end.isoformat()}).raise_for_status().json()["features"]
        try:
            feats = _cached(f"gauge:{st}:{end.isoformat()}", 600, fetch)
        except (httpx.HTTPError, KeyError):
            continue
        totals: dict[int, float | None] = {}
        for hours in WINDOWS:
            vals = [((x["properties"].get("precipitationLastHour") or {}).get("value"), datetime.fromisoformat(x["properties"]["timestamp"]))
                    for x in feats]
            # One routine (hourly, :51) report per hour carries the hour's total.
            hourly = [v for v, t in vals if t.minute >= 50 and end - timedelta(hours=hours) < t <= end]
            totals[hours] = round(sum(v or 0.0 for v in hourly) / MM_PER_IN, 3) if hourly else None
        out[st] = {"name": name, "totals_in": totals}
    return out


def verify(db: Any, area: dict[str, Any], *, client: httpx.Client | None = None) -> dict[str, Any]:
    http = client or httpx.Client(headers={"User-Agent": USER_AGENT, "Accept": "application/geo+json"}, timeout=30)
    w, s, e, n = area["bbox"]
    lon, lat = (w + e) / 2, (s + n) / 2
    errors: list[str] = []
    try:
        radar = mrms(lon, lat, http)
    except (httpx.HTTPError, KeyError, ValueError, IndexError) as exc:
        radar, errors = {}, [f"MRMS: {exc}"]
    end = next(iter(radar.values()))[1] if radar else datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
    gauge = gauges(end, http)
    snaps = run_one(db, "SELECT issued_at, intervals, gridpoint FROM forecast_snapshot WHERE area_id = $a ORDER BY issued_at;", {"a": area["code"]})
    rows = []
    for hours in WINDOWS:
        start = end - timedelta(hours=hours)
        before = [x for x in snaps if x["issued_at"] <= start]
        snap = before[-1] if before else None
        fc, cover = _forecast_in(snap["intervals"], start, end) if snap else (None, 0.0)
        obs = radar.get(hours, (None, None))[0]
        row: dict[str, Any] = {"window_hours": hours, "start": start.isoformat(), "end": end.isoformat(),
                               "observed_radar_in": round(obs, 3) if obs is not None else None,
                               "gauges_in": {st: g["totals_in"].get(hours) for st, g in gauge.items()},
                               "forecast_in": round(fc, 3) if fc is not None and cover >= 0.99 else None,
                               "forecast_issued_at": snap["issued_at"].isoformat() if snap else None}
        if row["forecast_in"] is None:
            first = snaps[0]["issued_at"].isoformat() if snaps else None
            row["verdict"] = ("no forecast stored from before this window began" + (f"; the first stored forecast was issued {first}" if first else "")
                              if not snap or cover < 0.99 else "forecast does not cover the whole window")
        elif obs is None:
            row["verdict"] = "radar estimate unavailable"
        else:
            diff = row["forecast_in"] - obs
            row["difference_in"] = round(diff, 3)
            row["verdict"] = ("about right" if abs(diff) <= CLOSE_IN else
                              f"forecast too high by {diff:.2f} in" if diff > 0 else f"forecast too low by {-diff:.2f} in")
        rows.append(row)
    return {
        "area_id": area["code"], "point": [round(lon, 5), round(lat, 5)], "radar_valid_until": end.isoformat(), "windows": rows,
        "stored_forecasts": len(snaps), "errors": errors,
        "knowledge": {"forecast": "predicted (NWS gridpoint QPF, issued before each window)",
                      "radar": "observed estimate (NOAA MRMS radar-only QPE, 1 km)", "gauges": "observed (NWS station hourly precipitation)"},
        "rule": f"'about right' means within {CLOSE_IN} in of the radar estimate",
        "notes": ["MRMS values are read in millimetres and converted; the service description says inches, but its values match gauges in mm.",
                  "Radar estimates the rain over a 1 km cell; a gauge measures one spot. Expect differences of about a millimetre in light rain."],
    }
