"""Crew briefings: Claude on Bedrock rewrites the ranking's evidence; deterministic checks guard it."""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from swale.ai import briefing as ai
from swale.api.params import feature_key, parse_bbox
from swale.api.problems import Problem
from swale.config import BACKEND_DIR
from swale.core.timeutil import iso_z, utcnow
from swale.db import queries as q
from swale.risk.ranking import rank

router = APIRouter()
AUDIO_DIR = BACKEND_DIR / "var" / "briefings"


class BriefingCreate(BaseModel):
    bbox: str
    run_id: str | None = None
    top_n: int = Field(5, ge=1, le=15)
    audio: bool = True


def briefing_out(rec: dict[str, Any]) -> dict[str, Any]:
    bid = str(rec["id"])
    return {
        "id": bid, "knowledge_type": "inferred", "source": rec["source"], "model": rec.get("model"),
        "prompt_version": rec["prompt_version"], "briefing": rec["briefing"], "checks": rec["checks"], "error": rec.get("error"),
        "trace_id": rec.get("trace_id"), "spoken_text": rec["spoken_text"], "run_id": rec.get("run_id"), "bbox": rec["bbox"],
        "pack": rec["pack"], "created_at": iso_z(rec["created_at"]), "audio_error": rec.get("audio_error"),
        "links": {"self": f"/api/v1/briefings/{bid}", "audio": f"/api/v1/briefings/{bid}/audio" if rec.get("audio_file") else None},
    }


@router.post("/briefings", status_code=201)
def create_briefing(body: BriefingCreate, request: Request) -> dict[str, Any]:
    box = parse_bbox(body.bbox)
    db, lock = request.app.state.db, request.app.state.db_lock
    run_key, run_label = None, None
    with lock:
        if body.run_id:
            run_key = feature_key(body.run_id, "simulation_run", param="run_id")
            run_rec = q.get_record(db, "simulation_run", run_key)
            if run_rec is None or run_rec["status"] != "succeeded":
                raise Problem(422, "invalid-parameter", "Invalid parameter", f"{body.run_id} is not a succeeded simulation run")
            scenario = q.get_record(db, "rainfall_scenario", run_rec["scenario"].id)
            run_label = f"{scenario['name']} (Swale SWMM demonstrator, uncalibrated)" if scenario else body.run_id
        ranked = rank(db, box, now=utcnow(), run_key=run_key, limit=body.top_n)
    if not ranked["items"]:
        raise Problem(422, "invalid-parameter", "Nothing to brief", "no catch basins in this bbox")
    pack = ai.evidence_pack(ranked["items"], area_label="the selected area", run_label=run_label)
    if not pack["basins"]:
        raise Problem(422, "invalid-parameter", "Nothing to brief", "no basin in this bbox has supporting evidence")
    result = ai.generate(pack, getattr(request.app.state, "tracer", None))  # outside the DB lock: model calls take seconds
    final = result["briefing"]
    spoken = ai.spoken_text(final, pack)
    key = f"{utcnow():%Y%m%dT%H%M%SZ}_{uuid.uuid4().hex[:6]}"
    audio_file, audio_error = None, None
    if body.audio:
        try:
            audio, audio_error = ai.synthesize_speech_with_voice(spoken)
            if audio:
                AUDIO_DIR.mkdir(parents=True, exist_ok=True)
                audio_file = str(AUDIO_DIR / f"{key}.mp3")
                (AUDIO_DIR / f"{key}.mp3").write_bytes(audio)
            else:
                audio_error = "ELEVENLABS_API_KEY not set"
        except Exception as exc:  # noqa: BLE001 - audio is optional; report why it is missing
            audio_error = f"{type(exc).__name__}: {exc}"[:300]
    doc = {
        "bbox": box.as_list(), "run_id": body.run_id, "pack": pack, "pack_hash": ai.pack_hash(pack), "briefing": final.model_dump(),
        "source": result["source"], "model": result["model"], "prompt_version": result["prompt_version"], "checks": result["checks"],
        "error": result["error"], "trace_id": result["trace_id"], "spoken_text": spoken, "audio_file": audio_file,
        "audio_error": audio_error, "knowledge_type": "inferred", "created_at": utcnow(),
    }
    with lock:
        q.upsert_many(db, "ai_briefing", [(key, doc)])
        return briefing_out(q.get_record(db, "ai_briefing", key))


@router.get("/briefings/{briefing_id}")
def get_briefing(briefing_id: str, request: Request) -> dict[str, Any]:
    with request.app.state.db_lock:
        rec = q.get_record(request.app.state.db, "ai_briefing", feature_key(briefing_id, "ai_briefing"))
    if rec is None:
        raise Problem(404, "not-found", "Not found", f"no briefing {briefing_id}")
    return briefing_out(rec)


@router.get("/briefings/{briefing_id}/audio")
def get_briefing_audio(briefing_id: str, request: Request) -> FileResponse:
    with request.app.state.db_lock:
        rec = q.get_record(request.app.state.db, "ai_briefing", feature_key(briefing_id, "ai_briefing"))
    if rec is None or not rec.get("audio_file"):
        raise Problem(404, "not-found", "Not found", f"no audio for {briefing_id}")
    return FileResponse(rec["audio_file"], media_type="audio/mpeg")
