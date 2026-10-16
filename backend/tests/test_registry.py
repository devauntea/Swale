from swale.sources.registry import CATCH_BASINS, NYC311, REGISTRY


def test_registry_is_keyed_by_source_key():
    assert set(REGISTRY) == {"nyc_catch_basins", "nyc311", "nyc_nta_2020"}
    assert all(key == source.key for key, source in REGISTRY.items())


def test_record_urls_point_at_the_source_row():
    assert CATCH_BASINS.record_url("CB305116") == "https://data.cityofnewyork.us/resource/2w2g-fk3i.json?unitid=CB305116"
    assert NYC311.record_url("69804630") == "https://data.cityofnewyork.us/resource/erm2-nwe9.json?unique_key=69804630"
