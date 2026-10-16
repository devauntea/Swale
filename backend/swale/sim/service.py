"""Simulation runs: validate, queue, run SWMM outside the DB lock, store predicted results per basin."""

from __future__ import annotations

import os
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from pathlib import Path
from typing import Any

from swale.core.timeutil import utcnow
from swale.db import queries as q
from swale.db.connection import run, run_one
from swale.db.geometry import point, to_geojson
from swale.ingest.pipeline import code_version
from swale.sim.network import ASSUMPTIONS, DEFAULTS, MODEL_NAME, MODEL_VERSION, Basin, build_model
from swale.sim.runners import RUNNERS
from swale.sim.scenarios import DESIGN_STORMS, design_storm

FT3_PER_MGAL = 133680.556
OBSTRUCTION_WINDOW = timedelta(days=365)
TUNABLE = set(DEFAULTS)


class SimulationError(ValueError):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


def risk_class(depth_in: float) -> str:
    """DEP flood-map style classes: under 4 in minor, 4-12 in nuisance, 12 in or more deep."""
    return "deep" if depth_in >= 12 else "nuisance" if depth_in >= 4 else "minor"


class SimulationService:
    def __init__(self, db: Any, lock: threading.Lock, runs_dir: Path) -> None:
        self.db, self.lock, self.runs_dir = db, lock, runs_dir
        self.executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="swmm")
        # Daytona runs each use their own sandbox, so several can run at once (SWALE_DAYTONA_CONCURRENCY, default 6).
        self.remote_executor = ThreadPoolExecutor(max_workers=int(os.environ.get("SWALE_DAYTONA_CONCURRENCY", "6")), thread_name_prefix="daytona")

    def startup(self, area_ids: list[str]) -> None:
        with self.lock:
            for area_id in area_ids:
                for key in DESIGN_STORMS:
                    scenario_key, doc = design_storm(key, area_id)
                    q.upsert_many(self.db, "rainfall_scenario", [(scenario_key, doc)])
            run(self.db, "UPDATE simulation_run SET status = 'failed', finished_at = time::now(), "
                         "error = {code: 'worker_lost', message: 'the server restarted while this run was in progress'} "
                         "WHERE status IN ['queued', 'running'];")

    def shutdown(self) -> None:
        self.executor.shutdown(wait=False, cancel_futures=True)
        self.remote_executor.shutdown(wait=False, cancel_futures=True)

    def save_scenario(self, key: str, doc: dict[str, Any]) -> None:
        with self.lock:
            q.upsert_many(self.db, "rainfall_scenario", [(key, doc)])

    def submit(self, scenario_key: str, runner: str, overrides: dict[str, float], timeout_s: int) -> str:
        if runner not in RUNNERS:
            raise SimulationError("bad_runner", f"runner must be one of {sorted(RUNNERS)}")
        if runner == "daytona" and not RUNNERS["daytona"].available():
            raise SimulationError("runner_unavailable", "the daytona runner needs DAYTONA_API_KEY on the server")
        unknown = set(overrides) - TUNABLE
        if unknown:
            raise SimulationError("bad_param", f"unknown model parameters: {sorted(unknown)}")
        with self.lock:
            scenario = q.get_record(self.db, "rainfall_scenario", scenario_key)
            if scenario is None:
                raise SimulationError("not_found", f"no rainfall scenario {scenario_key}")
            if not q.area_basins(self.db, scenario["area_id"]):
                raise SimulationError("missing_inputs", f"no catch basins loaded for area {scenario['area_id']}")
            now = utcnow()
            run_key = f"{now:%Y%m%dT%H%M%SZ}_{uuid.uuid4().hex[:6]}"
            run(self.db, "CREATE $record CONTENT $doc;", {"record": q.rid("simulation_run", run_key), "doc": {
                "scenario": q.rid("rainfall_scenario", scenario_key), "area_id": scenario["area_id"], "runner": runner,
                "status": "queued", "params": overrides, "queued_at": now, "timeout_s": timeout_s, "code_version": code_version(),
                "model": {"name": MODEL_NAME, "version": MODEL_VERSION},
            }})
        (self.remote_executor if runner == "daytona" else self.executor).submit(self._execute, run_key, scenario_key, runner, overrides, timeout_s)
        return run_key

    def _execute(self, run_key: str, scenario_key: str, runner_name: str, overrides: dict[str, float], timeout_s: int) -> None:
        record = q.rid("simulation_run", run_key)
        run_dir = self.runs_dir / run_key
        try:
            with self.lock:
                scenario = q.get_record(self.db, "rainfall_scenario", scenario_key)
                area = q.get_record(self.db, "area", scenario["area_id"])
                rows = q.area_basins(self.db, scenario["area_id"])
                obstructed = q.obstructed_basins(self.db, utcnow() - OBSTRUCTION_WINDOW)
                run(self.db, "UPDATE $record MERGE {status: 'running', started_at: time::now()};", {"record": record})
            basins = [Basin(r["key"], r["lon"], r["lat"], r["key"] in obstructed) for r in rows]
            built = build_model(basins, to_geojson(area["geom"]), scenario["intensities_in_hr"], scenario["step_min"],
                                f"{scenario['name']} over {scenario['area_id']}", overrides)
            run_dir.mkdir(parents=True, exist_ok=True)
            (run_dir / "model.inp").write_text(built.inp)
            with self.lock:
                run(self.db, "UPDATE $record MERGE $fields;", {"record": record, "fields": {
                    "inp_sha256": built.sha256, "artifacts_dir": str(run_dir),
                    "model": {"name": MODEL_NAME, "version": MODEL_VERSION, "parameters": built.params, "assumptions": ASSUMPTIONS,
                              "counts": built.counts},
                }})
            outcome = RUNNERS[runner_name]().run(run_dir, timeout_s)
            by_basin = {b.key: b for b in basins}
            docs = []
            if outcome.results:
                now = utcnow()
                for f in outcome.results["flooding"]:
                    key = built.nodes.get(f["node"])
                    if key is None:
                        continue
                    b = by_basin[key]
                    depth_in = round(f["max_ponded_depth_ft"] * 12, 2)
                    docs.append((f"{run_key}_{key}", {
                        "run": record, "basin": q.rid("catch_basin", key), "geom": point(b.lon, b.lat), "lon": b.lon, "lat": b.lat,
                        "hours_flooded": f["hours_flooded"], "max_flood_rate_cfs": f["max_rate_cfs"],
                        "flood_volume_ft3": round(f["volume_mgal"] * FT3_PER_MGAL, 1), "max_ponded_depth_in": depth_in,
                        "risk_class": risk_class(depth_in), "catchment_ac": built.catchment_ac.get(f["node"]),
                        "inlet_height_ft": built.inlet_height_ft[f["node"]], "blockage_applied": b.obstructed,
                        "knowledge_type": "predicted", "generated_at": now,
                    }))
            summary = None
            if outcome.results:
                r = outcome.results
                summary = {
                    "basins_modeled": built.counts["junctions"], "basins_flooded": len(docs),
                    "basins_with_blockage_applied": built.counts["obstructed"],
                    "deep": sum(1 for _, d in docs if d["risk_class"] == "deep"),
                    "nuisance": sum(1 for _, d in docs if d["risk_class"] == "nuisance"),
                    "total_flood_volume_ft3": round(sum(d["flood_volume_ft3"] for _, d in docs), 1),
                    "max_ponded_depth_in": max((d["max_ponded_depth_in"] for _, d in docs), default=0.0),
                    "precip_in": r.get("precip_in"), "runoff_continuity_error_pct": r.get("runoff_continuity_error_pct"),
                    "routing_continuity_error_pct": r.get("routing_continuity_error_pct"), "engine": r.get("engine"),
                    "elapsed_s": r.get("elapsed_s"), "warnings": r.get("warnings", []),
                }
            with self.lock:
                q.upsert_many(self.db, "flood_result", docs)
                run(self.db, "UPDATE $record MERGE $fields;", {"record": record, "fields": {
                    "status": outcome.status, "finished_at": utcnow(), "summary": summary, "error": outcome.error,
                    "runner_meta": outcome.meta,
                }})
        except Exception as exc:  # noqa: BLE001 - a run must always end in a terminal state
            with self.lock:
                run(self.db, "UPDATE $record MERGE $fields;", {"record": record, "fields": {
                    "status": "failed", "finished_at": utcnow(), "error": {"code": "internal", "message": f"{type(exc).__name__}: {exc}"},
                }})

    def list_runs(self, limit: int = 50) -> list[dict[str, Any]]:
        with self.lock:
            return run_one(self.db, "SELECT * FROM simulation_run ORDER BY queued_at DESC LIMIT $limit;", {"limit": limit})
