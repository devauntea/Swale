"""Subway: schedule matching, live delays and alerts, station flood exposure and danger zones (no network)."""

import zipfile
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from google.transit import gtfs_realtime_pb2

from swale.api.app import create_app
from swale.config import Settings
from swale.ingest import dep_flood_maps as dep
from swale.ingest.bundle import read_bundle
from swale.ingest.pipeline import ingest_bundle
from swale.transit import exposure, realtime, schedule, stations

FIXTURE = Path(__file__).parent / "fixtures" / "bundle_henry_st"
NOW = datetime(2026, 10, 16, 14, 0, tzinfo=timezone.utc)  # 10:00 New York time, a Friday
LON, LAT = -73.9962, 40.6909


def _gtfs(tmp_path: Path) -> Path:
    path = tmp_path / "gtfs.zip"
    with zipfile.ZipFile(path, "w") as z:
        z.writestr("calendar.txt", "service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\n"
                                   "Weekday,1,1,1,1,1,0,0,20260101,20261231\nSaturday,0,0,0,0,0,1,0,20260101,20261231\n")
        z.writestr("calendar_dates.txt", "service_id,date,exception_type\nSaturday,20261016,1\n")
        z.writestr("trips.txt", "route_id,trip_id,service_id,trip_headsign,direction_id,shape_id\n"
                                "F,X-Weekday-00_060000_F..N69R,Weekday,Jamaica,0,F..N69R\n"
                                "F,X-Weekday-00_060600_F..N69R,Weekday,Jamaica,0,F..N69R\n"
                                "G,X-Weekday-00_061000_G..S14R,Weekday,Church Av,1,G..S14R\n"
                                "F,X-Saturday-00_060000_F..N69R,Saturday,Jamaica,0,F..N69R\n")
        z.writestr("stop_times.txt", "trip_id,stop_id,arrival_time,departure_time,stop_sequence\n"
                                     "X-Weekday-00_060000_F..N69R,F21N,10:05:00,10:05:00,20\n"
                                     "X-Weekday-00_060600_F..N69R,F21N,10:11:00,10:11:00,20\n"
                                     "X-Weekday-00_061000_G..S14R,F21S,10:15:00,10:15:00,9\n"
                                     "X-Saturday-00_060000_F..N69R,F21N,10:07:00,10:07:00,20\n"
                                     "X-Weekday-00_060000_F..N69R,A41N,10:20:00,10:20:00,25\n")
    return path


def _feed(updates: list[tuple[str, str, str, str, datetime]]) -> gtfs_realtime_pb2.FeedMessage:
    msg = gtfs_realtime_pb2.FeedMessage()
    msg.header.gtfs_realtime_version = "1.0"
    msg.header.timestamp = int(NOW.timestamp())
    for i, (trip_id, route, start_date, stop_id, at) in enumerate(updates):
        e = msg.entity.add(id=str(i))
        e.trip_update.trip.trip_id, e.trip_update.trip.route_id, e.trip_update.trip.start_date = trip_id, route, start_date
        u = e.trip_update.stop_time_update.add(stop_id=stop_id)
        u.arrival.time = int(at.timestamp())
    v = msg.entity.add(id="v")
    v.vehicle.trip.trip_id, v.vehicle.trip.route_id, v.vehicle.stop_id, v.vehicle.current_status = "060000_F..N", "F", "F21N", 1
    return msg


STATION = {"gtfs_stop_id": "F21", "name": "Carroll St", "routes": ["F", "G"], "lon": LON, "lat": LAT,
           "north_label": "Manhattan", "south_label": "Coney Island"}


def test_trip_keys_match_static_and_realtime_ids():
    assert schedule.trip_key("AFA25GEN-G-Weekday-00_030100_G..S14R") == ("030100", "G", "S")
    assert schedule.trip_key("030100_G..S") == ("030100", "G", "S")
    assert schedule.trip_key("garbage") is None


def test_schedule_extract_uses_this_weeks_calendar(tmp_path):
    data = schedule.extract(_gtfs(tmp_path), {"F21"}, date(2026, 10, 16), days=2)
    assert data["services"]["Weekday"] == ["20261016"] and data["services"]["Saturday"] == ["20261016", "20261017"]
    assert len(data["stop_times"]) == 4  # the A41 row is outside the requested stops
    sched = schedule.Schedule(data)
    assert sched.covers(NOW) and not sched.covers(NOW + timedelta(days=5))
    at = sched.scheduled_time("060000_F..N", "20261016", "F21N")
    assert at == datetime(2026, 10, 16, 14, 5, tzinfo=timezone.utc)
    window = sched.arrivals("F21N", NOW, NOW + timedelta(minutes=30))
    assert [(r, d) for r, d, _ in window] == [("F", "N"), ("F", "N"), ("F", "N")]  # two weekday F trips plus the added Saturday one


