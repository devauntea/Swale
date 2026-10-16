"""RFC 9457 problem details for every API error."""

from __future__ import annotations

import logging
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

PROBLEM_JSON = "application/problem+json"
log = logging.getLogger("swale.api")


class Problem(Exception):
    def __init__(self, status: int, kind: str, title: str, detail: str, errors: list[dict[str, Any]] | None = None) -> None:
        super().__init__(detail)
        self.status, self.kind, self.title, self.detail, self.errors = status, kind, title, detail, errors or []


def respond(request: Request, status: int, kind: str, title: str, detail: str, errors: list[dict[str, Any]] | None = None) -> JSONResponse:
    instance = request.url.path + (f"?{request.url.query}" if request.url.query else "")
    body: dict[str, Any] = {"type": f"/api/v1/problems/{kind}", "title": title, "status": status, "detail": detail, "instance": instance}
    if errors:
        body["errors"] = errors
    return JSONResponse(body, status_code=status, media_type=PROBLEM_JSON)


def install(app: FastAPI) -> None:
    @app.exception_handler(Problem)
    async def _problem(request: Request, exc: Problem) -> JSONResponse:
        return respond(request, exc.status, exc.kind, exc.title, exc.detail, exc.errors)

    @app.exception_handler(RequestValidationError)
    async def _validation(request: Request, exc: RequestValidationError) -> JSONResponse:
        errors = [{"param": str(e["loc"][-1]), "code": e["type"], "message": e["msg"]} for e in exc.errors()]
        return respond(request, 422, "invalid-parameter", "Invalid parameter", "One or more parameters are invalid.", errors)

    @app.exception_handler(StarletteHTTPException)
    async def _http(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        kind = "not-found" if exc.status_code == 404 else "http-error"
        return respond(request, exc.status_code, kind, "Not found" if exc.status_code == 404 else "HTTP error", str(exc.detail))

    @app.exception_handler(Exception)
    async def _internal(request: Request, exc: Exception) -> JSONResponse:
        log.exception("unhandled error on %s", request.url.path)
        return respond(request, 500, "internal", "Internal error", "The server hit an unexpected error; see the server log.")
