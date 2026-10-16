"""Parsing and validation for shared query parameters."""

from __future__ import annotations

import base64
import binascii
from collections.abc import Iterable
from datetime import datetime, timezone

from swale.api.problems import Problem
from swale.core.geo import BBox, BBoxError, require_coverage

MAX_LIMIT = 5000
DEFAULT_LIMIT = 1000


def invalid(param: str, code: str, message: str) -> Problem:
    return Problem(422, "invalid-parameter", "Invalid parameter", message, [{"param": param, "code": code, "message": message}])


def parse_bbox(text: str) -> BBox:
    try:
        bbox = BBox.parse(text)
        require_coverage(bbox)
    except BBoxError as exc:
        kind = "bbox-outside-coverage" if exc.code == "outside_coverage" else "invalid-bbox"
        raise Problem(422, kind, "Invalid bbox", str(exc), [{"param": "bbox", "code": exc.code, "message": str(exc)}]) from None
    return bbox


def encode_cursor(key: str | None) -> str | None:
    return None if key is None else base64.urlsafe_b64encode(key.encode()).decode().rstrip("=")


def decode_cursor(cursor: str | None) -> str | None:
    if cursor is None:
        return None
    try:  # validate=True: urlsafe_b64decode would silently drop invalid characters
        key = base64.b64decode(cursor + "=" * (-len(cursor) % 4), altchars=b"-_", validate=True).decode()
    except (binascii.Error, UnicodeDecodeError, ValueError):
        key = ""
    if not key:
        raise invalid("cursor", "bad_cursor", "cursor must be a value returned in meta.next_cursor")
    return key


def split_list(value: str | None, *, allowed: Iterable[str], param: str) -> list[str]:
    if not value:
        return []
    items = [v.strip() for v in value.split(",") if v.strip()]
    unknown = sorted(set(items) - set(allowed))
    if unknown:
        raise invalid(param, "unknown_value", f"unknown {param}: {', '.join(unknown)}")
    return items


def require_utc(value: datetime | None, param: str) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        raise invalid(param, "missing_offset", f"{param} must include a UTC offset, e.g. 2026-01-01T00:00:00Z")
    return value.astimezone(timezone.utc)


def feature_key(feature_id: str, table: str, *, param: str | None = None) -> str:
    """Recover a string key from an opaque SDK ID; paths use 404, queries 422.

    surrealdb 2.0.0 prints special string keys as ``table:⟨key⟩``, escaping
    interior closing delimiters as ``\\⟩``. Its RecordID.parse neither unquotes
    these keys nor supports embedded colons. Undo only that printed wrapper;
    never URL-decode here (the HTTP framework already handled the URL).
    """
    prefix = f"{table}:"
    if feature_id.startswith(prefix) and len(feature_id) > len(prefix):
        key = feature_id[len(prefix):]
        if not key.startswith("⟨"):
            return key
        if key.endswith("⟩"):
            encoded = key[1:-1]
            raw = encoded.replace("\\⟩", "⟩")
            # Require a nonempty, correctly escaped wrapper. Preserve all other
            # punctuation/backslashes, including literal delimiters in the key.
            if raw and raw.replace("⟩", "\\⟩") == encoded:
                return raw
    if param:
        raise invalid(param, "bad_id", f"{param} must be a {table} id such as {prefix}…")
    raise Problem(404, "not-found", "Not found", f"no {table} with id {feature_id}")
