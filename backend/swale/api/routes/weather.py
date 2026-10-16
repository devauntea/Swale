"""Live weather for an area: observed conditions, the NWS forecast (predicted) and active alerts."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Query

from swale.api.deps import get_db
from swale.api.problems import Problem
from swale.db import queries as q
from swale.weather.nws import weather_now

router = APIRouter()


@router.get("/weather/now")
def get_weather(area_id: str = Query("BK0601"), hours: int = Query(24, ge=1, le=72), db: Any = Depends(get_db)) -> dict[str, Any]:
    area = q.get_record(db, "area", area_id)
    if area is None:
        raise Problem(404, "not-found", "Not found", f"no area {area_id}")
    w, s, e, n = area["bbox"]
    try:
        data = weather_now((s + n) / 2, (w + e) / 2, hours=hours)
    except Exception as exc:  # noqa: BLE001 - upstream failure is reported, never faked
        raise Problem(503, "upstream-unavailable", "NWS unavailable", f"{type(exc).__name__}: {exc}") from None
    if not data.get("cached"):
        from swale.weather.verify import record_forecast

        record_forecast(db, area_id, data)
    return {"api_version": "1.0", "area_id": area_id, **{k: v for k, v in data.items() if k != "qpf_intervals"}}


@router.get("/weather/verification")
def get_verification(area_id: str = Query("BK0601"), db: Any = Depends(get_db)) -> dict[str, Any]:
    """Forecast rain (issued before each window) against radar-estimated and gauge-measured rain."""
    from swale.weather.verify import record_forecast, verify

    area = q.get_record(db, "area", area_id)
    if area is None:
        raise Problem(404, "not-found", "Not found", f"no area {area_id}")
    w, s, e, n = area["bbox"]
    try:
        record_forecast(db, area_id, weather_now((s + n) / 2, (w + e) / 2, hours=24, use_cache=False))
    except Exception:  # noqa: BLE001 - verification still runs on what is stored
        pass
    return {"api_version": "1.0", **verify(db, area)}
