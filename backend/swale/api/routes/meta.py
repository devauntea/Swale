"""Service metadata: health, layer catalog and the data-source register."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Request

from swale.api.deps import get_db
from swale.api.geojson import API_VERSION, freshness
from swale.api.models import HealthResponse, LayersResponse, SourcesResponse
from swale.db import queries as q
from swale.db.connection import QueryFailed
from swale.ingest.pipeline import code_version
from swale.ingest.taxonomy_311 import CATEGORY_LABELS

router = APIRouter()


AVAILABLE = {"catch_basins", "incidents", "sensors", "flood_observations", "simulation_results", "risk_rankings"}


def _layer(id: str, title: str, kt: str, geom: str, endpoint: str, milestone: str, filters: list[str], attribution: str, **extra: Any) -> dict[str, Any]:
    return {"id": id, "title": title, "knowledge_type": kt, "geometry_type": geom, "endpoint": endpoint, "available": id in AVAILABLE,
            "milestone": milestone, "filters": filters, "attribution": attribution, **extra}


LAYERS = [
    _layer("catch_basins", "Catch basins (DEP inventory)", "observed", "Point", "/api/v1/catch-basins", "M1", ["bbox", "limit", "cursor"], "NYC DEP via NYC Open Data"),
    _layer("incidents", "311 reports", "reported", "Point", "/api/v1/incidents", "M1",
           ["bbox", "category", "verification", "since", "until", "basin", "limit", "cursor"], "NYC 311 via NYC Open Data",
           categories=[{"id": k, "label": v} for k, v in CATEGORY_LABELS.items()]),
    _layer("sensors", "FloodNet sensors", "observed", "Point", "/api/v1/sensors", "M2", ["bbox", "since", "limit", "cursor"], "FloodNet via NYC Open Data"),
    _layer("flood_observations", "FloodNet flood events", "observed", "Point", "/api/v1/flood-observations", "M2", ["bbox", "since", "until", "min_depth_in", "include_tidal", "limit", "cursor"], "FloodNet via NYC Open Data"),
    _layer("dep_flood_maps", "DEP stormwater flood maps", "predicted", "MultiPolygon", "/api/v1/flood-maps", "M2", ["bbox", "scenario"], "NYC DEP Stormwater Flood Maps"),
    _layer("simulation_results", "Swale simulation results", "predicted", "Point", "/api/v1/simulation-runs/{id}/results", "M2", ["bbox"], "Swale SWMM demonstrator (not calibrated)"),
    _layer("risk_rankings", "Inspection priorities", "inferred", "Point", "/api/v1/risk-rankings", "M3", ["bbox", "run_id", "limit"], "Swale risk-v1 (rule-based)"),
]


def _mode(db_url: str) -> str:
    return "server" if db_url.startswith(("ws://", "wss://", "http://", "https://")) else "embedded"


@router.get("/health", response_model=HealthResponse)
def health(request: Request, db: Any = Depends(get_db)) -> dict[str, Any]:
    try:
        sources, db_status = freshness(q.data_sources(db)), "ok"
    except QueryFailed:
        sources, db_status = [], "error"
    ok = db_status == "ok" and bool(sources) and not any(s["stale"] for s in sources)
    return {
        "status": "ok" if ok else "degraded",
        "api_version": API_VERSION,
        "build": code_version(),
        "db": {"status": db_status, "engine": "surrealdb", "mode": _mode(request.app.state.settings.db_url)},
        "sources": sources,
    }


@router.get("/layers", response_model=LayersResponse)
def layers() -> dict[str, Any]:
    return {"api_version": API_VERSION, "layers": LAYERS}


@router.get("/sources", response_model=SourcesResponse)
def sources(db: Any = Depends(get_db)) -> dict[str, Any]:
    rows = q.data_sources(db)
    fresh = {f["id"]: f for f in freshness(rows)}
    return {
        "api_version": API_VERSION,
        "sources": [
            {**fresh[r["id"].id], **{k: r[k] for k in ("name", "publisher", "dataset", "url", "cadence", "time_semantics", "known_limitations")}}
            for r in rows
        ],
    }
