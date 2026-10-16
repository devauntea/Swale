"""API tests against the real Henry Street fixture loaded into an in-memory DB."""

from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote

import pytest
from fastapi.testclient import TestClient

from swale.api.app import create_app
from swale.config import Settings
from swale.core.geo import BBox
from swale.ingest.bundle import read_bundle
from swale.ingest.pipeline import ingest_bundle

FIXTURE = Path(__file__).parent / "fixtures" / "bundle_henry_st"
NOW = datetime(2026, 10, 16, 5, 0, tzinfo=timezone.utc)
SINCE = "2020-01-01T00:00:00Z"


@pytest.fixture(scope="module")
def bundle():
    return read_bundle(FIXTURE)


@pytest.fixture(scope="module")
def client(bundle):
    app = create_app(Settings(db_url="mem://", dev_map=False))
    with TestClient(app) as c:
        ingest_bundle(app.state.db, bundle, mode="snapshot", now=NOW)
        yield c


@pytest.fixture(scope="module")
def bbox(bundle):
    return ",".join(str(v) for v in bundle.bbox.as_list())


def problem(response, status, kind):
    assert response.status_code == status
    assert response.headers["content-type"].startswith("application/problem+json")
    body = response.json()
    assert body["type"] == f"/api/v1/problems/{kind}"
    return body


def test_health_reports_db_and_sources(client):
    body = client.get("/api/v1/health").json()
    assert body["db"] == {"status": "ok", "engine": "surrealdb", "mode": "embedded"}
    assert body["status"] in ("ok", "degraded")
    assert {s["id"] for s in body["sources"]} == {"nyc311", "nyc_catch_basins", "nyc_nta_2020"}


def test_layers_list_available_and_planned_layers(client):
    layers = {layer["id"]: layer for layer in client.get("/api/v1/layers").json()["layers"]}
    assert layers["catch_basins"]["available"] and layers["catch_basins"]["knowledge_type"] == "observed"
    assert layers["incidents"]["available"] and layers["incidents"]["knowledge_type"] == "reported"
    assert not layers["risk_rankings"]["available"] and layers["risk_rankings"]["knowledge_type"] == "inferred"
    assert any(c["id"] == "catch_basin_clogged" for c in layers["incidents"]["categories"])


def test_sources_report_provenance_and_freshness(client, bundle):
    sources = {s["id"]: s for s in client.get("/api/v1/sources").json()["sources"]}
    assert sources["nyc311"]["dataset"] == "erm2-nwe9"
    assert sources["nyc311"]["last_ingested_at"] == "2026-10-16T05:00:00Z"
    assert sources["nyc311"]["fetched_at"] == bundle.fetched_at.isoformat().replace("+00:00", "Z")


def test_catch_basins_returns_exactly_the_basins_in_the_bbox(client, bundle, bbox):
    body = client.get("/api/v1/catch-basins", params={"bbox": bbox, "limit": 5000}).json()
    box = bundle.bbox
    want = {f"catch_basin:{r['unitid']}" for r in bundle.catch_basins.rows if box.contains(float(r["longitude"]), float(r["latitude"]))}
    assert {f["id"] for f in body["features"]} == want
    assert body["meta"]["count"] == len(want) and body["meta"]["truncated"] is False
    for f in body["features"]:
        lon, lat = f["geometry"]["coordinates"]
        assert box.contains(lon, lat)
        assert f["properties"]["knowledge_type"] == "observed"
        assert f["properties"]["source"]["url"].startswith("https://data.cityofnewyork.us/resource/2w2g-fk3i.json?unitid=")


def test_catch_basins_paginate_with_a_cursor(client, bbox):
    seen, cursor = [], None
    while True:
        params = {"bbox": bbox, "limit": 5, **({"cursor": cursor} if cursor else {})}
        meta = (body := client.get("/api/v1/catch-basins", params=params).json())["meta"]
        seen += [f["id"] for f in body["features"]]
        if not meta["truncated"]:
            assert meta["next_cursor"] is None
            break
        cursor = meta["next_cursor"]
    assert len(seen) == len(set(seen)) == len(client.get("/api/v1/catch-basins", params={"bbox": bbox, "limit": 5000}).json()["features"])


