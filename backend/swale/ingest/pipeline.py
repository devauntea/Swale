"""Load a bundle into the database: one ingest_run per source, then nearest-basin links."""

from __future__ import annotations

import subprocess
import uuid
from collections import Counter
from collections.abc import Callable
from dataclasses import asdict, dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

from swale.core.timeutil import utcnow
from swale.db import queries as q
from swale.db.schema import apply_schema
from swale.ingest.bundle import Bundle, SourcePull
from swale.ingest.link import METHOD, nearest_basins
from swale.ingest.transform import (
    Transformed,
    transform_area,
    transform_basins,
    transform_flood_events,
    transform_incidents,
    transform_sensors,
)
from swale.sources.registry import REGISTRY, DataSource

TABLES = {"nyc_nta_2020": "area", "nyc_catch_basins": "catch_basin", "nyc311": "incident",
          "floodnet_sensors": "sensor", "floodnet_events": "flood_event"}
REJECT_SAMPLE = 200


@dataclass
class SourceReport:
    source: str
    run_key: str
    fetched: int
    upserted: int
    rejected: int
    reject_reasons: dict[str, int]
    notes: dict[str, int]


@dataclass
class IngestSummary:
    area_code: str
    mode: str
    reports: list[SourceReport]
    linked: int
    unlinked: int


def code_version() -> str:
    try:
        done = subprocess.run(["git", "rev-parse", "--short", "HEAD"], capture_output=True, text=True, check=True, cwd=Path(__file__).parent)
    except (OSError, subprocess.CalledProcessError):
        return "unknown"
    return done.stdout.strip() or "unknown"


def source_doc(source: DataSource) -> dict[str, Any]:
    return {
        "name": source.name,
        "publisher": source.publisher,
        "dataset": source.dataset,
        "url": source.url,
        "cadence": source.cadence,
        "crs": source.crs,
        "time_semantics": source.time_semantics,
        "license_note": source.license_note,
        "known_limitations": list(source.known_limitations),
        "stale_after_s": int(source.stale_after.total_seconds()),
    }


def ingest_bundle(db: Any, bundle: Bundle, *, mode: str, now: datetime) -> IngestSummary:
    apply_schema(db)
    for source in REGISTRY.values():
        q.upsert_merge(db, "data_source", source.key, {**source_doc(source), "last_attempt_at": now})
    version = code_version()
    params = {"area_code": bundle.area_code, "since": bundle.since.isoformat(), "bbox": bundle.bbox.as_list(), "fetched_at": bundle.fetched_at}
    area_geom = bundle.area.rows[0]["the_geom"]

    def load(pull: SourcePull, transform: Callable[[str], Transformed]) -> tuple[SourceReport, Transformed]:
        run_key = f"{pull.source.key}_{now:%Y%m%dT%H%M%SZ}_{uuid.uuid4().hex[:6]}"
        q.create_ingest_run(db, run_key, {
            "source": q.rid("data_source", pull.source.key), "mode": mode, "status": "running", "started_at": now,
            "params": params, "report": {}, "requests": pull.requests, "code_version": version,
        })
        try:
            result = transform(run_key)
            q.upsert_many(db, TABLES[pull.source.key], result.docs)
        except Exception as exc:
            q.finish_ingest_run(db, run_key, {"status": "failed", "finished_at": utcnow(), "error": f"{type(exc).__name__}: {exc}"})
            raise
        report = SourceReport(
            pull.source.key, run_key, len(pull.rows), len(result.docs), len(result.rejected),
            dict(Counter(r.reason for r in result.rejected)), dict(result.notes),
        )
        q.finish_ingest_run(db, run_key, {
            "status": "succeeded", "finished_at": utcnow(),
            "report": {**asdict(report), "rejected_sample": [asdict(r) for r in result.rejected[:REJECT_SAMPLE]]},
        })
        update: dict[str, Any] = {"last_success_at": now, "last_fetched_at": bundle.fetched_at}
        if pull.dataset_updated_at is not None:
            update["dataset_updated_at"] = pull.dataset_updated_at
        q.upsert_merge(db, "data_source", pull.source.key, update)
        return report, result

    area_report, _ = load(bundle.area, lambda run_key: Transformed(docs=[
        transform_area(bundle.area.rows[0], run_key=run_key, now=now, updated_at=bundle.area.dataset_updated_at)
    ]))
    basin_report, basins = load(bundle.catch_basins, lambda run_key: transform_basins(
        bundle.catch_basins.rows, area_code=bundle.area_code, area_geom=area_geom, run_key=run_key, now=now,
        updated_at=bundle.catch_basins.dataset_updated_at,
    ))
    incident_report, incidents = load(bundle.nyc311, lambda run_key: transform_incidents(
        bundle.nyc311.rows, area_code=bundle.area_code, area_geom=area_geom, run_key=run_key, now=now,
    ))

    reports = [area_report, basin_report, incident_report]
    if bundle.floodnet_sensors is not None:
        sensor_report, sensors = load(bundle.floodnet_sensors, lambda run_key: transform_sensors(
            bundle.floodnet_sensors.rows, area_code=bundle.area_code, area_geom=area_geom, run_key=run_key, now=now,
            updated_at=bundle.floodnet_sensors.dataset_updated_at,
        ))
        reports.append(sensor_report)
        lookup = {key: {"lon": d["lon"], "lat": d["lat"], "tidally_influenced": d["tidally_influenced"]} for key, d in sensors.docs}
        if bundle.floodnet_events is not None:
            event_report, _ = load(bundle.floodnet_events, lambda run_key: transform_flood_events(
                bundle.floodnet_events.rows, sensors=lookup, run_key=run_key, now=now, updated_at=bundle.floodnet_events.dataset_updated_at,
            ))
            reports.append(event_report)

    nearest = nearest_basins(
        [(key, doc["lon"], doc["lat"]) for key, doc in incidents.docs],
        [(key, doc["lon"], doc["lat"]) for key, doc in basins.docs],
    )
    q.replace_near_basin(db, [
        {"incident": key, "basin": match[0] if match else None, "distance_ft": match[1] if match else 0.0, "method": METHOD, "computed_at": now}
        for key, match in nearest.items()
    ])
    linked = sum(1 for match in nearest.values() if match)
    return IngestSummary(bundle.area_code, mode, reports, linked, len(nearest) - linked)
