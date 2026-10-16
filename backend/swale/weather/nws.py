"""Live weather for an area from the National Weather Service (api.weather.gov, keyless).

Three different kinds of information, kept apart:
- the latest station observation (observed: what the weather is, as measured),
- the hourly forecast and rainfall amounts (predicted: what NWS expects),
- active alerts (official NWS products).
Everything carries the time NWS issued it and the time Swale fetched it.
"""

from __future__ import annotations

import threading
import time
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx

from swale.sim.scenarios import DESIGN_STORMS, _iso_hours
from swale.sources.socrata import USER_AGENT

BASE = "https://api.weather.gov"
# Nearest stations to the BK0601 demo area: Downtown Manhattan Heliport (~2 km across the harbor), then Central Park.
STATIONS = (("KJRB", "Downtown Manhattan Heliport"), ("KNYC", "Central Park"))
CACHE_S = 600
RAIN_WORDS = ("rain", "shower", "drizzle", "thunderstorm", "storm")
_cache: dict[str, tuple[float, dict[str, Any]]] = {}
_lock = threading.Lock()


def _client() -> httpx.Client:
    return httpx.Client(headers={"User-Agent": USER_AGENT, "Accept": "application/geo+json"}, timeout=20)


def _iso(dt: datetime | None) -> str | None:
    return dt.astimezone(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z") if dt else None


def is_rain(text: str | None) -> bool:
    return bool(text) and any(w in text.lower() for w in RAIN_WORDS)


def weather_now(lat: float, lon: float, *, hours: int = 24, client: httpx.Client | None = None, use_cache: bool = True) -> dict[str, Any]:
    key = f"{lat:.4f},{lon:.4f},{hours}"
    with _lock:
        hit = _cache.get(key)
        if use_cache and hit and time.time() - hit[0] < CACHE_S:
            return {**hit[1], "cached": True}
    http = client or _client()
    now = datetime.now(timezone.utc)
    errors: list[str] = []

    point = http.get(f"{BASE}/points/{lat:.4f},{lon:.4f}").raise_for_status().json()["properties"]

    # Forecast (predicted): hourly conditions plus quantitative precipitation spread across each interval.
    hourly_props = http.get(point["forecastHourly"]).raise_for_status().json()["properties"]
    grid = http.get(point["forecastGridData"]).raise_for_status().json()["properties"]
    rain_by_hour: dict[datetime, float] = {}
    for v in grid["quantitativePrecipitation"]["values"]:
        start_s, dur = v["validTime"].split("/")
        start, hrs = datetime.fromisoformat(start_s), _iso_hours(dur)
        per_hour = (v["value"] or 0.0) / 25.4 / max(hrs, 1e-9)  # mm over the interval -> inches per hour
        for h in range(int(round(hrs))):
            rain_by_hour[(start + timedelta(hours=h)).astimezone(timezone.utc)] = per_hour
    horizon = now + timedelta(hours=hours)
    forecast = []
    for p in hourly_props["periods"]:
        start, end = datetime.fromisoformat(p["startTime"]), datetime.fromisoformat(p["endTime"])
        if end <= now or start >= horizon:
            continue
        hour_key = start.astimezone(timezone.utc).replace(minute=0, second=0, microsecond=0)
        forecast.append({
            "start": _iso(start), "end": _iso(end),
            "rain_chance_pct": (p.get("probabilityOfPrecipitation") or {}).get("value") or 0,
            "rain_in": round(rain_by_hour.get(hour_key, 0.0), 3),
            "short_forecast": p.get("shortForecast"),
            "temperature_f": p.get("temperature"),
            "wind": p.get("windSpeed"),
        })

    forecast = forecast[:hours]  # the current partial hour counts as the first

    # Observation (observed): latest report from the nearest station that answers.
    observation = None
    for station, name in STATIONS:
        try:
            o = http.get(f"{BASE}/stations/{station}/observations/latest").raise_for_status().json()["properties"]
        except httpx.HTTPError as exc:
            errors.append(f"{station}: {exc}")
            continue
        temp_c = (o.get("temperature") or {}).get("value")
        precip_mm = (o.get("precipitationLastHour") or {}).get("value")
        observation = {
            "station": station, "station_name": name, "observed_at": o.get("timestamp"),
            "description": o.get("textDescription"), "raining": is_rain(o.get("textDescription")),
            "temperature_f": round(temp_c * 9 / 5 + 32) if temp_c is not None else None,
            "precip_last_hour_in": round(precip_mm / 25.4, 3) if precip_mm is not None else None,
            "knowledge_type": "observed",
        }
        break

    # Alerts (official NWS products) for this exact point.
    try:
        feats = http.get(f"{BASE}/alerts/active", params={"point": f"{lat:.4f},{lon:.4f}"}).raise_for_status().json()["features"]
        alerts = [{"event": f["properties"].get("event"), "headline": f["properties"].get("headline"),
                   "severity": f["properties"].get("severity"), "onset": f["properties"].get("onset"),
                   "ends": f["properties"].get("ends") or f["properties"].get("expires")} for f in feats]
    except httpx.HTTPError as exc:
        alerts, errors = [], [*errors, f"alerts: {exc}"]

    total = round(sum(h["rain_in"] for h in forecast), 2)
    peak = max(forecast, key=lambda h: h["rain_in"], default=None)
    peak_rate = peak["rain_in"] if peak else 0.0
    smallest_storm = min(v[1] for v in DESIGN_STORMS.values())
    result = {
        "fetched_at": _iso(now),
        "forecast_issued_at": grid.get("updateTime"),
        "gridpoint": f"{point['gridId']}/{point['gridX']},{point['gridY']}",
        "observation": observation,
        "forecast": {"knowledge_type": "predicted", "hours": forecast, "total_rain_in": total,
                     "peak_rate_in_hr": round(peak_rate, 3), "peak_at": peak["start"] if peak and peak_rate > 0 else None,
                     "max_rain_chance_pct": max((h["rain_chance_pct"] for h in forecast), default=0),
                     "rain_expected": any(h["rain_chance_pct"] >= 50 and h["rain_in"] > 0 for h in forecast)},
        "alerts": alerts,
        "context": {
            "smallest_dep_design_storm_in_hr": smallest_storm,
            "peak_vs_smallest_dep_storm_pct": round(100 * peak_rate / smallest_storm, 1),
            "note": "NWS rainfall amounts are spread evenly across each 6-hour forecast interval, so short bursts can be heavier than shown.",
        },
        "errors": errors,
        "qpf_intervals": [{"valid_time": v["validTime"], "mm": v["value"]} for v in grid["quantitativePrecipitation"]["values"]],
        "source": {"publisher": "National Weather Service", "url": point["forecastGridData"]},
        "cached": False,
    }
    with _lock:
        _cache[key] = (time.time(), result)
    return result
