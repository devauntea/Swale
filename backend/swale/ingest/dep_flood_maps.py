"""NYC DEP Stormwater Flood Maps (NYC Open Data 9i7c-xyvv): clip to an area, store, compare with Swale runs.

DEP's maps are an authoritative *model* of potential flooding (predicted, external). Codes come from
DEP's data dictionary: 1 = nuisance flooding (4 in to 1 ft), 2 = deep and contiguous flooding (1 ft or
more), 3 = future high tides (sea-level-rise scenarios only). Mapped areas are at least 0.25 acres.
The "Limited (1.77 in/hr)" geodatabase uses compressed storage that the open-source GDAL driver cannot
read, so it is skipped and reported.
"""

from __future__ import annotations

import glob
import gzip
import json
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
import shapely
from shapely.geometry import box, mapping

from swale.core.geo import BBox, to_state_plane
from swale.db import queries as q
from swale.db.geometry import to_surreal
from swale.sources.registry import DataSource

DEP_FLOOD_MAPS = "https://data.cityofnewyork.us/d/9i7c-xyvv"
CATEGORIES = {1: "nuisance", 2: "deep", 3: "future_high_tide"}
SCENARIOS = {
    # file-name fragment -> (scenario code, label, intensity in/hr, sea level)
    "Extreme_Flood_3_66": ("dep_extreme_2080", "DEP Extreme storm (3.66 in/hr) with 2080 sea level rise", 3.66, "2080 sea level rise"),
    "Moderate_Flood_2_13_per_hr_with_2050": ("dep_moderate_2050", "DEP Moderate storm (2.13 in/hr) with 2050 sea level rise", 2.13, "2050 sea level rise"),
    "Moderate_Flood_2_13_inches_per_hr_with_Current": ("dep_moderate_current", "DEP Moderate storm (2.13 in/hr) with current sea levels", 2.13, "current"),
    "Limited_Flood_1_77": ("dep_limited_current", "DEP Limited storm (1.77 in/hr) with current sea levels", 1.77, "current"),
}
# Swale design storm -> the DEP map with the same rainfall and today's sea level.
MATCHING_MAP = {2.13: "dep_moderate_current", 1.77: "dep_limited_current"}
SIMPLIFY_FT = 3.0


def _to_wgs84(geom: Any) -> Any:
    from pyproj import Transformer

    t = Transformer.from_crs("EPSG:2263", "EPSG:4326", always_xy=True)
    return shapely.transform(geom, lambda xy: np.column_stack(t.transform(xy[:, 0], xy[:, 1])))


def clip_from_zip(zip_path: Path, work_dir: Path, bbox: BBox) -> dict[str, Any]:
    """Read every readable scenario, clip to ``bbox`` and return a JSON-ready dict of polygons (WGS84)."""
    import pyogrio.raw as raw

    work_dir.mkdir(parents=True, exist_ok=True)
    zipfile.ZipFile(zip_path).extractall(work_dir)
    xs, ys = to_state_plane([bbox.w, bbox.e], [bbox.s, bbox.n])
    clip_sp = box(float(min(xs)), float(min(ys)), float(max(xs)), float(max(ys)))
    out: dict[str, Any] = {"source": DEP_FLOOD_MAPS, "clipped_to": bbox.as_list(), "fetched_at": datetime.now(timezone.utc).isoformat(),
                           "categories": CATEGORIES, "scenarios": {}, "skipped": {}}
    for gdb in sorted(glob.glob(str(work_dir / "**" / "*.gdb"), recursive=True)):
        key = next((k for k in SCENARIOS if k in gdb), None)
        if key is None:
            continue
        code, label, intensity, sea_level = SCENARIOS[key]
        try:
            import pyogrio

            layer = pyogrio.list_layers(gdb)[0][0]
            _, _, geoms, fields = raw.read(gdb, layer=layer, columns=["Flooding_Category"], bbox=tuple(clip_sp.bounds))
        except Exception as exc:  # noqa: BLE001 - e.g. compressed storage the open driver cannot read
            out["skipped"][code] = f"{type(exc).__name__}: {str(exc)[:160]}"
            continue
        features = []
        for wkb, cat in zip(geoms, fields[0]):
            geom = shapely.force_2d(shapely.from_wkb(wkb))
            clipped = shapely.intersection(shapely.make_valid(geom), clip_sp)
            for part in shapely.get_parts(clipped):
                if part.geom_type != "Polygon" or part.area < 100:  # drop slivers under 100 ft²
                    continue
                part = shapely.simplify(part, SIMPLIFY_FT, preserve_topology=True)
                features.append({"category": int(cat), "depth_class": CATEGORIES.get(int(cat), f"code_{int(cat)}"),
                                 "area_ft2": round(part.area, 1), "geometry": mapping(_to_wgs84(part))})
        out["scenarios"][code] = {"label": label, "intensity_in_hr": intensity, "sea_level": sea_level, "features": features}
    return out


def write_snapshot(data: dict[str, Any], path: Path) -> None:
    path.write_bytes(gzip.compress(json.dumps(data, separators=(",", ":")).encode(), mtime=0))


def read_snapshot(path: Path) -> dict[str, Any] | None:
    return json.loads(gzip.decompress(path.read_bytes())) if path.exists() else None


