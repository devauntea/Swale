"""Crew inspection briefings generated from the risk ranking.

The LLM (Claude on Amazon Bedrock) only rewrites evidence it is given into a briefing; it never
scores, classifies or adds facts. Deterministic checks reject any briefing that cites an evidence
ID it was not given, names a basin outside the ranking, or overclaims (e.g. "currently flooded").
A deterministic template briefing is always produced and is used whenever the LLM is unavailable,
refuses, or fails the checks.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
from typing import Any

from pydantic import BaseModel, Field

PROMPT_VERSION = "briefing-v1"
DEFAULT_MODEL = "anthropic.claude-opus-5-5"

SYSTEM = """You write short inspection briefings for NYC catch-basin maintenance crews.
You receive a JSON evidence pack of ranked catch basins. Use only facts in the pack.
Rules:
- Every stop must list the evidence IDs (copied exactly from the pack) that support what you say about it.
- A 311 complaint is a report, not proof. Only call an obstruction "confirmed" when the pack has a DEP finding (factor confirmed_obstruction_history with evidence).
- Simulation results are predictions from an uncalibrated model for a hypothetical storm; never say a street is flooded now or will flood.
- FloodNet readings are past measurements; give their date range only if the pack does.
- Plain language, no jargon, no IDs inside sentences. Keep each "why" to one or two sentences and each action to one sentence."""

SYSTEM_V2 = SYSTEM + """
- Start each "why" with the strongest kind of evidence, named plainly: "DEP found…", "A FloodNet sensor measured…",
  "Residents reported…" or "The model predicts…". Never blend kinds in one claim.
- Start each action with a verb, and say what the crew should check or do on site."""
PROMPTS = {"briefing-v1": SYSTEM, "briefing-v2": SYSTEM_V2}

FORBIDDEN = [
    r"\bcurrently flood", r"\bis flooding\b", r"\bflooded (right )?now\b", r"\bwill flood\b", r"\bguarantee", r"\btoxic\b",
    r"\bemergency\b", r"\bdangerous\b",
]
CONFIRMED = re.compile(r"\b(confirmed|verified)\b", re.I)


class Stop(BaseModel):
    basin_id: str = Field(description="catch_basin id from the pack, e.g. catch_basin:CB305116")
    why: str
    action: str
    evidence_ids: list[str]


class Briefing(BaseModel):
    headline: str
    stops: list[Stop]
    caveat: str


def evidence_pack(items: list[dict[str, Any]], *, area_label: str, run_label: str | None) -> dict[str, Any]:
    return {
        "area": area_label,
        "simulation": run_label or "none selected",
        "basins": [
            {
                "basin_id": str(it["basin"]["id"]),
                "unitid": it["basin"]["unitid"],
                "rank": it["rank"],
                "score": it["score"],
                "tier": it["tier"],
                "lat": round(it["basin"]["lat"], 5),
                "lon": round(it["basin"]["lon"], 5),
                "factors": [
                    {"id": f["id"], "knowledge_type": f["knowledge_type"], "value": f["value"], "explanation": f["explanation"],
                     "evidence_ids": f["evidence_ids"]}
                    for f in it["factors"] if f["value"] > 0
                ],
                "missing": [m["id"] for m in it["missing_factors"]],
            }
            for it in items
            if any(f["evidence_ids"] and f["value"] > 0 for f in it["factors"])  # never send a crew on zero evidence
        ],
    }


def pack_hash(pack: dict[str, Any]) -> str:
    return hashlib.sha256(json.dumps(pack, sort_keys=True).encode()).hexdigest()


def template_briefing(pack: dict[str, Any]) -> Briefing:
    stops = []
    for b in pack["basins"]:
        reasons = [f["explanation"] for f in b["factors"]]
        evidence = [e for f in b["factors"] for e in f["evidence_ids"]]
        confirmed = any(f["id"] == "confirmed_obstruction_history" for f in b["factors"])
        stops.append(Stop(
            basin_id=b["basin_id"],
            why="; ".join(reasons) + "." if reasons else "Ranked on limited evidence.",
            action="Inspect and clear the inlet; DEP has found it obstructed before." if confirmed else "Inspect the inlet and record what you find.",
            evidence_ids=evidence,
        ))
    return Briefing(
        headline=f"{len(stops)} catch basins to check first in {pack['area']}",
        stops=stops,
        caveat="Priorities combine DEP findings, 311 reports, FloodNet readings and a simulation of a hypothetical storm. "
               "Reports and simulations are not confirmations; this is decision support, not an official alert.",
    )


def normalize_ids(briefing: Briefing) -> Briefing:
    """Models sometimes copy SurrealDB's ⟨⟩ ID delimiters as literal JSON escapes (\\u27e8 … \\u27e9); restore them."""
    fix = lambda e: e.replace("\\u27e8", "⟨").replace("\\u27e9", "⟩").replace("\\u27E8", "⟨").replace("\\u27E9", "⟩")  # noqa: E731
    for stop in briefing.stops:
        stop.evidence_ids = [fix(e) for e in stop.evidence_ids]
        stop.basin_id = fix(stop.basin_id)
    return briefing


