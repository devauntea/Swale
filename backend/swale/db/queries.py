"""Typed query helpers. All application SurrealQL lives here or in schema.surql."""

from __future__ import annotations

from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from surrealdb import RecordID

from swale.core.geo import BBox
from swale.db.connection import run, run_one

MAP_TABLES = frozenset({"catch_basin", "incident", "sensor", "flood_event", "flood_result"})
CHUNK = 2000
LINKS = ", ->near_basin.* AS links"


def rid(table: str, key: str) -> RecordID:
    return RecordID(table, key)


def count(db: Any, table: str) -> int:
    rows = run_one(db, "SELECT count() FROM type::table($table) GROUP ALL;", {"table": table})
    return rows[0]["count"] if rows else 0


def upsert_many(db: Any, table: str, docs: Sequence[tuple[str, dict[str, Any]]]) -> int:
    """Idempotently write (key, document) pairs. Each document fully replaces the stored one."""
    for i in range(0, len(docs), CHUNK):
        rows = [{"key": key, "doc": doc} for key, doc in docs[i : i + CHUNK]]
        run(db, "FOR $r IN $rows { UPSERT type::thing($table, $r.key) CONTENT $r.doc; };", {"table": table, "rows": rows})
    return len(docs)


def replace_near_basin(db: Any, links: Sequence[dict[str, Any]]) -> None:
    """Make each listed incident's nearest-basin edge exactly what ``links`` says (``basin: None`` means no edge)."""
    sql = """FOR $l IN $links {
        LET $i = type::thing('incident', $l.incident);
        DELETE near_basin WHERE in = $i;
        IF $l.basin {
            LET $b = type::thing('catch_basin', $l.basin);
            RELATE $i->near_basin->$b SET distance_ft = $l.distance_ft, method = $l.method,
                knowledge_type = 'inferred', computed_at = $l.computed_at;
        };
    };"""
    for i in range(0, len(links), CHUNK):
        run(db, sql, {"links": list(links[i : i + CHUNK])})


@dataclass(frozen=True)
class Page:
    records: list[dict[str, Any]]
    next_after: str | None  # record key to pass as ``after`` for the next page; None on the last page


def page_in_bbox(
    db: Any,
    table: str,
    bbox: BBox,
    *,
    limit: int,
    after: str | None = None,
    where: str = "",
    vars: dict[str, Any] | None = None,
    fetch_links: bool = False,
) -> Page:
    """One page of a map table inside ``bbox``, in id order. Uses the ``lat`` index (see docs/benchmarks)."""
    if table not in MAP_TABLES:
        raise ValueError(f"not a map table: {table}")
    clauses = ["lat >= $s", "lat <= $n", "lon >= $w", "lon <= $e"]
    params: dict[str, Any] = {"s": bbox.s, "n": bbox.n, "w": bbox.w, "e": bbox.e, "limit": limit + 1, **(vars or {})}
    if after is not None:
        clauses.append("id > $after")
        params["after"] = rid(table, after)
    if where:
        clauses.append(where)
    sql = f"SELECT *{LINKS if fetch_links else ''} FROM {table} WHERE {' AND '.join(clauses)} ORDER BY id LIMIT $limit;"
    rows = run_one(db, sql, params)
    more = len(rows) > limit
    rows = rows[:limit]
    return Page(rows, rows[-1]["id"].id if more else None)


def incident_filters(
    *,
    categories: Iterable[str] | None = None,
    statuses: Iterable[str] | None = None,
    since: datetime | None = None,
    until: datetime | None = None,
    basin: str | None = None,
) -> tuple[str, dict[str, Any]]:
    clauses: list[str] = []
    params: dict[str, Any] = {}
    if categories:
        clauses.append("category IN $categories")
        params["categories"] = list(categories)
    if statuses:
        clauses.append("verification_status IN $statuses")
        params["statuses"] = list(statuses)
    if since is not None:
        clauses.append("reported_at >= $since")
        params["since"] = since
    if until is not None:
        clauses.append("reported_at <= $until")
        params["until"] = until
    if basin is not None:
        clauses.append("id IN (SELECT VALUE in FROM near_basin WHERE out = $basin)")
        params["basin"] = rid("catch_basin", basin)
    return " AND ".join(clauses), params


def get_record(db: Any, table: str, key: str, *, fetch_links: bool = False) -> dict[str, Any] | None:
    rows = run_one(db, f"SELECT *{LINKS if fetch_links else ''} FROM $record;", {"record": rid(table, key)})
    return rows[0] if rows else None


def data_sources(db: Any) -> list[dict[str, Any]]:
    return run_one(db, "SELECT * FROM data_source ORDER BY id;")


def create_ingest_run(db: Any, key: str, doc: dict[str, Any]) -> None:
    run(db, "CREATE $record CONTENT $doc;", {"record": rid("ingest_run", key), "doc": doc})


def finish_ingest_run(db: Any, key: str, fields: dict[str, Any]) -> None:
    run(db, "UPDATE $record MERGE $fields;", {"record": rid("ingest_run", key), "fields": fields})


def upsert_merge(db: Any, table: str, key: str, doc: dict[str, Any]) -> None:
    """Create the record or merge ``doc`` into it; fields not in ``doc`` are kept."""
    run(db, "UPSERT $record MERGE $doc;", {"record": rid(table, key), "doc": doc})


def flood_event_stats(db: Any, sensor_ids: Sequence[str], since: datetime | None = None, until: datetime | None = None) -> dict[str, dict[str, Any]]:
    """Per-sensor event count, deepest event and latest event start."""
    if not sensor_ids:
        return {}
    where = "sensor_id IN $ids" + (" AND started_at >= $since" if since else "") + (" AND started_at <= $until" if until else "")
    rows = run_one(
        db,
        f"SELECT sensor_id, count() AS event_count, math::max(max_depth_in) AS max_depth_in, time::max(started_at) AS last_event_at "
        f"FROM flood_event WHERE {where} GROUP BY sensor_id;",
        {"ids": list(sensor_ids), "since": since, "until": until},
    )
    return {r["sensor_id"]: r for r in rows}


def area_basins(db: Any, area_id: str) -> list[dict[str, Any]]:
    return run_one(db, "SELECT record::id(id) AS key, lon, lat FROM catch_basin WHERE area_ids CONTAINS $area;", {"area": area_id})


def obstructed_basins(db: Any, since: datetime) -> set[str]:
    """Basins linked to a complaint where DEP's own resolution recorded an obstruction since ``since``."""
    # Start from the matching incidents and follow their links: a subquery filter on near_basin re-ran per
    # edge (20 s on BK0601), and comparing a datetime through the link (in.reported_at) matches nothing
    # in surrealdb-core 2.3.10. This form takes ~50 ms. Both verified 2026-10-16.
    rows = run_one(
        db,
        "SELECT VALUE ->near_basin.out FROM incident WHERE verification_status = 'agency_found_obstruction' AND reported_at >= $since;",
        {"since": since},
    )
    return {basin.id for links in rows for basin in links}
