"""Briefing quality evaluations, stored in SurrealDB and sent to Arize as evaluator spans.

Each stored briefing gets:
- citation_check (deterministic): the guardrail checks that decide whether the model's draft was used;
- caveat_present (deterministic): the briefing ends with a caveat;
- words_per_stop (deterministic): length, a proxy for how easy it is to read aloud;
- faithfulness (LLM as judge): a separate Claude call reads each stop next to the evidence pack and labels it
  supported or unsupported. The judge's own prompt version is recorded, so its changes are visible too.
Spans carry swale.prompt_version, so Arize can compare briefing-v1 with briefing-v2.
"""

from __future__ import annotations

import json
import os
from typing import Any, Literal

from pydantic import BaseModel

from swale.ai.briefing import DEFAULT_MODEL, Briefing, check, llm_available
from swale.core.timeutil import utcnow
from swale.db import queries as q
from swale.db.connection import run_one

JUDGE_VERSION = "faithfulness-judge-v1"
JUDGE = """You check crew briefings against their evidence pack. For each stop, decide whether every factual claim
in "why" is supported by that basin's factors and explanations in the pack. Dates, counts, depths and the kind of
evidence (DEP finding, measured flood, resident report, model prediction) must match. Wording may differ.
Label a stop "unsupported" if any claim is missing from, or stronger than, the pack."""


class StopVerdict(BaseModel):
    stop: int
    label: Literal["supported", "unsupported"]
    reason: str


class Judgement(BaseModel):
    verdicts: list[StopVerdict]


def judge(briefing: Briefing, pack: dict[str, Any]) -> tuple[list[dict[str, Any]] | None, str | None]:
    if not llm_available():
        return None, "no AWS credentials configured"
    try:
        from anthropic import AnthropicBedrockMantle

        client = AnthropicBedrockMantle(aws_region=os.environ.get("AWS_REGION", "us-east-1"))
        stops = [{"stop": i + 1, "basin_id": s.basin_id, "why": s.why} for i, s in enumerate(briefing.stops)]
        r = client.messages.parse(model=os.environ.get("SWALE_BEDROCK_MODEL", DEFAULT_MODEL), max_tokens=6000, system=JUDGE,
                                  messages=[{"role": "user", "content": f"Evidence pack:\n{json.dumps(pack)}\n\nStops:\n{json.dumps(stops)}"}],
                                  output_config={"effort": "low"}, output_format=Judgement)
        if r.parsed_output is None:
            return None, f"no structured output (stop_reason={r.stop_reason})"
        return [v.model_dump() for v in r.parsed_output.verdicts], None
    except Exception as exc:  # noqa: BLE001 - reported, never faked
        return None, f"{type(exc).__name__}: {exc}"[:300]


def evaluate(rec: dict[str, Any], *, use_judge: bool = True) -> dict[str, Any]:
    b = Briefing.model_validate(rec["briefing"])
    words = [len((s.why + " " + s.action).split()) for s in b.stops]
    verdicts, judge_error = judge(b, rec["pack"]) if use_judge and rec["source"] == "llm" else (None, "template briefing: not judged")
    supported = sum(v["label"] == "supported" for v in verdicts) if verdicts else None
    return {
        "briefing": rec["id"], "prompt_version": rec["prompt_version"], "source": rec["source"], "model": rec.get("model"),
        "citation_check": "pass" if not check(b, rec["pack"]) else "fail",
        "model_draft_used": rec["source"] == "llm",
        "caveat_present": bool(b.caveat.strip()),
        "words_per_stop": round(sum(words) / len(words), 1) if words else 0,
        "faithfulness": round(supported / len(verdicts), 3) if verdicts else None,
        "verdicts": verdicts, "judge_error": judge_error, "judge_version": JUDGE_VERSION,
        "trace_id": rec.get("trace_id"), "evaluated_at": utcnow(),
    }


def log_to_arize(tracer: Any, ev: dict[str, Any]) -> None:
    if tracer is None:
        return
    with tracer.start_as_current_span("swale.briefing.eval") as span:
        span.set_attribute("openinference.span.kind", "EVALUATOR")
        span.set_attribute("swale.prompt_version", ev["prompt_version"])
        span.set_attribute("swale.briefing_id", str(ev["briefing"]))
        span.set_attribute("swale.briefing_trace_id", ev.get("trace_id") or "")
        span.set_attribute("swale.source", ev["source"])
        span.set_attribute("eval.citation_check.label", ev["citation_check"])
        span.set_attribute("eval.caveat_present.label", str(ev["caveat_present"]).lower())
        span.set_attribute("eval.words_per_stop.score", float(ev["words_per_stop"]))
        if ev.get("faithfulness") is not None:  # SurrealDB drops empty fields, so read optional ones with .get
            span.set_attribute("eval.faithfulness.score", float(ev["faithfulness"]))
            span.set_attribute("eval.faithfulness.label", "faithful" if ev["faithfulness"] == 1.0 else "unfaithful")
            span.set_attribute("eval.faithfulness.explanation", json.dumps(ev.get("verdicts") or [])[:4000])
        span.set_attribute("swale.judge_version", ev["judge_version"])


def run(db: Any, lock: Any, tracer: Any, *, limit: int = 10, use_judge: bool = True) -> list[dict[str, Any]]:
    with lock:
        done = {str(b) for b in run_one(db, "SELECT VALUE briefing FROM briefing_eval;") or []}  # RecordID is unhashable
        recs = [r for r in run_one(db, "SELECT * FROM ai_briefing ORDER BY created_at DESC LIMIT 200;") if str(r["id"]) not in done][:limit]
    out = []
    for rec in recs:
        ev = evaluate(rec, use_judge=use_judge)
        with lock:
            q.upsert_many(db, "briefing_eval", [(rec["id"].id, ev)])
        log_to_arize(tracer, ev)
        out.append(ev)
    if tracer is not None:
        from swale.ai.briefing import flush_traces

        flush_traces()
    return out


def summary(db: Any, lock: Any) -> list[dict[str, Any]]:
    with lock:
        rows = run_one(db, "SELECT prompt_version, count() AS briefings, math::mean(IF faithfulness != NONE THEN faithfulness END) AS faithfulness, "
                           "count(citation_check = 'pass') AS citation_pass, count(model_draft_used) AS model_used, "
                           "math::mean(words_per_stop) AS words_per_stop FROM briefing_eval GROUP BY prompt_version;")
    return [{**r, "citation_pass_rate": round(r["citation_pass"] / r["briefings"], 3) if r["briefings"] else None,
             "model_draft_rate": round(r["model_used"] / r["briefings"], 3) if r["briefings"] else None} for r in rows]
