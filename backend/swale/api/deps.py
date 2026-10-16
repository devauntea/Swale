"""FastAPI dependencies. The embedded connection is shared, so requests take turns behind a lock."""

from collections.abc import Iterator
from typing import Any

from fastapi import Request


def get_db(request: Request) -> Iterator[Any]:
    with request.app.state.db_lock:
        yield request.app.state.db
