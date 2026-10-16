"""Regression: many concurrent requests must not deadlock the shared DB connection."""

from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

from fastapi.testclient import TestClient

from swale.api.app import create_app
from swale.config import Settings
from swale.ingest.bundle import read_bundle
from swale.ingest.pipeline import ingest_bundle

FIXTURE = Path(__file__).parent / "fixtures" / "bundle_henry_st"


def test_concurrent_requests_complete():
    app = create_app(Settings(db_url="mem://", dev_map=False))
    with TestClient(app) as client:
        bundle = read_bundle(FIXTURE)
        ingest_bundle(app.state.db, bundle, mode="snapshot", now=datetime(2026, 10, 16, 5, 0, tzinfo=timezone.utc))
        bbox = ",".join(map(str, bundle.bbox.as_list()))
        paths = [f"/api/v1/catch-basins?bbox={bbox}", f"/api/v1/incidents?bbox={bbox}", f"/api/v1/sensors?bbox={bbox}",
                 f"/api/v1/risk-rankings?bbox={bbox}", "/api/v1/health", "/api/v1/scenarios"] * 8
        with ThreadPoolExecutor(max_workers=12) as pool:
            codes = list(pool.map(lambda p: client.get(p, timeout=30).status_code, paths))
        assert codes == [200] * len(paths)
