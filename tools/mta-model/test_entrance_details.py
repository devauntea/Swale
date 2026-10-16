"""Additive cached-source publication; no network or scientific validation."""

import hashlib
import importlib.util
import json
from pathlib import Path
import unittest


spec = importlib.util.spec_from_file_location(
    "entrance_publisher", Path(__file__).with_name("publish_entrance_details.py")
)
publisher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(publisher)


class EntranceCatalogPublication(unittest.TestCase):
    def test_deterministic_copy_preserves_unknown_types_unmatched_reasons_and_xy(self):
        rows = [
            {
                "id": "row-example", "gtfsStopId": "F21", "stationId": "237",
                "complexId": "237", "position": [-73.9952827, 40.6793588],
                "type": "Unknown", "matched": False,
                "reason": "Conflicting source identity", "sourceIds": ["S4:row-example"],
                "unusedField": "excluded",
            }
        ]
        raw = json.dumps(rows).encode()
        first = publisher.catalog_bytes(raw)
        self.assertEqual(first, publisher.catalog_bytes(raw))
        output = json.loads(first)
        self.assertEqual(output["inputSha256"], hashlib.sha256(raw).hexdigest())
        self.assertEqual(output["entrances"], [
            {field: rows[0][field] for field in publisher.FIELDS}
        ])
        self.assertIn("2024", output["sourceEdition"])
        self.assertIn("not survey time", output["sourceTimestamp"])

    def test_duplicate_and_inconsistent_ids_fail_closed(self):
        row = {"id": "same", "sourceIds": ["S4:wrong"]}
        with self.assertRaises(ValueError):
            publisher.catalog_bytes(json.dumps([row]).encode())
        row["sourceIds"] = ["S4:same"]
        for field in publisher.FIELDS:
            row.setdefault(field, None)
        with self.assertRaises(ValueError):
            publisher.catalog_bytes(json.dumps([row, row]).encode())
        for raw in [b"[]", b"{}"]:
            with self.assertRaises(ValueError):
                publisher.catalog_bytes(raw)

    def test_retained_full_cache_matches_published_bytes_all_580_records_and_577_joins(self):
        project = Path(__file__).resolve().parents[2]
        path = project / "tools/mta-model/output/entrance_inventory.json"
        if not path.is_file():
            self.skipTest("Full model cache not available; cache publication not tested")
        raw = path.read_bytes()
        rows = json.loads(raw)
        canonical_paths = [
            project / "frontend/public/infrastructure/index.json",
            project / "frontend/public/infrastructure/stations/F21.json",
            project / "frontend/public/infrastructure/stations/F22.json",
        ]
        before = {item: hashlib.sha256(item.read_bytes()).hexdigest() for item in canonical_paths}
        published = (project / "frontend/public/infrastructure/entrance-details.json").read_bytes()
        self.assertEqual(published, publisher.catalog_bytes(raw))
        entries = json.loads(published)["entrances"]
        self.assertEqual(len(entries), 580)
        self.assertEqual(sum(entry["matched"] for entry in entries), 577)
        self.assertEqual(sum(not entry["matched"] for entry in entries), 3)
        for original, entry in zip(rows, entries):
            for field in publisher.FIELDS:
                self.assertEqual(original[field], entry[field], (entry["id"], field))
        self.assertEqual(before, {
            item: hashlib.sha256(item.read_bytes()).hexdigest() for item in canonical_paths
        })


if __name__ == "__main__":
    unittest.main(verbosity=2)
