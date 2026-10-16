"""Rain-triggered alert packs: forecast simulation, re-ranking, briefing, translations and audio."""

from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter, Query, Request
from pydantic import BaseModel, Field

from swale.ai import multilingual
from swale.api.geojson import API_VERSION
from swale.api.params import feature_key
from swale.api.problems import Problem
from swale.core.timeutil import iso_z
from swale.db import queries as q
from swale.transit import exposure

router = APIRouter()


class PackCreate(BaseModel):
    area_id: str = "BK0601"
    force: bool = Field(False, description="run even if the rain level is low (a drill or demo; the pack is labelled forced)")
    languages: list[str] = Field(default_factory=lambda: ["es", "zh"], max_length=5)
    runner: Literal["local", "daytona"] = "local"


def _iso(v: Any) -> Any:
    if isinstance(v, dict):
        return {k: _iso(x) for k, x in v.items()}
    if isinstance(v, list):
        return [_iso(x) for x in v]
    return iso_z(v) if hasattr(v, "tzinfo") and hasattr(v, "isoformat") else v


def pack_out(rec: dict[str, Any]) -> dict[str, Any]:
    pid = f"alert_pack:{rec['id'].id}"
    out = {k: _iso(v) for k, v in rec.items() if k != "id"}
    return {"id": pid, **out, "links": {"self": f"/api/v1/alert-packs/{pid}",
                                        "briefing": f"/api/v1/briefings/{rec['briefing_id']}" if rec.get("briefing_id") else None}}


@router.get("/alert-packs/check")
def check(area_id: str = Query("BK0601"), request: Request = None) -> dict[str, Any]:  # type: ignore[assignment]
    from swale.alerts.rain_pack import TRIGGER_LEVELS, _weather

    with request.app.state.db_lock:
        area = q.get_record(request.app.state.db, "area", area_id)
    if area is None:
        raise Problem(404, "not-found", "Not found", f"no area {area_id}")
    rain = exposure.rain_level(_weather(area))
    return {"api_version": API_VERSION, "area_id": area_id, "rain": rain, "would_trigger": rain["level"] in TRIGGER_LEVELS,
            "monitor": bool(getattr(request.app.state, "alert_monitor", False))}


@router.post("/alert-packs", status_code=202)
def create_pack(body: PackCreate, request: Request) -> dict[str, Any]:
    bad = [lang for lang in body.languages if lang not in multilingual.LANGUAGES]
    if bad:
        raise Problem(422, "invalid-parameter", "Invalid parameter", f"unsupported language(s) {bad}; use {sorted(multilingual.LANGUAGES)}")
    try:
        key = request.app.state.alerts.start(body.area_id, force=body.force, languages=body.languages, runner=body.runner)
    except ValueError as exc:
        raise Problem(404, "not-found", "Not found", str(exc)) from None
    return {"api_version": API_VERSION, **pack_out(request.app.state.alerts.get(key))}


@router.get("/alert-packs")
def list_packs(area_id: str = Query("BK0601"), request: Request = None) -> dict[str, Any]:  # type: ignore[assignment]
    return {"api_version": API_VERSION, "items": [pack_out(p) for p in request.app.state.alerts.recent(area_id)]}


@router.get("/alert-packs/{pack_id}")
def get_pack(pack_id: str, request: Request) -> dict[str, Any]:
    rec = request.app.state.alerts.get(feature_key(pack_id, "alert_pack"))
    if rec is None:
        raise Problem(404, "not-found", "Not found", f"no alert pack {pack_id}")
    return {"api_version": API_VERSION, **pack_out(rec)}
