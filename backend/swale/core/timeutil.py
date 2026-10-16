"""Timestamps. Swale stores UTC; Socrata serves floating timestamps (no offset)."""

from __future__ import annotations

from datetime import datetime, timezone, tzinfo
from zoneinfo import ZoneInfo

NEW_YORK = ZoneInfo("America/New_York")


def parse_floating(value: str | None, zone: tzinfo) -> datetime | None:
    """Read a floating timestamp such as '2026-07-22T14:36:00.000' in ``zone``; return it in UTC.

    Ambiguous fall-back times resolve to the first occurrence, and times inside the
    spring-forward gap use the pre-transition offset (Python's fold=0 rules).
    """
    if value is None or value == "":
        return None
    parsed = datetime.fromisoformat(value)
    if parsed.tzinfo is not None:
        raise ValueError(f"expected a floating timestamp without an offset, got {value!r}")
    return parsed.replace(tzinfo=zone).astimezone(timezone.utc)


def nyc_local_to_utc(value: str | None) -> datetime | None:
    """311 timestamps are New York local time."""
    return parse_floating(value, NEW_YORK)


def gmt_to_utc(value: str | None) -> datetime | None:
    """FloodNet timestamps are documented as GMT."""
    return parse_floating(value, timezone.utc)


def epoch_to_utc(seconds: int | float | None) -> datetime | None:
    return None if seconds is None else datetime.fromtimestamp(seconds, tz=timezone.utc)


def iso_z(value: datetime | None) -> str | None:
    """The API's timestamp format: ISO-8601, UTC, 'Z' suffix, whole seconds."""
    if value is None:
        return None
    return value.astimezone(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def utcnow() -> datetime:
    return datetime.now(timezone.utc)
