"""Offline public-context regressions. Provider calls are mocked or explicitly disabled."""
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from swale.ai.contextual import AgentRequest, ContextRequest, ContextualService, Selection, Snapshot, Translation, WARNINGS
from swale.api.app import create_app
from swale.api.problems import Problem
from swale.config import Settings
from swale.db import queries as q
from swale.db.geometry import point
from swale.ingest.bundle import read_bundle
from swale.ingest.pipeline import ingest_bundle

FIXTURE = Path(__file__).parent / "fixtures/bundle_henry_st"
NOW = datetime(2026, 10, 16, 14, tzinfo=timezone.utc)
CONTEXT = {"kind": "station", "id": "subway_station:F21", "water_view": "normal", "view_scope": "overview", "state_version": "selection-1"}


@pytest.fixture(autouse=True)
def providers_disabled(monkeypatch):
    for key in ("AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_SESSION_TOKEN", "AWS_PROFILE", "AWS_BEARER_TOKEN_BEDROCK", "ANTHROPIC_AWS_API_KEY",
                "ARIZE_SPACE_ID", "ARIZE_API_KEY", "ELEVENLABS_API_KEY", "SWALE_ALERT_MONITOR", "SWALE_CONTEXT_MODEL_ENABLED", "SWALE_CONTEXT_AUDIO_ENABLED",
                "SWALE_CONTEXT_MAX_MODEL_CALLS", "SWALE_CONTEXT_MAX_AUDIO_CALLS", "SWALE_CONTEXT_BUDGET_USD", "SWALE_CONTEXT_LEDGER_PATH", "SWALE_BEDROCK_MODEL"):
        monkeypatch.delenv(key, raising=False)


@pytest.fixture()
def client():
    app = create_app(Settings(db_url="mem://", dev_map=False))
    with TestClient(app) as http:
        ingest_bundle(app.state.db, read_bundle(FIXTURE), mode="snapshot", now=NOW)
        q.upsert_many(app.state.db, "subway_station", [("F21", {"gtfs_stop_id": "F21", "name": "Carroll St", "routes": ["F", "G"],
                      "geom": point(-73.995048, 40.680303), "lon": -73.995048, "lat": 40.680303, "area_ids": ["BK0601"],
                      "ada": 0, "knowledge_type": "observed", "source": q.rid("data_source", "mta_subway_stations"), "ingested_at": NOW,
                      "source_url": "https://data.ny.gov/resource/39hk-dx4f.json?gtfs_stop_id=F21"})])
        yield http, app


def generate(client, **extra):
    return client[0].post("/api/v1/context/agent", json={"context": CONTEXT, "prompt": "Explain this station.", **extra})


def test_explicit_server_provider_gates_default_zero(client):
    body = client[0].get("/api/v1/context/capabilities").json()
    assert body["model"] == {"enabled": False, "remaining_calls": 0}
    assert body["audio"] == {"enabled": False, "remaining_calls": 0}
    assert body["budget"]["limit_usd"] == 0
    assert body["translation"]["available"] == ["en"]


def test_template_public_context_is_subject_grounded_and_retrievable(client):
    response = generate(client)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["source"] == "template" and "deterministic" in body["error"]
    assert body["context"]["id"] == CONTEXT["id"] and body["context"]["state_version"] == "selection-1"
    assert all(e["subject_id"] == CONTEXT["id"] for e in body["evidence"])
    assert WARNINGS["en"] in body["transcript"]
    assert "clear the inlet" not in body["transcript"] and body["actions"] == []
    assert not any(key.startswith("_") for key in body)
    saved = client[0].get(f"/api/v1/context/briefings/{body['id']}").json()
    assert saved == body
    assert generate(client).json() == body  # same target/version never repeats generation


def test_unknown_subject_and_mismatched_relationship_fail_before_model(client, monkeypatch):
    def unexpected(*args):
        raise AssertionError("provider must not be reached")
    monkeypatch.setattr(client[1].state.contextual, "_model", unexpected)
    for context in ({**CONTEXT, "id": "subway_station:UNKNOWN"}, {**CONTEXT, "station_id": "subway_station:R31"}):
        result = client[0].post("/api/v1/context/agent", json={"context": context, "prompt": "Explain", "use_model": True})
        assert result.status_code in (404, 422)


