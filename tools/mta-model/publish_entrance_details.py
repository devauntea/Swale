#!/usr/bin/env python3
"""Publish additive source entrance metadata from the existing cached build only.

No network, GIS acquisition, model rebuild, backend, database, or credentials.
Canonical index/chunks/GLB are neither read for rewriting nor modified.
"""

import argparse
import hashlib
import json
from pathlib import Path


FIELDS = (
    "id", "gtfsStopId", "stationId", "complexId", "position", "type",
    "matched", "reason", "sourceIds",
)


def catalog_bytes(inventory: bytes) -> bytes:
    rows = json.loads(inventory)
    if not isinstance(rows, list) or not 0 < len(rows) <= 1000:
        raise ValueError("Expected a bounded existing entrance inventory")
    seen = set()
    entries = []
    for row in rows:
        if row["id"] in seen or row["sourceIds"] != ["S4:" + row["id"]]:
            raise ValueError("Duplicate or inconsistent source entrance identity")
        seen.add(row["id"])
        entries.append({field: row[field] for field in FIELDS})
    result = {
        "version": 1,
        "sourceEdition": "MTA S4 i9wp-a4ja — 2024 static entrance edition; not a current survey",
        "sourceTimestamp": "2025-12-05T18:36:18+00:00 (publisher upload, not survey time)",
        "inputSha256": hashlib.sha256(inventory).hexdigest(),
        "entrances": entries,
    }
    return (json.dumps(result, sort_keys=True, separators=(",", ":")) + "\n").encode()


def main() -> None:
    project = Path(__file__).resolve().parents[2]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--inventory", type=Path, default=project / "tools/mta-model/output/entrance_inventory.json")
    parser.add_argument("--output", type=Path, default=project / "frontend/public/infrastructure/entrance-details.json")
    parser.add_argument("--check", action="store_true", help="Verify existing output without writing")
    args = parser.parse_args()
    output = catalog_bytes(args.inventory.read_bytes())
    if args.check:
        if args.output.read_bytes() != output:
            raise SystemExit("Entrance metadata differs from the cached inventory")
    else:
        args.output.write_bytes(output)
    print(f"{'Verified' if args.check else 'Published'} {len(output)} bytes; SHA-256 {hashlib.sha256(output).hexdigest()}")


if __name__ == "__main__":
    main()
