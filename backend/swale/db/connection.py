"""SurrealDB connections, and a query runner that never hides errors.

surrealdb 2.0.0's ``query()`` returns, and error-checks, only the first statement
of a multi-statement query: an error in a later statement is silently dropped
(verified 2026-10-16). Swale therefore runs every query through ``run()``, which
reads every statement's status from ``query_raw()``.
"""

from __future__ import annotations

import threading
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path
from typing import Any

from surrealdb import Surreal

NAMESPACE = "swale"
DATABASE = "main"
FILE_SCHEMES = ("surrealkv://", "surrealkv+versioned://", "file://")
# One query at a time per process: the embedded SDK connection is shared across API threads.
_QUERY_LOCK = threading.RLock()


class QueryFailed(RuntimeError):
    """A SurrealQL statement failed. ``index`` is the statement number, or -1 for a parse/transport error."""

    def __init__(self, index: int, message: str, sql: str) -> None:
        super().__init__(f"statement {index} failed: {message}")
        self.index = index
        self.message = message
        self.sql = sql


@contextmanager
def connect(url: str, namespace: str = NAMESPACE, database: str = DATABASE) -> Iterator[Any]:
    """Open ``mem://``, ``surrealkv://<path>`` or ``ws://host:port`` and select Swale's namespace and database."""
    for scheme in FILE_SCHEMES:
        if url.startswith(scheme):
            Path(url[len(scheme):]).parent.mkdir(parents=True, exist_ok=True)
    with Surreal(url) as db:
        db.use(namespace, database)
        yield db


def run(db: Any, sql: str, vars: dict[str, Any] | None = None) -> list[Any]:
    """Run SurrealQL and return one result per statement; raise QueryFailed if any statement failed."""
    try:
        with _QUERY_LOCK:
            response = db.query_raw(sql, vars or {})
    except Exception as exc:  # the SDK raises RuntimeError for parse errors
        raise QueryFailed(-1, str(exc), sql) from exc
    if response.get("error"):
        raise QueryFailed(-1, str(response["error"]), sql)
    results: list[Any] = []
    for index, statement in enumerate(response.get("result", [])):
        if statement.get("status") != "OK":
            raise QueryFailed(index, str(statement.get("result")), sql)
        results.append(statement.get("result"))
    return results


def run_one(db: Any, sql: str, vars: dict[str, Any] | None = None) -> Any:
    """Run exactly one statement and return its result."""
    results = run(db, sql, vars)
    if len(results) != 1:
        raise ValueError(f"expected exactly one statement, got {len(results)}")
    return results[0]