def test_unmatched_static_station_is_honest_catalog_coverage(client):
    body = client[0].post("/api/v1/context/briefings", json={"context": {**CONTEXT, "id": "subway_station:231"}}).json()
    assert body["subject"]["geometry"]["type"] == "Point"
    assert any("static source-linked" in limitation for limitation in body["limitations"])
    assert body["evidence"][0]["stale"] is None


def test_report_cannot_be_relabelled_station_briefing(client):
    context = {**CONTEXT, "kind": "incident", "id": "incident:nyc311_69804630"}
    body = client[0].post("/api/v1/context/briefings", json={"context": context}).json()
    assert body["subject"]["station_id"] is None
    assert all(e["subject_id"] == context["id"] for e in body["evidence"])
    assert "closure alone does not prove cleaning" in body["transcript"]
    invalid = client[0].post("/api/v1/context/briefings", json={"context": {**context, "station_id": "subway_station:F21"}})
    assert invalid.status_code == 422


def snapshot(**extra):
    return {"station_id": "subway_station:F21", "scenario_id": "local-entrance-what-if", "model_version": "swale-entrance-storage-v1",
            "elapsed_seconds": 600, "fingerprint": "client-label", "inputs": {"streetDepthM": 0.35, "barrierHeightM": 0.1, "inflowCapacityLps": 20, "drainageCapacityLps": 2, "durationS": 1800}, "results": {"storedM3": 10.8}, **extra}


def test_local_snapshot_keeps_hypothetical_identity_and_changes_context_key(client):
    one = client[0].post("/api/v1/context/briefings", json={"context": {**CONTEXT, "water_view": "flood_simulation", "snapshot": snapshot()}})
    assert one.status_code == 201, one.text
    body = one.json()
    assert "unverified hypothetical" in body["transcript"]
    assert body["context"]["snapshot"]["results"]["storedM3"] == 10.8
    two = client[0].post("/api/v1/context/briefings", json={"context": {**CONTEXT, "snapshot": snapshot(elapsed_seconds=601)}}).json()
    assert two["context_key"] != body["context_key"]
    assert "backend simulation run" in body["transcript"]


@pytest.mark.parametrize("change", [{"station_id": "subway_station:R31"}, {"model_version": "invented-hydraulic-model"}, {"entrance_id": "invented-entrance"}, {"elapsed_seconds": -1}, {"inputs": {"SQL()": 1}}])
def test_unmatched_or_unbounded_snapshot_rejected(client, change):
    result = client[0].post("/api/v1/context/briefings", json={"context": {**CONTEXT, "snapshot": snapshot(**change)}})
    assert result.status_code == 422


def test_genuine_model_selection_has_no_unchecked_factual_prose(client, monkeypatch):
    service = client[1].state.contextual
    def choose(system, data, output):
        assert "untrusted" in system
        return Selection(evidence_ids=[data["context"]["evidence"][0]["id"]], actions=[{"type": "set_view", "view_scope": "station_exploration"}])
    monkeypatch.setattr(service, "_model", choose)
    body = generate(client, prompt="Explore this station", use_model=True).json()
    assert body["source"] == "model"
    assert body["actions"] == [{"type": "set_view", "view_scope": "station_exploration"}]
    assert body["transcript"].startswith(body["evidence"][0]["text"])


@pytest.mark.parametrize("choice", [{"evidence_ids": ["other-station#inventory"], "actions": []},
                                  {"evidence_ids": ["subway_station:F21#inventory"], "actions": [{"type": "highlight", "ids": ["catch_basin:unrelated"]}]},
                                  {"evidence_ids": ["subway_station:F21#inventory"], "actions": [{"type": "play_briefing"}]}])
def test_bad_evidence_actions_or_unrequested_play_fail_closed(client, monkeypatch, choice):
    monkeypatch.setattr(client[1].state.contextual, "_model", lambda *args: Selection.model_validate(choice))
    body = generate(client, use_model=True).json()
    assert body["source"] == "template" and body["actions"] == []
    assert "rejected" in body["error"]


def test_unknown_commands_and_extra_fields_are_rejected():
    with pytest.raises(ValidationError):
        Selection(evidence_ids=["x"], actions=[{"type": "run_sql", "sql": "DELETE everything"}])
    with pytest.raises(ValidationError):
        ContextRequest(**CONTEXT, backend_run_id="local-entrance-what-if")


