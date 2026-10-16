"""Unit tests for the bbox benchmark. GRID is synthetic test input only; it never reaches the app database."""

import pytest

from swale.bench import bbox as bench
from swale.db.connection import connect, run_one

GRID = [bench.Point(f"G{i:02d}{j:02d}", -74.0 + i * 0.001, 40.6 + j * 0.001) for i in range(20) for j in range(20)]
BOXES = [
    (-73.9955, 40.6035, -73.9855, 40.6125),  # interior; edges fall between grid points
    (-74.0005, 40.5995, -73.9805, 40.6195),  # covers the whole grid
    (-73.9, 40.7, -73.8, 40.8),  # empty
]


def test_in_bbox_is_inclusive_on_edges():
    assert sorted(bench.in_bbox(GRID, (-74.0, 40.6, -73.9985, 40.6015))) == ["G0000", "G0001", "G0100", "G0101"]


def test_tiles_cover_every_point_in_the_box():
    box = BOXES[0]
    tiles = set(bench.tiles_for_bbox(box))
    for p in GRID:
        if box[0] <= p.lon <= box[2] and box[1] <= p.lat <= box[3]:
            assert bench.tile_key(p.lon, p.lat) in tiles


def test_viewport_has_the_requested_size():
    w, s, e, n = bench.viewport(-73.99, 40.68, 1.0)
    assert (n - s) * bench.KM_PER_DEG_LAT == pytest.approx(1.0)
    assert (e - w) * bench.km_per_deg_lon(40.68) == pytest.approx(1.0)


def test_percentile_is_nearest_rank():
    values = [float(v) for v in range(1, 11)]
    assert bench.percentile(values, 50) == 5.0
    assert bench.percentile(values, 95) == 10.0


def test_dedupe_keeps_first_and_counts_duplicates():
    a, b = bench.Point("A", 1.0, 2.0), bench.Point("A", 3.0, 4.0)
    assert bench.dedupe([a, b]) == ([a], 1)


@pytest.fixture(scope="module")
def grid_db():
    with connect("mem://") as db:
        for table, indexes in bench.tables_for(bench.STRATEGIES.values()).items():
            bench.load(db, table, GRID, indexes)
        yield db


@pytest.mark.parametrize("name", sorted(bench.STRATEGIES))
@pytest.mark.parametrize("box", BOXES)
def test_every_strategy_returns_exactly_the_reference_ids(grid_db, name, box):
    st = bench.STRATEGIES[name]
    _, ids = bench.time_query(grid_db, st.sql, st.params(box))
    assert sorted(ids) == bench.expected(st, GRID, box)


@pytest.mark.parametrize("name", ["scan", "lat_index", "lat_index_paged", "tile_in"])
def test_range_strategies_include_points_on_the_edges(grid_db, name):
    corner = (-74.0, 40.6, -73.9995, 40.6005)  # G0000 sits exactly on the west and south edges
    st = bench.STRATEGIES[name]
    _, ids = bench.time_query(grid_db, st.sql, st.params(corner))
    assert ids == ["G0000"]


def test_paged_strategy_returns_the_first_page_in_id_order(grid_db):
    st = bench.lat_index_paged(limit=7)
    _, ids = bench.time_query(grid_db, st.sql, st.params(BOXES[1]))
    assert ids == sorted(bench.in_bbox(GRID, BOXES[1]))[:7]


@pytest.mark.parametrize(
    ("name", "operation"),
    [("scan", "Iterate Table"), ("lat_index", "Iterate Index"), ("lat_index_paged", "Iterate Index"), ("tile_in", "Iterate Index")],
)
def test_query_plans_use_the_expected_access_path(grid_db, name, operation):
    st = bench.STRATEGIES[name]
    plan = run_one(grid_db, st.sql + " EXPLAIN;", st.params(BOXES[0]))
    assert plan[0]["operation"] == operation


def test_gate_passes_only_under_budget_with_no_mismatches():
    def result(scale, p95, bad=0):
        return bench.Result("mem", scale, 10, bench.GATE_STRATEGY, "1km", 30, 1.0, p95, p95, 5.0, bad)

    assert bench.gate([result("bk0601", 50.0)])["demo_scale"]["pass"] is True
    assert bench.gate([result("bk0601", 250.0)])["demo_scale"]["pass"] is False
    assert bench.gate([result("bk0601", 50.0, bad=1)])["demo_scale"]["pass"] is False
    assert bench.gate([])["brooklyn_scale"] == {"measured": False}