SOURCE = DataSource(
    key="dep_stormwater_flood_maps", name="NYC Stormwater Flood Maps", publisher="Department of Environmental Protection (DEP)",
    dataset="9i7c-xyvv", id_column="scenario", cadence="Annually (last updated 2024)", crs="EPSG:2263 in the source; stored as EPSG:4326",
    time_semantics="Static model output", stale_after=__import__("datetime").timedelta(days=730), required_columns=(),
    known_limitations=("A model of potential flooding, not observations.", "Areas under 0.25 acres are not mapped.",
                       "The Limited (1.77 in/hr) map uses compressed storage the open-source GDAL driver cannot read."),
)


def load(db: Any, data: dict[str, Any], area_code: str, now: datetime) -> dict[str, int]:
    """Replace stored DEP flood-map polygons for this area with ``data``."""
    from swale.ingest.pipeline import source_doc

    q.upsert_merge(db, "data_source", SOURCE.key, {**source_doc(SOURCE), "last_success_at": now,
                                                   "last_fetched_at": datetime.fromisoformat(data["fetched_at"])})
    from swale.db.connection import run

    run(db, "DELETE flood_map_feature WHERE area_id = $area;", {"area": area_code})
    docs, counts = [], {}
    for code, sc in data["scenarios"].items():
        for i, f in enumerate(sc["features"]):
            shp = shapely.geometry.shape(f["geometry"])
            w, s, e, n = shp.bounds
            docs.append((f"{area_code}_{code}_{i}", {
                "area_id": area_code, "scenario_code": code, "scenario_label": sc["label"], "intensity_in_hr": sc["intensity_in_hr"],
                "sea_level": sc["sea_level"], "category": f["category"], "depth_class": f["depth_class"], "area_ft2": f["area_ft2"],
                "geom": to_surreal(f["geometry"]), "bbox_w": w, "bbox_s": s, "bbox_e": e, "bbox_n": n,
                "knowledge_type": "predicted", "source": q.rid("data_source", SOURCE.key), "source_url": DEP_FLOOD_MAPS, "ingested_at": now,
            }))
        counts[code] = len(sc["features"])
    q.upsert_many(db, "flood_map_feature", docs)
    return counts


def features_in_bbox(db: Any, scenario: str, bbox: BBox) -> list[dict[str, Any]]:
    from swale.db.connection import run_one

    return run_one(db, "SELECT * FROM flood_map_feature WHERE scenario_code = $sc AND bbox_n >= $s AND bbox_s <= $n "
                       "AND bbox_e >= $w AND bbox_w <= $e;", {"sc": scenario, "s": bbox.s, "n": bbox.n, "w": bbox.w, "e": bbox.e})


def compare_run(db: Any, run_key: str, area_code: str, scenario: str, near_ft: float = 30.0) -> dict[str, Any]:
    """Agreement between a Swale run's flooded basins and DEP's mapped flooding (nuisance or deep), basin by basin."""
    from swale.db.connection import run_one
    from swale.db.geometry import to_geojson

    basins = q.area_basins(db, area_code)
    flooded = {r["basin"].id: r["risk_class"] for r in run_one(db, "SELECT basin, risk_class FROM flood_result WHERE run = $run;",
                                                                 {"run": q.rid("simulation_run", run_key)})}
    polys = run_one(db, "SELECT geom, depth_class FROM flood_map_feature WHERE scenario_code = $sc AND area_id = $area AND category IN [1, 2];",
                    {"sc": scenario, "area": area_code})
    if not polys:
        return {"available": False, "reason": f"no stored DEP polygons for {scenario}"}
    from swale.core.geo import _transformer

    tr = _transformer("EPSG:4326", "EPSG:2263")
    shapes = [shapely.transform(shapely.geometry.shape(to_geojson(p["geom"])), lambda xy: np.column_stack(tr.transform(xy[:, 0], xy[:, 1])))
              for p in polys]
    tree = shapely.STRtree(shapes)
    bx, by = to_state_plane([b["lon"] for b in basins], [b["lat"] for b in basins])
    pts = shapely.points(bx, by)
    idx = tree.query(pts, predicate="dwithin", distance=near_ft)
    in_dep = set(idx[0].tolist())
    table = {"both": 0, "swale_only": 0, "dep_only": 0, "neither": 0}
    for i, b in enumerate(basins):
        ours = flooded.get(b["key"]) in ("nuisance", "deep")
        theirs = i in in_dep
        table["both" if ours and theirs else "swale_only" if ours else "dep_only" if theirs else "neither"] += 1
    n = len(basins)
    agree = (table["both"] + table["neither"]) / n if n else 0
    swale_pos, dep_pos = table["both"] + table["swale_only"], table["both"] + table["dep_only"]
    return {
        "available": True, "dep_scenario": scenario, "basins": n, "counts": table,
        "agreement_pct": round(100 * agree, 1),
        "swale_flooded_also_in_dep_pct": round(100 * table["both"] / swale_pos, 1) if swale_pos else None,
        "dep_flooded_also_in_swale_pct": round(100 * table["both"] / dep_pos, 1) if dep_pos else None,
        "method": f"A basin counts as DEP-flooded if it lies within {near_ft:g} ft of DEP's nuisance or deep flooding polygons; "
                  "Swale-flooded means the run predicts nuisance or deep ponding (4 in or more) at the basin.",
        "caveat": "Both are models of potential flooding, not observations. Swale's is a schematic demonstrator; see DEP's Stormwater Resiliency Plan for how DEP's maps were made.",
    }