def test_translation_keeps_original_and_full_caveat_and_separate_id(client, monkeypatch):
    original = generate(client).json()
    service = client[1].state.contextual
    monkeypatch.setattr(service, "_model", lambda system, data, output: Translation(sentences=["Traducción: " + text.replace("not", "no").replace("unknown", "desconocido").replace("hypothetical", "hipotético").replace("unverified", "no verificado").replace("uncalibrated", "no calibrado").replace("inferred", "inferido") for text in data["sentences"]]))
    response = client[0].post(f"/api/v1/context/briefings/{original['id']}/translations", json={"language": "es", "use_model": True})
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["id"] != original["id"] and body["context_key"] == original["context_key"]
    assert body["original_transcript"] == original["transcript"]
    assert body["transcript"].endswith(WARNINGS["es"]) and body["language"] == "es"
    assert body["source"] == "machine_translation" and body["translation"]["verified"] is False


def test_translation_is_never_english_relabelled_and_rejects_changed_numbers(client, monkeypatch):
    original = client[0].post("/api/v1/context/briefings", json={"context": {**CONTEXT, "snapshot": snapshot()}}).json()
    path = f"/api/v1/context/briefings/{original['id']}/translations"
    assert client[0].post(path, json={"language": "es"}).status_code == 409
    monkeypatch.setattr(client[1].state.contextual, "_model", lambda system, data, output: Translation(sentences=[text.replace("600", "601") for text in data["sentences"]]))
    assert client[0].post(path, json={"language": "es", "use_model": True}).status_code == 502


def test_audio_needs_explicit_intent_and_provider_opt_in(client):
    body = generate(client).json()
    path = f"/api/v1/context/briefings/{body['id']}/audio"
    assert client[0].get(path).status_code == 404
    assert client[0].post(path, json={}).status_code == 422
    assert client[0].post(path, json={"user_intent": False}).status_code == 422
    assert client[0].post(path, json={"user_intent": True}).status_code == 409


def test_complete_transcript_audio_binary_and_cache_no_duplicate_charge(client, monkeypatch, tmp_path):
    body = generate(client).json()
    service = client[1].state.contextual
    monkeypatch.setenv("ELEVENLABS_API_KEY", "test-value-never-real")
    monkeypatch.setenv("SWALE_CONTEXT_AUDIO_ENABLED", "1")
    monkeypatch.setenv("SWALE_CONTEXT_MAX_AUDIO_CALLS", "1")
    monkeypatch.setenv("SWALE_CONTEXT_BUDGET_USD", "1")
    monkeypatch.setenv("SWALE_CONTEXT_LEDGER_PATH", str(tmp_path / "provider-ledger.json"))
    sent = []
    def post(url, **kwargs):
        sent.append(kwargs["json"]["text"])
        return SimpleNamespace(content=b"ID3offline-audio", headers={"content-type": "audio/mpeg"}, raise_for_status=lambda: None)
    import httpx
    monkeypatch.setattr(httpx, "post", post)
    path = f"/api/v1/context/briefings/{body['id']}/audio"
    ready = client[0].post(path, json={"user_intent": True})
    assert ready.status_code == 200, ready.text
    assert sent == [body["transcript"]] and sent[0].endswith(WARNINGS["en"])
    assert client[0].post(path, json={"user_intent": True}).status_code == 200
    response = client[0].get(path)
    assert response.content == b"ID3offline-audio" and response.headers["content-type"] == "audio/mpeg"
    assert service.calls["audio"] == 1


def test_aggregate_reservation_and_unknown_pricing_block_before_network(monkeypatch):
    service = ContextualService()
    monkeypatch.setenv("SWALE_CONTEXT_BUDGET_USD", "1")
    service._reserve(800000)
    service._reserve(200000)
    with pytest.raises(ValueError):
        service._reserve(1)
    assert service.capabilities()["budget"]["remaining_usd"] == 0
    monkeypatch.setenv("SWALE_CONTEXT_BUDGET_USD", "999")
    assert service.capabilities()["budget"]["limit_usd"] == 1


