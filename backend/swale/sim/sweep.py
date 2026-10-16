"""Simulation sweeps: every DEP design storm at several blockage levels, run in parallel Daytona sandboxes.

A sweep records which runs it started and summarises them as a storm x blockage grid. It also measures what
concurrency Daytona actually gave: how many runs overlapped in time, and the speed-up over running them one
after another. Runs that hit an account limit fail with Daytona's own message, which the sweep reports.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from swale.core.timeutil import iso_z, utcnow
from swale.db import queries as q
from swale.sim.scenarios import DESIGN_STORMS, design_storm

DEFAULT_BLOCKAGE = (0.0, 0.5, 0.9)


def start(sim: Any, area_id: str, *, presets: list[str] | None, blockage: list[float], runner: str) -> str:
    presets = presets or sorted(DESIGN_STORMS)
    runs = []
    for preset in presets:
        scen_key, doc = design_storm(preset, area_id)
        sim.save_scenario(scen_key, doc)
        for b in blockage:
            run_key = sim.submit(scen_key, runner, {"blockage_factor": b}, 900)
            runs.append({"run_id": f"simulation_run:{run_key}", "preset": preset, "scenario": doc["name"], "blockage_factor": b})
    key = f"{area_id}_{utcnow():%Y%m%dT%H%M%SZ}_{uuid.uuid4().hex[:4]}"
    with sim.lock:
        q.upsert_many(sim.db, "simulation_sweep", [(key, {"area_id": area_id, "runner": runner, "created_at": utcnow(),
                                                           "presets": presets, "blockage": blockage, "runs": runs})])
    return key


def _overlap(intervals: list[tuple[datetime, datetime]]) -> int:
    events = sorted([(a, 1) for a, _ in intervals] + [(b, -1) for _, b in intervals])
    peak = cur = 0
    for _, d in events:
        cur += d
        peak = max(peak, cur)
    return peak


def summarise(sim: Any, key: str) -> dict[str, Any] | None:
    with sim.lock:
        sweep = q.get_record(sim.db, "simulation_sweep", key)
        if sweep is None:
            return None
        recs = {r["run_id"]: q.get_record(sim.db, "simulation_run", r["run_id"].split(":", 1)[1]) for r in sweep["runs"]}
    cells, intervals, durations, errors = [], [], [], []
    for r in sweep["runs"]:
        rec = recs[r["run_id"]] or {}
        sm = rec.get("summary") or {}
        cells.append({**r, "status": rec.get("status"), "deep": sm.get("deep"), "basins_flooded": sm.get("basins_flooded"),
                      "flood_volume_ft3": sm.get("total_flood_volume_ft3"), "wall_s": (rec.get("runner_meta") or {}).get("wall_s"),
                      "error": (rec.get("error") or {}).get("message")})
        if rec.get("started_at") and rec.get("finished_at"):
            intervals.append((rec["started_at"], rec["finished_at"]))
            durations.append((rec["finished_at"] - rec["started_at"]).total_seconds())
        if rec.get("error"):
            errors.append(rec["error"].get("message"))
    done = [c for c in cells if c["status"] in ("succeeded", "failed", "timed_out")]
    span = (max(b for _, b in intervals) - min(a for a, _ in intervals)).total_seconds() if intervals else None
    return {
        "id": f"simulation_sweep:{key}", "area_id": sweep["area_id"], "runner": sweep["runner"], "created_at": iso_z(sweep["created_at"]),
        "status": "finished" if len(done) == len(cells) else "running", "runs": cells,
        "progress": {"finished": len(done), "total": len(cells), "succeeded": sum(c["status"] == "succeeded" for c in cells)},
        "concurrency": {"configured": sim.remote_executor._max_workers if sweep["runner"] == "daytona" else 1,
                        "peak_overlap": _overlap(intervals), "elapsed_s": round(span, 1) if span else None,
                        "sum_of_run_s": round(sum(durations), 1) if durations else None,
                        "speedup": round(sum(durations) / span, 2) if span else None,
                        "limit_errors": sorted({e for e in errors if e and any(w in e.lower() for w in ("limit", "quota", "exceed", "429"))})},
        "knowledge_type": "predicted",
        "note": "Swale SWMM demonstrator (schematic, uncalibrated). Blockage narrows the inlets of basins where DEP recorded an obstruction.",
    }
