"""Smoke check: call every Swale endpoint and report what works.

    uv run python scripts/smoke.py                                        # local server, read-only
    uv run python scripts/smoke.py https://d1tl5jij0x3sdf.cloudfront.net  # the AWS site
    uv run python scripts/smoke.py URL --spend                            # also a storm run and a briefing (uses credits)

Read-only checks cost nothing beyond public API calls (NWS, MTA, NOAA). Exit code 1 if any check fails.
"""

from __future__ import annotations

import sys
import time
from typing import Any, Callable

import httpx

BBOX = "-74.01995,40.66457,-73.97962,40.69255"


def main() -> int:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    base = (args[0] if args else "http://127.0.0.1:8000").rstrip("/")
    spend = "--spend" in sys.argv
    c = httpx.Client(base_url=base + "/api/v1", timeout=90)
    results: list[tuple[str, bool, str, float]] = []

    def check(name: str, fn: Callable[[], str]) -> None:
        t = time.time()
        try:
            detail, ok = fn(), True
        except Exception as exc:  # noqa: BLE001 - every failure is reported
            detail, ok = f"{type(exc).__name__}: {exc}"[:160], False
        results.append((name, ok, detail, time.time() - t))
        print(f"{'PASS' if ok else 'FAIL'}  {name:28} {time.time() - t:5.1f}s  {detail}", flush=True)

    def get(path: str, **params: Any) -> Any:
        r = c.get(path, params=params)
        r.raise_for_status()
        return r.json()

    def health() -> str:
        h = get("/health")
        off = [k for k, v in h["integrations"].items() if not v]
        stale = [s["id"] for s in h["sources"] if s.get("stale")]
        assert h["status"] in ("ok", "degraded"), h["status"]
        return f"integrations off: {off or 'none'}; stale sources: {stale or 'none'}"

    def need(cond: bool, msg: str) -> None:
        if not cond:
            raise AssertionError(msg)

    def layer(path: str, minimum: int, **p: Any) -> Callable[[], str]:
        def fn() -> str:
            fc = get(path, **p)
            n = len(fc["features"])
            need(n >= minimum, f"{n} features")
            kts = sorted({f["properties"].get("knowledge_type") for f in fc["features"]})
            return f"{n} features, knowledge types {kts}"
        return fn

    check("health", health)
    check("catch basins", layer("/catch-basins", 100, bbox=BBOX, limit=5000))
    check("311 reports", layer("/incidents", 100, bbox=BBOX, limit=5000, since="2024-10-16T00:00:00Z"))
    check("FloodNet sensors", layer("/sensors", 1, bbox=BBOX))
    check("DEP flood map", layer("/flood-maps", 1, bbox=BBOX))
    check("risk rankings", layer("/risk-rankings", 10, bbox=BBOX, limit=10))
    check("subway stations", layer("/subway/stations", 10, bbox=BBOX))

    def weather() -> str:
        w = get("/weather/now", area_id="BK0601")
        need(w["forecast"]["hours"], "no forecast hours")
        return f"{(w.get('observation') or {}).get('description')}; {w['forecast']['total_rain_in']} in forecast over 24 h"

    def subway() -> str:
        s = get("/subway/live", area_id="BK0601")
        need(s["summary"]["stations"] > 0, "no stations")
        return f"{s['summary']}; errors {s['errors'] or 'none'}"

    def accessibility() -> str:
        a = get("/subway/accessibility", area_id="BK0601")
        return f"{a['summary']}; errors {a['errors'] or 'none'}"

    def exposure() -> str:
        e = get("/subway/flood-exposure", area_id="BK0601")
        return f"{len(e['features'])} stations; rain level {e['meta']['rain']['level']}"

    def zones() -> str:
        z = get("/danger-zones", area_id="BK0601")
        return f"{z['meta']['summary']}"

    def verification() -> str:
        v = get("/weather/verification", area_id="BK0601")
        return "; ".join(f"{w['window_hours']}h {w['verdict'][:30]}" for w in v["windows"])

    def alerts() -> str:
        a = get("/alert-packs/check", area_id="BK0601")
        packs = get("/alert-packs", area_id="BK0601")["items"]
        return f"rain {a['rain']['level']}, monitor {a['monitor']}, {len(packs)} pack(s), latest {packs[0]['status'] if packs else '-'}"

    def stream() -> str:
        with httpx.stream("GET", base + "/api/v1/stream/changes", timeout=10) as r:
            r.raise_for_status()
            first = next(r.iter_lines())
        need(first.startswith("retry"), first)
        return "event stream open"

    def console() -> str:
        r = httpx.get(base + "/dev/map", timeout=30)
        r.raise_for_status()
        return f"{len(r.text) // 1024} KB"

    for name, fn in [("weather", weather), ("subway live", subway), ("station accessibility", accessibility),
                     ("station flood exposure", exposure), ("danger zones", zones), ("forecast check", verification),
                     ("alert packs", alerts), ("live change stream", stream), ("demo console", console)]:
        check(name, fn)
    check("briefing quality", lambda: str(get("/briefings/evals")["by_prompt_version"]))

    if spend:
        def storm() -> str:
            sid = next(s["id"] for s in get("/scenarios", area_id="BK0601")["items"] if "2_13" in s["id"])
            r = c.post("/simulation-runs", json={"scenario_id": sid, "runner": "local", "params": {"blockage_factor": 0.5}})
            r.raise_for_status()
            run = r.json()
            for _ in range(120):
                run = get(f"/simulation-runs/{run['id']}")
                if run["status"] not in ("queued", "running"):
                    break
                time.sleep(1.5)
            need(run["status"] == "succeeded", run["status"])
            return f"{run['summary']['basins_flooded']} basins pond, {run['summary']['deep']} deep"

        def briefing() -> str:
            r = c.post("/briefings", json={"bbox": BBOX, "top_n": 3, "audio": False})
            r.raise_for_status()
            b = r.json()
            return f"source {b['source']} ({b.get('model')}), checks {b['checks'] or 'passed'}"

        check("storm run (local SWMM)", storm)
        check("briefing (Bedrock)", briefing)

    failed = [r for r in results if not r[1]]
    print(f"\n{len(results) - len(failed)} of {len(results)} checks passed against {base}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
