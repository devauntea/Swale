"""Rainfall scenarios and SWMM simulation runs. Results are predicted, never observed."""

from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, Field

from swale.api.deps import get_db
from swale.api.geojson import collection, flood_result_feature
from swale.api.models import LayerCollection
from swale.api.params import DEFAULT_LIMIT, MAX_LIMIT, decode_cursor, feature_key, parse_bbox
from swale.api.problems import Problem
from swale.core.timeutil import iso_z
from swale.db import queries as q
from swale.db.connection import run_one
from swale.sim.scenarios import DESIGN_STORMS, custom_storm, design_storm, nws_forecast
from swale.sim.service import SimulationError

router = APIRouter()


class ScenarioCreate(BaseModel):
    kind: Literal["design_storm", "nws_forecast", "custom"]
    area_id: str = "BK0601"
    preset: Literal["dep_limited_1_77", "dep_moderate_2_13", "dep_extreme_3_66"] | None = None
    duration_min: int = Field(60, ge=5, le=360)
    hours: int = Field(48, ge=1, le=168)
    name: str | None = None
    intensities_in_hr: list[float] | None = None


class RunCreate(BaseModel):
    scenario_id: str
    runner: Literal["local", "daytona"] = "local"
    params: dict[str, float] = Field(default_factory=dict)
    timeout_s: int = Field(600, ge=30, le=3600)


def scenario_out(rec: dict[str, Any]) -> dict[str, Any]:
    keys = ("name", "kind", "area_id", "step_min", "intensities_in_hr", "total_depth_in", "peak_in_hr", "duration_min",
            "assumptions", "source_ref", "content_hash", "created_by")
    return {"id": str(rec["id"]), **{k: rec.get(k) for k in keys}, "created_at": iso_z(rec.get("created_at"))}


def run_out(rec: dict[str, Any]) -> dict[str, Any]:
    run_id = str(rec["id"])
    return {
        "id": run_id,
        "status": rec["status"],
        "scenario_id": str(rec["scenario"]),
        "area_id": rec["area_id"],
        "runner": rec["runner"],
        "params": rec.get("params") or {},
        "model": rec.get("model") or {},
        "queued_at": iso_z(rec.get("queued_at")),
        "started_at": iso_z(rec.get("started_at")),
        "finished_at": iso_z(rec.get("finished_at")),
        "timeout_s": rec["timeout_s"],
        "inp_sha256": rec.get("inp_sha256"),
        "summary": rec.get("summary"),
        "error": rec.get("error"),
        "runner_meta": rec.get("runner_meta"),
        "knowledge_type": "predicted",
        "links": {"self": f"/api/v1/simulation-runs/{run_id}", "results": f"/api/v1/simulation-runs/{run_id}/results",
                  "model": f"/api/v1/simulation-runs/{run_id}/model.inp", "logs": f"/api/v1/simulation-runs/{run_id}/logs"},
    }


def _sim_error(exc: SimulationError) -> Problem:
    status = 404 if exc.code == "not_found" else 422
    return Problem(status, "not-found" if status == 404 else "invalid-parameter", "Cannot start run", str(exc),
                   [{"param": "body", "code": exc.code, "message": str(exc)}])


@router.get("/scenarios")
def list_scenarios(area_id: str | None = None, db: Any = Depends(get_db)) -> dict[str, Any]:
    where = "WHERE area_id = $area " if area_id else ""
    rows = run_one(db, f"SELECT * FROM rainfall_scenario {where}ORDER BY created_at DESC;", {"area": area_id})
    return {"api_version": "1.0", "scenarios": [scenario_out(r) for r in rows]}


@router.post("/scenarios", status_code=201)
def create_scenario(body: ScenarioCreate, request: Request) -> dict[str, Any]:
    sim = request.app.state.sim
    if body.kind == "design_storm":
        if body.preset is None:
            raise Problem(422, "invalid-parameter", "Invalid parameter", f"preset must be one of {sorted(DESIGN_STORMS)}")
        key, doc = design_storm(body.preset, body.area_id, body.duration_min)
    elif body.kind == "custom":
        try:
            key, doc = custom_storm(body.area_id, body.name or "Custom storm", body.intensities_in_hr or [])
        except ValueError as exc:
            raise Problem(422, "invalid-parameter", "Invalid parameter", str(exc)) from None
    else:
        with sim.lock:
            area = q.get_record(sim.db, "area", body.area_id)
        if area is None:
            raise Problem(404, "not-found", "Not found", f"no area {body.area_id}")
        w, s, e, n = area["bbox"]
        try:
            key, doc = nws_forecast(body.area_id, (w + e) / 2, (s + n) / 2, body.hours)
        except Exception as exc:  # noqa: BLE001 - upstream failure is reported, never faked
            raise Problem(503, "upstream-unavailable", "NWS unavailable", f"{type(exc).__name__}: {exc}") from None
    sim.save_scenario(key, doc)
    with sim.lock:
        return scenario_out(q.get_record(sim.db, "rainfall_scenario", key))


