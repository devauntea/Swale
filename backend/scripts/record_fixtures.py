"""Record the small real-data fixture used by tests/test_ingest.py. Run once, then commit the output.

    uv run python scripts/record_fixtures.py
"""

from datetime import date
from pathlib import Path

from swale.core.geo import BBox
from swale.ingest.bundle import fetch_bundle, write_bundle
from swale.sources.socrata import SocrataClient

# A ~340 m x 290 m box around 304 Henry Street, inside the BK0601 bounding box.
# It contains 311 complaint 69804630, which the tests assert on.
HENRY_ST = BBox(-73.9982, 40.6896, -73.9942, 40.6922)
OUT = Path(__file__).resolve().parents[1] / "tests" / "fixtures" / "bundle_henry_st"


def main() -> None:
    client = SocrataClient()
    try:
        bundle = fetch_bundle(client, "BK0601", since=date(2020, 1, 1), bbox=HENRY_ST)
    finally:
        client.close()
    write_bundle(bundle, OUT)
    print(f"wrote {OUT}: {len(bundle.catch_basins.rows)} basins, {len(bundle.nyc311.rows)} complaints")


if __name__ == "__main__":
    main()