def test_board_computes_delays_and_flags_late_service(tmp_path):
    sched = schedule.Schedule(schedule.extract(_gtfs(tmp_path), {"F21"}, date(2026, 10, 16), days=2))
    feed = _feed([("060000_F..N", "F", "20261016", "F21N", NOW + timedelta(minutes=12)),     # due 10:05, predicted 10:12: 7 min late
                  ("060600_F..N", "F", "20261016", "F21N", NOW + timedelta(minutes=17)),     # due 10:11, 6 min late
                  ("061000_G..S", "G", "20261016", "F21S", NOW + timedelta(minutes=15)),     # on time
                  ("999900_F..N", "F", "20261016", "F21N", NOW + timedelta(minutes=50))])    # beyond the 30-minute window
    out = realtime.board([STATION], {"bdfm": feed}, sched, [], NOW)
    st = out["stations"][0]
    assert st["trains_next_30_min"]["predicted"] == 3
    assert st["delay_min"] == {"median": 6.0, "max": 7.0, "trains_matched": 3}
    assert st["status"] == "delayed" and "median train 6 min late" in st["reasons"][0]
    assert st["next"]["N"][0]["scheduled_at"] == "2026-10-16T14:05:00Z" and st["next"]["N"][0]["delay_min"] == 7.0
    assert out["trains"][0]["status"] == "stopped_at" and out["trains"][0]["knowledge_type"] == "observed"


def test_board_without_schedule_reports_no_delays():
    feed = _feed([("060000_F..N", "F", "20261016", "F21N", NOW + timedelta(minutes=5))])
    st = realtime.board([STATION], {"bdfm": feed}, None, [], NOW)["stations"][0]
    assert st["delay_min"]["median"] is None and st["trains_next_30_min"]["scheduled"] is None and st["status"] == "normal"


def test_alerts_match_routes_and_our_stops_only():
    ts = int(NOW.timestamp())
    body = {"entity": [
        {"id": "flood", "alert": {"active_period": [{"start": ts - 60}], "informed_entity": [{"route_id": "F", "stop_id": "F21N"}],
                                  "header_text": {"translation": [{"language": "en", "text": "Flooding at Carroll St: trains bypass the station"}]},
                                  "transit_realtime.mercury_alert": {"alert_type": "Station Notice"}}},
        {"id": "elsewhere", "alert": {"active_period": [{"start": ts - 60}], "informed_entity": [{"route_id": "F", "stop_id": "B08N"}],
                                      "header_text": {"translation": [{"language": "en", "text": "Enter 5 Av at 53 St only"}]}}},
        {"id": "line", "alert": {"active_period": [{"start": ts - 60}], "informed_entity": [{"route_id": "G"}],
                                 "header_text": {"translation": [{"language": "en", "text": "G trains are delayed"}]},
                                 "transit_realtime.mercury_alert": {"alert_type": "Delays"}}},
        {"id": "later", "alert": {"active_period": [{"start": ts + 3600}], "informed_entity": [{"route_id": "F"}]}},
    ]}
    alerts = realtime.parse_alerts(body, {"F", "G"}, {"F21"}, NOW)
    assert [a["id"] for a in alerts] == ["flood", "line"]
    assert alerts[0]["mentions_flooding"] and alerts[0]["station_specific"] and alerts[0]["knowledge_type"] == "observed"
    st = realtime.board([STATION], {}, None, alerts, NOW)["stations"][0]
    assert st["status"] == "flooding_reported" and any("may be elsewhere" in r for r in st["reasons"])


def test_rain_level_rule():
    w = lambda peak, alerts=(): {"forecast": {"peak_rate_in_hr": peak, "peak_at": None}, "alerts": [{"event": e} for e in alerts]}  # noqa: E731
    assert exposure.rain_level(None)["level"] == "unknown"
    assert exposure.rain_level(w(0.02))["level"] == "low"
    assert exposure.rain_level(w(0.6))["level"] == "watch"
    assert exposure.rain_level(w(0.1, ["Flood Advisory"]))["level"] == "watch"
    assert exposure.rain_level(w(2.0))["level"] == "warning"
    assert exposure.rain_level(w(0.1, ["Flash Flood Warning"]))["level"] == "warning"


