"""Translate a checked crew briefing for the neighbourhood's languages, and read each one aloud.

Only the prose is translated. Basin IDs, unit IDs and evidence IDs are copied from the checked English
briefing, so a translation cannot change which basins are named or what evidence backs them. A language
whose translation fails is reported as failed, never filled in.
"""

from __future__ import annotations

import os
from typing import Any

from pydantic import BaseModel, Field

from swale.ai.briefing import DEFAULT_MODEL, Briefing, llm_available

# Languages widely spoken in Brooklyn Community District 6 and neighbouring districts, all supported by
# ElevenLabs' multilingual model.
LANGUAGES = {"es": "Spanish", "zh": "Mandarin Chinese (simplified characters)", "ar": "Arabic", "ru": "Russian", "fr": "French"}
PROMPT_VERSION = "translate-v1"
SYSTEM = """You translate short inspection briefings for New York City catch-basin crews.
Translate faithfully and plainly. Keep every number, street name and unit ID exactly as written.
Do not add, drop or soften anything: if the English says a finding is a report, keep it a report;
if it says a prediction is uncalibrated, keep that. Translate the caveat in full."""


class StopText(BaseModel):
    why: str
    action: str


class Translated(BaseModel):
    headline: str
    stops: list[StopText] = Field(description="one entry per English stop, same order")
    caveat: str
    stop_word: str = Field(description='the word for "Stop" as in "Stop 1", in the target language')


def translate(briefing: Briefing, lang: str) -> tuple[dict[str, Any] | None, str | None]:
    """(translated briefing with the original IDs, error)."""
    if lang not in LANGUAGES:
        return None, f"unsupported language {lang}"
    if not llm_available():
        return None, "no AWS credentials configured"
    try:
        from anthropic import AnthropicBedrockMantle

        client = AnthropicBedrockMantle(aws_region=os.environ.get("AWS_REGION", "us-east-1"))
        english = {"headline": briefing.headline, "stops": [{"why": s.why, "action": s.action} for s in briefing.stops],
                   "caveat": briefing.caveat}
        response = client.messages.parse(
            model=os.environ.get("SWALE_BEDROCK_MODEL", DEFAULT_MODEL), max_tokens=8000, system=SYSTEM,
            messages=[{"role": "user", "content": f"Translate into {LANGUAGES[lang]}:\n{english}"}],
            output_config={"effort": "low"}, output_format=Translated,
        )
        t = response.parsed_output
        if t is None:
            return None, f"no structured output (stop_reason={response.stop_reason})"
        if len(t.stops) != len(briefing.stops) or not t.caveat.strip():
            return None, "translation dropped a stop or the caveat"
    except Exception as exc:  # noqa: BLE001 - reported, never faked
        return None, f"{type(exc).__name__}: {exc}"[:300]
    stops = [{"basin_id": s.basin_id, "evidence_ids": s.evidence_ids, "why": ts.why, "action": ts.action}
             for s, ts in zip(briefing.stops, t.stops)]
    return {"headline": t.headline, "stops": stops, "caveat": t.caveat, "stop_word": t.stop_word}, None


def spoken(translated: dict[str, Any], pack: dict[str, Any]) -> str:
    unit = {b["basin_id"]: b["unitid"] for b in pack["basins"]}
    parts = [translated["headline"] + "."]
    for n, s in enumerate(translated["stops"], start=1):
        parts.append(f"{translated['stop_word']} {n}, {unit.get(s['basin_id'], '')}. {s['why']} {s['action']}")
    parts.append(translated["caveat"])
    return " ".join(parts)
