from datetime import datetime, timezone

import pytest

from swale.core.geo import NYC, BBox, BBoxError, covers_points, from_state_plane, geojson_bbox, ground_distance_ft, require_coverage
from swale.core.timeutil import gmt_to_utc, iso_z, nyc_local_to_utc, parse_floating
from swale.core.trust import AGENCY_FINDINGS, KnowledgeType, Verification, verification_knowledge_type

UTC = timezone.utc


def test_agency_findings_are_observations_and_everything_else_stays_reported():
    for status in Verification:
        expected = KnowledgeType.OBSERVED if status in AGENCY_FINDINGS else KnowledgeType.REPORTED
        assert verification_knowledge_type(status) is expected
    assert Verification.CAPACITY_SURCHARGE in AGENCY_FINDINGS
    assert Verification.DUPLICATE not in AGENCY_FINDINGS
    assert len(Verification) == 13


@pytest.mark.parametrize(
    ("local", "utc"),
    [
        ("2026-07-22T14:36:00.000", datetime(2026, 7, 22, 18, 36, tzinfo=UTC)),  # EDT (real complaint 69804630)
        ("2026-01-15T09:00:00.000", datetime(2026, 1, 15, 14, 0, tzinfo=UTC)),  # EST
        ("2026-03-08T02:30:00.000", datetime(2026, 3, 8, 7, 30, tzinfo=UTC)),  # spring-forward gap: pre-transition offset
        ("2026-11-01T01:30:00.000", datetime(2026, 11, 1, 5, 30, tzinfo=UTC)),  # fall-back: first occurrence (EDT)
    ],
)
def test_nyc_local_to_utc(local, utc):
    assert nyc_local_to_utc(local) == utc


def test_gmt_to_utc_does_not_shift():
    assert gmt_to_utc("2026-10-05T09:26:25.000") == datetime(2026, 10, 5, 9, 26, 25, tzinfo=UTC)


def test_parse_floating_rejects_offsets_and_passes_empty_through():
    with pytest.raises(ValueError):
        parse_floating("2026-07-22T14:36:00Z", UTC)
    assert nyc_local_to_utc(None) is None
    assert nyc_local_to_utc("") is None


def test_iso_z():
    assert iso_z(datetime(2026, 7, 22, 18, 36, 0, 123456, tzinfo=UTC)) == "2026-07-22T18:36:00Z"
    assert iso_z(None) is None


def test_bbox_parse_valid():
    assert BBox.parse("-74.01995,40.66457,-73.97962,40.69255") == BBox(-74.01995, 40.66457, -73.97962, 40.69255)


@pytest.mark.parametrize(
    ("text", "code"),
    [
        ("1,2,3", "wrong_arity"),
        ("a,40.6,-73.9,40.7", "not_a_number"),
        ("nan,40.6,-73.9,40.7", "not_finite"),
        ("-200,40.6,-73.9,40.7", "out_of_range"),
        ("-73.97962,40.66457,-74.01995,40.69255", "inverted_lon"),
        ("-74.01995,40.69255,-73.97962,40.66457", "inverted_lat"),
    ],
)
def test_bbox_parse_errors(text, code):
    with pytest.raises(BBoxError) as err:
        BBox.parse(text)
    assert err.value.code == code


def test_coverage():
    require_coverage(BBox(-74.02, 40.66, -73.98, 40.69))
    with pytest.raises(BBoxError) as err:
        require_coverage(BBox(-118.3, 34.0, -118.2, 34.1))  # Los Angeles
    assert err.value.code == "outside_coverage"
    assert NYC.contains(-73.99, 40.68)


def test_geojson_bbox_of_multipolygon():
    mp = {"type": "MultiPolygon", "coordinates": [[[[0, 0], [2, 0], [2, 1], [0, 0]]], [[[5, 5], [6, 5], [6, 7], [5, 5]]]]}
    assert geojson_bbox(mp) == BBox(0, 0, 6, 7)


def test_covers_points_includes_the_boundary():
    square = {"type": "Polygon", "coordinates": [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]}
    assert covers_points(square, [0.5, 1.0, 2.0], [0.5, 0.5, 0.5]) == [True, True, False]


def test_catch_basin_state_plane_matches_its_lat_lon():
    # Real row CB305116 (2w2g-fk3i): point_x/point_y should land on its latitude/longitude.
    lon, lat = from_state_plane(980826.88681, 184528.97207)
    assert ground_distance_ft(lon, lat, -74.01234032641392, 40.67316545047439) < 10.0


def test_ground_distance_ft_for_a_thousandth_of_a_degree_of_latitude():
    assert ground_distance_ft(-73.99, 40.680, -73.99, 40.681) == pytest.approx(364.3, abs=2.0)