def test_expired_records_do_not_leak_audio_or_cross_context(client, monkeypatch):
    body = generate(client).json()
    service = client[1].state.contextual
    service.records[body["id"]] = (-1e10, service.records[body["id"]][1])
    assert client[0].get(f"/api/v1/context/briefings/{body['id']}").status_code == 404
    service._prune()
    assert body["id"] not in service.records
    service.close()
    assert not service.records and not service.audio and not service.cache


def test_persistent_reservations_survive_service_restart_and_cap_attempts(monkeypatch, tmp_path):
    monkeypatch.setenv("SWALE_CONTEXT_LEDGER_PATH", str(tmp_path / "provider-ledger.json"))
    monkeypatch.setenv("SWALE_CONTEXT_BUDGET_USD", "1")
    monkeypatch.setenv("SWALE_CONTEXT_MAX_MODEL_CALLS", "3")
    monkeypatch.setenv("SWALE_CONTEXT_MAX_AUDIO_CALLS", "30")
    first = ContextualService()
    first._reserve(200000, "model")
    second = ContextualService()
    assert second.capabilities()["budget"]["reserved_usd"] == 0.2
    second._reserve(200000, "model")
    second._reserve(100000, "audio")
    assert first.capabilities()["budget"]["reserved_usd"] == 0.5
    with pytest.raises(ValueError):
        first._reserve(100000, "audio")
    assert first.calls == {"model": 2, "audio": 1}


def test_translation_dropped_negation_and_unrequested_ui_action_rejected(client, monkeypatch):
    original = generate(client).json()
    service = client[1].state.contextual
    monkeypatch.setattr(service, "_model", lambda system, data, output: Translation(sentences=[text.replace("not ", "") for text in data["sentences"]]))
    result = client[0].post(f"/api/v1/context/briefings/{original['id']}/translations", json={"language": "es", "use_model": True})
    assert result.status_code == 502
    monkeypatch.setattr(service, "_model", lambda *args: Selection(evidence_ids=["subway_station:F21#inventory"], actions=[{"type": "set_view", "view_scope": "station_exploration"}]))
    body = generate(client, use_model=True).json()
    assert body["source"] == "template" and body["actions"] == []


def test_model_entrance_keeps_catalog_identity_and_exact_parent_monitoring(client):
    http, app = client
    service = app.state.contextual
    entrance_id = next(key for key, entrance in service.entrances.items() if entrance["gtfsStopId"] == "F21" and entrance["matched"])
    q.upsert_many(app.state.db, "transit_poll", [("context-parent-test", {"area_id": "BK0601", "polled_at": NOW, "feed_times": {}, "errors": [], "alerts": [],
                                                               "stations": [{"gtfs_stop_id": "F21N", "status": "flooding_reported"}, {"gtfs_stop_id": "R31", "status": "no_service"}, {"gtfs_stop_id": "F21", "status": "delayed"}]})])
    context = {**CONTEXT, "kind": "entrance", "id": entrance_id, "station_id": "subway_station:F21"}
    response = http.post("/api/v1/context/briefings", json={"context": context})
    assert response.status_code == 201, response.text
    body = response.json()
    monitoring = next(e for e in body["evidence"] if e["id"].endswith("#parent-station-monitoring"))
    assert "Parent station subway_station:F21" in monitoring["text"] and "label delayed" in monitoring["text"]
    assert "flooding_reported" not in monitoring["text"] and "no_service" not in monitoring["text"]
    assert monitoring["source_time"] == "2026-10-16T14:00:00Z" and monitoring["fetched_at"] == monitoring["source_time"]
    inventory = next(e for e in body["evidence"] if e["id"].endswith("#inventory"))
    entrance = next(e for e in body["evidence"] if e["id"].endswith("#entrance"))
    assert inventory["source_time"] == service.catalog_sources["S3"]["vintage"]
    assert entrance["source_time"] == service.catalog_sources["S4"]["vintage"]
    assert inventory["fetched_at"] is None and entrance["fetched_at"] is None
    assert not any("coverage is unavailable" in limitation for limitation in body["limitations"])
    assert "entrance-condition observation" in monitoring["text"]


