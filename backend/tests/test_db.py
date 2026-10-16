"""DB-layer tests. Documents here are hand-made test values inside an in-memory DB; none of them are presented as data."""

from datetime import datetime, timedelta, timezone

import pytest

from swale.core.geo import BBox
from swale.db import queries as q
from swale.db.connection import QueryFailed, connect
from swale.db.geometry import point, to_geojson, to_surreal
from swale.db.schema import apply_schema

NOW = datetime(2026, 10, 16, 4, 0, tzinfo=timezone.utc)
TEST_URL = "https://example.invalid/test"


@pytest.fixture()
def db():
    with connect("mem://") as conn:
        apply_schema(conn)
        yield conn


def provenance(source_key, record_id):
    return {
        "source": q.rid("data_source", source_key),
        "source_record_id": record_id,
        "source_url": TEST_URL,
        "source_updated_at": None,
        "ingested_at": NOW,
        "ingest_run": q.rid("ingest_run", "test"),
        "raw": {"id": record_id},
    }


def basin_doc(unitid, lon, lat, **overrides):
    doc = {"unitid": unitid, "geom": point(lon, lat), "lon": lon, "lat": lat, "x_sp_ft": None, "y_sp_ft": None,
           "area_ids": ["BK0601"], "knowledge_type": "observed", **provenance("nyc_catch_basins", unitid)}
    return {**doc, **overrides}


def incident_doc(key, lon, lat, *, status="none", basis="dep_311_resolution", category="catch_basin_clogged", reported_at=NOW, **overrides):
    doc = {
        "category": category,
        "source_category": {"agency": "DEP", "complaint_type": "Sewer", "descriptor": "test", "descriptor_2": None},
        "geom": point(lon, lat), "lon": lon, "lat": lat, "address": None,
        "reported_at": reported_at, "closed_at": None, "source_status": "Closed",
        "verification": {"status": status, "knowledge_type": "reported", "basis": basis, "rule": None, "text": None, "at": None},
        "verification_status": status, "area_ids": ["BK0601"], "knowledge_type": "reported",
        **provenance("nyc311", key),
    }
    return {**doc, **overrides}


GRID = [(f"B{i:02d}{j:02d}", -74.0 + i * 0.001, 40.6 + j * 0.001) for i in range(10) for j in range(10)]


def test_schema_applies_twice_and_keeps_data(db):
    q.upsert_many(db, "catch_basin", [("CB1", basin_doc("CB1", -73.99, 40.68))])
    apply_schema(db)
    assert q.count(db, "catch_basin") == 1


def test_catch_basin_rejects_wrong_knowledge_type(db):
    with pytest.raises(QueryFailed):
        q.upsert_many(db, "catch_basin", [("CB1", basin_doc("CB1", -73.99, 40.68, knowledge_type="reported"))])


def test_agency_status_requires_dep_resolution_basis(db):
    with pytest.raises(QueryFailed):
        q.upsert_many(db, "incident", [("i1", incident_doc("i1", -73.99, 40.68, status="agency_found_obstruction", basis=None))])
    q.upsert_many(db, "incident", [("i2", incident_doc("i2", -73.99, 40.68, status="agency_found_obstruction"))])
    assert q.count(db, "incident") == 1


def test_unknown_verification_status_is_rejected(db):
    with pytest.raises(QueryFailed):
        q.upsert_many(db, "incident", [("i1", incident_doc("i1", -73.99, 40.68, status="confirmed"))])


def test_upsert_many_is_idempotent_and_replaces_documents(db):
    docs = [(k, basin_doc(k, lon, lat)) for k, lon, lat in GRID[:3]]
    q.upsert_many(db, "catch_basin", docs)
    q.upsert_many(db, "catch_basin", docs)
    assert q.count(db, "catch_basin") == 3
    q.upsert_many(db, "catch_basin", [(GRID[0][0], basin_doc(GRID[0][0], GRID[0][1], GRID[0][2], area_ids=[]))])
    assert q.get_record(db, "catch_basin", GRID[0][0])["area_ids"] == []


def test_page_in_bbox_is_exact_and_pages_cover_everything_once(db):
    q.upsert_many(db, "catch_basin", [(k, basin_doc(k, lon, lat)) for k, lon, lat in GRID])
    box = BBox(-73.9975, 40.6015, -73.9935, 40.6075)
    want = sorted(k for k, lon, lat in GRID if box.contains(lon, lat))
    got, after = [], None
    while True:
        page = q.page_in_bbox(db, "catch_basin", box, limit=7, after=after)
        got += [r["id"].id for r in page.records]
        if page.next_after is None:
            break
        after = page.next_after
    assert got == want
    assert len(want) == 24  # i in 3..6 (4 columns) x j in 2..7 (6 rows)


