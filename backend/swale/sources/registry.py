"""The machine-readable data-source register. docs/data-sources.md is the human-readable version."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import timedelta
from urllib.parse import urlencode

LICENSE_NOTE = "No license field in Socrata metadata; NYC Open Data Terms of Use apply."


@dataclass(frozen=True)
class DataSource:
    key: str
    name: str
    publisher: str
    dataset: str
    id_column: str
    cadence: str
    crs: str
    time_semantics: str
    stale_after: timedelta
    required_columns: tuple[str, ...]
    known_limitations: tuple[str, ...] = ()
    license_note: str = LICENSE_NOTE
    domain: str = "https://data.cityofnewyork.us"

    @property
    def url(self) -> str:
        return f"{self.domain}/d/{self.dataset}"

    def record_url(self, record_id: str) -> str:
        return f"{self.domain}/resource/{self.dataset}.json?{urlencode({self.id_column: record_id})}"


CATCH_BASINS = DataSource(
    key="nyc_catch_basins",
    name="NYCDEP Citywide Catch Basins",
    publisher="Department of Environmental Protection (DEP)",
    dataset="2w2g-fk3i",
    id_column="unitid",
    cadence="Annually (ongoing GIS editing)",
    crs="EPSG:4326 lon/lat; point_x/point_y assumed EPSG:2263 (US ft)",
    time_semantics="No per-row timestamps; dataset rowsUpdatedAt only",
    stale_after=timedelta(days=400),
    required_columns=("the_geom", "unitid", "latitude", "longitude", "point_x", "point_y"),
    known_limitations=(
        "No condition, inspection, install-date or borough fields.",
        "CRS of point_x/point_y is not stated; Swale assumes EPSG:2263 and checks it at ingest.",
    ),
)

NYC311 = DataSource(
    key="nyc311",
    name="311 Service Requests from 2020 to Present",
    publisher="311",
    dataset="erm2-nwe9",
    id_column="unique_key",
    cadence="Daily",
    crs="EPSG:4326 lon/lat; x/y_coordinate_state_plane EPSG:2263",
    time_semantics="Floating timestamps, interpreted as America/New_York",
    stale_after=timedelta(days=2),
    required_columns=(
        "unique_key", "created_date", "closed_date", "agency", "complaint_type", "descriptor", "descriptor_2",
        "status", "resolution_description", "resolution_action_updated_date", "incident_address", "bbl",
        "borough", "latitude", "longitude", "location",
    ),
    known_limitations=(
        "A complaint is a report, not proof that a condition existed or still exists.",
        "Complaints without coordinates cannot be selected by area and are not loaded.",
        "DEP files the same problems under two complaint types (Sewer, Sewer Maintenance).",
    ),
)

NTA_2020 = DataSource(
    key="nyc_nta_2020",
    name="2020 Neighborhood Tabulation Areas (NTAs)",
    publisher="Department of City Planning (DCP)",
    dataset="9nt8-h7nd",
    id_column="nta2020",
    cadence="Fixed 2020 boundaries",
    crs="EPSG:4326",
    time_semantics="Not time-varying",
    stale_after=timedelta(days=3650),
    required_columns=("nta2020", "ntaname", "boroname", "the_geom"),
)

FLOODNET_SENSORS = DataSource(
    key="floodnet_sensors",
    name="FloodNet: Sensor Deployment Metadata",
    publisher="Department of Environmental Protection (DEP)",
    dataset="kb2e-tjy3",
    id_column="sensor_id",
    cadence="Every 2 weeks (automated)",
    crs="EPSG:4326",
    time_semantics="Install/removal dates as published (GMT)",
    stale_after=timedelta(days=21),
    required_columns=("sensor_id", "sensor_name", "date_installed", "date_removed", "tidally_influenced", "latitude", "longitude",
                      "location", "lowest_point_height_delta_inches", "nta"),
    known_limitations=("Tidally influenced sensors also record tidal flooding, not only stormwater.",),
)

FLOODNET_EVENTS = DataSource(
    key="floodnet_events",
    name="FloodNet: Street Flooding Events Measured by FloodNet Sensors",
    publisher="Department of Environmental Protection (DEP)",
    dataset="aq7i-eu5q",
    id_column="sensor_id",
    cadence="Every 2 weeks (automated); not real time",
    crs="EPSG:4326 (sensor location)",
    time_semantics="GMT, per the dataset's column descriptions",
    stale_after=timedelta(days=21),
    required_columns=("sensor_id", "flood_start_time", "flood_end_time", "max_depth_inches", "onset_time_mins", "drain_time_mins",
                      "duration_mins", "duration_above_4_inches_mins", "duration_above_12_inches_mins",
                      "duration_above_24_inches_mins", "flood_profile_depth_inches", "flood_profile_time_secs"),
    known_limitations=("Events exist only where sensors are installed.",
                       "No events before a sensor's install date does not mean no flooding."),
)

REGISTRY: dict[str, DataSource] = {s.key: s for s in (CATCH_BASINS, NYC311, NTA_2020, FLOODNET_SENSORS, FLOODNET_EVENTS)}
