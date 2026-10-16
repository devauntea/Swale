"""Alert packs, translations, voice inspections, change feeds, accessibility, forecast checks, rain gardens, sweeps, evals.
All offline: network calls are replaced with fixed inputs."""

from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from swale.ai import briefing as ai
from swale.ai import evals, multilingual
from swale.api.app import create_app
from swale.config import Settings
from swale.db.changes import ChangeStream
from swale.db.connection import connect, run
from swale.ingest.bundle import read_bundle
from swale.ingest.pipeline import ingest_bundle
from swale.risk import voice
from swale.sim.network import Basin, build_model
from swale.sim.sweep import _overlap
from swale.transit.accessibility import station_access
from swale.weather import verify

FIXTURE = Path(__file__).parent / "fixtures" / "bundle_henry_st"
NOW = datetime(2026, 10, 16, 14, 0, tzinfo=timezone.utc)


# ---- voice ------------------------------------------------------------------------------------
@pytest.mark.parametrize("text, unit, result", [
    ("Inspection at basin CB three five zero two eight nine. Debris found: leaves and a plastic bag.", "CB350289", "debris_found"),
    ("Basin C B 305116, we cleaned it out", "CB305116", "cleaned"),
    ("CB305116 looks good, no issues", "CB305116", "clear"),
    ("The grate is cracked at CB 3 0 5 1 1 6", "CB305116", "damaged"),
    ("Couldn't find basin CB305116", "CB305116", "not_found"),
    ("Sumidero CB tres cero cinco uno uno seis, mucha basura", "CB305116", "debris_found"),
    ("just some noise", None, None),
])
def test_voice_parse(text, unit, result):
    p = voice.parse(text)
    assert p["unitid"] == unit and p["result"] == result


# ---- translations ------------------------------------------------------------------------------
def test_translation_keeps_ids_and_reports_failure(monkeypatch):
    b = ai.Briefing(headline="h", caveat="c", stops=[ai.Stop(basin_id="catch_basin:CB1", why="w", action="a", evidence_ids=["incident:1"])])
    monkeypatch.setattr(multilingual, "llm_available", lambda: False)
    t, err = multilingual.translate(b, "es")
    assert t is None and "credentials" in err
    assert multilingual.translate(b, "xx")[1].startswith("unsupported")
    spoken = multilingual.spoken({"headline": "Titular", "stop_word": "Parada", "caveat": "Aviso",
                                  "stops": [{"basin_id": "catch_basin:CB1", "why": "por qué", "action": "acción"}]},
                                 {"basins": [{"basin_id": "catch_basin:CB1", "unitid": "CB1"}]})
    assert spoken == "Titular. Parada 1, C B 1. por qué acción Aviso"


def test_escaped_id_delimiters_are_restored():
    b = ai.Briefing(headline="h", caveat="c", stops=[ai.Stop(basin_id="catch_basin:CB1", why="w", action="a",
                                                             evidence_ids=["sensor:\\u27e8BK-x\\u27e9"])])
    assert ai.normalize_ids(b).stops[0].evidence_ids == ["sensor:⟨BK-x⟩"]


# ---- change feed ---------------------------------------------------------------------------------
def test_change_feed_streams_new_inspections():
    with connect("mem://") as db:
        run(db, "DEFINE TABLE inspection SCHEMALESS CHANGEFEED 1d; DEFINE TABLE alert_pack SCHEMALESS CHANGEFEED 1d;")
        run(db, "CREATE inspection:old SET result = 'clear';")
        cs = ChangeStream(db)
        cs.stop()
        sub = cs.subscribe()
        assert cs.poll_once() == []  # history before startup is not replayed
        run(db, "CREATE inspection:new SET result = 'debris_found', basin_key = 'CB1';")
        events = cs.poll_once()
        assert [(e["table"], e["record"]["result"]) for e in events] == [("inspection", "debris_found")]
        assert sub.get_nowait()["record"]["basin_key"] == "CB1"


# ---- accessibility -------------------------------------------------------------------------------
def test_accessibility_flags_lost_step_free_access():
    stations = [{"gtfs_stop_id": "F24", "complex_id": "240", "name": "7 Av", "routes": ["F", "G"], "ada": "1"},
                {"gtfs_stop_id": "F22", "complex_id": "238", "name": "Smith-9 Sts", "routes": ["F", "G"], "ada": "0"}]
    equipment = [
        {"equipmentno": "EL1", "equipmenttype": "EL", "ADA": "Y", "stationcomplexid": "240", "elevatorsgtfsstopid": "F24", "redundant": 0, "isactive": "Y"},
        {"equipmentno": "EL2", "equipmenttype": "EL", "ADA": "Y", "stationcomplexid": "240", "elevatorsgtfsstopid": "F24", "redundant": 1, "isactive": "Y"},
        {"equipmentno": "ES1", "equipmenttype": "ES", "ADA": "N", "stationcomplexid": "238", "elevatorsgtfsstopid": "F22", "redundant": 0, "isactive": "N"},
    ]
    outages = [{"equipment": "EL1", "reason": "Repair", "isupcomingoutage": "N", "outagedate": "10/16/2026 08:00:00 AM",
                "estimatedreturntoservice": "10/17/2026 06:00:00 PM"},
               {"equipment": "EL2", "reason": "Maintenance", "isupcomingoutage": "Y", "outagedate": "10/30/2026 10:00:00 PM",
                "estimatedreturntoservice": "10/31/2026 06:00:00 AM"}]
    a, s = station_access(stations, equipment, outages)
    assert a["lost_step_free"] and not a["step_free_now"] and a["out_now"] == ["EL1"] and a["planned_outages"] == 1
    assert a["equipment"][0]["return_expected"] == "2026-10-17T22:00:00Z"
    assert s["out_now"] == ["ES1"] and s["ada"] == "not accessible" and not s["lost_step_free"]


