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


def spoken_text(briefing: Briefing, pack: dict[str, Any]) -> str:
    unit = {b["basin_id"]: b["unitid"] for b in pack["basins"]}
    lines = [briefing.headline + "."]
    for n, stop in enumerate(briefing.stops, start=1):
        lines.append(f"Stop {n}, basin {unit.get(stop.basin_id, '')}. {stop.why} {stop.action}")
    lines.append(briefing.caveat)
    return " ".join(lines)


def llm_available() -> bool:
    return bool(os.environ.get("AWS_ACCESS_KEY_ID") or os.environ.get("AWS_PROFILE") or os.environ.get("AWS_BEARER_TOKEN_BEDROCK"))


def generate(pack: dict[str, Any], tracer: Any | None = None) -> dict[str, Any]:
    """Return {"briefing", "source", "model", "checks", "error", "trace_id"}; never raises for LLM problems."""
    template = template_briefing(pack)
    result: dict[str, Any] = {"briefing": template, "source": "template", "model": None, "checks": [], "error": None, "trace_id": None,
                              "prompt_version": PROMPT_VERSION}
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
            span.set_attribute("swale.prompt_version", PROMPT_VERSION)
            span.set_attribute("swale.pack_hash", pack_hash(pack))
            result["trace_id"] = format(span.get_span_context().trace_id, "032x")
        response = client.messages.parse(
            model=model,
            max_tokens=16000,
            system=SYSTEM,
            messages=[{"role": "user", "content": user}],
            output_config={"effort": "medium"},
            output_format=Briefing,
        )
        if response.stop_reason == "refusal":
            result["error"] = f"model refused ({getattr(response.stop_details, 'category', None)}); using the template briefing"
        elif response.parsed_output is None:
            result["error"] = f"no structured output (stop_reason={response.stop_reason}); using the template briefing"
        else:
            problems = check(response.parsed_output, pack)
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

    provider = register(space_id=os.environ["ARIZE_SPACE_ID"], api_key=os.environ["ARIZE_API_KEY"], project_name="swale",
                        set_global_tracer_provider=False, verbose=False)
    return provider.get_tracer("swale.ai")


def synthesize_speech(text: str) -> bytes | None:
    """ElevenLabs text-to-speech (mp3) when ELEVENLABS_API_KEY is set."""
    key = os.environ.get("ELEVENLABS_API_KEY")
    if not key:
        return None
    import httpx

    voice = os.environ.get("ELEVENLABS_VOICE_ID") or "21m00Tcm4TlvDq8ikWAM"
    response = httpx.post(
        f"https://api.elevenlabs.io/v1/text-to-speech/{voice}",
        headers={"xi-api-key": key, "accept": "audio/mpeg"},
        json={"text": text[:4500], "model_id": os.environ.get("ELEVENLABS_MODEL_ID", "eleven_multilingual_v2")},
        timeout=120,
    )
    response.raise_for_status()
    return response.content
