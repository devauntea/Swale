"""Weather module: parses real-shaped NWS responses offline; nothing invented when NWS fails."""

from datetime import datetime, timedelta, timezone

import httpx
import pytest

from swale.weather import nws


def handler_factory(obs_text="Light Rain", fail_alerts=False):
    now = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
    hourly = [{"startTime": (now + timedelta(hours=h)).isoformat(), "endTime": (now + timedelta(hours=h + 1)).isoformat(),
               "temperature": 60, "probabilityOfPrecipitation": {"value": 80}, "shortForecast": "Rain Showers", "windSpeed": "7 mph"}
              for h in range(30)]

    def handler(request: httpx.Request) -> httpx.Response:
        path = request.url.path
        if path.startswith("/points/"):
            return httpx.Response(200, json={"properties": {"gridId": "OKX", "gridX": 34, "gridY": 40,
                "forecastHourly": "https://api.weather.gov/gridpoints/OKX/34,40/forecast/hourly",
                "forecastGridData": "https://api.weather.gov/gridpoints/OKX/34,40"}})
        if path.endswith("/forecast/hourly"):
            return httpx.Response(200, json={"properties": {"periods": hourly}})
        if path.startswith("/gridpoints/"):
            return httpx.Response(200, json={"properties": {"updateTime": now.isoformat(), "quantitativePrecipitation": {
                "uom": "wmoUnit:mm", "values": [{"validTime": f"{now.isoformat()}/PT6H", "value": 15.24}]}}})
        if path.endswith("/observations/latest"):
            return httpx.Response(200, json={"properties": {"timestamp": now.isoformat(), "textDescription": obs_text,
                "temperature": {"value": 15.0}, "precipitationLastHour": {"value": 2.54}}})
        if path == "/alerts/active":
            return httpx.Response(500) if fail_alerts else httpx.Response(200, json={"features": [
                {"properties": {"event": "Flood Watch", "headline": "Flood Watch in effect", "severity": "Moderate"}}]})
        return httpx.Response(404)
    return handler


def client(**kw):
    return httpx.Client(transport=httpx.MockTransport(handler_factory(**kw)), headers={"User-Agent": "test"})


def test_weather_now_separates_observed_and_forecast():
    w = nws.weather_now(40.68, -74.0, hours=24, client=client(), use_cache=False)
    assert w["observation"]["knowledge_type"] == "observed" and w["observation"]["raining"] is True
    assert w["observation"]["temperature_f"] == 59 and w["observation"]["precip_last_hour_in"] == 0.1
    f = w["forecast"]
    assert f["knowledge_type"] == "predicted" and len(f["hours"]) == 24
    assert f["hours"][0]["rain_in"] == pytest.approx(0.1)  # 15.24 mm over 6 h = 0.1 in/hr
    assert f["total_rain_in"] == pytest.approx(0.6)  # only the 6 forecast hours carry rain
    assert f["rain_expected"] is True and w["alerts"][0]["event"] == "Flood Watch"
    assert w["context"]["peak_vs_smallest_dep_storm_pct"] == pytest.approx(5.6, abs=0.1)


def test_alert_failure_is_reported_not_hidden():
    w = nws.weather_now(40.68, -74.0, hours=6, client=client(fail_alerts=True), use_cache=False)
    assert w["alerts"] == [] and any(e.startswith("alerts:") for e in w["errors"])


def test_dry_weather_is_not_called_rain():
    assert nws.is_rain("Cloudy") is False and nws.is_rain("Light Rain and Fog") is True
