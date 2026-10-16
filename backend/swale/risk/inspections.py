"""Field inspections entered by crews (observed). Each one is what a person saw at a basin on a date."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Sequence

from swale.db import queries as q
from swale.db.connection import run_one

RESULTS = ("clear", "debris_found", "cleaned", "damaged", "not_found")
SOURCE = "swale_field_entry"


def record(db: Any, basin_key: str, *, result: str, inspected_at: datetime, now: datetime,
           notes: str | None = None, inspector: str | None = None) -> dict[str, Any]:
    if result not in RESULTS:
        raise ValueError(f"result must be one of {', '.join(RESULTS)}")
    if inspected_at > now:
        raise ValueError("inspected_at cannot be in the future")
    key = f"{basin_key}_{inspected_at.strftime('%Y%m%dT%H%M%S')}_{uuid.uuid4().hex[:6]}"
    doc = {"basin": q.rid("catch_basin", basin_key), "basin_key": basin_key, "inspected_at": inspected_at, "result": result,
           "notes": notes, "inspector": inspector, "entered_at": now, "knowledge_type": "observed", "source": SOURCE}
    q.upsert_many(db, "inspection", [(key, doc)])
    return q.get_record(db, "inspection", key)


def latest_by_basin(db: Any, basin_keys: Sequence[str], since: datetime, until: datetime) -> dict[str, dict[str, Any]]:
    """The most recent inspection per basin with since <= inspected_at <= until."""
    rows = run_one(db, "SELECT * FROM inspection WHERE inspected_at >= $since AND inspected_at <= $until AND basin_key IN $keys "
                       "ORDER BY inspected_at DESC;", {"since": since, "until": until, "keys": list(basin_keys)})
    out: dict[str, dict[str, Any]] = {}
    for r in rows:
        out.setdefault(r["basin_key"], r)
    return out


def list_inspections(db: Any, *, basin_key: str | None = None, limit: int = 100) -> list[dict[str, Any]]:
    where = "WHERE basin_key = $key " if basin_key else ""
    return run_one(db, f"SELECT * FROM inspection {where}ORDER BY inspected_at DESC LIMIT $limit;", {"key": basin_key, "limit": limit})
