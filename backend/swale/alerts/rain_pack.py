"""Rain-triggered alert pack: when the NWS rain level reaches watch or warning, simulate today's forecast,
re-rank the basins with that run, write a crew briefing, translate it and read every language aloud.

Each pack records every step with its time and outcome, so a pack that stopped half-way says where and why.
A pack can also be forced for a drill or demo; it is then labelled forced, with the real rain level beside it.
"""

from __future__ import annotations

import threading
import time
import uuid
from datetime import timedelta
from typing import Any

from swale.ai import service as briefings
from swale.core.geo import BBox
from swale.core.timeutil import utcnow
from swale.db import queries as q
from swale.transit import exposure

TRIGGER_LEVELS = ("watch", "warning")
COOLDOWN = timedelta(hours=3)
MONITOR_EVERY_S = 600
DEFAULT_LANGUAGES = ["es", "zh"]


def _weather(area: dict[str, Any]) -> dict[str, Any] | None:
    from swale.weather.nws import weather_now

    w, s, e, n = area["bbox"]
    try:
        return weather_now((s + n) / 2, (w + e) / 2, hours=24)
    except Exception:  # noqa: BLE001 - the level then reads unknown, and no pack is triggered by it
        return None


class AlertPacks:
    def __init__(self, db: Any, lock: Any, sim: Any, tracer: Any) -> None:
        self.db, self.lock, self.sim, self.tracer = db, lock, sim, tracer
        self._stop = threading.Event()
        self._monitor: threading.Thread | None = None

    # ---- records -------------------------------------------------------------------------------
    def _save(self, key: str, doc: dict[str, Any]) -> None:
        with self.lock:
            q.upsert_merge(self.db, "alert_pack", key, doc)

    def _step(self, key: str, steps: list[dict[str, Any]], name: str, status: str, detail: str | None = None) -> None:
        steps.append({"step": name, "status": status, "at": utcnow(), "detail": detail})
        self._save(key, {"steps": steps})

    def get(self, key: str) -> dict[str, Any] | None:
        with self.lock:
            return q.get_record(self.db, "alert_pack", key)

    def recent(self, area_id: str, limit: int = 20) -> list[dict[str, Any]]:
        from swale.db.connection import run_one

        with self.lock:
            return run_one(self.db, "SELECT * FROM alert_pack WHERE area_id = $a ORDER BY created_at DESC LIMIT $n;", {"a": area_id, "n": limit})

    # ---- one pack ------------------------------------------------------------------------------
    def start(self, area_id: str, *, force: bool = False, languages: list[str] | None = None, runner: str = "local",
              trigger: str = "manual") -> str | None:
        with self.lock:
            area = q.get_record(self.db, "area", area_id)
        if area is None:
            raise ValueError(f"no area {area_id}")
        weather = _weather(area)
        rain = exposure.rain_level(weather)
        key = f"{area_id}_{utcnow():%Y%m%dT%H%M%SZ}_{uuid.uuid4().hex[:4]}"
        triggered = rain["level"] in TRIGGER_LEVELS
        if trigger == "monitor" and not triggered:
            return None  # the monitor records only packs it starts; quiet checks are not stored
        doc = {"area_id": area_id, "created_at": utcnow(), "trigger": trigger, "forced": force and not triggered, "rain": rain,
               "languages": languages if languages is not None else DEFAULT_LANGUAGES, "runner": runner,
               "status": "queued" if (triggered or force) else "not_triggered", "steps": [], "knowledge_type": "inferred"}
        self._save(key, doc)
        if triggered or force:
            threading.Thread(target=self._run, args=(key, area, doc), name=f"alert-pack-{key}", daemon=True).start()
        return key

    def _run(self, key: str, area: dict[str, Any], doc: dict[str, Any]) -> None:
        from swale.sim.scenarios import nws_forecast

        steps: list[dict[str, Any]] = []
        self._save(key, {"status": "running"})
        try:
            w, s, e, n = area["bbox"]
            scen_key, scen = nws_forecast(area["code"] if "code" in area else doc["area_id"], (w + e) / 2, (s + n) / 2, 24)
            self.sim.save_scenario(scen_key, scen)
            self._step(key, steps, "forecast_scenario", "ok", f"{scen['name']}: {scen.get('total_depth_in', '?')} in over 24 h")
            run_key = self.sim.submit(scen_key, doc["runner"], {}, 600)
            deadline = time.time() + 600
            while True:
                with self.lock:
                    run = q.get_record(self.db, "simulation_run", run_key)
                if run["status"] in ("succeeded", "failed", "timed_out") or time.time() > deadline:
                    break
                time.sleep(1.5)
            if run["status"] != "succeeded":
                raise RuntimeError(f"simulation {run['status']}: {(run.get('error') or {}).get('message', '')}")
            sm = run["summary"]
            self._step(key, steps, "simulation", "ok", f"{sm['basins_flooded']} basins pond, {sm['deep']} deep ({doc['runner']} runner)")
            self._save(key, {"run_id": f"simulation_run:{run_key}", "simulation": {k: sm.get(k) for k in ("basins_flooded", "deep", "total_flood_volume_ft3", "precip_in")}})

            box = BBox(*area["bbox"])
            bkey = briefings.create(self.db, self.lock, self.tracer, box, run_key=run_key,
                                    run_label=f"{scen['name']} (Swale SWMM demonstrator, uncalibrated)", run_id=f"simulation_run:{run_key}",
                                    top_n=5, audio=True, languages=doc["languages"])
            b = q.get_record(self.db, "ai_briefing", bkey)
            langs = {k: ("ok" if v.get("briefing") else v.get("error")) for k, v in (b.get("translations") or {}).items()}
            self._step(key, steps, "briefing", "ok", f"{b['source']} briefing; translations {langs}")
            self._save(key, {"briefing_id": f"ai_briefing:{bkey}"})

            with self.lock:
                zones = exposure.danger_zones(self.db, box, now=utcnow(), run_key=run_key)
            at_risk = sorted({e["station_name"] for z in zones if z["level"] == "high" for e in z["entrances"]})
            self._step(key, steps, "stations", "ok", f"{len(at_risk)} station(s) with entrances in high danger zones")
            self._save(key, {"stations_at_risk": at_risk, "status": "succeeded", "finished_at": utcnow()})
        except Exception as exc:  # noqa: BLE001 - recorded on the pack
            self._step(key, steps, "error", "failed", f"{type(exc).__name__}: {exc}"[:400])
            self._save(key, {"status": "failed", "finished_at": utcnow()})

    # ---- monitor -------------------------------------------------------------------------------
    def start_monitor(self, area_ids: list[str]) -> None:
        def loop() -> None:
            while not self._stop.wait(MONITOR_EVERY_S):
                for area_id in area_ids:
                    try:
                        last = [p for p in self.recent(area_id, 5) if p["status"] in ("queued", "running", "succeeded") and not p.get("forced")]
                        if last and utcnow() - last[0]["created_at"] < COOLDOWN:
                            continue
                        self.start(area_id, trigger="monitor")
                    except Exception:  # noqa: BLE001 - the monitor keeps running
                        continue

        self._monitor = threading.Thread(target=loop, name="alert-monitor", daemon=True)
        self._monitor.start()

    def stop(self) -> None:
        self._stop.set()
