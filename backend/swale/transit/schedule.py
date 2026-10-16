"""MTA's static subway schedule (GTFS, supplemented with this week's service changes), cut down to an area.

Used to turn live predictions into delays: a train's delay at a stop is its predicted arrival minus its
scheduled arrival. Realtime trip IDs such as ``030100_G..S`` are the tail of static IDs such as
``…_030100_G..S14R``: origin time in hundredths of a minute after midnight, route, direction.
"""

from __future__ import annotations

import csv
import gzip
import io
import json
import re
import zipfile
from collections import defaultdict
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path
from typing import Any, Iterable
from zoneinfo import ZoneInfo

GTFS_URL = "https://rrgtfsfeeds.s3.amazonaws.com/gtfs_supplemented.zip"
TZ = ZoneInfo("America/New_York")
TRIP_KEY = re.compile(r"(\d{6})_([A-Z0-9]+)\.+([NS])")
WEEKDAYS = ("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday")


def trip_key(trip_id: str) -> tuple[str, str, str] | None:
    """(origin, route, direction) from a static or realtime trip ID."""
    m = TRIP_KEY.search(trip_id)
    return (m.group(1), m.group(2), m.group(3)) if m else None


def _rows(zf: zipfile.ZipFile, name: str) -> Iterable[dict[str, str]]:
    with zf.open(name) as fh:
        yield from csv.DictReader(io.TextIOWrapper(fh, encoding="utf-8-sig"))


def active_dates(zf: zipfile.ZipFile, start: date, days: int) -> dict[str, list[str]]:
    """service_id -> the dates (YYYYMMDD) in [start, start + days) on which it runs."""
    span = [start + timedelta(days=i) for i in range(days)]
    out: dict[str, set[str]] = defaultdict(set)
    for r in _rows(zf, "calendar.txt"):
        lo, hi = datetime.strptime(r["start_date"], "%Y%m%d").date(), datetime.strptime(r["end_date"], "%Y%m%d").date()
        for d in span:
            if lo <= d <= hi and r[WEEKDAYS[d.weekday()]] == "1":
                out[r["service_id"]].add(d.strftime("%Y%m%d"))
    wanted = {d.strftime("%Y%m%d") for d in span}
    for r in _rows(zf, "calendar_dates.txt"):
        if r["date"] in wanted:
            (out[r["service_id"]].add if r["exception_type"] == "1" else out[r["service_id"]].discard)(r["date"])
    return {k: sorted(v) for k, v in out.items() if v}


def extract(zip_path: Path, stop_ids: set[str], start: date, days: int = 8) -> dict[str, Any]:
    """Scheduled arrivals at ``stop_ids`` (parent IDs, e.g. F21) for services running in the window."""
    zf = zipfile.ZipFile(zip_path)
    services = active_dates(zf, start, days)
    trips: dict[str, list[Any]] = {}
    for r in _rows(zf, "trips.txt"):
        if r["service_id"] in services and (k := trip_key(r["trip_id"])):
            trips[r["trip_id"]] = [r["service_id"], *k]
    index: dict[str, int] = {}
    trip_list: list[list[Any]] = []
    stops: list[list[Any]] = []
    for r in _rows(zf, "stop_times.txt"):
        if r["stop_id"][:-1] not in stop_ids or r["trip_id"] not in trips:
            continue
        if r["trip_id"] not in index:
            index[r["trip_id"]] = len(trip_list)
            trip_list.append(trips[r["trip_id"]])
        h, m, s = (int(x) for x in (r["arrival_time"] or r["departure_time"]).split(":"))
        stops.append([index[r["trip_id"]], r["stop_id"], h * 3600 + m * 60 + s])
    return {"source": GTFS_URL, "extracted_at": datetime.now(timezone.utc).isoformat(), "window_start": start.isoformat(), "days": days,
            "services": services, "trips": trip_list, "stop_times": stops}


def write_snapshot(data: dict[str, Any], path: Path) -> None:
    path.write_bytes(gzip.compress(json.dumps(data, separators=(",", ":")).encode(), mtime=0))


def service_day_start(service_date: date) -> datetime:
    """GTFS times count from noon minus 12 h on the service day, in New York time."""
    return datetime.combine(service_date, time(12), tzinfo=TZ) - timedelta(hours=12)


class Schedule:
    def __init__(self, data: dict[str, Any]) -> None:
        self.data = data
        self.dates_by_service = {k: set(v) for k, v in data["services"].items()}
        covered = sorted({d for v in data["services"].values() for d in v})
        self.first_date, self.last_date = (covered[0], covered[-1]) if covered else (None, None)
        # (service date, origin, route, direction, stop_id) -> seconds; and stop_id -> [(service_id, route, direction, seconds)]
        self.by_key: dict[tuple[str, str, str, str, str], int] = {}
        self.by_stop: dict[str, list[tuple[str, str, str, int]]] = defaultdict(list)
        for trip_i, stop_id, secs in data["stop_times"]:
            service, origin, route, direction = data["trips"][trip_i]
            self.by_stop[stop_id].append((service, route, direction, secs))
            for d in self.dates_by_service.get(service, ()):
                self.by_key.setdefault((d, origin, route, direction, stop_id), secs)

    @classmethod
    def from_file(cls, path: Path) -> Schedule | None:
        return cls(json.loads(gzip.decompress(path.read_bytes()))) if path.exists() else None

    def covers(self, when: datetime) -> bool:
        d = when.astimezone(TZ).strftime("%Y%m%d")
        return self.first_date is not None and self.first_date <= d <= self.last_date

    def scheduled_time(self, rt_trip_id: str, start_date: str, stop_id: str) -> datetime | None:
        k = trip_key(rt_trip_id)
        if not k or not start_date:
            return None
        secs = self.by_key.get((start_date, *k, stop_id))
        if secs is None:
            return None
        return service_day_start(datetime.strptime(start_date, "%Y%m%d").date()) + timedelta(seconds=secs)

    def arrivals(self, stop_id: str, start: datetime, end: datetime) -> list[tuple[str, str, datetime]]:
        """Scheduled (route, direction, time) at ``stop_id`` between start and end (service days that overlap)."""
        out = []
        local = start.astimezone(TZ).date()
        for d in (local - timedelta(days=1), local):
            ds, base = d.strftime("%Y%m%d"), service_day_start(d)
            for service, route, direction, secs in self.by_stop.get(stop_id, ()):
                if ds in self.dates_by_service.get(service, ()):
                    t = base + timedelta(seconds=secs)
                    if start <= t < end:
                        out.append((route, direction, t))
        return sorted(out, key=lambda x: x[2])
