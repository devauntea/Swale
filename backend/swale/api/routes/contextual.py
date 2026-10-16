"""Public selected-context assistant. No crew instructions, DB writes or automatic audio."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Path, Request, Response

from swale.ai.contextual import AgentRequest, AudioRequest, CreateRequest, TranslationRequest

router = APIRouter(prefix="/context", tags=["selected-context"])


@router.get("/capabilities")
def capabilities(request: Request) -> dict[str, Any]:
    return request.app.state.contextual.capabilities()


@router.post("/briefings", status_code=201)
def create_briefing(body: CreateRequest, request: Request) -> dict[str, Any]:
    state = request.app.state
    return state.contextual.create(state.db, state.db_lock, body)


@router.post("/agent")
def agent(body: AgentRequest, request: Request) -> dict[str, Any]:
    state = request.app.state
    return state.contextual.create(state.db, state.db_lock, body, body.prompt)


@router.get("/briefings/{briefing_id}")
def get_briefing(request: Request, briefing_id: str = Path(pattern=r"^[0-9a-f]{32}$")) -> dict[str, Any]:
    service = request.app.state.contextual
    return service.public(service.get(briefing_id))


@router.post("/briefings/{briefing_id}/translations", status_code=201)
def translate(body: TranslationRequest, request: Request, briefing_id: str = Path(pattern=r"^[0-9a-f]{32}$")) -> dict[str, Any]:
    return request.app.state.contextual.translate(briefing_id, body)


@router.post("/briefings/{briefing_id}/audio")
def prepare_audio(body: AudioRequest, request: Request, briefing_id: str = Path(pattern=r"^[0-9a-f]{32}$")) -> dict[str, Any]:
    return request.app.state.contextual.prepare_audio(briefing_id)


@router.get("/briefings/{briefing_id}/audio", response_class=Response)
def audio(request: Request, briefing_id: str = Path(pattern=r"^[0-9a-f]{32}$")) -> Response:
    return Response(content=request.app.state.contextual.audio_bytes(briefing_id), media_type="audio/mpeg", headers={"Cache-Control": "private, no-store"})
