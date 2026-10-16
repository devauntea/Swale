"""Crew briefings: Claude on Bedrock rewrites the ranking's evidence; deterministic checks guard it."""

from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from swale.ai import multilingual, service
from swale.api.params import feature_key, parse_bbox
from swale.api.problems import Problem
from swale.core.timeutil import iso_z
from swale.db import queries as q

router = APIRouter()


class BriefingCreate(BaseModel):
    bbox: str
    run_id: str | None = None
    top_n: int = Field(5, ge=1, le=15)
    audio: bool = True
    languages: list[str] = Field(default_factory=list, description=f"also translate into these: {sorted(multilingual.LANGUAGES)}")
    prompt_version: Literal["briefing-v1", "briefing-v2"] = "briefing-v1"


class TranslationCreate(BaseModel):
    languages: list[str] = Field(..., min_length=1, max_length=5)
    audio: bool = True


def _translations_out(bid: str, rec: dict[str, Any]) -> dict[str, Any]:
    out = {}
    for lang, t in (rec.get("translations") or {}).items():
        out[lang] = {"language": t.get("language"), "briefing": t.get("briefing"), "error": t.get("error"), "spoken_text": t.get("spoken_text"),
                     "prompt_version": t.get("prompt_version"), "audio_error": t.get("audio_error"), "translated_from": "en",
                     "audio": f"/api/v1/briefings/{bid}/audio?lang={lang}" if t.get("audio_file") else None}
    return out


def briefing_out(rec: dict[str, Any]) -> dict[str, Any]:
    bid = str(rec["id"])
    return {
        "id": bid, "knowledge_type": "inferred", "source": rec["source"], "model": rec.get("model"),
        "prompt_version": rec["prompt_version"], "briefing": rec["briefing"], "checks": rec["checks"], "error": rec.get("error"),
        "trace_id": rec.get("trace_id"), "spoken_text": rec["spoken_text"], "run_id": rec.get("run_id"), "bbox": rec["bbox"],
        "pack": rec["pack"], "created_at": iso_z(rec["created_at"]), "audio_error": rec.get("audio_error"),
        "translations": _translations_out(bid, rec), "languages_available": multilingual.LANGUAGES,
        "links": {"self": f"/api/v1/briefings/{bid}", "audio": f"/api/v1/briefings/{bid}/audio" if rec.get("audio_file") else None},
    }


def _check_languages(langs: list[str]) -> None:
    bad = [lang for lang in langs if lang not in multilingual.LANGUAGES]
    if bad:
        raise Problem(422, "invalid-parameter", "Invalid parameter", f"unsupported language(s) {bad}; use {sorted(multilingual.LANGUAGES)}")


@router.post("/briefings", status_code=201)
def create_briefing(body: BriefingCreate, request: Request) -> dict[str, Any]:
    box = parse_bbox(body.bbox)
    _check_languages(body.languages)
    db, lock = request.app.state.db, request.app.state.db_lock
    run_key, run_label = None, None
    if body.run_id:
        run_key = feature_key(body.run_id, "simulation_run", param="run_id")
        with lock:
            run_rec = q.get_record(db, "simulation_run", run_key)
            scenario = q.get_record(db, "rainfall_scenario", run_rec["scenario"].id) if run_rec else None
        if run_rec is None or run_rec["status"] != "succeeded":
            raise Problem(422, "invalid-parameter", "Invalid parameter", f"{body.run_id} is not a succeeded simulation run")
        run_label = f"{scenario['name']} (Swale SWMM demonstrator, uncalibrated)" if scenario else body.run_id
    try:
        key = service.create(db, lock, getattr(request.app.state, "tracer", None), box, run_key=run_key, run_label=run_label,
                             run_id=body.run_id, top_n=body.top_n, audio=body.audio, languages=body.languages,
                             prompt_version=body.prompt_version)
    except service.NothingToBrief as exc:
        raise Problem(422, "invalid-parameter", "Nothing to brief", str(exc)) from None
    with lock:
        return briefing_out(q.get_record(db, "ai_briefing", key))


class EvalRun(BaseModel):
    limit: int = Field(10, ge=1, le=50)
    judge: bool = True


@router.post("/briefings/evals", status_code=201)
def run_evals(body: EvalRun, request: Request) -> dict[str, Any]:
    """Evaluate briefings not yet evaluated; results are stored and sent to Arize."""
    from swale.ai import evals

    st = request.app.state
    out = evals.run(st.db, st.db_lock, getattr(st, "tracer", None), limit=body.limit, use_judge=body.judge)
    return {"evaluated": len(out), "results": [{**{k: v for k, v in e.items() if k not in ("evaluated_at",)}, "briefing": str(e["briefing"])} for e in out],
            "by_prompt_version": evals.summary(st.db, st.db_lock), "arize": bool(getattr(st, "tracer", None))}


@router.get("/briefings/evals")
def get_evals(request: Request) -> dict[str, Any]:
    from swale.ai import evals

    return {"by_prompt_version": evals.summary(request.app.state.db, request.app.state.db_lock), "judge_version": evals.JUDGE_VERSION}


@router.post("/briefings/{briefing_id}/translations", status_code=201)
def translate_briefing(briefing_id: str, body: TranslationCreate, request: Request) -> dict[str, Any]:
    _check_languages(body.languages)
    db, lock = request.app.state.db, request.app.state.db_lock
    key = feature_key(briefing_id, "ai_briefing")
    with lock:
        rec = q.get_record(db, "ai_briefing", key)
    if rec is None:
        raise Problem(404, "not-found", "Not found", f"no briefing {briefing_id}")
    service.translate(db, lock, key, body.languages, audio=body.audio)
    with lock:
        return briefing_out(q.get_record(db, "ai_briefing", key))


@router.get("/briefings/{briefing_id}")
def get_briefing(briefing_id: str, request: Request) -> dict[str, Any]:
    with request.app.state.db_lock:
        rec = q.get_record(request.app.state.db, "ai_briefing", feature_key(briefing_id, "ai_briefing"))
    if rec is None:
        raise Problem(404, "not-found", "Not found", f"no briefing {briefing_id}")
    return briefing_out(rec)


@router.get("/briefings/{briefing_id}/audio")
def get_briefing_audio(briefing_id: str, request: Request, lang: str | None = None) -> FileResponse:
    with request.app.state.db_lock:
        rec = q.get_record(request.app.state.db, "ai_briefing", feature_key(briefing_id, "ai_briefing"))
    path = None
    if rec is not None:
        path = ((rec.get("translations") or {}).get(lang) or {}).get("audio_file") if lang else rec.get("audio_file")
    if not path:
        raise Problem(404, "not-found", "Not found", f"no {lang or 'English'} audio for {briefing_id}")
    return FileResponse(path, media_type="audio/mpeg")
