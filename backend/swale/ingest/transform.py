"""Source rows -> Swale documents, with explicit rejects and counted notes. Pure functions: no I/O."""

from __future__ import annotations

import math
from collections import Counter
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from swale.core.geo import covers_points, geojson_bbox, in_nyc, to_state_plane
from swale.core.timeutil import nyc_local_to_utc
from swale.core.trust import KnowledgeType, Verification
from swale.db.geometry import point, to_surreal
from swale.db.queries import rid
from swale.ingest.resolutions_311 import classify
from swale.ingest.taxonomy_311 import categorize
from swale.sources.registry import CATCH_BASINS, NTA_2020, NYC311, DataSource

STATE_PLANE_TOLERANCE_FT = 50.0


@dataclass(frozen=True)
class Rejected:
    source_record_id: str | None
    reason: str


@dataclass
class Transformed:
    docs: list[tuple[str, dict[str, Any]]] = field(default_factory=list)
    rejected: list[Rejected] = field(default_factory=list)
    notes: Counter[str] = field(default_factory=Counter)


def provenance(source: DataSource, record_id: str, *, run_key: str, now: datetime, updated_at: datetime | None, raw: dict[str, Any]) -> dict[str, Any]:
    return {
        "source": rid("data_source", source.key),
        "source_record_id": record_id,
        "source_url": source.record_url(record_id),
        "source_updated_at": updated_at,
        "ingested_at": now,
        "ingest_run": rid("ingest_run", run_key),
        "raw": raw,
    }


def transform_area(row: dict[str, Any], *, run_key: str, now: datetime, updated_at: datetime | None) -> tuple[str, dict[str, Any]]:
    code, geometry = row["nta2020"], row["the_geom"]
    return code, {
        "code": code,
        "name": row["ntaname"],
        "geom": to_surreal(geometry),
        "bbox": geojson_bbox(geometry).as_list(),
        **provenance(NTA_2020, code, run_key=run_key, now=now, updated_at=updated_at, raw=row),
    }


def transform_basins(
    rows: list[dict[str, Any]], *, area_code: str, area_geom: dict[str, Any], run_key: str, now: datetime, updated_at: datetime | None
) -> Transformed:
    out = Transformed()
    kept: list[tuple[str, float, float, dict[str, Any]]] = []
    seen: set[str] = set()
    for row in rows:
        unitid = row.get("unitid")
        if not unitid:
            out.rejected.append(Rejected(None, "missing_id"))
            continue
        lonlat = _lonlat(row)
        if isinstance(lonlat, str):
            out.rejected.append(Rejected(unitid, lonlat))
            continue
        if unitid in seen:
            out.notes["duplicate_id"] += 1
            continue
        seen.add(unitid)
        kept.append((unitid, lonlat[0], lonlat[1], row))
    if not kept:
        return out
    lons, lats = [k[1] for k in kept], [k[2] for k in kept]
    xs, ys = to_state_plane(lons, lats)
    for (unitid, lon, lat, row), area_ids, x_pred, y_pred in zip(kept, _area_ids(area_code, area_geom, lons, lats), xs, ys):
        x_ft, y_ft = _float(row.get("point_x")), _float(row.get("point_y"))
        if x_ft is not None and y_ft is not None and math.hypot(x_ft - x_pred, y_ft - y_pred) > STATE_PLANE_TOLERANCE_FT:
            out.notes["state_plane_mismatch"] += 1
        if not area_ids:
            out.notes["outside_area_polygon"] += 1
        out.docs.append(
            (
                unitid,
                {
                    "unitid": unitid,
                    "geom": point(lon, lat),
                    "lon": lon,
                    "lat": lat,
                    "x_sp_ft": x_ft,
                    "y_sp_ft": y_ft,
                    "area_ids": area_ids,
                    "knowledge_type": KnowledgeType.OBSERVED.value,
                    **provenance(CATCH_BASINS, unitid, run_key=run_key, now=now, updated_at=updated_at, raw=row),
                },
            )
        )
    return out


def transform_incidents(rows: list[dict[str, Any]], *, area_code: str, area_geom: dict[str, Any], run_key: str, now: datetime) -> Transformed:
    out = Transformed()
    kept: list[tuple[str, float, float, datetime, datetime | None, datetime | None, dict[str, Any]]] = []
    seen: set[str] = set()
    for row in rows:
        key = row.get("unique_key")
        if not key:
            out.rejected.append(Rejected(None, "missing_id"))
            continue
        try:
            reported_at = nyc_local_to_utc(row.get("created_date"))
            closed_at = nyc_local_to_utc(row.get("closed_date"))
            resolved_at = nyc_local_to_utc(row.get("resolution_action_updated_date"))
        except ValueError:
            out.rejected.append(Rejected(key, "bad_timestamp"))
            continue
        if reported_at is None:
            out.rejected.append(Rejected(key, "missing_created_date"))
            continue
        lonlat = _lonlat(row)
        if isinstance(lonlat, str):
            out.rejected.append(Rejected(key, lonlat))
            continue
        if key in seen:
            out.notes["duplicate_id"] += 1
            continue
        seen.add(key)
        kept.append((key, lonlat[0], lonlat[1], reported_at, closed_at, resolved_at, row))
    areas = _area_ids(area_code, area_geom, [k[1] for k in kept], [k[2] for k in kept])
    for (key, lon, lat, reported_at, closed_at, resolved_at, row), area_ids in zip(kept, areas):
        category = categorize(row.get("complaint_type"), row.get("descriptor"))
        if category == "other":
            out.notes[f"unmapped:{row.get('complaint_type')} / {row.get('descriptor')}"] += 1
        verification = classify(row.get("agency"), row.get("resolution_description"), resolved_at)
        if verification.status is Verification.UNKNOWN:
            out.notes[f"unknown_resolution:{(verification.text or '')[:100]}"] += 1
        out.docs.append(
            (
                f"nyc311_{key}",
                {
                    "category": category,
                    "source_category": {k: row.get(k) for k in ("agency", "complaint_type", "descriptor", "descriptor_2")},
                    "geom": point(lon, lat),
                    "lon": lon,
                    "lat": lat,
                    "address": row.get("incident_address"),
                    "reported_at": reported_at,
                    "closed_at": closed_at,
                    "source_status": row.get("status"),
                    "verification": verification.as_doc(),
                    "verification_status": verification.status.value,
                    "area_ids": area_ids,
                    "knowledge_type": KnowledgeType.REPORTED.value,
                    **provenance(NYC311, key, run_key=run_key, now=now, updated_at=resolved_at, raw=row),
                },
            )
        )
    return out


def _lonlat(row: dict[str, Any]) -> tuple[float, float] | str:
    """(lon, lat), or a reject reason."""
    lon, lat = row.get("longitude"), row.get("latitude")
    if lon in (None, "") or lat in (None, ""):
        return "missing_coordinates"
    lon_f, lat_f = _float(lon), _float(lat)
    if lon_f is None or lat_f is None:
        return "bad_coordinates"
    if not in_nyc(lon_f, lat_f):
        return "outside_nyc"
    return lon_f, lat_f


def _float(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def _area_ids(area_code: str, area_geom: dict[str, Any], lons: list[float], lats: list[float]) -> list[list[str]]:
    if not lons:
        return []
    return [[area_code] if inside else [] for inside in covers_points(area_geom, lons, lats)]
