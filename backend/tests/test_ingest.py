"""Ingest tests against a small real fixture (recorded by scripts/record_fixtures.py) plus hand-made bad rows."""

from datetime import datetime, timezone
from pathlib import Path

import pytest

from swale.core.geo import covers_points
from swale.db import queries as q
from swale.db.connection import connect, run_one
from swale.db.schema import apply_schema
from swale.ingest.bundle import read_bundle
from swale.ingest.link import nearest_basins
from swale.ingest.pipeline import ingest_bundle
from swale.ingest.transform import transform_incidents

FIXTURE = Path(__file__).parent / "fixtures" / "bundle_henry_st"
NOW = datetime(2026, 10, 16, 5, 0, tzinfo=timezone.utc)


@pytest.fixture(scope="module")
def bundle():
    return read_bundle(FIXTURE)


@pytest.fixture()
def db():
    with connect("mem://") as conn:
        apply_schema(conn)
        yield conn


def test_fixture_is_the_recorded_real_bundle(bundle):
    assert bundle.area_code == "BK0601"
    assert "69804630" in {r["unique_key"] for r in bundle.nyc311.rows}
    assert bundle.catch_basins.rows
    assert all(r["unitid"].startswith("CB") for r in bundle.catch_basins.rows)


def test_ingest_loads_every_valid_row_with_provenance(db, bundle):
    summary = ingest_bundle(db, bundle, mode="snapshot", now=NOW)
    reports = {r.source: r for r in summary.reports}
    basins = {r["unitid"] for r in bundle.catch_basins.rows if r.get("latitude")}
    assert q.count(db, "catch_basin") == len(basins) == reports["nyc_catch_basins"].upserted
    assert q.count(db, "incident") == reports["nyc311"].upserted == reports["nyc311"].fetched - reports["nyc311"].rejected
    rec = q.get_record(db, "incident", "nyc311_69804630")
    assert rec["category"] == "catch_basin_clogged"
    assert rec["verification_status"] == "agency_found_obstruction"
    assert rec["verification"]["rule"] == "dep-res-obstruction-v1"
    assert rec["verification"]["knowledge_type"] == "observed"
    assert rec["knowledge_type"] == "reported"
    assert rec["reported_at"] == datetime(2026, 7, 22, 18, 36, tzinfo=timezone.utc)
    assert rec["source_url"] == "https://data.cityofnewyork.us/resource/erm2-nwe9.json?unique_key=69804630"
    assert rec["raw"]["unique_key"] == "69804630"
    assert str(rec["source"]) == "data_source:nyc311"


def test_area_ids_follow_the_polygon(db, bundle):
    ingest_bundle(db, bundle, mode="snapshot", now=NOW)
    rows = run_one(db, "SELECT lon, lat, area_ids FROM catch_basin;")
    inside = covers_points(bundle.area.rows[0]["the_geom"], [r["lon"] for r in rows], [r["lat"] for r in rows])
    assert [r["area_ids"] == ["BK0601"] for r in rows] == inside


def test_reingesting_is_idempotent(db, bundle):
    ingest_bundle(db, bundle, mode="snapshot", now=NOW)
    first = [q.count(db, t) for t in ("area", "catch_basin", "incident", "near_basin")]
    ingest_bundle(db, bundle, mode="snapshot", now=NOW)
    assert [q.count(db, t) for t in ("area", "catch_basin", "incident", "near_basin")] == first
    assert first[0] == 1


def test_links_are_inferred_unique_and_within_150_ft(db, bundle):
    summary = ingest_bundle(db, bundle, mode="snapshot", now=NOW)
    edges = run_one(db, "SELECT in, out, distance_ft, knowledge_type, method FROM near_basin;")
    assert len(edges) == summary.linked > 0
    assert all(e["distance_ft"] <= 150.0 and e["knowledge_type"] == "inferred" for e in edges)
    assert len({str(e["in"]) for e in edges}) == len(edges)


def test_ingest_runs_record_what_happened(db, bundle):
    ingest_bundle(db, bundle, mode="snapshot", now=NOW)
    runs = run_one(db, "SELECT * FROM ingest_run;")
    assert sorted(str(r["source"]) for r in runs) == ["data_source:nyc311", "data_source:nyc_catch_basins", "data_source:nyc_nta_2020"]
    assert all(r["status"] == "succeeded" and r["mode"] == "snapshot" and r["requests"] for r in runs)
    sources = {str(s["id"]): s for s in q.data_sources(db)}
    assert sources["data_source:nyc311"]["last_success_at"] == NOW
    assert sources["data_source:nyc311"]["dataset_updated_at"] is not None
    assert sources["data_source:nyc311"]["last_fetched_at"] == bundle.fetched_at


def test_bad_rows_are_rejected_with_reasons(bundle):
    good = bundle.nyc311.rows[0]
    rows = [
        good,
        {**good, "unique_key": "x1", "latitude": None, "longitude": None},
        {**good, "unique_key": "x2", "created_date": None},
        {**good, "unique_key": "x3", "latitude": "34.05", "longitude": "-118.24"},
        {**good, "unique_key": "x4", "created_date": "not a date"},
        {**good, "unique_key": None},
    ]
    out = transform_incidents(rows, area_code="BK0601", area_geom=bundle.area.rows[0]["the_geom"], run_key="t", now=NOW)
    assert len(out.docs) == 1
    assert sorted(r.reason for r in out.rejected) == ["bad_timestamp", "missing_coordinates", "missing_created_date", "missing_id", "outside_nyc"]


def test_unmapped_descriptors_and_unknown_resolutions_are_counted(bundle):
    good = bundle.nyc311.rows[0]
    rows = [
        {**good, "unique_key": "y1", "complaint_type": "Sewer", "descriptor": "Brand New Descriptor"},
        {**good, "unique_key": "y2", "agency": "DEP", "resolution_description": "Something DEP has never written."},
    ]
    out = transform_incidents(rows, area_code="BK0601", area_geom=bundle.area.rows[0]["the_geom"], run_key="t", now=NOW)
    assert out.notes["unmapped:Sewer / Brand New Descriptor"] == 1
    assert out.notes["unknown_resolution:Something DEP has never written."] == 1


def test_nearest_basins_respects_the_radius():
    basins = [("A", -73.99, 40.68), ("B", -73.99, 40.681)]  # B is ~364 ft north of A
    incidents = [("near_a", -73.99, 40.68005), ("between", -73.99, 40.6805), ("far", -73.98, 40.68)]
    got = nearest_basins(incidents, basins)
    assert got["near_a"][0] == "A" and got["near_a"][1] < 20.0
    assert got["between"] is None  # ~182 ft from both
    assert got["far"] is None
    assert nearest_basins([], basins) == {}
    assert nearest_basins(incidents, []) == {"near_a": None, "between": None, "far": None}