def check(briefing: Briefing, pack: dict[str, Any]) -> list[str]:
    """Deterministic guardrails. An empty list means the briefing passed."""
    allowed_basins = {b["basin_id"] for b in pack["basins"]}
    allowed_evidence = {e for b in pack["basins"] for f in b["factors"] for e in f["evidence_ids"]}
    confirmed_ok = {b["basin_id"] for b in pack["basins"] if any(f["id"] == "confirmed_obstruction_history" for f in b["factors"])}
    problems = []
    if not briefing.stops:
        problems.append("no stops")
    for stop in briefing.stops:
        if stop.basin_id not in allowed_basins:
            problems.append(f"unknown basin {stop.basin_id}")
        if not stop.evidence_ids:
            problems.append(f"{stop.basin_id}: no evidence cited")
        for e in stop.evidence_ids:
            if e not in allowed_evidence:
                problems.append(f"{stop.basin_id}: cites evidence not in the pack: {e}")
        if CONFIRMED.search(stop.why + " " + stop.action) and stop.basin_id not in confirmed_ok:
            problems.append(f"{stop.basin_id}: says confirmed/verified without a DEP finding")
    text = " ".join([briefing.headline, briefing.caveat, *(s.why + " " + s.action for s in briefing.stops)]).lower()
    for pattern in FORBIDDEN:
        if re.search(pattern, text):
            problems.append(f"forbidden claim: {pattern}")
    return problems


def say_id(unitid: str) -> str:
    """Read a basin ID character by character ("C B 3 5 0 2 8 9"), so a listener can write it down.

    Voices read "CB350289" as one large number, which is hard to catch by ear; in a 2026-10-16 check, Scribe
    heard 4 of 5 IDs wrong in the Spanish briefing and 0 of 5 in English.
    """
    return " ".join(unitid) if unitid else ""


def spoken_text(briefing: Briefing, pack: dict[str, Any]) -> str:
    unit = {b["basin_id"]: say_id(b["unitid"]) for b in pack["basins"]}
    lines = [briefing.headline + "."]
    for n, stop in enumerate(briefing.stops, start=1):
        lines.append(f"Stop {n}, basin {unit.get(stop.basin_id, '')}. {stop.why} {stop.action}")
    lines.append(briefing.caveat)
    return " ".join(lines)


def llm_available() -> bool:
    env = os.environ
    return bool(env.get("AWS_BEARER_TOKEN_BEDROCK") or env.get("ANTHROPIC_AWS_API_KEY") or env.get("AWS_ACCESS_KEY_ID") or env.get("AWS_PROFILE"))