# ---- forecast check --------------------------------------------------------------------------------
def test_forecast_is_spread_over_its_interval():
    intervals = [{"valid_time": "2026-10-16T06:00:00+00:00/PT6H", "mm": 6.0}, {"valid_time": "2026-10-16T12:00:00+00:00/PT6H", "mm": 0.0}]
    total, cover = verify._forecast_in(intervals, datetime(2026, 10, 16, 9, tzinfo=timezone.utc), datetime(2026, 10, 16, 15, tzinfo=timezone.utc))
    assert cover == 1.0 and round(total, 4) == round(3.0 / 25.4, 4)
    _, partial = verify._forecast_in(intervals, datetime(2026, 10, 16, 0, tzinfo=timezone.utc), datetime(2026, 10, 16, 12, tzinfo=timezone.utc))
    assert partial == 0.5


# ---- rain gardens and sweeps ---------------------------------------------------------------------
AREA = {"type": "Polygon", "coordinates": [[[-74.0, 40.68], [-73.99, 40.68], [-73.99, 40.69], [-74.0, 40.69], [-74.0, 40.68]]]}
BASINS = [Basin("A", -73.997, 40.684, False), Basin("B", -73.993, 40.686, True)]


def test_rain_gardens_add_lid_sections_only_when_asked():
    plain = build_model(BASINS, AREA, [2.0] * 12, 5, "t")
    green = build_model(BASINS, AREA, [2.0] * 12, 5, "t", {"gi_area_pct": 5})
    assert "[LID_CONTROLS]" not in plain.inp and "[LID_CONTROLS]" in green.inp
    usage = green.inp.split("[LID_USAGE]")[1].split("\n\n")[0].strip().splitlines()
    assert len(usage) == 2 and usage[0].split()[1] == "RAINGARDEN"
    assert float(usage[0].split()[6]) == pytest.approx(5 * 10 / 85 * 100, rel=1e-3)  # % of impervious runoff sent to the garden


def test_sweep_overlap_counts_simultaneous_runs():
    t = datetime(2026, 1, 1, tzinfo=timezone.utc)
    m = lambda a, b: (t + timedelta(seconds=a), t + timedelta(seconds=b))  # noqa: E731
    assert _overlap([m(0, 10), m(1, 9), m(2, 3), m(20, 30)]) == 3


# ---- evals ---------------------------------------------------------------------------------------
def test_template_briefings_are_scored_without_a_judge():
    pack = {"basins": [{"basin_id": "catch_basin:CB1", "unitid": "CB1", "factors": [{"id": "x", "evidence_ids": ["incident:1"]}]}]}
    rec = {"id": "ai_briefing:1", "prompt_version": "briefing-v2", "source": "template", "pack": pack,
           "briefing": {"headline": "h", "caveat": "c", "stops": [{"basin_id": "catch_basin:CB1", "why": "one two", "action": "three",
                                                                    "evidence_ids": ["incident:1"]}]}}
    ev = evals.evaluate(rec)
    assert ev["citation_check"] == "pass" and ev["faithfulness"] is None and ev["words_per_stop"] == 3 and ev["caveat_present"]


# ---- API ----------------------------------------------------------------------------------------
@pytest.fixture(scope="module")
def client():
    app = create_app(Settings(db_url="mem://", dev_map=False))
    with TestClient(app) as c:
        ingest_bundle(app.state.db, read_bundle(FIXTURE), mode="snapshot", now=NOW)
        yield c


def test_alert_pack_is_not_triggered_by_low_rain(client, monkeypatch):
    from swale.alerts import rain_pack

    monkeypatch.setattr(rain_pack, "_weather", lambda area: {"forecast": {"peak_rate_in_hr": 0.02, "peak_at": None}, "alerts": []})
    p = client.post("/api/v1/alert-packs", json={"area_id": "BK0601"}).json()
    assert p["status"] == "not_triggered" and p["rain"]["level"] == "low" and not p["forced"]
    assert client.get(f"/api/v1/alert-packs/{p['id']}").json()["status"] == "not_triggered"
    assert client.post("/api/v1/alert-packs", json={"languages": ["xx"]}).status_code == 422


def test_voice_inspection_records_or_explains(client, monkeypatch):
    from swale.db import queries as q

    key = q.page_in_bbox(client.app.state.db, "catch_basin", read_bundle(FIXTURE).bbox, limit=1).records[0]["id"].id
    monkeypatch.setattr(voice, "transcribe", lambda *a: {"text": f"Basin {key}, debris found on the grate", "language": "eng",
                                                          "language_probability": 0.9, "model": "test"})
    r = client.post("/api/v1/inspections/voice", files={"audio": ("v.webm", b"x", "audio/webm")}, data={"inspector": "t"}).json()
    assert r["saved"] and r["inspection"]["result"] == "debris_found" and r["inspection"]["knowledge_type"] == "observed"
    monkeypatch.setattr(voice, "transcribe", lambda *a: {"text": "hello there", "language": "eng", "language_probability": 0.9, "model": "test"})
    r = client.post("/api/v1/inspections/voice", files={"audio": ("v.webm", b"x", "audio/webm")}).json()
    assert not r["saved"] and len(r["problems"]) == 2


def test_new_routes_validate(client):
    assert client.get("/api/v1/simulation-sweeps/simulation_sweep:nope").status_code == 404
    assert client.post("/api/v1/simulation-sweeps", json={"blockage_factors": [1.5]}).status_code == 422
    assert client.get("/api/v1/briefings/evals").status_code == 200
