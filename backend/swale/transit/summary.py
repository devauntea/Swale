"""Spoken transit summary: one cohesive paragraph about what is going wrong on the area's subway right now.

The facts come from MTA's live feeds (delays, service alerts, elevator and escalator outages) and Swale's station
flood exposure, numbered so the paragraph can be checked against them. Claude on Bedrock writes the paragraph;
code then checks that every number and every station it names appears in the facts, and that it claims no flooding
MTA has not reported. A paragraph that fails is replaced by a plain template paragraph built from the same facts.
"""

from __future__ import annotations

import json
import os
import re
from typing import Any

from pydantic import BaseModel, Field

from swale.ai.briefing import DEFAULT_MODEL, llm_available

PROMPT_VERSION = "transit-summary-v1"
SYSTEM = """You write a short spoken summary of subway conditions for a Brooklyn neighborhood, read aloud to the public.
Write ONE cohesive paragraph of 70 to 120 words from the numbered facts only. Lead with what most affects riders now
(delays, service alerts, broken elevators or escalators), then flood exposure, then the rain outlook.
Rules: use digits for every number; use station names exactly as written; say "MTA reports" for alerts; never say a
station is flooded or will flood unless a fact says MTA reported flooding; an exposure score describes risk in heavy
rain, not current conditions. If service is normal, say so plainly. No lists, no headings, no IDs."""
FORBIDDEN = [r"\bis flooding\b", r"\bflooded\b", r"\bwill flood\b", r"\bunderwater\b", r"\bclosed due to flood", r"\bemergency\b"]


class Summary(BaseModel):
    paragraph: str
    fact_ids: list[str] = Field(description="ids of the facts the paragraph uses, e.g. ['f1','f4']")


def _spoken_date(iso: str | None) -> str | None:
    """'2026-11-01T03:59:00Z' -> 'November 1' (dates are read aloud)."""
    from datetime import datetime

    if not iso:
        return None
    try:
        d = datetime.fromisoformat(iso.replace("Z", "+00:00"))
    except ValueError:
        return None
    return f"{d:%B} {d.day}"


def _route_list(routes: list[str]) -> str:
    return "/".join(routes)


def facts(board: dict[str, Any], access: dict[str, Any], exposure_items: list[dict[str, Any]], rain: dict[str, Any]) -> list[dict[str, str]]:
    out: list[dict[str, str]] = []

    def add(kind: str, text: str) -> None:
        out.append({"id": f"f{len(out) + 1}", "kind": kind, "text": text})

    st = board["stations"]
    add("overview", f"{len(st)} stations in the area; {sum(s['trains_next_30_min']['predicted'] for s in st)} train arrivals predicted in the next 30 minutes.")
    for s in st:
        if s["status"] == "delayed":
            d = s["delay_min"]
            add("delay", f"{s['name']} ({_route_list(s['routes'])}) is delayed: {'; '.join(s['reasons'])}."
                + (f" Median delay {d['median']:g} min, worst {d['max']:g} min." if d.get("median") is not None else ""))
        elif s["status"] == "flooding_reported":
            add("flooding", f"MTA reported flooding or water conditions affecting {s['name']} ({_route_list(s['routes'])}).")
    for a in board["alerts"][:6]:
        where = f"at {', '.join(a['stops'])}" if a["station_specific"] else f"on the {_route_list(a['routes'])} line"
        add("alert", f"MTA {a['alert_type'] or 'service alert'} {where}: {a['header'][:220]}")
    if not any(f["kind"] in ("delay", "flooding") for f in out) and not board["alerts"]:
        add("normal", "No stations are delayed and MTA has no active alerts for lines serving the area.")
    for s in access.get("stations", []):
        outs = [u for u in s["equipment"] if u["out_now"]]
        if outs:
            kinds = sorted({u["type"] for u in outs})
            reason = outs[0].get("reason") or "out of service"
            back = _spoken_date(outs[0].get("return_expected"))
            add("equipment", f"{s['name']} has {len(outs)} {' and '.join(k + 's' for k in kinds)} out of service ({reason})"
                + (f", expected back {back}" if back else "") + ("; step-free access is lost" if s["lost_step_free"] else "") + ".")
    sm = access.get("summary", {})
    if sm:
        add("access", f"{sm.get('step_free_now', 0)} of {sm.get('stations', 0)} stations are step-free right now.")
    high = [it for it in exposure_items if it["tier"] == "high"]
    for it in high[:3]:
        reasons = "; ".join(f["explanation"] for f in it["factors"] if f["value"] > 0)[:220]
        add("exposure", f"{it['station']['name']} has high flood exposure in heavy rain (score {it['score']:g} of 100): {reasons}.")
    if rain and rain.get("level") not in (None, "unknown"):
        add("rain", f"Rain level now: {rain['level']}; forecast peak {rain['forecast_peak_in_hr']:g} in/hr against about {rain['sewer_design_in_hr']:g} in/hr sewer capacity.")
    return out


