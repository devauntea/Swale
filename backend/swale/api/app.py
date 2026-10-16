"""FastAPI application factory. Run with `swale serve` (Task 8) or `uvicorn swale.api.app:create_app --factory`."""

from __future__ import annotations

import threading
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from swale import __version__
from swale.api import problems
from swale.api.routes import briefings, catch_basins, flood_maps, flooding, incidents, inspections, meta, risk, simulation, weather
from swale.config import BACKEND_DIR, Settings
from swale.db.connection import connect
from swale.db.connection import run_one
from swale.db.schema import apply_schema
from swale.ai.briefing import tracer_from_env
from swale.sim.service import SimulationService

DEV_MAP = BACKEND_DIR / "devtools" / "map.html"


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings.from_env()

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        with connect(settings.db_url) as db:
            apply_schema(db)
            app.state.db = db
            app.state.db_lock = threading.RLock()
            app.state.sim = SimulationService(db, app.state.db_lock, BACKEND_DIR / "var" / "runs")
            app.state.sim.startup(run_one(db, "SELECT VALUE code FROM area;"))
            app.state.tracer = tracer_from_env()
            try:
                yield
            finally:
                app.state.sim.shutdown()

    app = FastAPI(title="Swale API", version=__version__, openapi_url="/api/v1/openapi.json", docs_url="/docs", lifespan=lifespan)
    app.state.settings = settings
    app.add_middleware(CORSMiddleware, allow_origins=list(settings.cors_origins), allow_methods=["GET", "POST"], allow_headers=["*"])
    problems.install(app)
    for module in (meta, catch_basins, incidents, flooding, simulation, risk, briefings, weather, flood_maps, inspections):
        app.include_router(module.router, prefix="/api/v1")
    if settings.dev_map:

        @app.get("/dev/map", include_in_schema=False)
        def dev_map() -> FileResponse:
            return FileResponse(DEV_MAP, media_type="text/html")

    return app