def test_page_in_bbox_rejects_tables_that_are_not_map_layers(db):
    with pytest.raises(ValueError):
        q.page_in_bbox(db, "data_source", BBox(-74.0, 40.6, -73.9, 40.7), limit=10)


def test_replace_near_basin_keeps_one_edge_per_incident(db):
    q.upsert_many(db, "catch_basin", [("A", basin_doc("A", -74.0, 40.6)), ("B", basin_doc("B", -74.001, 40.6))])
    q.upsert_many(db, "incident", [("i1", incident_doc("i1", -74.0, 40.6))])
    link = {"incident": "i1", "basin": "A", "distance_ft": 12.5, "method": "nearest_within_150ft_v1", "computed_at": NOW}
    q.replace_near_basin(db, [link])
    q.replace_near_basin(db, [{**link, "basin": "B", "distance_ft": 80.0}])
    links = q.get_record(db, "incident", "i1", fetch_links=True)["links"]
    assert [(str(e["out"]), e["distance_ft"], e["knowledge_type"]) for e in links] == [("catch_basin:B", 80.0, "inferred")]
    q.replace_near_basin(db, [{**link, "basin": None}])
    assert q.get_record(db, "incident", "i1", fetch_links=True)["links"] == []


def test_incident_filters(db):
    old = NOW - timedelta(days=400)
    q.upsert_many(db, "catch_basin", [("A", basin_doc("A", -74.0, 40.6))])
    q.upsert_many(db, "incident", [
        ("new_clog", incident_doc("new_clog", -74.0, 40.6)),
        ("old_clog", incident_doc("old_clog", -74.0, 40.6, reported_at=old)),
        ("pothole", incident_doc("pothole", -74.0, 40.6, category="pothole", status="unverified", basis=None)),
    ])
    q.replace_near_basin(db, [{"incident": "new_clog", "basin": "A", "distance_ft": 1.0, "method": "m", "computed_at": NOW}])
    box = BBox(-74.01, 40.59, -73.99, 40.61)

    def keys(**filters):
        where, params = q.incident_filters(**filters)
        return [r["id"].id for r in q.page_in_bbox(db, "incident", box, limit=50, where=where, vars=params).records]

    assert keys() == ["new_clog", "old_clog", "pothole"]
    assert keys(categories=["catch_basin_clogged"]) == ["new_clog", "old_clog"]
    assert keys(since=NOW - timedelta(days=365)) == ["new_clog", "pothole"]
    assert keys(statuses=["unverified"]) == ["pothole"]
    assert keys(basin="A") == ["new_clog"]


def test_geometry_round_trips_and_areas_store_multipolygons(db):
    mp = {"type": "MultiPolygon", "coordinates": [[[[-74.0, 40.6], [-73.9, 40.6], [-73.9, 40.7], [-74.0, 40.6]]]]}
    poly = {"type": "Polygon", "coordinates": mp["coordinates"][0]}
    pt = {"type": "Point", "coordinates": [-73.99, 40.68]}
    for geometry in (pt, poly, mp):
        assert to_geojson(to_surreal(geometry)) == geometry
    q.upsert_many(db, "area", [("BK0601", {"code": "BK0601", "name": "Test area", "geom": to_surreal(mp), "bbox": [-74.0, 40.6, -73.9, 40.7], **provenance("nyc_nta_2020", "BK0601")})])
    assert to_geojson(q.get_record(db, "area", "BK0601")["geom"]) == mp


def test_get_record_returns_none_when_missing(db):
    assert q.get_record(db, "catch_basin", "nope") is None


def test_ingest_run_and_source_bookkeeping(db):
    q.upsert_merge(db, "data_source", "nyc311", {
        "name": "n", "publisher": "p", "dataset": "erm2-nwe9", "url": "u", "cadence": "c", "crs": "c",
        "time_semantics": "t", "license_note": "l", "known_limitations": [], "stale_after_s": 172800,
    })
    q.create_ingest_run(db, "run1", {"source": q.rid("data_source", "nyc311"), "mode": "live", "status": "running",
                                     "started_at": NOW, "params": {}, "report": {}, "requests": [], "code_version": "test"})
    q.finish_ingest_run(db, "run1", {"status": "succeeded", "finished_at": NOW, "report": {"upserted": 3}})
    q.upsert_merge(db, "data_source", "nyc311", {"last_success_at": NOW})
    q.upsert_merge(db, "data_source", "nyc311", {"name": "renamed"})  # merging keeps last_success_at
    assert q.get_record(db, "ingest_run", "run1")["report"] == {"upserted": 3}
    assert q.data_sources(db)[0]["last_success_at"] == NOW
    assert q.data_sources(db)[0]["name"] == "renamed"
