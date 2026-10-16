"""Build Swale's SWMM demonstrator network for an area.

There is no public sewer network, so the model is schematic: every catch basin inside the
area becomes a junction that collects runoff from its Voronoi catchment and drains through a
bottom orifice (the inlet) into a shared trunk. Water the inlet cannot take overflows the
junction and ponds on the street. Every parameter below is an assumption and travels with
each run, so the API can show it next to the results.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from typing import Any

import numpy as np
import shapely
from shapely.geometry import shape

from swale.core.geo import to_state_plane

MODEL_NAME = "swale-swmm-demonstrator"
MODEL_VERSION = "0.1.0"
SQFT_PER_ACRE = 43560.0

DEFAULTS: dict[str, float] = {
    "impervious_pct": 85.0,  # dense urban Brooklyn (assumption)
    "slope_pct": 1.0,  # no terrain input yet (assumption)
    "n_imperv": 0.015,
    "n_perv": 0.24,
    "dstore_imperv_in": 0.06,
    "dstore_perv_in": 0.3,
    "pct_zero": 25.0,
    "horton_max_in_hr": 3.0,
    "horton_min_in_hr": 0.5,
    "horton_decay_per_hr": 4.0,
    "horton_dry_days": 7.0,
    "inlet_width_ft": 0.5,  # effective inlet opening (assumption)
    "inlet_height_ft": 0.5,
    "inlet_cd": 0.65,
    "junction_depth_ft": 1.0,  # sump depth before the inlet overflows (assumption)
    "ponded_area_fraction": 0.05,  # share of the catchment that ponds near the inlet (assumption)
    "ponded_area_min_ft2": 2000.0,
    "blockage_factor": 0.5,  # share of the inlet opening lost where DEP recently found an obstruction
    "max_catchment_ft2": 250000.0,  # caps edge cells (~5.7 acres)
    "drain_hours": 2.0,
}

ASSUMPTIONS = {
    "impervious_pct": "Uniform imperviousness; land cover is not modeled.",
    "slope_pct": "Uniform slope; terrain is not modeled.",
    "inlet_width_ft": "Effective inlet opening per basin; NYC inlet hydraulics are not published per basin.",
    "junction_depth_ft": "Depth of the basin sump before overflow.",
    "ponded_area_fraction": "Street area that ponds around each inlet; ponded depth depends directly on it.",
    "blockage_factor": "Applied only where DEP's own resolution text recorded an obstruction within the window.",
    "network": "No sewer pipes: each inlet drains to an unlimited trunk, so sewer surcharge is not represented.",
}


@dataclass(frozen=True)
class Basin:
    key: str
    lon: float
    lat: float
    obstructed: bool


@dataclass
class BuiltModel:
    inp: str
    nodes: dict[str, str]  # junction name -> basin key
    catchment_ac: dict[str, float]  # junction name -> catchment area
    inlet_height_ft: dict[str, float]  # junction name -> effective inlet height used
    params: dict[str, float]
    sha256: str
    counts: dict[str, int]


def _project(geometry: Any) -> Any:
    return shapely.transform(geometry, lambda xy: np.column_stack(to_state_plane(xy[:, 0], xy[:, 1])))


def build_model(
    basins: list[Basin], area_geojson: dict[str, Any], intensities_in_hr: list[float], step_min: int, title: str,
    overrides: dict[str, float] | None = None,
) -> BuiltModel:
    params = {**DEFAULTS, **(overrides or {})}
    if not basins:
        raise ValueError("no catch basins inside the area")
    if not intensities_in_hr or step_min <= 0:
        raise ValueError("the rainfall series is empty")

    area = shapely.make_valid(_project(shape(area_geojson)))
    xs, ys = to_state_plane([b.lon for b in basins], [b.lat for b in basins])
    seen: dict[tuple[float, float], int] = {}
    unique: list[int] = []
    for i, (x, y) in enumerate(zip(xs, ys)):
        k = (round(float(x), 1), round(float(y), 1))
        if k not in seen:
            seen[k] = i
            unique.append(i)
    points = shapely.points(xs[unique], ys[unique])
    cells = shapely.get_parts(shapely.voronoi_polygons(shapely.multipoints(points), extend_to=area, ordered=True))
    radius = (params["max_catchment_ft2"] / np.pi) ** 0.5

    sub, subarea, infil, junc, orif, xsec, coords = [], [], [], [], [], [], []
    nodes, catchment_ac, inlet_h = {}, {}, {}
    for n, (i, cell) in enumerate(zip(unique, cells), start=1):
        b = basins[i]
        clipped = shapely.intersection(cell, area)
        clipped = shapely.intersection(clipped, shapely.buffer(points[n - 1], radius))
        a_ft2 = float(shapely.area(clipped))
        name = f"J{n}"
        nodes[name] = b.key
        h = params["inlet_height_ft"] * ((1 - params["blockage_factor"]) if b.obstructed else 1.0)
        inlet_h[name] = round(h, 4)
        ponded = max(params["ponded_area_min_ft2"], params["ponded_area_fraction"] * a_ft2)
        junc.append(f"{name}  0  {params['junction_depth_ft']}  0  0  {ponded:.0f}")
        orif.append(f"O{n}  {name}  TRUNK  BOTTOM  0  {params['inlet_cd']}  NO  0")
        xsec.append(f"O{n}  RECT_CLOSED  {max(h, 0.01):.4f}  {params['inlet_width_ft']}  0  0")
        coords.append(f"{name}  {float(xs[i]):.1f}  {float(ys[i]):.1f}")
        if a_ft2 > 1.0:
            ac = a_ft2 / SQFT_PER_ACRE
            catchment_ac[name] = round(ac, 4)
            sub.append(f"S{n}  RG1  {name}  {ac:.4f}  {params['impervious_pct']}  {a_ft2 ** 0.5:.1f}  {params['slope_pct']}  0")
            subarea.append(f"S{n}  {params['n_imperv']}  {params['n_perv']}  {params['dstore_imperv_in']}  {params['dstore_perv_in']}  {params['pct_zero']}  OUTLET")
            infil.append(f"S{n}  {params['horton_max_in_hr']}  {params['horton_min_in_hr']}  {params['horton_decay_per_hr']}  {params['horton_dry_days']}  0")

    cx, cy = float(np.mean(xs)), float(np.mean(ys))
    storm_min = step_min * len(intensities_in_hr)
    end_min = storm_min + int(params["drain_hours"] * 60)
    series = [f"STORM  {m // 60}:{m % 60:02d}  {v}" for m, v in zip(range(0, storm_min, step_min), intensities_in_hr)]
    series.append(f"STORM  {storm_min // 60}:{storm_min % 60:02d}  0")
    inp = "\n".join([
        "[TITLE]", f"{title} ({MODEL_NAME} {MODEL_VERSION})", "",
        "[OPTIONS]", "FLOW_UNITS CFS", "INFILTRATION HORTON", "FLOW_ROUTING DYNWAVE", "LINK_OFFSETS DEPTH", "ALLOW_PONDING YES",
        "START_DATE 01/01/2026", "START_TIME 00:00:00", "REPORT_START_DATE 01/01/2026", "REPORT_START_TIME 00:00:00",
        "END_DATE 01/01/2026", f"END_TIME {end_min // 60:02d}:{end_min % 60:02d}:00", f"REPORT_STEP 00:{step_min:02d}:00",
        "WET_STEP 00:01:00", "DRY_STEP 00:05:00", "ROUTING_STEP 0:00:05", "VARIABLE_STEP 0.75", "THREADS 1", "",
        "[RAINGAGES]", f"RG1  INTENSITY  0:{step_min:02d}  1.0  TIMESERIES  STORM", "",
        "[SUBCATCHMENTS]", *sub, "", "[SUBAREAS]", *subarea, "", "[INFILTRATION]", *infil, "",
        "[JUNCTIONS]", *junc, "TRUNK  -10  50  0  0  0", "",
        "[OUTFALLS]", "SEWER  -20  FREE  NO", "",
        "[ORIFICES]", *orif, "", "[CONDUITS]", "CT  TRUNK  SEWER  50  0.013  0  0", "",
        "[XSECTIONS]", *xsec, "CT  CIRCULAR  20  0  0  0", "",
        "[TIMESERIES]", *series, "",
        "[REPORT]", "INPUT NO", "SUBCATCHMENTS NONE", "NODES NONE", "LINKS NONE", "",
        "[COORDINATES]", *coords, f"TRUNK  {cx:.1f}  {cy:.1f}", f"SEWER  {cx:.1f}  {cy - 500:.1f}", "",
    ])
    counts = {"basins": len(basins), "junctions": len(nodes), "subcatchments": len(sub),
              "duplicate_locations": len(basins) - len(unique), "obstructed": sum(1 for b in basins if b.obstructed)}
    return BuiltModel(inp, nodes, catchment_ac, inlet_h, params, hashlib.sha256(inp.encode()).hexdigest(), counts)
