"""Field inspections: what a crew saw at a basin (observed). Entering one feeds the next ranking."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

import json
import queue

from fastapi import APIRouter, Depends, File, Form, Query, Request, UploadFile
from fastapi.responses import StreamingResponse
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


@router.post("/inspections/voice", status_code=201)
def voice_inspection(
    request: Request,
    audio: UploadFile = File(..., description="a short recording: 'Basin CB305116, debris found, leaves on the grate'"),
    basin_id: str | None = Form(None, description="the basin picked on the map; otherwise it is read from the recording"),
    inspector: str | None = Form(None, max_length=80),
    save: bool = Form(True, description="false: transcribe and parse only, record nothing"),
    db: Any = Depends(get_db),
) -> dict[str, Any]:
    from swale.db.connection import run_one
    from swale.risk import voice

    data = audio.file.read(10_000_001)
    if not data or len(data) > 10_000_000:
        raise Problem(422, "invalid-parameter", "Invalid parameter", "audio must be between 1 byte and 10 MB")
    try:
        heard = voice.transcribe(data, audio.filename or "inspection.webm", audio.content_type or "application/octet-stream")
    except Exception as exc:  # noqa: BLE001 - upstream failure is reported, never faked
        raise Problem(503, "upstream-unavailable", "Transcription unavailable", f"{type(exc).__name__}: {exc}"[:300]) from None
    parsed = voice.parse(heard["text"])
    key = feature_key(basin_id, "catch_basin", param="basin_id") if basin_id else None
    if key is None and parsed["unitid"]:
        hit = run_one(db, "SELECT VALUE record::id(id) FROM catch_basin WHERE unitid = $u LIMIT 1;", {"u": parsed["unitid"]})
        key = hit[0] if hit else None
    body: dict[str, Any] = {"api_version": API_VERSION, "transcript": heard, "parsed": parsed,
                            "basin_id": f"catch_basin:{key}" if key else None, "saved": False, "inspection": None}
    problems = []
    if key is None or q.get_record(db, "catch_basin", key) is None:
        problems.append(f"no known basin in the recording (heard {parsed['unitid'] or 'no basin ID'}); say the CB number or pick the basin on the map")
    if parsed["result"] is None:
        problems.append("no result heard; say debris found, cleaned, clear, damaged or not found")
    body["problems"] = problems
    if problems or not save:
        return body
    now = utcnow()
    rec = insp.record(db, key, result=parsed["result"], inspected_at=now, now=now,
                      notes=f"Voice: {heard['text']}"[:500], inspector=inspector or "voice entry")
    body.update({"saved": True, "inspection": _out(rec)})
    return body


@router.get("/stream/changes")
def stream_changes(request: Request) -> StreamingResponse:
    """Server-sent events for new inspections and alert packs, read from SurrealDB change feeds."""
    stream = request.app.state.changes
    sub = stream.subscribe()

    def events():
        try:
            yield "retry: 3000\n\n"
            while True:
                try:
                    e = sub.get(timeout=15)
                    yield f"event: {e['table']}\ndata: {json.dumps(e, default=str)}\n\n"
                except queue.Empty:
                    yield ": keep-alive\n\n"
        finally:
            stream.unsubscribe(sub)

    return StreamingResponse(events(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})