def template(fs: list[dict[str, str]]) -> str:
    order = ["overview", "flooding", "delay", "alert", "normal", "equipment", "access", "exposure", "rain"]
    parts = [f["text"] for k in order for f in fs if f["kind"] == k]
    return " ".join(parts)


def _numbers(text: str) -> set[str]:
    return {n.rstrip(".").lstrip("0") or "0" for n in re.findall(r"\d+(?:\.\d+)?", text.replace(",", ""))}


def check(paragraph: str, fs: list[dict[str, str]], station_names: set[str]) -> list[str]:
    problems = []
    fact_text = " ".join(f["text"] for f in fs)
    extra = _numbers(paragraph) - _numbers(fact_text)
    if extra:
        problems.append(f"numbers not in the facts: {sorted(extra)}")
    mentioned = {n for n in station_names if n.lower() in paragraph.lower()}
    unknown = mentioned - {n for n in station_names if n.lower() in fact_text.lower()}
    if unknown:
        problems.append(f"stations not in the facts: {sorted(unknown)}")
    if not any(f["kind"] == "flooding" for f in fs):
        for pattern in FORBIDDEN:
            if re.search(pattern, paragraph, re.I):
                problems.append(f"forbidden claim: {pattern}")
    words = len(paragraph.split())
    if not 40 <= words <= 160:
        problems.append(f"{words} words (want 70-120)")
    if "\n" in paragraph.strip():
        problems.append("not a single paragraph")
    return problems


def generate(fs: list[dict[str, str]], station_names: set[str], tracer: Any | None = None) -> dict[str, Any]:
    result: dict[str, Any] = {"paragraph": template(fs), "source": "template", "model": None, "checks": [], "error": None,
                              "prompt_version": PROMPT_VERSION, "fact_ids": [f["id"] for f in fs]}
    if not llm_available():
        result["error"] = "no AWS credentials configured; using the template summary"
        return result
    model = os.environ.get("SWALE_BEDROCK_MODEL", DEFAULT_MODEL)
    result["model"] = model
    span_cm = tracer.start_as_current_span("swale.transit_summary") if tracer else None
    span = span_cm.__enter__() if span_cm else None
    try:
        from anthropic import AnthropicBedrockMantle

        client = AnthropicBedrockMantle(aws_region=os.environ.get("AWS_REGION", "us-east-1"))
        user = "Facts:\n" + json.dumps(fs, indent=1)
        if span:
            span.set_attribute("openinference.span.kind", "LLM")
            span.set_attribute("llm.model_name", model)
            span.set_attribute("input.value", user)
            span.set_attribute("swale.prompt_version", PROMPT_VERSION)
        r = client.messages.parse(model=model, max_tokens=4000, system=SYSTEM, messages=[{"role": "user", "content": user}],
                                  output_config={"effort": "low"}, output_format=Summary)
        if r.parsed_output is None:
            result["error"] = f"no structured output (stop_reason={r.stop_reason}); using the template summary"
        else:
            para = " ".join(r.parsed_output.paragraph.split())
            problems = check(para, fs, station_names)
            result["checks"] = problems
            if problems:
                result["error"] = "the model's paragraph failed the checks; using the template summary"
            else:
                result.update({"paragraph": para, "source": "llm", "fact_ids": r.parsed_output.fact_ids})
        if span:
            span.set_attribute("output.value", result["paragraph"])
            span.set_attribute("swale.eval.citation_check", "pass" if result["source"] == "llm" else "fail")
            span.set_attribute("swale.eval.problems", json.dumps(result["checks"]))
    except Exception as exc:  # noqa: BLE001 - any provider error falls back to the template, and is reported
        result["error"] = f"{type(exc).__name__}: {exc}"[:300]
    finally:
        if span_cm:
            span_cm.__exit__(None, None, None)
    return result