def test_known_incident_has_the_contract_shape(client):
    feature = client.get(f"/api/v1/incidents/{quote('incident:nyc311_69804630')}").json()
    props = feature["properties"]
    assert feature["id"] == "incident:nyc311_69804630"
    assert props["knowledge_type"] == "reported"
    assert props["reported_at"] == "2026-07-22T18:36:00Z"
    assert props["verification"]["status"] == "agency_found_obstruction"
    assert props["verification"]["knowledge_type"] == "observed"
    assert props["verification"]["rule"] == "dep-res-obstruction-v1"
    assert props["verification"]["text"].endswith("debris was obstructing the catch basin.")
    assert props["source_fields"]["unique_key"] == "69804630"
    assert props["source"]["url"] == "https://data.cityofnewyork.us/resource/erm2-nwe9.json?unique_key=69804630"


def test_incident_filters(client, bbox):
    def features(**params):
        return client.get("/api/v1/incidents", params={"bbox": bbox, "since": SINCE, "limit": 5000, **params}).json()["features"]

    everything = features()
    assert everything
    clogged = features(category="catch_basin_clogged")
    assert clogged and all(f["properties"]["category"] == "catch_basin_clogged" for f in clogged)
    found = features(verification="agency_found_obstruction")
    assert found and all(f["properties"]["verification"]["status"] == "agency_found_obstruction" for f in found)
    linked = next(f for f in everything if f["properties"]["linked_basin"])
    basin = linked["properties"]["linked_basin"]["id"]
    for f in features(basin=basin):
        assert f["properties"]["linked_basin"]["id"] == basin
    body = client.get("/api/v1/incidents", params={"bbox": bbox}).json()
    assert "since" in body["meta"]["filters"]  # the 365-day default is echoed back


@pytest.mark.parametrize(
    ("params", "status", "kind", "code"),
    [
        ({"bbox": "-73.97962,40.66457,-74.01995,40.69255"}, 422, "invalid-bbox", "inverted_lon"),
        ({"bbox": "-118.3,34.0,-118.2,34.1"}, 422, "bbox-outside-coverage", "outside_coverage"),
        ({"bbox": "-74.0,40.6,-73.9,40.7", "limit": 5001}, 422, "invalid-parameter", None),
        ({}, 422, "invalid-parameter", None),
        ({"bbox": "-74.0,40.6,-73.9,40.7", "cursor": "%%%"}, 422, "invalid-parameter", None),
    ],
)
def test_catch_basin_errors_are_problem_json(client, params, status, kind, code):
    body = problem(client.get("/api/v1/catch-basins", params=params), status, kind)
    assert body["instance"].startswith("/api/v1/catch-basins")
    if code:
        assert body["errors"][0]["code"] == code


@pytest.mark.parametrize(
    "params",
    [{"category": "not_a_category"}, {"verification": "confirmed"}, {"since": "2020-01-01T00:00:00"}, {"basin": "CB1"}],
)
def test_incident_parameter_errors_are_problem_json(client, bbox, params):
    problem(client.get("/api/v1/incidents", params={"bbox": bbox, **params}), 422, "invalid-parameter")


def test_unknown_records_are_404_problems(client):
    problem(client.get(f"/api/v1/catch-basins/{quote('catch_basin:NOPE')}"), 404, "not-found")
    problem(client.get(f"/api/v1/incidents/{quote('catch_basin:CB1')}"), 404, "not-found")


def test_openapi_is_published_under_v1(client):
    paths = client.get("/api/v1/openapi.json").json()["paths"]
    assert {"/api/v1/catch-basins", "/api/v1/incidents", "/api/v1/layers", "/api/v1/health"} <= set(paths)
