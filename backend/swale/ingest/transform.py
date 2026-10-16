"""Source rows -> Swale documents, with explicit rejects and counted notes. Pure functions: no I/O."""

from __future__ import annotations

import json
import math
from collections import Counter
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any
from urllib.parse import urlencode

from swale.core.geo import covers_points, geojson_bbox, in_nyc, to_state_plane
from swale.core.timeutil import gmt_to_utc, nyc_local_to_utc
from swale.core.trust import KnowledgeType, Verification
from swale.db.geometry import point, to_surreal
from swale.db.queries import rid
from swale.ingest.resolutions_311 import classify
from swale.ingest.taxonomy_311 import categorize
from swale.sources.registry import CATCH_BASINS, FLOODNET_EVENTS, FLOODNET_SENSORS, NTA_2020, NYC311, DataSource

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


def transform_sensors(
    rows: list[dict[str, Any]], *, area_code: str, area_geom: dict[str, Any], run_key: str, now: datetime, updated_at: datetime | None
) -> Transformed:
    out = Transformed()
    kept: list[tuple[str, float, float, dict[str, Any]]] = []
    seen: set[str] = set()
    for row in rows:
        sensor_id = row.get("sensor_id")
        if not sensor_id:
            out.rejected.append(Rejected(None, "missing_id"))
            continue
        lonlat = _lonlat(row)
        if isinstance(lonlat, str):
            out.rejected.append(Rejected(sensor_id, lonlat))
            continue
        if sensor_id in seen:
            out.notes["duplicate_id"] += 1
            continue
        seen.add(sensor_id)
        kept.append((sensor_id, lonlat[0], lonlat[1], row))
    areas = _area_ids(area_code, area_geom, [k[1] for k in kept], [k[2] for k in kept])
    for (sensor_id, lon, lat, row), area_ids in zip(kept, areas):
        try:
            installed_at, removed_at = gmt_to_utc(row.get("date_installed")), gmt_to_utc(row.get("date_removed"))
        except ValueError:
            out.rejected.append(Rejected(sensor_id, "bad_timestamp"))
            continue
        tidal = {"Yes": True, "No": False}.get(row.get("tidally_influenced"))
        if tidal:
            out.notes["tidally_influenced"] += 1
        out.docs.append(
            (
                sensor_id,
                {
                    "sensor_id": sensor_id,
                    "name": row.get("sensor_name") or sensor_id,
                    "geom": point(lon, lat),
                    "lon": lon,
                    "lat": lat,
                    "installed_at": installed_at,
                    "removed_at": removed_at,
                    "tidally_influenced": tidal,
                    "street_name": row.get("street_name"),
                    "nta": row.get("nta"),
                    "lowest_point_height_delta_in": _float(row.get("lowest_point_height_delta_inches")),
                    "area_ids": area_ids,
                    "knowledge_type": KnowledgeType.OBSERVED.value,
                    **provenance(FLOODNET_SENSORS, sensor_id, run_key=run_key, now=now, updated_at=updated_at, raw=row),
                },
            )
        )
    return out


def transform_flood_events(
    rows: list[dict[str, Any]], *, sensors: dict[str, dict[str, Any]], run_key: str, now: datetime, updated_at: datetime | None
) -> Transformed:
    """``sensors`` maps sensor_id -> {"lon", "lat", "tidally_influenced"} for the sensors loaded in this bundle."""
    out = Transformed()
    seen: set[str] = set()
    for row in rows:
        sensor_id = row.get("sensor_id")
        sensor = sensors.get(sensor_id or "")
        if sensor is None:
            out.rejected.append(Rejected(sensor_id, "unknown_sensor"))
            continue
        try:
            started_at, ended_at = gmt_to_utc(row.get("flood_start_time")), gmt_to_utc(row.get("flood_end_time"))
        except ValueError:
            out.rejected.append(Rejected(sensor_id, "bad_timestamp"))
            continue
        depth = _float(row.get("max_depth_inches"))
        if started_at is None or depth is None:
            out.rejected.append(Rejected(sensor_id, "missing_start_or_depth"))
            continue
        key = f"{sensor_id}_{started_at:%Y%m%dT%H%M%SZ}"
        if key in seen:
            out.notes["duplicate_id"] += 1
            continue
        seen.add(key)
        depths, times = _float_list(row.get("flood_profile_depth_inches")), _float_list(row.get("flood_profile_time_secs"))
        if depths is None or times is None or len(depths) != len(times):
            out.notes["bad_profile"] += 1
            depths, times = [], []
        doc = {
            "sensor": rid("sensor", sensor_id),
            "sensor_id": sensor_id,
            "geom": point(sensor["lon"], sensor["lat"]),
            "lon": sensor["lon"],
            "lat": sensor["lat"],
            "started_at": started_at,
            "ended_at": ended_at,
            "max_depth_in": depth,
            "onset_min": _float(row.get("onset_time_mins")),
            "drain_min": _float(row.get("drain_time_mins")),
            "duration_min": _float(row.get("duration_mins")),
            "duration_above_4in_min": _float(row.get("duration_above_4_inches_mins")),
            "duration_above_12in_min": _float(row.get("duration_above_12_inches_mins")),
            "duration_above_24in_min": _float(row.get("duration_above_24_inches_mins")),
            "profile_depth_in": depths,
            "profile_t_s": times,
            "tidally_influenced": sensor["tidally_influenced"],
            "knowledge_type": KnowledgeType.OBSERVED.value,
            **provenance(FLOODNET_EVENTS, f"{sensor_id}@{row['flood_start_time']}", run_key=run_key, now=now, updated_at=updated_at, raw=row),
        }
        doc["source_url"] = f"{FLOODNET_EVENTS.domain}/resource/{FLOODNET_EVENTS.dataset}.json?" + urlencode(
            {"sensor_id": sensor_id, "flood_start_time": row["flood_start_time"]}
        )
        out.docs.append((key, doc))
    return out


def _float_list(text: Any) -> list[float] | None:
    if text in (None, ""):
        return []
    try:
        values = json.loads(text) if isinstance(text, str) else text
        return [float(v) for v in values]
    except (TypeError, ValueError):
        return None
