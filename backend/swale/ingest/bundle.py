"""Bundles: everything one area ingest needs, fetched live or read from a snapshot on disk."""

from __future__ import annotations

import gzip
import json
import re
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path
from typing import Any

from swale.core.geo import BBox, geojson_bbox
from swale.core.timeutil import epoch_to_utc, iso_z, utcnow
from swale.ingest.taxonomy_311 import soql_filter
from swale.sources.registry import CATCH_BASINS, FLOODNET_EVENTS, FLOODNET_SENSORS, NTA_2020, NYC311, DataSource
from swale.sources.socrata import SocrataClient

AREA_CODE = re.compile(r"^[A-Z]{2}\d{4}$")
FILE_STEMS = {NTA_2020.key: "area", CATCH_BASINS.key: "catch_basins", NYC311.key: "nyc311",
              FLOODNET_SENSORS.key: "floodnet_sensors", FLOODNET_EVENTS.key: "floodnet_events"}
OPTIONAL = (FLOODNET_SENSORS, FLOODNET_EVENTS)


@dataclass
class SourcePull:
    source: DataSource
    rows: list[dict[str, Any]]
    dataset_updated_at: datetime | None
    requests: list[str]


@dataclass
class Bundle:
    area_code: str
    fetched_at: datetime
    since: date
    bbox: BBox
    area: SourcePull
    catch_basins: SourcePull
    nyc311: SourcePull
    floodnet_sensors: SourcePull | None = None
    floodnet_events: SourcePull | None = None

    def pulls(self) -> list[SourcePull]:
        return [p for p in (self.area, self.catch_basins, self.nyc311, self.floodnet_sensors, self.floodnet_events) if p is not None]


def within_box(column: str, box: BBox) -> str:
    """Socrata's within_box takes the north-west corner, then the south-east corner."""
    return f"within_box({column}, {box.n}, {box.w}, {box.s}, {box.e})"


def fetch_bundle(client: SocrataClient, area_code: str, *, since: date, bbox: BBox | None = None) -> Bundle:
    if not AREA_CODE.match(area_code):
        raise ValueError(f"not an NTA 2020 code: {area_code!r}")
    fetched_at = utcnow()
    area = _pull(client, NTA_2020, where=f"nta2020 = '{area_code}'")
    if len(area.rows) != 1:
        raise ValueError(f"expected one NTA row for {area_code}, got {len(area.rows)}")
    box = bbox or geojson_bbox(area.rows[0]["the_geom"])
    basins = _pull(client, CATCH_BASINS, where=within_box("the_geom", box))
    complaints = _pull(
        client,
        NYC311,
        where=f"{within_box('location', box)} AND created_date >= '{since.isoformat()}T00:00:00' AND {soql_filter()}",
    )
    sensors = _pull(client, FLOODNET_SENSORS, where=within_box("location", box))
    ids = sorted({r["sensor_id"] for r in sensors.rows if r.get("sensor_id")})
    quoted = ",".join("'" + i.replace("'", "''") + "'" for i in ids)
    events = _pull(client, FLOODNET_EVENTS, where=f"sensor_id in({quoted})") if ids else SourcePull(FLOODNET_EVENTS, [], None, [])
    return Bundle(area_code, fetched_at, since, box, area, basins, complaints, sensors, events)


def _pull(client: SocrataClient, source: DataSource, *, where: str) -> SourcePull:
    start = len(client.requests)
    rows = list(client.rows(source.dataset, where=where))
    meta = client.metadata(source.dataset)
    return SourcePull(source, rows, epoch_to_utc(meta.get("rowsUpdatedAt")), client.requests[start:])


def write_bundle(bundle: Bundle, directory: Path, *, compress: bool = False) -> Path:
    directory.mkdir(parents=True, exist_ok=True)
    manifest: dict[str, Any] = {
        "area_code": bundle.area_code,
        "fetched_at": iso_z(bundle.fetched_at),
        "since": bundle.since.isoformat(),
        "bbox": bundle.bbox.as_list(),
        "note": "Rows exactly as served by NYC Open Data (Socrata), unmodified.",
        "sources": {},
    }
    for pull in bundle.pulls():
        name = FILE_STEMS[pull.source.key] + (".json.gz" if compress else ".json")
        payload = json.dumps(pull.rows, sort_keys=True, indent=None if compress else 1) + "\n"
        if compress:
            (directory / name).write_bytes(gzip.compress(payload.encode(), mtime=0))
        else:
            (directory / name).write_text(payload)
        manifest["sources"][pull.source.key] = {
            "dataset": pull.source.dataset,
            "file": name,
            "rows": len(pull.rows),
            "dataset_updated_at": iso_z(pull.dataset_updated_at),
            "requests": pull.requests,
        }
    path = directory / "manifest.json"
    path.write_text(json.dumps(manifest, indent=2) + "\n")
    return path


def read_bundle(directory: Path) -> Bundle:
    manifest = json.loads((directory / "manifest.json").read_text())
    pulls: dict[str, SourcePull] = {}
    for source in (NTA_2020, CATCH_BASINS, NYC311, *OPTIONAL):
        if source.key not in manifest["sources"]:
            continue  # older snapshots have no FloodNet files
        entry = manifest["sources"][source.key]
        raw = (directory / entry["file"]).read_bytes()
        rows = json.loads(gzip.decompress(raw) if entry["file"].endswith(".gz") else raw)
        if len(rows) != entry["rows"]:
            raise ValueError(f"{entry['file']}: manifest says {entry['rows']} rows, file has {len(rows)}")
        updated = datetime.fromisoformat(entry["dataset_updated_at"]) if entry["dataset_updated_at"] else None
        pulls[source.key] = SourcePull(source, rows, updated, entry["requests"])
    return Bundle(
        manifest["area_code"],
        datetime.fromisoformat(manifest["fetched_at"]),
        date.fromisoformat(manifest["since"]),
        BBox(*manifest["bbox"]),
        pulls[NTA_2020.key],
        pulls[CATCH_BASINS.key],
        pulls[NYC311.key],
        pulls.get(FLOODNET_SENSORS.key),
        pulls.get(FLOODNET_EVENTS.key),
    )