@pytest.fixture(scope="module")
def app():
    application = create_app(Settings(db_url="mem://", dev_map=False))
    with TestClient(application) as client:
        ingest_bundle(application.state.db, read_bundle(FIXTURE), mode="snapshot", now=NOW)
        data = {"fetched_at": NOW.isoformat(), "stations": [{
            "gtfs_stop_id": "F21", "station_id": "237", "complex_id": "237", "stop_name": "Carroll St", "daytime_routes": "F G",
            "structure": "Subway", "ada": "0", "gtfs_latitude": str(LAT), "gtfs_longitude": str(LON),
            "north_direction_label": "Manhattan", "south_direction_label": "Coney Island"}],
            "entrances": [{"gtfs_stop_id": "F21", "stop_name": "Carroll St", "daytime_routes": "F G", "entrance_type": "Stair",
                           "entry_allowed": "YES", "exit_allowed": "YES", "entrance_latitude": str(LAT), "entrance_longitude": str(LON)},
                          {"gtfs_stop_id": "F21", "stop_name": "Carroll St", "daytime_routes": "F G", "entrance_type": "Elevator",
                           "entry_allowed": "YES", "exit_allowed": "NO", "entrance_latitude": str(LAT + 0.004), "entrance_longitude": str(LON)}]}
        application.state.loaded = stations.load(application.state.db, data, "BK0601", NOW)
        application.state.client = client
        yield application


def _square(lon, lat, d=0.0002):
    return {"type": "Polygon", "coordinates": [[[lon - d, lat - d], [lon + d, lat - d], [lon + d, lat + d], [lon - d, lat + d], [lon - d, lat - d]]]}


def test_station_layers_and_exposure_without_dep_map(app):
    client = app.state.client
    assert app.state.loaded == {"stations": 1, "entrances": 2}
    bbox = "-74.0,40.68,-73.99,40.70"
    st = client.get("/api/v1/subway/stations", params={"bbox": bbox}).json()
    assert st["features"][0]["id"] == "subway_station:F21" and st["features"][0]["properties"]["knowledge_type"] == "observed"
    ent = client.get("/api/v1/subway/entrances", params={"bbox": bbox}).json()
    assert len(ent["features"]) == 2 and ent["features"][0]["properties"]["station_id"] == "subway_station:F21"
    body = client.get("/api/v1/subway/flood-exposure", params={"live": "false"}).json()
    props = body["features"][0]["properties"]
    assert props["knowledge_type"] == "inferred" and props["entrances"] == 2 and props["live"] is None
    assert {m["id"] for m in props["missing_factors"]} >= {"dep_flood_map_at_entrance", "simulated_ponding_at_entrance"}
    assert body["meta"]["rain"]["level"] == "unknown"
    assert client.get("/api/v1/subway/flood-exposure", params={"live": "false", "run_id": "simulation_run:nope"}).status_code == 404


def test_dep_polygon_raises_exposure_and_makes_a_danger_zone(app):
    db, client = app.state.db, app.state.client
    data = {"fetched_at": NOW.isoformat(), "scenarios": {"dep_moderate_current": {
        "label": "DEP Moderate storm (2.13 in/hr) with current sea levels", "intensity_in_hr": 2.13, "sea_level": "current",
        "features": [{"category": 2, "depth_class": "deep", "area_ft2": 4000.0, "geometry": _square(LON, LAT)}]}}}
    dep.load(db, data, "BK0601", NOW)
    from swale.core.geo import BBox

    item = exposure.station_exposure(db, BBox(-74.0, 40.68, -73.99, 40.70), now=NOW)["items"][0]
    f = next(f for f in item["factors"] if f["id"] == "dep_flood_map_at_entrance")
    assert f["value"] == 1.0 and f["knowledge_type"] == "predicted" and "1 of 2 entrance(s)" in f["explanation"]
    assert item["score"] > 0
    body = client.get("/api/v1/danger-zones", params={"weather": "false"}).json()
    zone = next(z for z in body["features"] if z["properties"]["zone_type"] == "dep_mapped")
    assert zone["properties"]["level"] == "high" and zone["properties"]["entrance_count"] == 1
    assert zone["properties"]["entrances"][0]["station_id"] == "subway_station:F21"
    assert body["meta"]["summary"]["stations_with_entrances_in_high_zones"] == ["Carroll St"]


def test_history_is_empty_until_polled(app):
    body = app.state.client.get("/api/v1/subway/history").json()
    assert body["polls"] == [] and body["hours"] == 6