@router.post("/simulation-runs", status_code=202)
def create_run(body: RunCreate, request: Request) -> dict[str, Any]:
    sim = request.app.state.sim
    try:
        run_key = sim.submit(feature_key(body.scenario_id, "rainfall_scenario", param="scenario_id"), body.runner, body.params, body.timeout_s)
    except SimulationError as exc:
        raise _sim_error(exc) from None
    with sim.lock:
        return run_out(q.get_record(sim.db, "simulation_run", run_key))


@router.get("/simulation-runs")
def list_runs(request: Request, limit: int = Query(50, ge=1, le=200)) -> dict[str, Any]:
    return {"api_version": "1.0", "runs": [run_out(r) for r in request.app.state.sim.list_runs(limit)]}


@router.get("/simulation-runs/{run_id}")
def get_run(run_id: str, db: Any = Depends(get_db)) -> dict[str, Any]:
    rec = q.get_record(db, "simulation_run", feature_key(run_id, "simulation_run"))
    if rec is None:
        raise Problem(404, "not-found", "Not found", f"no simulation run {run_id}")
    return run_out(rec)


@router.get("/simulation-runs/{run_id}/results", response_model=LayerCollection)
def run_results(
    run_id: str,
    bbox: str = Query(..., description="minLon,minLat,maxLon,maxLat (WGS84)"),
    limit: int = Query(DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
    cursor: str | None = None,
    db: Any = Depends(get_db),
) -> dict[str, Any]:
    key = feature_key(run_id, "simulation_run")
    rec = q.get_record(db, "simulation_run", key)
    if rec is None:
        raise Problem(404, "not-found", "Not found", f"no simulation run {run_id}")
    if rec["status"] != "succeeded":
        raise Problem(409, "run-not-finished", "Run not finished", f"run {run_id} is {rec['status']}")
    box = parse_bbox(bbox)
    scenario = q.get_record(db, "rainfall_scenario", rec["scenario"].id)
    page = q.page_in_bbox(db, "flood_result", box, limit=limit, after=decode_cursor(cursor), where="run = $run", vars={"run": rec["id"]})
    label = scenario["name"] if scenario else None
    return collection([flood_result_feature(r, scenario_label=label) for r in page.records], layer="simulation_results", bbox=box,
                      filters={"run_id": str(rec["id"])}, limit=limit, next_after=page.next_after, sources=[])


def _artifact(db: Any, run_id: str, name: str) -> str:
    rec = q.get_record(db, "simulation_run", feature_key(run_id, "simulation_run"))
    if rec is None or not rec.get("artifacts_dir"):
        raise Problem(404, "not-found", "Not found", f"no artifacts for {run_id}")
    from pathlib import Path

    path = Path(rec["artifacts_dir"]) / name
    if not path.exists():
        raise Problem(404, "not-found", "Not found", f"{name} not written for {run_id}")
    return path.read_text(errors="replace")


@router.get("/simulation-runs/{run_id}/model.inp", response_class=PlainTextResponse)
def run_model(run_id: str, db: Any = Depends(get_db)) -> str:
    return _artifact(db, run_id, "model.inp")


@router.get("/simulation-runs/{run_id}/logs", response_class=PlainTextResponse)
def run_logs(run_id: str, db: Any = Depends(get_db)) -> str:
    parts = []
    for name in ("worker.log", "model.rpt"):
        try:
            parts.append(f"===== {name} =====\n" + _artifact(db, run_id, name))
        except Problem:
            continue
    if not parts:
        raise Problem(404, "not-found", "Not found", f"no logs for {run_id}")
    return "\n\n".join(parts)


class SweepCreate(BaseModel):
    area_id: str = "BK0601"
    presets: list[Literal["dep_limited_1_77", "dep_moderate_2_13", "dep_extreme_3_66"]] | None = None
    blockage_factors: list[float] = Field(default_factory=lambda: [0.0, 0.5, 0.9], min_length=1, max_length=5)
    runner: Literal["local", "daytona"] = "daytona"


@router.post("/simulation-sweeps", status_code=202)
def create_sweep(body: SweepCreate, request: Request) -> dict[str, Any]:
    from swale.sim import sweep

    if any(not 0 <= b <= 0.95 for b in body.blockage_factors):
        raise Problem(422, "invalid-parameter", "Invalid parameter", "blockage factors must be between 0 and 0.95")
    try:
        key = sweep.start(request.app.state.sim, body.area_id, presets=body.presets, blockage=body.blockage_factors, runner=body.runner)
    except SimulationError as exc:
        raise _sim_error(exc) from None
    return sweep.summarise(request.app.state.sim, key)


@router.get("/simulation-sweeps/{sweep_id}")
def get_sweep(sweep_id: str, request: Request) -> dict[str, Any]:
    from swale.sim import sweep

    out = sweep.summarise(request.app.state.sim, feature_key(sweep_id, "simulation_sweep"))
    if out is None:
        raise Problem(404, "not-found", "Not found", f"no sweep {sweep_id}")
    return out
