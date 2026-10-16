"""Opaque record IDs must round-trip the installed SDK's printed string keys."""

import pytest
from surrealdb import RecordID

from swale.api.params import feature_key
from swale.api.problems import Problem


@pytest.mark.parametrize("table,key", [
    ("catch_basin", "CB305116"),
    ("incident", "nyc311_69804630"),
    ("flood_event", "BK-3rd-ave-bergen-st-2jg440_20260807T205455Z"),
    ("flood_event", "sensor:é洪水:2026-10-16"),
    ("flood_event", "000123"),
    ("flood_event", "⟨inside⟩:⟩"),
    # Raw delimiter keys remain valid through their canonical SDK full IDs.
    ("flood_event", "⟨unclosed"),
    ("flood_event", "⟨wrapped⟩"),
    ("flood_event", "sensor/opaque:part"),
    ("flood_event", "\\⟩\\\\⟩:tail\\"),
    ("flood_event", "quotes'\"`[brackets];$value"),
    ("flood_event", "%3A%E2%9F%A8+space #?"),
    ("flood_event", " leading and trailing "),
    ("simulation_run", "run:one-with-punctuation"),
    ("rainfall_scenario", "storm:é⟩"),
])
def test_feature_key_round_trips_sdk_string_identifiers(table, key):
    full_id = str(RecordID(table, key))
    assert feature_key(full_id, table) == key
    assert feature_key(full_id, table, param="target") == key


@pytest.mark.parametrize("key", ["sensor:2026:00", "quotes'\"`[]", "literal%3A", "é洪水"])
def test_feature_key_preserves_existing_unwrapped_key_inputs(key):
    assert feature_key(f"flood_event:{key}", "flood_event") == key


@pytest.mark.parametrize("feature_id", [
    "", "missing_prefix", "flood_event:", "incident:same_key",
    "flood_event_wrong:key", "flood_event:⟨⟩", "flood_event:⟨unclosed",
    "flood_event:⟨key⟩trailing", "flood_event:⟨unescaped⟩inside⟩",
])
def test_feature_key_invalid_full_ids_keep_path_and_query_error_semantics(feature_id):
    with pytest.raises(Problem) as path_error:
        feature_key(feature_id, "flood_event")
    assert path_error.value.status == 404
    assert path_error.value.kind == "not-found"
    with pytest.raises(Problem) as query_error:
        feature_key(feature_id, "flood_event", param="event_id")
    assert query_error.value.status == 422
    assert query_error.value.kind == "invalid-parameter"
    assert query_error.value.errors[0] == {
        "param": "event_id", "code": "bad_id",
        "message": "event_id must be a flood_event id such as flood_event:…",
    }
