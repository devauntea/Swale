"""Simulation tests: report parsing, network building, a real SWMM run, and the API flow."""

import time
from datetime import datetime, timezone
from pathlib import Path

from fastapi.testclient import TestClient

from swale.api.app import create_app
from swale.config import Settings
from swale.ingest.bundle import read_bundle
from swale.ingest.pipeline import ingest_bundle
from swale.sim.network import Basin, build_model
from swale.sim.runners import LocalRunner
from swale.sim.service import risk_class
from swale.sim.worker import parse_report

FIXTURE = Path(__file__).parent / "fixtures" / "bundle_henry_st"
SQUARE = {"type": "Polygon", "coordinates": [[[-74.0, 40.6], [-73.99, 40.6], [-73.99, 40.61], [-74.0, 40.61], [-74.0, 40.6]]]}
# Synthetic test geometry; never stored as data.
BASINS = [Basin("A", -73.998, 40.602, False), Basin("B", -73.995, 40.605, True), Basin("C", -73.992, 40.608, False)]

# Copied from a real SWMM 5.2.4 report produced while building this feature.
REPORT = """
  *********************
  Node Flooding Summary
  *********************

  Flooding refers to all water that overflows a node, whether it ponds or not.
  --------------------------------------------------------------------------
                                                             Total   Maximum
                                 Maximum   Time of Max       Flood    Ponded
                        Hours       Rate    Occurrence      Volume     Depth
  Node                 Flooded       CFS   days hr:min    10^6 gal      Feet
  --------------------------------------------------------------------------
  J1                      1.61      1.72      0  00:16       0.033     4.353


  ***********************
  Outfall Loading Summary
  ***********************
  Continuity Error (%) .....        -0.038
  Continuity Error (%) .....        -0.013
"""


def test_parse_report_reads_the_flooding_table_and_continuity():
    out = parse_report(REPORT)
    assert out["flooding"] == [{"node": "J1", "hours_flooded": 1.61, "max_rate_cfs": 1.72, "time_of_max": "0d 00:16",
                                "volume_mgal": 0.033, "max_ponded_depth_ft": 4.353}]
    assert out["runoff_continuity_error_pct"] == -0.038
    assert out["routing_continuity_error_pct"] == -0.013
    assert out["errors"] == []


def test_risk_classes_follow_dep_depth_bands():
    assert [risk_class(d) for d in (0.5, 4.0, 11.9, 12.0)] == ["minor", "nuisance", "nuisance", "deep"]


def test_build_model_applies_blockage_only_to_obstructed_basins():
    built = build_model(BASINS, SQUARE, [2.13] * 12, 5, "test")
    assert built.counts == {"basins": 3, "junctions": 3, "subcatchments": 3, "duplicate_locations": 0, "obstructed": 1}
    heights = {built.nodes[n]: h for n, h in built.inlet_height_ft.items()}
    assert heights == {"A": 0.5, "B": 0.25, "C": 0.5}
    assert "[ORIFICES]" in built.inp and "TRUNK" in built.inp
    assert built.inp.count("STORM  ") == 13  # 12 steps of rain, then an explicit zero


def test_local_runner_runs_real_swmm(tmp_path):
    built = build_model(BASINS, SQUARE, [3.66] * 12, 5, "test")
    (tmp_path / "model.inp").write_text(built.inp)
    outcome = LocalRunner().run(tmp_path, timeout_s=120)
    assert outcome.status == "succeeded", outcome.error
    assert outcome.results["precip_in"] == 3.66
    assert abs(outcome.results["routing_continuity_error_pct"]) < 1.0
    assert outcome.results["engine"].startswith("SWMM 5.2")


def test_simulation_api_flow():
    app = create_app(Settings(db_url="mem://", dev_map=False))
    with TestClient(app) as client:
        ingest_bundle(app.state.db, read_bundle(FIXTURE), mode="snapshot", now=datetime(2026, 10, 16, 5, 0, tzinfo=timezone.utc))
        app.state.sim.startup(["BK0601"])
        scenarios = client.get("/api/v1/scenarios", params={"area_id": "BK0601"}).json()["scenarios"]
        moderate = next(s for s in scenarios if s["id"].startswith("rainfall_scenario:dep_moderate"))
        assert moderate["total_depth_in"] == 2.13
        run = client.post("/api/v1/simulation-runs", json={"scenario_id": moderate["id"]}).json()
        for _ in range(60):
            run = client.get(f"/api/v1/simulation-runs/{run['id']}").json()
            if run["status"] not in ("queued", "running"):
                break
            time.sleep(0.5)
        assert run["status"] == "succeeded", run["error"]
        assert run["summary"]["precip_in"] == 2.13
        bbox = "-73.9982,40.6896,-73.9942,40.6922"
        results = client.get(f"/api/v1/simulation-runs/{run['id']}/results", params={"bbox": bbox}).json()
        assert all(f["properties"]["knowledge_type"] == "predicted" for f in results["features"])
        assert client.get(f"/api/v1/simulation-runs/{run['id']}/model.inp").text.startswith("[TITLE]")
        bad = client.post("/api/v1/simulation-runs", json={"scenario_id": moderate["id"], "params": {"nope": 1}})
        assert bad.status_code == 422
