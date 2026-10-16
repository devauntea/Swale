"""Briefing tests: the template always passes the checks, the checks catch planted overclaims, and the API works keyless."""

from datetime import datetime, timezone
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from swale.ai.briefing import Briefing, Stop, check, evidence_pack, spoken_text, template_briefing
from swale.api.app import create_app
from swale.config import Settings
from swale.ingest.bundle import read_bundle
from swale.ingest.pipeline import ingest_bundle
from swale.risk.ranking import rank

FIXTURE = Path(__file__).parent / "fixtures" / "bundle_henry_st"
NOW = datetime(2026, 10, 16, 5, 0, tzinfo=timezone.utc)
KEYS = ("AWS_ACCESS_KEY_ID", "AWS_PROFILE", "AWS_BEARER_TOKEN_BEDROCK", "ARIZE_SPACE_ID", "ARIZE_API_KEY", "ELEVENLABS_API_KEY")


@pytest.fixture()
def keyless(monkeypatch):
    for k in KEYS:
        monkeypatch.delenv(k, raising=False)


@pytest.fixture(scope="module")
def loaded():
    app = create_app(Settings(db_url="mem://", dev_map=False))
    with TestClient(app) as client:
        bundle = read_bundle(FIXTURE)
        ingest_bundle(app.state.db, bundle, mode="snapshot", now=NOW)
        pack = evidence_pack(rank(app.state.db, bundle.bbox, now=NOW, limit=5)["items"], area_label="Henry St", run_label=None)
        yield app, client, bundle, pack


def test_template_briefing_passes_its_own_checks(loaded):
    *_, pack = loaded
    briefing = template_briefing(pack)
    assert check(briefing, pack) == []
    assert len(briefing.stops) == len(pack["basins"])
    assert "Stop 1" in spoken_text(briefing, pack)


def test_checks_catch_planted_overclaims(loaded):
    *_, pack = loaded
    real = pack["basins"][0]
    evidence = [e for f in real["factors"] for e in f["evidence_ids"]][:1] or ["incident:none"]
    bad = Briefing(headline="Streets are currently flooded", caveat="", stops=[
        Stop(basin_id=real["basin_id"], why="ok", action="go", evidence_ids=evidence + ["incident:nyc311_00000000"]),
        Stop(basin_id="catch_basin:NOT_IN_PACK", why="x", action="y", evidence_ids=[]),
    ])
    problems = check(bad, pack)
    assert any("not in the pack" in p for p in problems)
    assert any("unknown basin" in p for p in problems)
    assert any("no evidence cited" in p for p in problems)
    assert any("forbidden claim" in p for p in problems)


def test_confirmed_needs_a_dep_finding(loaded):
    *_, pack = loaded
    unconfirmed = next((b for b in pack["basins"] if not any(f["id"] == "confirmed_obstruction_history" for f in b["factors"])), None)
    if unconfirmed is None:
        pytest.skip("every basin in the fixture pack has a DEP finding")
    ids = [e for f in unconfirmed["factors"] for e in f["evidence_ids"]]
    b = Briefing(headline="h", caveat="c", stops=[Stop(basin_id=unconfirmed["basin_id"], why="A confirmed blockage.", action="Clear it.", evidence_ids=ids)])
    assert any("without a DEP finding" in p for p in check(b, pack))


def test_api_briefing_falls_back_to_template_without_keys(loaded, keyless):
    app, client, bundle, _ = loaded
    body = client.post("/api/v1/briefings", json={"bbox": ",".join(map(str, bundle.bbox.as_list())), "top_n": 3}).json()
    assert body["source"] == "template" and body["knowledge_type"] == "inferred"
    assert "AWS" in body["error"] and body["audio_error"] == "ELEVENLABS_API_KEY not set"
    assert len(body["briefing"]["stops"]) == 3
    assert client.get(f"/api/v1/briefings/{body['id']}").json()["pack"]["basins"][0]["rank"] == 1
    assert client.get(f"/api/v1/briefings/{body['id']}/audio").status_code == 404
