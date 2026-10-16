"""Bounding-box query benchmark for embedded SurrealDB (the M1 gate).

Times map-viewport queries over real DEP catch-basin points (NYC Open Data
2w2g-fk3i) at three scales, and checks that every strategy returns exactly the
IDs that a plain Python filter returns.

    uv run python -m swale.bench.bbox --fetch     # cache citywide basins (~31 requests)
    uv run python -m swale.bench.bbox             # benchmark in surrealkv file mode

The module has its own minimal fetcher so the gate does not depend on the
production ingest code. Points go only into the benchmark database
(var/bench/bench.kv), never into the application database.
"""

from __future__ import annotations

import argparse
import json
import math
import random
import shutil
import statistics
import sys
import time
import urllib.parse
import urllib.request
from collections.abc import Callable, Iterable
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from surrealdb.data import GeometryLine, GeometryPoint, GeometryPolygon

from swale.db.connection import connect, run, run_one

BBox = tuple[float, float, float, float]  # (west, south, east, north), degrees

SOURCE_URL = "https://data.cityofnewyork.us/resource/2w2g-fk3i.json"
USER_AGENT = "Swale-hackathon/0.1 (+https://github.com/devauntea/Swale)"
VAR_DIR = Path(__file__).resolve().parents[2] / "var" / "bench"
CACHE = VAR_DIR / "catch_basins_citywide.json"

# The demo area's bounding box, a Brooklyn bounding box (it also takes in edges of
# Queens and Staten Island), and the whole city (None = no filter).
SCALES: dict[str, BBox | None] = {
    "bk0601": (-74.01995, 40.66457, -73.97962, 40.69255),
    "brooklyn": (-74.0420, 40.5700, -73.8330, 40.7395),
    "citywide": None,
}
VIEWPORT_KM = (0.5, 1.0, 2.0)
TILE_ZOOM = 15
PAGE_LIMIT = 1000
BUDGET_MS = 200.0
GATE_STRATEGY = "lat_index_paged"
KM_PER_DEG_LAT = 110.574


@dataclass(frozen=True)
class Point:
    id: str
    lon: float
    lat: float


@dataclass(frozen=True)
class Strategy:
    name: str
    table: str
    indexes: tuple[str, ...]
    sql: str
    params: Callable[[BBox], dict[str, Any]]
    limit: int | None = None


@dataclass
class Result:
    mode: str
    scale: str
    points: int
    strategy: str
    viewport: str
    queries: int
    p50_ms: float
    p95_ms: float
    max_ms: float
    mean_rows: float
    mismatches: int


# --- geometry helpers ---------------------------------------------------------


def in_bbox(points: Iterable[Point], box: BBox) -> list[str]:
    w, s, e, n = box
    return [p.id for p in points if w <= p.lon <= e and s <= p.lat <= n]


def km_per_deg_lon(lat: float) -> float:
    return 111.320 * math.cos(math.radians(lat))


def viewport(lon: float, lat: float, side_km: float) -> BBox:
    half_lat = side_km / 2 / KM_PER_DEG_LAT
    half_lon = side_km / 2 / km_per_deg_lon(lat)
    return (lon - half_lon, lat - half_lat, lon + half_lon, lat + half_lat)


def viewports(points: list[Point], side_km: float, count: int, seed: int) -> list[BBox]:
    rng = random.Random(seed)
    return [viewport(p.lon, p.lat, side_km) for p in rng.sample(points, min(count, len(points)))]


