"""Risk ranking tests on the real Henry Street fixture."""

from datetime import datetime, timezone
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from swale.api.app import create_app
from swale.config import Settings
from swale.db import queries as q
from swale.ingest.bundle import read_bundle
from swale.ingest.pipeline import ingest_bundle
from swale.risk.ranking import FACTORS, methodology, rank

FIXTURE = Path(__file__).parent / "fixtures" / "bundle_henry_st"
NOW = datetime(2026, 10, 16, 5, 0, tzinfo=timezone.utc)


@pytest.fixture(scope="module")
def app():
    application = create_app(Settings(db_url="mem://", dev_map=False))
    with TestClient(application) as client:
        bundle = read_bundle(FIXTURE)
        ingest_bundle(application.state.db, bundle, mode="snapshot", now=NOW)
        application.state.client = client
        application.state.bundle = bundle
        yield application


def test_weights_sum_to_one():
    assert round(sum(f.weight for f in FACTORS), 6) == 1.0
    assert methodology()["method_version"] == "risk-v2"


def test_rank_is_sorted_explained_and_backed_by_real_evidence(app):
    db, bundle = app.state.db, app.state.bundle
    out = rank(db, bundle.bbox, now=NOW, limit=500)
    items = out["items"]
    assert items and [it["score"] for it in items] == sorted((it["score"] for it in items), reverse=True)
    for it in items:
        mult = 1.0
        for adj in it["adjustments"]:
            mult *= adj["multiplier"]
        assert abs(sum(f["contribution"] for f in it["factors"]) * mult - it["score"]) < 0.2
        assert {m["id"] for m in it["missing_factors"]} >= {"predicted_flooding"}
        for f in it["factors"]:
            for evidence_id in f["evidence_ids"]:
                table, key = evidence_id.split(":", 1)
                assert q.get_record(db, table, key) is not None
    top = items[0]
    assert top["score"] > 0
    assert any(f["evidence_ids"] for f in top["factors"])


def test_confirmed_obstruction_needs_a_dep_finding(app):
    db, bundle = app.state.db, app.state.bundle
    for it in rank(db, bundle.bbox, now=NOW, limit=500)["items"]:
        f = next(f for f in it["factors"] if f["id"] == "confirmed_obstruction_history")
        for evidence_id in f["evidence_ids"]:
            assert q.get_record(db, "incident", evidence_id.split(":", 1)[1])["verification_status"] == "agency_found_obstruction"


def test_api_returns_inferred_features_and_methodology(app):
    client, bundle = app.state.client, app.state.bundle
    body = client.get("/api/v1/risk-rankings", params={"bbox": ",".join(map(str, bundle.bbox.as_list())), "limit": 10}).json()
    assert body["meta"]["layer"] == "risk_rankings" and body["meta"]["ranked"] >= len(body["features"])
    props = body["features"][0]["properties"]
    assert props["knowledge_type"] == "inferred" and props["rank"] == 1 and props["method_version"] == "risk-v2"
    assert client.get("/api/v1/risk-rankings/methodology").json()["factors"][0]["id"] == "confirmed_obstruction_history"
    missing = client.get("/api/v1/risk-rankings", params={"bbox": ",".join(map(str, bundle.bbox.as_list())), "run_id": "simulation_run:nope"})
    assert missing.status_code == 404


def test_validation_uses_only_earlier_evidence_and_reports_lift(app):
    from swale.risk.validation import validate

    db, bundle = app.state.db, app.state.bundle
    cutoff = datetime(2025, 10, 1, tzinfo=timezone.utc)
    out = validate(db, bundle.bbox, cutoff=cutoff, window_days=365, cutoffs=(5,))
    assert out["basins_ranked"] > 0 and 0 <= out["base_rate"]["any"] <= 1
    for row in out["precision_at"]:
        assert 0 <= row["any"] <= 1
    future = rank(db, bundle.bbox, now=cutoff, limit=500)["items"]
    for it in future:  # no evidence dated after the cutoff may contribute
        for f in it["factors"]:
            for evidence_id in f["evidence_ids"]:
                rec = q.get_record(db, *evidence_id.split(":", 1))
                if rec and "reported_at" in rec:
                    assert rec["reported_at"] <= cutoff
    bad = app.state.client.get("/api/v1/risk-rankings/validation", params={"cutoff": "2099-01-01"})
    assert bad.status_code == 422
