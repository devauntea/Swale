import json
from pathlib import Path

from fastapi.testclient import TestClient

from swale.api.app import create_app
from swale.cli import main
from swale.config import Settings

FIXTURE = Path(__file__).parent / "fixtures" / "bundle_henry_st"


def test_ingest_from_snapshot_prints_a_summary(tmp_path, monkeypatch, capsys):
    monkeypatch.setenv("SWALE_DB_URL", f"surrealkv://{tmp_path / 'swale.db'}")
    assert main(["ingest", "--from-snapshot", str(FIXTURE)]) == 0
    summary = json.loads(capsys.readouterr().out)
    assert summary["mode"] == "snapshot"
    assert {r["source"] for r in summary["reports"]} == {"nyc_nta_2020", "nyc_catch_basins", "nyc311"}


def test_dev_map_is_served_when_enabled():
    with TestClient(create_app(Settings(db_url="mem://", dev_map=True))) as client:
        response = client.get("/dev/map")
    assert response.status_code == 200
    assert "maplibre-gl@4.7.1" in response.text


def test_dev_map_is_absent_when_disabled():
    with TestClient(create_app(Settings(db_url="mem://", dev_map=False))) as client:
        assert client.get("/dev/map").status_code == 404
