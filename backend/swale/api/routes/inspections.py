"""Field inspections: what a crew saw at a basin (observed). Entering one feeds the next ranking."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field

from swale.api.deps import get_db
from swale.api.geojson import API_VERSION
from swale.api.params import feature_key, require_utc
from swale.api.problems import Problem
from swale.core.timeutil import iso_z, utcnow
from swale.db import queries as q
from swale.risk import inspections as insp

router = APIRouter()


class InspectionIn(BaseModel):
    basin_id: str = Field(..., description="catch_basin id, e.g. catch_basin:CB305116")
    result: Literal["clear", "debris_found", "cleaned", "damaged", "not_found"]
    inspected_at: datetime | None = Field(None, description="ISO-8601 with offset; default now")
    notes: str | None = Field(None, max_length=500)
    inspector: str | None = Field(None, max_length=80)


def _out(r: dict[str, Any]) -> dict[str, Any]:
    return {"id": str(r["id"]), "basin_id": str(r["basin"]), "result": r["result"], "inspected_at": iso_z(r["inspected_at"]),
            "notes": r.get("notes"), "inspector": r.get("inspector"), "entered_at": iso_z(r["entered_at"]),
            "knowledge_type": r["knowledge_type"], "source": r["source"]}


@router.post("/inspections", status_code=201)
def create_inspection(body: InspectionIn, db: Any = Depends(get_db)) -> dict[str, Any]:
    key = feature_key(body.basin_id, "catch_basin", param="basin_id")
    if q.get_record(db, "catch_basin", key) is None:
        raise Problem(404, "not-found", "Not found", f"no catch basin {body.basin_id}")
    now = utcnow()
    at = require_utc(body.inspected_at, "inspected_at") if body.inspected_at else now
    try:
        rec = insp.record(db, key, result=body.result, inspected_at=at, now=now, notes=body.notes, inspector=body.inspector)
    except ValueError as exc:
        raise Problem(422, "invalid-parameter", "Invalid parameter", str(exc)) from None
    return {"api_version": API_VERSION, **_out(rec)}


@router.get("/inspections")
def list_inspections(
    basin_id: str | None = Query(None, description="only this catch_basin id"),
    limit: int = Query(100, ge=1, le=1000),
    db: Any = Depends(get_db),
) -> dict[str, Any]:
    key = feature_key(basin_id, "catch_basin", param="basin_id") if basin_id else None
    rows = insp.list_inspections(db, basin_key=key, limit=limit)
    return {"api_version": API_VERSION, "items": [_out(r) for r in rows], "count": len(rows)}
