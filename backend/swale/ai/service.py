"""Create and store crew briefings (shared by the briefing API and the rain alert pack)."""

from __future__ import annotations

import uuid
from typing import Any

from swale.ai import briefing as ai
from swale.ai import multilingual
from swale.config import BACKEND_DIR
from swale.core.geo import BBox
from swale.core.timeutil import utcnow
from swale.db import queries as q
from swale.risk.ranking import rank

AUDIO_DIR = BACKEND_DIR / "var" / "briefings"


class NothingToBrief(ValueError):
    pass


def _audio(text: str, name: str) -> tuple[str | None, str | None]:
    try:
        audio, note = ai.synthesize_speech_with_voice(text)
    except Exception as exc:  # noqa: BLE001 - audio is optional; report why it is missing
        return None, f"{type(exc).__name__}: {exc}"[:300]
    if not audio:
        return None, "ELEVENLABS_API_KEY not set"
    AUDIO_DIR.mkdir(parents=True, exist_ok=True)
    path = AUDIO_DIR / f"{name}.mp3"
    path.write_bytes(audio)
    return str(path), note


def create(db: Any, lock: Any, tracer: Any, box: BBox, *, run_key: str | None, run_label: str | None, run_id: str | None,
           top_n: int, audio: bool, languages: list[str] | None = None, prompt_version: str = ai.PROMPT_VERSION) -> str:
    with lock:
        ranked = rank(db, box, now=utcnow(), run_key=run_key, limit=top_n)
    if not ranked["items"]:
        raise NothingToBrief("no catch basins in this bbox")
    pack = ai.evidence_pack(ranked["items"], area_label="the selected area", run_label=run_label)
    if not pack["basins"]:
        raise NothingToBrief("no basin in this bbox has supporting evidence")
    result = ai.generate(pack, tracer, prompt_version)  # outside the DB lock: model calls take seconds
    final = result["briefing"]
    spoken = ai.spoken_text(final, pack)
    key = f"{utcnow():%Y%m%dT%H%M%SZ}_{uuid.uuid4().hex[:6]}"
    audio_file, audio_error = _audio(spoken, key) if audio else (None, None)
    doc = {
        "bbox": box.as_list(), "run_id": run_id, "pack": pack, "pack_hash": ai.pack_hash(pack), "briefing": final.model_dump(),
        "source": result["source"], "model": result["model"], "prompt_version": result["prompt_version"], "checks": result["checks"],
        "error": result["error"], "trace_id": result["trace_id"], "spoken_text": spoken, "audio_file": audio_file,
        "audio_error": audio_error, "translations": {}, "knowledge_type": "inferred", "created_at": utcnow(),
    }
    with lock:
        q.upsert_many(db, "ai_briefing", [(key, doc)])
    if languages:
        translate(db, lock, key, languages, audio=audio)
    return key


def translate(db: Any, lock: Any, key: str, languages: list[str], *, audio: bool = True) -> dict[str, Any]:
    with lock:
        rec = q.get_record(db, "ai_briefing", key)
    english = ai.Briefing.model_validate(rec["briefing"])
    out = dict(rec.get("translations") or {})
    for lang in languages:
        t, err = multilingual.translate(english, lang)
        entry: dict[str, Any] = {"language": multilingual.LANGUAGES.get(lang, lang), "briefing": t, "error": err,
                                 "prompt_version": multilingual.PROMPT_VERSION, "audio_file": None, "audio_error": None,
                                 "translated_from": "en", "created_at": utcnow()}
        if t:
            entry["spoken_text"] = multilingual.spoken(t, rec["pack"])
            if audio:
                entry["audio_file"], entry["audio_error"] = _audio(entry["spoken_text"], f"{key}_{lang}")
        out[lang] = entry
    with lock:
        q.upsert_merge(db, "ai_briefing", key, {"translations": out})
    return out
