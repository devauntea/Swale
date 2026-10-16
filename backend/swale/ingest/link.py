"""Nearest catch basin for each incident: an inferred association, measured in EPSG:2263 feet."""

from __future__ import annotations

import shapely

from swale.core.geo import to_state_plane

METHOD = "nearest_within_150ft_v1"
MAX_FT = 150.0

Point = tuple[str, float, float]  # (key, lon, lat)


def nearest_basins(incidents: list[Point], basins: list[Point], max_ft: float = MAX_FT) -> dict[str, tuple[str, float] | None]:
    result: dict[str, tuple[str, float] | None] = {key: None for key, _, _ in incidents}
    if not incidents or not basins:
        return result
    bx, by = to_state_plane([b[1] for b in basins], [b[2] for b in basins])
    ix, iy = to_state_plane([i[1] for i in incidents], [i[2] for i in incidents])
    tree = shapely.STRtree(shapely.points(bx, by))
    (inc_idx, basin_idx), distances = tree.query_nearest(
        shapely.points(ix, iy), max_distance=max_ft, return_distance=True, all_matches=False
    )
    for i, b, d in zip(inc_idx, basin_idx, distances):
        result[incidents[i][0]] = (basins[b][0], round(float(d), 1))
    return result
