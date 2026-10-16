"""Where a SWMM model runs: a local child process, or a Daytona sandbox. Both produce the same files."""

from __future__ import annotations

import json
import os
import subprocess
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

WORKER = Path(__file__).with_name("worker.py")
SWMM_TOOLKIT = "swmm-toolkit==0.17.0"


@dataclass
class RunOutcome:
    status: str  # succeeded | failed | timed_out
    results: dict[str, Any] | None
    error: dict[str, str] | None
    log: str
    meta: dict[str, Any] = field(default_factory=dict)


def _outcome_from_results(run_dir: Path, log: str, meta: dict[str, Any]) -> RunOutcome:
    path = run_dir / "results.json"
    if not path.exists():
        return RunOutcome("failed", None, {"code": "worker_crashed", "message": "the worker wrote no results"}, log, meta)
    results = json.loads(path.read_text())
    if not results["ok"]:
        message = "; ".join(results.get("errors") or []) or results.get("error") or "SWMM reported an error"
        return RunOutcome("failed", results, {"code": "swmm_error", "message": message}, log, meta)
    return RunOutcome("succeeded", results, None, log, meta)


class LocalRunner:
    name = "local"

    def run(self, run_dir: Path, timeout_s: int) -> RunOutcome:
        started = time.time()
        try:
            proc = subprocess.run([sys.executable, str(WORKER), str(run_dir)], capture_output=True, text=True, timeout=timeout_s)
        except subprocess.TimeoutExpired:
            return RunOutcome("timed_out", None, {"code": "timeout", "message": f"SWMM did not finish within {timeout_s} s"}, "", {})
        log = (proc.stdout[-20000:] + proc.stderr[-20000:]).strip()
        (run_dir / "worker.log").write_text(log)
        if proc.returncode < 0:
            return RunOutcome("failed", None, {"code": "worker_killed", "message": f"worker killed by signal {-proc.returncode}"}, log, {})
        return _outcome_from_results(run_dir, log, {"wall_s": round(time.time() - started, 2)})


class DaytonaRunner:
    """Runs the same worker in a fresh Daytona sandbox, then deletes the sandbox."""

    name = "daytona"
    REMOTE = "/tmp/swale-run"

    @staticmethod
    def available() -> bool:
        return bool(os.environ.get("DAYTONA_API_KEY"))

    def run(self, run_dir: Path, timeout_s: int) -> RunOutcome:
        if not self.available():
            return RunOutcome("failed", None, {"code": "runner_unavailable", "message": "DAYTONA_API_KEY is not set"}, "", {})
        from daytona import Daytona, DaytonaConfig

        started = time.time()
        daytona = Daytona(DaytonaConfig(api_key=os.environ["DAYTONA_API_KEY"]))
        sandbox = None
        log: list[str] = []
        try:
            sandbox = daytona.create(timeout=120)
            log.append(f"sandbox {getattr(sandbox, 'id', '?')} created in {time.time() - started:.1f}s")
            install = sandbox.process.exec(f"pip install --quiet {SWMM_TOOLKIT}", timeout=300)
            log.append(f"pip install exit={getattr(install, 'exit_code', '?')}: {str(getattr(install, 'result', ''))[-2000:]}")
            sandbox.process.exec(f"mkdir -p {self.REMOTE}", timeout=30)
            sandbox.fs.upload_file(WORKER.read_bytes(), f"{self.REMOTE}/worker.py")
            sandbox.fs.upload_file((run_dir / "model.inp").read_bytes(), f"{self.REMOTE}/model.inp")
            remaining = max(30, int(timeout_s - (time.time() - started)))
            run = sandbox.process.exec(f"python worker.py {self.REMOTE}", cwd=self.REMOTE, timeout=remaining)
            log.append(f"worker exit={getattr(run, 'exit_code', '?')}: {str(getattr(run, 'result', ''))[-4000:]}")
            for name in ("results.json", "model.rpt"):
                data = sandbox.fs.download_file(f"{self.REMOTE}/{name}")
                if data:
                    (run_dir / name).write_bytes(data)
        except Exception as exc:  # noqa: BLE001 - any SDK/network failure becomes a failed run, never a silent fallback
            text = "\n".join(log)
            (run_dir / "worker.log").write_text(text)
            code = "timeout" if "timeout" in type(exc).__name__.lower() else "runner_error"
            return RunOutcome("timed_out" if code == "timeout" else "failed", None, {"code": code, "message": f"{type(exc).__name__}: {exc}"}, text, {})
        finally:
            if sandbox is not None:
                try:
                    daytona.delete(sandbox)
                    log.append("sandbox deleted")
                except Exception as exc:  # noqa: BLE001
                    log.append(f"sandbox delete failed: {exc}")
        text = "\n".join(log)
        (run_dir / "worker.log").write_text(text)
        return _outcome_from_results(run_dir, text, {"wall_s": round(time.time() - started, 2), "sandbox_id": getattr(sandbox, "id", None)})


RUNNERS = {"local": LocalRunner, "daytona": DaytonaRunner}