def generate(pack: dict[str, Any], tracer: Any | None = None, prompt_version: str = PROMPT_VERSION) -> dict[str, Any]:
    """Return {"briefing", "source", "model", "checks", "error", "trace_id"}; never raises for LLM problems."""
    template = template_briefing(pack)
    result: dict[str, Any] = {"briefing": template, "source": "template", "model": None, "checks": [], "error": None, "trace_id": None,
                              "prompt_version": prompt_version}
    if not llm_available():
        result["error"] = "no AWS credentials configured; using the template briefing"
        return result
    model = os.environ.get("SWALE_BEDROCK_MODEL", DEFAULT_MODEL)
    result["model"] = model
    span_cm = tracer.start_as_current_span("swale.briefing") if tracer else None
    span = span_cm.__enter__() if span_cm else None
    try:
        from anthropic import AnthropicBedrockMantle

        client = AnthropicBedrockMantle(aws_region=os.environ.get("AWS_REGION", "us-east-1"))
        user = "Evidence pack:\n" + json.dumps(pack, indent=1) + "\n\nWrite the briefing: one stop per basin, in rank order."
        if span:
            span.set_attribute("openinference.span.kind", "LLM")
            span.set_attribute("llm.model_name", model)
            span.set_attribute("llm.provider", "aws_bedrock")
            span.set_attribute("input.value", user)
            span.set_attribute("swale.prompt_version", prompt_version)
            span.set_attribute("swale.pack_hash", pack_hash(pack))
            result["trace_id"] = format(span.get_span_context().trace_id, "032x")
        response = client.messages.parse(
            model=model,
            max_tokens=16000,
            system=PROMPTS[prompt_version],
            messages=[{"role": "user", "content": user}],
            output_config={"effort": "medium"},
            output_format=Briefing,
        )
        if response.stop_reason == "refusal":
            result["error"] = f"model refused ({getattr(response.stop_details, 'category', None)}); using the template briefing"
        elif response.parsed_output is None:
            result["error"] = f"no structured output (stop_reason={response.stop_reason}); using the template briefing"
        else:
            problems = check(normalize_ids(response.parsed_output), pack)
            result["checks"] = problems
            if problems:
                result["error"] = "LLM briefing failed the evidence checks; using the template briefing"
            else:
                result["briefing"], result["source"] = response.parsed_output, "llm"
        if span:
            span.set_attribute("output.value", response.parsed_output.model_dump_json() if response.parsed_output else "")
            span.set_attribute("llm.token_count.prompt", response.usage.input_tokens)
            span.set_attribute("llm.token_count.completion", response.usage.output_tokens)
            span.set_attribute("swale.eval.citation_check", "pass" if result["source"] == "llm" else "fail")
            span.set_attribute("swale.eval.problems", json.dumps(result["checks"]))
    except Exception as exc:  # noqa: BLE001 - any provider error falls back to the template, and is reported
        result["error"] = f"{type(exc).__name__}: {exc}"[:500]
        if span:
            span.set_attribute("swale.error", result["error"])
    finally:
        if span_cm:
            span_cm.__exit__(None, None, None)
    return result


def tracer_from_env() -> Any | None:
    """Arize tracing when ARIZE_SPACE_ID and ARIZE_API_KEY are set; otherwise no tracing."""
    if not (os.environ.get("ARIZE_SPACE_ID") and os.environ.get("ARIZE_API_KEY")):
        return None
    from arize.otel import register

    global TRACER_PROVIDER
    provider = register(space_id=os.environ["ARIZE_SPACE_ID"], api_key=os.environ["ARIZE_API_KEY"], project_name="swale",
                        set_global_tracer_provider=False, verbose=False)
    TRACER_PROVIDER = provider
    return provider.get_tracer("swale.ai")


TRACER_PROVIDER: Any | None = None


def flush_traces(timeout_ms: int = 15000) -> bool:
    """Send buffered spans to Arize now (spans are batched; a short-lived process can exit before they are sent)."""
    return bool(TRACER_PROVIDER and TRACER_PROVIDER.force_flush(timeout_ms))


DEFAULT_VOICE = "Yg7C1g7suzNt5TisIqkZ"  # Jude - Conversational British Podcaster (ElevenLabs professional voice)
FALLBACK_VOICE = "XrExE9yKIg1WjnnlVkGX"  # Matilda (ElevenLabs premade; used only if Jude is refused, e.g. HTTP 402)


def synthesize_speech(text: str) -> bytes | None:
    """ElevenLabs text-to-speech (mp3) when ELEVENLABS_API_KEY is set. Returns None without a key."""
    audio, _ = synthesize_speech_with_voice(text)
    return audio


def synthesize_speech_with_voice(text: str) -> tuple[bytes | None, str | None]:
    """(mp3, note). Voice Library voices need a paid ElevenLabs plan (HTTP 402); then the premade voice is used."""
    key = os.environ.get("ELEVENLABS_API_KEY")
    if not key:
        return None, None
    import httpx

    def speak(voice: str) -> httpx.Response:
        return httpx.post(
            f"https://api.elevenlabs.io/v1/text-to-speech/{voice}",
            headers={"xi-api-key": key, "accept": "audio/mpeg"},
            json={"text": text[:4500], "model_id": os.environ.get("ELEVENLABS_MODEL_ID", "eleven_multilingual_v2")},
            timeout=120,
        )

    voice = os.environ.get("ELEVENLABS_VOICE_ID") or DEFAULT_VOICE
    response = speak(voice)
    note = None
    if response.status_code in (402, 403) and voice != FALLBACK_VOICE:
        note = f"voice {voice} was refused (HTTP {response.status_code}; Voice Library voices need a paid ElevenLabs plan), used the premade Matilda voice"
        response = speak(FALLBACK_VOICE)
    response.raise_for_status()
    return response.content, note
