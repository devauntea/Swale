"""Run one SWMM model and summarize its report.

Self-contained (standard library + swmm-toolkit only) so the same file runs locally
or inside a Daytona sandbox:  python worker.py RUN_DIR   (expects RUN_DIR/model.inp)
Writes RUN_DIR/model.rpt, RUN_DIR/model.out and RUN_DIR/results.json.
"""

from __future__ import annotations

import json
import re
import sys
import time
from pathlib import Path

FLOOD_ROW = re.compile(r"^\s*(J\d+)\s+([\d.]+)\s+([\d.]+)\s+(\d+)\s+(\d{2}:\d{2})\s+([\d.]+)\s+([\d.]+)\s*$")
CONTINUITY = re.compile(r"Continuity Error \(%\) \.+\s+(-?[\d.]+)")
PRECIP = re.compile(r"Total Precipitation \.+\s+([\d.]+)\s+([\d.]+)")


def parse_report(text: str) -> dict:
    """Pull errors, continuity checks and the Node Flooding Summary out of a SWMM 5.2 report."""
    errors = re.findall(r"^\s*(ERROR \d+:.*)$", text, re.M)
    warnings = re.findall(r"^\s*(WARNING \d+:.*)$", text, re.M)
    continuity = [float(v) for v in CONTINUITY.findall(text)]
    precip = PRECIP.search(text)
    flooding = []
    start = text.find("Node Flooding Summary")
    if start != -1:
        end = text.find("Outfall Loading Summary", start)
        for line in text[start : end if end != -1 else None].splitlines():
            m = FLOOD_ROW.match(line)
            if m:
                flooding.append({
                    "node": m.group(1),
                    "hours_flooded": float(m.group(2)),
                    "max_rate_cfs": float(m.group(3)),
                    "time_of_max": f"{m.group(4)}d {m.group(5)}",
                    "volume_mgal": float(m.group(6)),
                    "max_ponded_depth_ft": float(m.group(7)),
                })
    return {
        "errors": errors,
        "warnings": warnings[:20],
        "runoff_continuity_error_pct": continuity[0] if continuity else None,
        "routing_continuity_error_pct": continuity[1] if len(continuity) > 1 else None,
        "precip_in": float(precip.group(2)) if precip else None,
        "flooding": flooding,
    }


def engine_version() -> str:
    from swmm.toolkit import solver

    v = int(solver.swmm_get_version())  # e.g. 52004
    return f"SWMM {v // 10000}.{(v // 1000) % 10}.{v % 1000}"


def main(run_dir: str) -> int:
    d = Path(run_dir)
    started = time.time()
    error = None
    try:
        from swmm.toolkit import solver

        solver.swmm_run(str(d / "model.inp"), str(d / "model.rpt"), str(d / "model.out"))
    except Exception as exc:  # SWMM raises with its ERROR text; the report has the details
        error = " ".join(str(exc).split())
    report = (d / "model.rpt").read_text(errors="replace") if (d / "model.rpt").exists() else ""
    summary = parse_report(report)
    try:
        engine = engine_version()
    except Exception:  # noqa: BLE001 - version is informational
        engine = "unknown"
    result = {"ok": error is None and not summary["errors"], "error": error, "elapsed_s": round(time.time() - started, 2), "engine": engine, **summary}
    (d / "results.json").write_text(json.dumps(result))
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1]))
