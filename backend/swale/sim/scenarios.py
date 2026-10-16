"""Rainfall scenarios: DEP's design-storm intensities, the live NWS forecast, or a custom series."""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from typing import Any

import httpx

from swale.sources.socrata import USER_AGENT

STEP_MIN = 5
DEP_FLOOD_MAPS = "https://data.cityofnewyork.us/d/9i7c-xyvv"

# Peak intensities from NYC DEP's Stormwater Flood Map scenarios (NYC Open Data 9i7c-xyvv).
DESIGN_STORMS = {
    "dep_limited_1_77": ("DEP 'Limited' storm, 1.77 in/hr", 1.77),
    "dep_moderate_2_13": ("DEP 'Moderate' storm, 2.13 in/hr", 2.13),
    "dep_extreme_3_66": ("DEP 'Extreme' storm, 3.66 in/hr", 3.66),
}


def _scenario(key: str, name: str, kind: str, area_id: str, intensities: list[float], assumptions: list[str],
              source_ref: dict[str, Any] | None, created_by: str) -> tuple[str, dict[str, Any]]:
    body = {"kind": kind, "step_min": STEP_MIN, "intensities_in_hr": intensities}
    return key, {
        "name": name,
        "kind": kind,
        "area_id": area_id,
        "step_min": STEP_MIN,
        "intensities_in_hr": [float(v) for v in intensities],
        "total_depth_in": round(sum(intensities) * STEP_MIN / 60, 3),
        "peak_in_hr": max(intensities) if intensities else 0.0,
        "duration_min": STEP_MIN * len(intensities),
        "assumptions": assumptions,
        "source_ref": source_ref,
        "content_hash": hashlib.sha256(json.dumps(body, sort_keys=True).encode()).hexdigest(),
        "created_at": datetime.now(timezone.utc),
        "created_by": created_by,
    }


def design_storm(key: str, area_id: str, duration_min: int = 60) -> tuple[str, dict[str, Any]]:
    name, peak = DESIGN_STORMS[key]
    steps = max(1, duration_min // STEP_MIN)
    return _scenario(
        f"{key}_{area_id.lower()}_{duration_min}m", f"{name} for {duration_min} min", "design_storm", area_id, [peak] * steps,
        ["Peak intensity from DEP's Stormwater Flood Map scenarios; Swale holds it constant for the duration "
         "(DEP's storm shapes are not reproduced)."],
        {"publisher": "NYC DEP", "dataset": "9i7c-xyvv", "url": DEP_FLOOD_MAPS}, "system",
    )


def custom_storm(area_id: str, name: str, intensities_in_hr: list[float], created_by: str = "api") -> tuple[str, dict[str, Any]]:
    if not intensities_in_hr or any(v < 0 or v > 12 for v in intensities_in_hr):
        raise ValueError("intensities must be between 0 and 12 in/hr")
    key, doc = _scenario("", name, "custom", area_id, intensities_in_hr, ["User-supplied rainfall series."], None, created_by)
    return f"custom_{doc['content_hash'][:12]}", doc


def nws_forecast(area_id: str, lon: float, lat: float, hours: int = 48, client: httpx.Client | None = None) -> tuple[str, dict[str, Any]]:
    """Turn the NWS gridpoint's quantitative precipitation forecast (mm per interval) into a 5-minute series."""
    http = client or httpx.Client(headers={"User-Agent": USER_AGENT, "Accept": "application/geo+json"}, timeout=30)
    point = http.get(f"https://api.weather.gov/points/{lat:.4f},{lon:.4f}").raise_for_status().json()
    grid_url = point["properties"]["forecastGridData"]
    grid = http.get(grid_url).raise_for_status().json()["properties"]
    qpf = grid["quantitativePrecipitation"]
    if qpf.get("uom") != "wmoUnit:mm":
        raise ValueError(f"unexpected QPF unit {qpf.get('uom')}")
    now = datetime.now(timezone.utc)
    series: list[float] = []
    for value in qpf["values"]:
        start_s, duration = value["validTime"].split("/")
        start = datetime.fromisoformat(start_s)
        hrs = _iso_hours(duration)
        end = start.timestamp() + hrs * 3600
        if end <= now.timestamp():
            continue
        steps = int(hrs * 60 // STEP_MIN)
        intensity = (value["value"] or 0.0) / 25.4 / hrs  # mm over the interval -> in/hr
        series += [round(intensity, 4)] * steps
        if len(series) * STEP_MIN >= hours * 60:
            break
    series = series[: hours * 60 // STEP_MIN]
    stamp = now.strftime("%Y%m%dT%H%MZ")
    return _scenario(
        f"nws_{area_id.lower()}_{stamp}", f"NWS forecast for the next {hours} h (issued {grid.get('updateTime', '?')})",
        "nws_forecast", area_id, series,
        ["NWS quantitative precipitation forecast spread evenly across each forecast interval.",
         "Forecast values are predictions, not observations."],
        {"publisher": "National Weather Service", "url": grid_url, "update_time": grid.get("updateTime")}, "api",
    )


def _iso_hours(duration: str) -> float:
    """'PT6H', 'PT1H30M', 'P1DT6H' -> hours."""
    days = hours = minutes = 0.0
    date_part, _, time_part = duration[1:].partition("T")
    if date_part.endswith("D"):
        days = float(date_part[:-1])
    num = ""
    for ch in time_part:
        if ch.isdigit() or ch == ".":
            num += ch
        elif ch == "H":
            hours, num = float(num), ""
        elif ch == "M":
            minutes, num = float(num), ""
    return days * 24 + hours + minutes / 60
