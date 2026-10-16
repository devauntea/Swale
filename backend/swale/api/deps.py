"""FastAPI dependencies."""

from typing import Any

from fastapi import Request


def get_db(request: Request) -> Any:
    """The shared connection. Each query is serialized inside swale.db.connection.run(); never hold a lock across a
    yield dependency here: FastAPI may run its setup and teardown on different threads."""
    return request.app.state.db
