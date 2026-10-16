"""Field inspections, DEP flood-map polygons, and how both feed ranking risk-v2 (real Henry Street fixture)."""

from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from swale.api.app import create_app
from swale.config import Settings
from swale.db import queries as q
from swale.ingest import dep_flood_maps as dep
from swale.ingest.bundle import read_bundle
from swale.ingest.pipeline import ingest_bundle
from swale.risk import inspections as insp
from swale.risk.ranking import rank

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


def _item(out, key):
    return next(it for it in out["items"] if it["basin"]["id"].id == key)


def _square(lon, lat, d=0.0001):
    return {"type": "Polygon", "coordinates": [[[lon - d, lat - d], [lon + d, lat - d], [lon + d, lat + d], [lon - d, lat + d], [lon - d, lat - d]]]}


def test_inspection_api_validates_and_lists(app):
    client, db, bundle = app.state.client, app.state.db, app.state.bundle
    basin = q.page_in_bbox(db, "catch_basin", bundle.bbox, limit=1).records[0]
    bid = str(basin["id"])
    made = client.post("/api/v1/inspections", json={"basin_id": bid, "result": "debris_found", "notes": "leaves", "inspector": "crew 4"})
    assert made.status_code == 201
    body = made.json()
    assert body["knowledge_type"] == "observed" and body["source"] == "swale_field_entry" and body["basin_id"] == bid
    listed = client.get("/api/v1/inspections", params={"basin_id": bid}).json()
    assert listed["count"] >= 1 and listed["items"][0]["id"] == body["id"]
    assert client.post("/api/v1/inspections", json={"basin_id": bid, "result": "looked fine"}).status_code == 422
    assert client.post("/api/v1/inspections", json={"basin_id": "catch_basin:NOPE", "result": "clear"}).status_code == 404
    future = (datetime.now(timezone.utc) + timedelta(days=2)).isoformat()
    assert client.post("/api/v1/inspections", json={"basin_id": bid, "result": "clear", "inspected_at": future}).status_code == 422
    naive = client.post("/api/v1/inspections", json={"basin_id": bid, "result": "clear", "inspected_at": "2026-10-01T00:00:00"})
    assert naive.status_code == 422


def test_field_inspection_raises_or_halves_priority(app):
    db, bundle = app.state.db, app.state.bundle
    before = rank(db, bundle.bbox, now=NOW, limit=5000)
    top_key = before["items"][0]["basin"]["id"].id
    low = before["items"][-1]
    low_key = low["basin"]["id"].id
    assert any(m["id"] == "field_inspection" for m in _item(before, top_key)["missing_factors"])

    insp.record(db, low_key, result="debris_found", inspected_at=NOW - timedelta(days=3), now=NOW)
    insp.record(db, top_key, result="cleaned", inspected_at=NOW - timedelta(days=2), now=NOW)
    after = rank(db, bundle.bbox, now=NOW, limit=5000)

    raised = _item(after, low_key)
    f = next(f for f in raised["factors"] if f["id"] == "field_inspection")
    assert f["value"] == 1.0 and f["knowledge_type"] == "observed" and f["evidence_ids"]
    assert raised["score"] > low["score"]

    cleaned = _item(after, top_key)
    assert [a["id"] for a in cleaned["adjustments"]] == ["recent_clean"]
    assert cleaned["score"] < before["items"][0]["score"]
    # Evidence dated after `now` never counts: ranking as of last month ignores these inspections.
    earlier = rank(db, bundle.bbox, now=NOW - timedelta(days=30), limit=5000)
    assert not _item(earlier, top_key)["adjustments"]


def test_dep_flood_map_factor_and_layer(app):
    db, bundle, client = app.state.db, app.state.bundle, app.state.client
    out = rank(db, bundle.bbox, now=NOW, limit=5000)
    assert all(any(m["id"] == "dep_flood_map_exposure" for m in it["missing_factors"]) for it in out["items"])

    basin = out["items"][len(out["items"]) // 2]["basin"]
    data = {"fetched_at": NOW.isoformat(), "scenarios": {"dep_moderate_current": {
        "label": "DEP Moderate storm (2.13 in/hr) with current sea levels", "intensity_in_hr": 2.13, "sea_level": "current",
        "features": [{"category": 2, "depth_class": "deep", "area_ft2": 1200.0, "geometry": _square(basin["lon"], basin["lat"])}]}}}
    assert dep.load(db, data, "BK0601", NOW) == {"dep_moderate_current": 1}

    after = rank(db, bundle.bbox, now=NOW, limit=5000)
    hit = next(f for f in _item(after, basin["id"].id)["factors"] if f["id"] == "dep_flood_map_exposure")
    assert hit["value"] == 1.0 and hit["knowledge_type"] == "predicted" and hit["evidence_ids"][0].startswith("flood_map_feature:")
    far = [it for it in after["items"] if it["basin"]["id"].id != basin["id"].id][0]
    assert next(f for f in far["factors"] if f["id"] == "dep_flood_map_exposure")["value"] in (0.0, 1.0)

    layer = client.get("/api/v1/flood-maps", params={"bbox": ",".join(map(str, bundle.bbox.as_list()))}).json()
    assert layer["meta"]["layer"] == "dep_flood_maps" and len(layer["features"]) == 1
    props = layer["features"][0]["properties"]
    assert props["knowledge_type"] == "predicted" and props["depth_class"] == "deep"
    assert client.get("/api/v1/simulation-runs/simulation_run:nope/compare-dep").status_code == 404


def test_snapshot_round_trip(tmp_path):
    data = {"fetched_at": NOW.isoformat(), "scenarios": {}, "skipped": {"dep_limited_current": "unreadable"}}
    path = tmp_path / "dep.json.gz"
    dep.write_snapshot(data, path)
    assert dep.read_snapshot(path) == data and dep.read_snapshot(tmp_path / "missing.json.gz") is None
