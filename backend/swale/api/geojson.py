"""DB records -> GeoJSON in the v1 contract shape."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from swale.api.params import encode_cursor
from swale.core.geo import BBox
from swale.core.timeutil import iso_z, utcnow
from swale.db.geometry import to_geojson
from swale.ingest.taxonomy_311 import CATEGORY_LABELS
from swale.sources.registry import REGISTRY

API_VERSION = "1.0"


def source_ref(rec: dict[str, Any]) -> dict[str, Any]:
    key = rec["source"].id
    source = REGISTRY.get(key)
    return {
        "id": key,
        "dataset": source.dataset if source else None,
        "record_id": rec["source_record_id"],
        "url": rec["source_url"],
        "updated_at": iso_z(rec.get("source_updated_at")),
    }


def catch_basin_feature(rec: dict[str, Any]) -> dict[str, Any]:
    x, y = rec.get("x_sp_ft"), rec.get("y_sp_ft")
    return {
        "type": "Feature",
        "id": str(rec["id"]),
        "geometry": to_geojson(rec["geom"]),
        "properties": {
            "layer": "catch_basins",
            "knowledge_type": rec["knowledge_type"],
            "unitid": rec["unitid"],
            "area_ids": rec["area_ids"],
            "state_plane": {"x_ft": x, "y_ft": y, "crs": "EPSG:2263"} if x is not None and y is not None else None,
            "source": source_ref(rec),
            "ingested_at": iso_z(rec["ingested_at"]),
        },
    }


def incident_feature(rec: dict[str, Any], *, include_source_fields: bool = False) -> dict[str, Any]:
    v = rec.get("verification") or {}
    link = (rec.get("links") or [None])[0]
    props: dict[str, Any] = {
        "layer": "incidents",
        "knowledge_type": rec["knowledge_type"],
        "category": rec["category"],
        "category_label": CATEGORY_LABELS.get(rec["category"], rec["category"]),
        "reported_at": iso_z(rec["reported_at"]),
        "closed_at": iso_z(rec.get("closed_at")),
        "source_status": rec.get("source_status"),
        "address": rec.get("address"),
        "verification": {
            "status": rec["verification_status"],
            "knowledge_type": v.get("knowledge_type", "reported"),
            "basis": v.get("basis"),
            "rule": v.get("rule"),
            "text": v.get("text"),
            "at": iso_z(v.get("at")),
        },
        "linked_basin": (
            {"id": str(link["out"]), "distance_ft": link["distance_ft"], "method": link["method"], "knowledge_type": link["knowledge_type"]}
            if link
            else None
        ),
        "source": source_ref(rec),
        "ingested_at": iso_z(rec["ingested_at"]),
    }
    if include_source_fields:
        props["source_fields"] = rec.get("raw") or {}
    return {"type": "Feature", "id": str(rec["id"]), "geometry": to_geojson(rec.get("geom")), "properties": props}


def freshness(sources: list[dict[str, Any]], now: datetime | None = None) -> list[dict[str, Any]]:
    """Staleness is measured from when the rows were fetched from the source, not when they were loaded."""
    now = now or utcnow()
    out = []
    for s in sources:
        fetched = s.get("last_fetched_at")
        out.append({
            "id": s["id"].id,
            "dataset_updated_at": iso_z(s.get("dataset_updated_at")),
            "last_ingested_at": iso_z(s.get("last_success_at")),
            "fetched_at": iso_z(fetched),
            "stale": fetched is None or (now - fetched).total_seconds() > s["stale_after_s"],
        })
    return out


def collection(
    features: list[dict[str, Any]], *, layer: str, bbox: BBox, filters: dict[str, Any], limit: int, next_after: str | None, sources: list[dict[str, Any]]
) -> dict[str, Any]:
    return {
        "type": "FeatureCollection",
        "features": features,
        "meta": {
            "api_version": API_VERSION,
            "layer": layer,
            "request_bbox": bbox.as_list(),
            "filters": filters,
            "count": len(features),
            "limit": limit,
            "truncated": next_after is not None,
            "next_cursor": encode_cursor(next_after),
            "generated_at": iso_z(utcnow()),
            "sources": sources,
        },
    }


def sensor_feature(rec: dict[str, Any], stats: dict[str, Any] | None) -> dict[str, Any]:
    stats = stats or {}
    return {
        "type": "Feature",
        "id": str(rec["id"]),
        "geometry": to_geojson(rec["geom"]),
        "properties": {
            "layer": "sensors",
            "knowledge_type": rec["knowledge_type"],
            "sensor_id": rec["sensor_id"],
            "name": rec["name"],
            "tidally_influenced": rec.get("tidally_influenced"),
            "installed_at": iso_z(rec.get("installed_at")),
            "removed_at": iso_z(rec.get("removed_at")),
            "lowest_point_height_delta_in": rec.get("lowest_point_height_delta_in"),
            "area_ids": rec["area_ids"],
            "event_count": stats.get("event_count", 0),
            "max_depth_in": stats.get("max_depth_in"),
            "last_event_at": iso_z(stats.get("last_event_at")),
            "source": source_ref(rec),
            "ingested_at": iso_z(rec["ingested_at"]),
        },
    }


def flood_event_feature(rec: dict[str, Any], *, include_profile: bool = False) -> dict[str, Any]:
    props: dict[str, Any] = {
        "layer": "flood_observations",
        "knowledge_type": rec["knowledge_type"],
        "sensor_id": rec["sensor_id"],
        "sensor": str(rec["sensor"]),
        "started_at": iso_z(rec["started_at"]),
        "ended_at": iso_z(rec.get("ended_at")),
        "max_depth_in": rec["max_depth_in"],
        "duration_min": rec.get("duration_min"),
        "onset_min": rec.get("onset_min"),
        "drain_min": rec.get("drain_min"),
        "duration_above_4in_min": rec.get("duration_above_4in_min"),
        "duration_above_12in_min": rec.get("duration_above_12in_min"),
        "tidally_influenced": rec.get("tidally_influenced"),
        "source": source_ref(rec),
        "ingested_at": iso_z(rec["ingested_at"]),
    }
    if include_profile:
        props["profile"] = {"t_s": rec.get("profile_t_s", []), "depth_in": rec.get("profile_depth_in", [])}
    return {"type": "Feature", "id": str(rec["id"]), "geometry": to_geojson(rec["geom"]), "properties": props}


def flood_result_feature(rec: dict[str, Any], *, scenario_label: str | None = None) -> dict[str, Any]:
    return {
        "type": "Feature",
        "id": str(rec["id"]),
        "geometry": to_geojson(rec["geom"]),
        "properties": {
            "layer": "simulation_results",
            "knowledge_type": rec["knowledge_type"],
            "run_id": str(rec["run"]),
            "basin_id": str(rec["basin"]),
            "scenario_label": scenario_label,
            "generated_at": iso_z(rec["generated_at"]),
            "hours_flooded": rec["hours_flooded"],
            "max_flood_rate_cfs": rec["max_flood_rate_cfs"],
            "flood_volume_ft3": rec["flood_volume_ft3"],
            "max_ponded_depth_in": rec["max_ponded_depth_in"],
            "risk_class": rec["risk_class"],
            "blockage_applied": rec["blockage_applied"],
            "inlet_height_ft": rec["inlet_height_ft"],
            "catchment_ac": rec.get("catchment_ac"),
            "note": "Swale SWMM demonstrator (schematic, not calibrated). Predicted, not observed.",
        },
    }