def test_model_entrance_does_not_attach_other_station_or_direction_alias_poll(client):
    http, app = client
    entrance_id = next(key for key, entrance in app.state.contextual.entrances.items() if entrance["gtfsStopId"] == "F21" and entrance["matched"])
    q.upsert_many(app.state.db, "transit_poll", [("context-wrong-parent-test", {"area_id": "BK0601", "polled_at": NOW, "feed_times": {}, "errors": [], "alerts": [],
                                                                    "stations": [{"gtfs_stop_id": "F21N", "status": "flooding_reported"}, {"gtfs_stop_id": "R31", "status": "no_service"}]})])
    body = http.post("/api/v1/context/briefings", json={"context": {**CONTEXT, "kind": "entrance", "id": entrance_id, "station_id": "subway_station:F21"}}).json()
    assert not any(e["source_id"] == "mta_realtime" for e in body["evidence"])
    assert any("No subject-matched operational" in limitation for limitation in body["limitations"])


@pytest.mark.parametrize("prompt,action", [
    ("Explore this station in normal view", {"type": "set_view", "view_scope": "overview"}),
    ("Explore this station in normal view", {"type": "set_water_view", "water_view": "flood_simulation"}),
    ("Show the hypothetical flood", {"type": "set_water_view", "water_view": "normal"}),
    ("Show buildings", {"type": "set_layers", "layers": {"complaints": True}}),
    ("Show buildings", {"type": "set_layers", "layers": {"buildings": False}}),
])
def test_model_action_value_must_match_requested_direction_and_target(client, monkeypatch, prompt, action):
    monkeypatch.setattr(client[1].state.contextual, "_model", lambda *args: Selection(evidence_ids=["subway_station:F21#inventory"], actions=[action]))
    body = generate(client, prompt=prompt, use_model=True).json()
    assert body["source"] == "template" and body["actions"] == []


def test_readiness_cannot_overwrite_pending_persistent_reservation(monkeypatch, tmp_path):
    import threading
    from swale.ai import contextual
    monkeypatch.setenv("SWALE_CONTEXT_LEDGER_PATH", str(tmp_path / "provider-ledger.json"))
    monkeypatch.setenv("SWALE_CONTEXT_BUDGET_USD", "1")
    monkeypatch.setenv("SWALE_CONTEXT_MAX_MODEL_CALLS", "3")
    service = ContextualService()
    service._reserve(200000, "model")
    entered, release, reader_started, reader_done = (threading.Event() for _ in range(4))
    fdopen = contextual.os.fdopen
    errors = []
    def paused_open(descriptor, mode):
        if threading.current_thread().name == "context-reserve" and mode == "w":
            entered.set()
            assert release.wait(5)
        return fdopen(descriptor, mode)
    monkeypatch.setattr(contextual.os, "fdopen", paused_open)
    def reserve():
        try:
            with service.lock:
                service._reserve(200000, "model")
        except BaseException as error:
            errors.append(error)
    def read():
        try:
            reader_started.set()
            service.capabilities()
            reader_done.set()
        except BaseException as error:
            errors.append(error)
    writer = threading.Thread(target=reserve, name="context-reserve")
    reader = threading.Thread(target=read, name="context-readiness")
    writer.start()
    assert entered.wait(5)
    reader.start()
    assert reader_started.wait(5)
    try:
        assert not reader_done.wait(0.1), "readiness must wait for the pending reservation"
    finally:
        release.set()
        writer.join(5)
        reader.join(5)
    assert not errors and not writer.is_alive() and not reader.is_alive()
    assert service.capabilities()["budget"]["reserved_usd"] == 0.4
    assert service.calls == {"model": 2, "audio": 0}


@pytest.mark.parametrize("replacement", ["+1.7919e-13", "-1.7919e+13"])
def test_translation_preserves_numeric_sign_and_exponent(client, monkeypatch, replacement):
    service = client[1].state.contextual
    body = client[0].post("/api/v1/context/briefings", json={"context": {**CONTEXT, "snapshot": snapshot(results={"balanceErrorM3": -1.7919e-13})}}).json()
    def translated(system, data, output):
        return Translation(sentences=[text.replace("not", "no").replace("unknown", "desconocido").replace("hypothetical", "hipotético").replace("unverified", "no verificado").replace("uncalibrated", "no calibrado").replace("inferred", "inferido").replace("-1.7919e-13", replacement) for text in data["sentences"]])
    monkeypatch.setattr(service, "_model", translated)
    result = client[0].post(f"/api/v1/context/briefings/{body['id']}/translations", json={"language": "es", "use_model": True})
    assert result.status_code == 502
