"""311 complaint taxonomy -> Swale incident categories. Covers both DEP taxonomies (see docs/data-sources.md)."""

from __future__ import annotations

from collections.abc import Iterable

CATEGORY_LABELS: dict[str, str] = {
    "catch_basin_clogged": "Catch basin clogged",
    "street_flooding": "Street flooding",
    "highway_flooding": "Highway flooding",
    "sewer_backup": "Sewer backup",
    "manhole_overflow": "Manhole overflow",
    "catch_basin_damaged": "Catch basin damaged",
    "catch_basin_other": "Other catch basin request",
    "culvert_blocked": "Culvert blocked",
    "basin_contamination": "Waste in catch basin",
    "pothole": "Pothole",
    "cave_in": "Cave-in",
    "other": "Other sewer report",
}

_MAPPING: dict[tuple[str, str], str] = {
    ("Sewer", "Catch Basin Clogged/Flooding (Use Comments) (SC)"): "catch_basin_clogged",
    ("Sewer Maintenance", "Catch Basin Clogged"): "catch_basin_clogged",
    ("Sewer", "Street Flooding (SJ)"): "street_flooding",
    ("Sewer Maintenance", "Flooding on Street"): "street_flooding",
    ("Sewer", "Highway Flooding (SH)"): "highway_flooding",
    ("Sewer Maintenance", "Flooding on Highway"): "highway_flooding",
    ("Sewer", "Sewer Backup (Use Comments) (SA)"): "sewer_backup",
    ("Sewer Maintenance", "Backup"): "sewer_backup",
    ("Sewer", "Manhole Overflow (Use Comments) (SA1)"): "manhole_overflow",
    ("Sewer", "Catch Basin Sunken/Damaged/Raised (SC1)"): "catch_basin_damaged",
    ("Sewer Maintenance", "Catch Basin Sunken"): "catch_basin_damaged",
    ("Sewer", "Catch Basin Grating Missing (SA4)"): "catch_basin_damaged",
    ("Sewer Maintenance", "Catch Basin Grate Missing"): "catch_basin_damaged",
    ("Sewer", "Defective/Missing Curb Piece (SC4)"): "catch_basin_damaged",
    ("Sewer", "Catch Basin Search (SC2)"): "catch_basin_other",
    ("Sewer Maintenance", "Catch Basin Search"): "catch_basin_other",
    ("Sewer", "Culvert Blocked/Needs Cleaning (SE)"): "culvert_blocked",
    ("Industrial Waste", "Concrete In Catch Basin (IEA)"): "basin_contamination",
    ("Industrial Waste", "Wastewater Into Catch Basin (IEB)"): "basin_contamination",
    ("Industrial Waste", "Grease In Sewer/Catch Basin (IDG)"): "basin_contamination",
    ("Street Condition", "Pothole"): "pothole",
    ("Street Condition", "Cave-in"): "cave_in",
}

#: Loaded in full, so new or unmapped DEP descriptors surface in the ingest report as "other".
FULL_TYPES = ("Sewer", "Sewer Maintenance")


def categorize(complaint_type: str | None, descriptor: str | None) -> str:
    """Map a complaint to a Swale category. Anything unmapped is 'other', and the ingest report counts it."""
    return _MAPPING.get((complaint_type or "", descriptor or ""), "other")


def soql_filter() -> str:
    """The SoQL clause selecting the complaints Swale loads."""
    partial: dict[str, list[str]] = {}
    for complaint_type, descriptor in _MAPPING:
        if complaint_type not in FULL_TYPES:
            partial.setdefault(complaint_type, []).append(descriptor)
    clauses = [f"complaint_type in({_quote_list(FULL_TYPES)})"]
    clauses += [f"(complaint_type = {_quote(c)} AND descriptor in({_quote_list(d)}))" for c, d in sorted(partial.items())]
    return "(" + " OR ".join(clauses) + ")"


def _quote(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def _quote_list(values: Iterable[str]) -> str:
    return ",".join(_quote(v) for v in values)
