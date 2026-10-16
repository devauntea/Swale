"""Stream SurrealDB changes to browsers.

The embedded SDK cannot deliver LIVE SELECT notifications (it needs a WebSocket server connection), so
Swale uses SurrealDB's change feeds instead: tables defined with CHANGEFEED keep an ordered log of
writes, and one background reader polls `SHOW CHANGES` once a second and fans each change out to every
connected client.
"""

from __future__ import annotations

import queue
import threading
from typing import Any

from swale.db.connection import run_one

TABLES = ("inspection", "alert_pack")
POLL_S = 1.0


def _version(stamp: int) -> int:
    """SHOW CHANGES reports versionstamps shifted left 16 bits; SINCE takes the unshifted version (surrealdb-core 2.3)."""
    return stamp >> 16


def _plain(v: Any) -> Any:
    if isinstance(v, dict):
        return {k: _plain(x) for k, x in v.items() if k not in ("geom", "raw", "pack")}
    if isinstance(v, list):
        return [_plain(x) for x in v]
    if hasattr(v, "table_name") and hasattr(v, "id"):
        return f"{v.table_name}:{v.id}"
    if hasattr(v, "isoformat"):
        return v.isoformat()
    return v


class ChangeStream:
    def __init__(self, db: Any) -> None:
        self.db = db
        self.since: dict[str, int] = {}
        self.subscribers: set[queue.Queue] = set()
        self._lock = threading.Lock()
        self._stop = threading.Event()
        for t in TABLES:
            rows = run_one(db, f"SHOW CHANGES FOR TABLE {t} SINCE 0 LIMIT 100000;")
            self.since[t] = (_version(rows[-1]["versionstamp"]) + 1) if rows else 0
        self._thread = threading.Thread(target=self._loop, name="surreal-changefeed", daemon=True)
        self._thread.start()

    def subscribe(self) -> queue.Queue:
        q: queue.Queue = queue.Queue(maxsize=200)
        with self._lock:
            self.subscribers.add(q)
        return q

    def unsubscribe(self, q: queue.Queue) -> None:
        with self._lock:
            self.subscribers.discard(q)

    def poll_once(self) -> list[dict[str, Any]]:
        events = []
        for t in TABLES:
            rows = run_one(self.db, f"SHOW CHANGES FOR TABLE {t} SINCE {int(self.since[t])} LIMIT 200;")
            for row in rows:
                self.since[t] = _version(row["versionstamp"]) + 1
                for change in row["changes"]:
                    for op, rec in change.items():
                        if op in ("update", "delete") and isinstance(rec, dict):
                            events.append({"table": t, "op": op, "record": _plain(rec), "versionstamp": row["versionstamp"]})
        with self._lock:
            subs = list(self.subscribers)
        for e in events:
            for q in subs:
                try:
                    q.put_nowait(e)
                except queue.Full:
                    pass
        return events

    def _loop(self) -> None:
        while not self._stop.wait(POLL_S):
            try:
                self.poll_once()
            except Exception:  # noqa: BLE001 - keep streaming
                continue

    def stop(self) -> None:
        self._stop.set()
