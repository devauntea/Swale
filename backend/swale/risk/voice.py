"""Voice-in inspections: ElevenLabs Scribe transcribes what a crew member says; plain rules read the basin
and the result out of the transcript. No model guesses the outcome: if the transcript names no basin or no
result, nothing is recorded and the crew member is asked to say it again or pick the basin on the map.
"""

from __future__ import annotations

import os
import re
from typing import Any

import httpx

STT_URL = "https://api.elevenlabs.io/v1/speech-to-text"
STT_MODEL = "scribe_v2"
DIGITS = {"zero": "0", "oh": "0", "o": "0", "one": "1", "two": "2", "to": "2", "too": "2", "three": "3", "four": "4", "for": "4",
          "five": "5", "six": "6", "seven": "7", "eight": "8", "ate": "8", "nine": "9",
          "cero": "0", "uno": "1", "dos": "2", "tres": "3", "cuatro": "4", "cinco": "5", "seis": "6", "siete": "7", "ocho": "8", "nueve": "9"}
# Checked in this order: the first rule that matches decides the result.
RESULT_RULES = [
    ("not_found", r"\b(not found|couldn'?t find|could not find|can'?t find|no basin|no encontr\w*)\b"),
    ("damaged", r"\b(damaged|broken|cracked|collapsed|missing grate|grate missing|dañad\w*|rot[oa])\b"),
    ("cleaned", r"\b(cleaned|cleared it|cleared out|vacuumed|we cleared|unclogged|limpiad\w*|limpiamos)\b"),
    ("debris_found", r"\b(debris|clogged|blocked|blockage|obstructed|trash|garbage|leaves|sediment|plastic|basura|hojas|tapad\w*|obstru\w*)\b"),
    ("clear", r"\b(clear|no issues?|no problems?|looks good|flowing|all good|despejad\w*|limpi[oa])\b"),
]


def transcribe(audio: bytes, filename: str, content_type: str) -> dict[str, Any]:
    key = os.environ.get("ELEVENLABS_API_KEY")
    if not key:
        raise RuntimeError("ELEVENLABS_API_KEY not set")
    r = httpx.post(STT_URL, headers={"xi-api-key": key}, data={"model_id": STT_MODEL},
                   files={"file": (filename, audio, content_type)}, timeout=120)
    r.raise_for_status()
    body = r.json()
    return {"text": body.get("text", ""), "language": body.get("language_code"), "language_probability": body.get("language_probability"),
            "model": STT_MODEL}


def normalize(text: str) -> str:
    """Spoken digits to numerals and 'C B' to 'CB', so 'C B three five zero' reads as 'CB350'."""
    words = re.findall(r"[\w']+|[^\w\s]", text.lower())
    out = []
    for w in words:
        out.append(DIGITS.get(w, w))
    joined = " ".join(out)
    joined = re.sub(r"\bc\s*b\b", "cb", joined)
    joined = re.sub(r"(?<=\d)\s+(?=\d)", "", joined)  # "3 5 0" -> "350"
    joined = re.sub(r"\bcb\s+(?=\d)", "cb", joined)
    return joined


def parse(text: str) -> dict[str, Any]:
    norm = normalize(text)
    unit = re.search(r"\bcb(\d{4,8})\b", norm)
    result = next((name for name, rx in RESULT_RULES if re.search(rx, text.lower()) or re.search(rx, norm)), None)
    return {"unitid": f"CB{unit.group(1)}" if unit else None, "result": result, "normalized": norm,
            "rule": "first matching keyword rule: " + ", ".join(n for n, _ in RESULT_RULES)}