def tile_xy(lon: float, lat: float, z: int = TILE_ZOOM) -> tuple[int, int]:
    n = 2**z
    x = int((lon + 180.0) / 360.0 * n)
    y = int((1.0 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2.0 * n)
    return x, y


def tile_key(lon: float, lat: float, z: int = TILE_ZOOM) -> str:
    x, y = tile_xy(lon, lat, z)
    return f"{z}/{x}/{y}"


def tiles_for_bbox(box: BBox, z: int = TILE_ZOOM) -> list[str]:
    w, s, e, n = box
    x0, y0 = tile_xy(w, n, z)
    x1, y1 = tile_xy(e, s, z)
    return [f"{z}/{x}/{y}" for x in range(x0, x1 + 1) for y in range(y0, y1 + 1)]


def _box_params(box: BBox) -> dict[str, Any]:
    w, s, e, n = box
    return {"w": w, "s": s, "e": e, "n": n}


def _polygon_params(box: BBox) -> dict[str, Any]:
    w, s, e, n = box
    ring = GeometryLine(GeometryPoint(w, s), GeometryPoint(e, s), GeometryPoint(e, n), GeometryPoint(w, n), GeometryPoint(w, s))
    return {"poly": GeometryPolygon(ring)}


def _tile_params(box: BBox) -> dict[str, Any]:
    return {**_box_params(box), "tiles": tiles_for_bbox(box)}


# --- strategies -------------------------------------------------------------------

RANGE = "lat >= $s AND lat <= $n AND lon >= $w AND lon <= $e"
LAT_INDEX = ("DEFINE INDEX pt_lat_lat ON pt_lat FIELDS lat",)
TILE_INDEX = ("DEFINE INDEX pt_tile_tile ON pt_tile FIELDS tile",)


def lat_index_paged(limit: int = PAGE_LIMIT) -> Strategy:
    """What the API runs: indexed lat range, lon filter, ordered by id, one page."""
    sql = f"SELECT id FROM pt_lat WHERE {RANGE} ORDER BY id LIMIT {limit}"
    return Strategy("lat_index_paged", "pt_lat", LAT_INDEX, sql, _box_params, limit)


STRATEGIES: dict[str, Strategy] = {
    s.name: s
    for s in (
        Strategy("scan", "pt_scan", (), f"SELECT id FROM pt_scan WHERE {RANGE}", _box_params),
        Strategy("geom_inside", "pt_scan", (), "SELECT id FROM pt_scan WHERE geom INSIDE $poly", _polygon_params),
        Strategy("lat_index", "pt_lat", LAT_INDEX, f"SELECT id FROM pt_lat WHERE {RANGE}", _box_params),
        lat_index_paged(),
        Strategy("tile_in", "pt_tile", TILE_INDEX, f"SELECT id FROM pt_tile WHERE tile IN $tiles AND {RANGE}", _tile_params),
    )
}


def tables_for(strategies: Iterable[Strategy]) -> dict[str, tuple[str, ...]]:
    tables: dict[str, set[str]] = {}
    for st in strategies:
        tables.setdefault(st.table, set()).update(st.indexes)
    return {table: tuple(sorted(indexes)) for table, indexes in tables.items()}


def expected(st: Strategy, points: Iterable[Point], box: BBox) -> list[str]:
    ids = sorted(in_bbox(points, box))
    return ids[: st.limit] if st.limit is not None else ids


# --- database work ------------------------------------------------------------------


def load(db: Any, table: str, points: list[Point], indexes: Iterable[str], chunk: int = 5000) -> None:
    run(db, f"REMOVE TABLE IF EXISTS {table}; DEFINE TABLE {table} SCHEMALESS;")
    for i in range(0, len(points), chunk):
        rows = [
            {"id": p.id, "lon": p.lon, "lat": p.lat, "geom": GeometryPoint(p.lon, p.lat), "tile": tile_key(p.lon, p.lat)}
            for p in points[i : i + chunk]
        ]
        run(db, f"INSERT INTO {table} $rows;", {"rows": rows})
    for statement in indexes:
        run(db, statement + ";")


def time_query(db: Any, sql: str, params: dict[str, Any]) -> tuple[float, list[str]]:
    start = time.perf_counter()
    rows = run_one(db, sql + ";", params)
    elapsed_ms = (time.perf_counter() - start) * 1000
    return elapsed_ms, [r["id"].id for r in rows]


def percentile(values: list[float], q: float) -> float:
    ordered = sorted(values)
    return ordered[max(0, math.ceil(q / 100 * len(ordered)) - 1)]


def benchmark(
    db: Any, mode: str, scale: str, points: list[Point], strategies: list[Strategy], sizes: Iterable[float], count: int, seed: int
) -> list[Result]:
    for table, indexes in tables_for(strategies).items():
        load(db, table, points, indexes)
    boxes = {f"{km:g}km": viewports(points, km, count, seed) for km in sizes}
    if scale == "bk0601":
        boxes["bk0601_full"] = [SCALES["bk0601"]] * count
    results = []
    for st in strategies:
        for label, bxs in boxes.items():
            time_query(db, st.sql, st.params(bxs[0]))  # warm-up, not timed
            times, rows, mismatches = [], [], 0
            for box in bxs:
                ms, ids = time_query(db, st.sql, st.params(box))
                times.append(ms)
                rows.append(len(ids))
                got = ids if st.limit is not None else sorted(ids)
                if got != expected(st, points, box):
                    mismatches += 1
            results.append(
                Result(
                    mode, scale, len(points), st.name, label, len(bxs),
                    round(percentile(times, 50), 2), round(percentile(times, 95), 2), round(max(times), 2),
                    round(statistics.fmean(rows), 1), mismatches,
                )
            )
    return results


def gate(results: list[Result]) -> dict[str, Any]:
    def check(scale: str) -> dict[str, Any]:
        rows = [r for r in results if r.scale == scale and r.strategy == GATE_STRATEGY]
        if not rows:
            return {"measured": False}
        worst = max(r.p95_ms for r in rows)
        bad = sum(r.mismatches for r in rows)
        return {"measured": True, "worst_p95_ms": worst, "mismatches": bad, "pass": worst < BUDGET_MS and bad == 0}

    return {"strategy": GATE_STRATEGY, "budget_ms": BUDGET_MS, "demo_scale": check("bk0601"), "brooklyn_scale": check("brooklyn")}


# --- fetching (benchmark-only) ------------------------------------------------------


def fetch_catch_basins(page_size: int = 5000, retries: int = 5) -> tuple[list[Point], int]:
    """Return (points with coordinates, total rows fetched)."""
    points: list[Point] = []
    offset = 0
    while True:
        query = urllib.parse.urlencode({"$select": "unitid,longitude,latitude", "$order": ":id", "$limit": page_size, "$offset": offset})
        rows = _get_json(f"{SOURCE_URL}?{query}", retries)
        points.extend(
            Point(r["unitid"], float(r["longitude"]), float(r["latitude"]))
            for r in rows
            if r.get("unitid") and r.get("longitude") and r.get("latitude")
        )
        print(f"  fetched {offset + len(rows)} rows", file=sys.stderr)
        if len(rows) < page_size:
            return points, offset + len(rows)
        offset += page_size


def _get_json(url: str, retries: int) -> list[dict[str, Any]]:
    last: Exception | None = None
    for attempt in range(retries):
        try:
            request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(request, timeout=120) as response:
                return json.loads(response.read())
        except (OSError, ValueError) as exc:  # URLError/HTTPError are OSErrors; bad JSON is a ValueError
            last = exc
            time.sleep(2**attempt)
    raise RuntimeError(f"giving up on {url}: {last}")


def dedupe(points: Iterable[Point]) -> tuple[list[Point], int]:
    seen: dict[str, Point] = {}
    duplicates = 0
    for p in points:
        if p.id in seen:
            duplicates += 1
        else:
            seen[p.id] = p
    return list(seen.values()), duplicates


# --- command line -------------------------------------------------------------------


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m swale.bench.bbox", description="SurrealDB bbox benchmark (M1 gate)")
    parser.add_argument("--fetch", action="store_true", help="download citywide catch basins into the cache and exit")
    parser.add_argument("--mode", choices=("kv", "mem"), default="kv", help="kv = surrealkv file (the demo setup); mem = in-memory")
    parser.add_argument("--scales", default=",".join(SCALES))
    parser.add_argument("--strategies", default=",".join(STRATEGIES))
    parser.add_argument("--queries", type=int, default=30, help="viewports per size")
    parser.add_argument("--seed", type=int, default=20261016)
    args = parser.parse_args(argv)

    VAR_DIR.mkdir(parents=True, exist_ok=True)
    if args.fetch:
        points, total = fetch_catch_basins()
        CACHE.write_text(json.dumps({"source": SOURCE_URL, "fetched_at": _now(), "rows": total, "points": [asdict(p) for p in points]}))
        print(f"cached {len(points)} points ({total - len(points)} rows without coordinates) -> {CACHE}")
        return 0
    if not CACHE.exists():
        print(f"no cache at {CACHE}; run with --fetch first", file=sys.stderr)
        return 2

    cache = json.loads(CACHE.read_text())
    points, duplicates = dedupe(Point(**p) for p in cache["points"])
    strategies = [STRATEGIES[name] for name in args.strategies.split(",")]
    url = "mem://"
    if args.mode == "kv":
        db_path = VAR_DIR / "bench.kv"
        shutil.rmtree(db_path, ignore_errors=True)
        url = f"surrealkv://{db_path}"
    results: list[Result] = []
    with connect(url, database="bench") as db:
        sdk = db.version()
        for scale in args.scales.split(","):
            box = SCALES[scale]
            subset = points if box is None else [p for p in points if box[0] <= p.lon <= box[2] and box[1] <= p.lat <= box[3]]
            print(f"{scale}: {len(subset)} points", file=sys.stderr)
            results += benchmark(db, args.mode, scale, subset, strategies, VIEWPORT_KM, args.queries, args.seed)
    report = {
        "run_at": _now(),
        "mode": args.mode,
        "sdk": sdk,
        "python": sys.version.split()[0],
        "cache": {"source": cache["source"], "fetched_at": cache["fetched_at"], "rows": cache["rows"], "points": len(cache["points"]), "duplicate_unitids": duplicates},
        "results": [asdict(r) for r in results],
        "gate": gate(results),
    }
    out = VAR_DIR / f"results-{args.mode}-{datetime.now(timezone.utc):%Y%m%dT%H%M%SZ}.json"
    out.write_text(json.dumps(report, indent=2))
    _print_table(results)
    print(json.dumps(report["gate"], indent=2))
    print(f"wrote {out}")
    return 0 if report["gate"]["demo_scale"].get("pass") else 1


def _print_table(results: list[Result]) -> None:
    header = f"{'mode':<4} {'scale':<9} {'points':>7} {'strategy':<16} {'viewport':<12} {'p50 ms':>8} {'p95 ms':>8} {'max ms':>8} {'rows':>7} {'bad':>4}"
    print(header)
    print("-" * len(header))
    for r in results:
        print(
            f"{r.mode:<4} {r.scale:<9} {r.points:>7} {r.strategy:<16} {r.viewport:<12} "
            f"{r.p50_ms:>8.1f} {r.p95_ms:>8.1f} {r.max_ms:>8.1f} {r.mean_rows:>7.0f} {r.mismatches:>4}"
        )


def _now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


if __name__ == "__main__":
    raise SystemExit(main())
