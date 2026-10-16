# Swale data-source register

**Checked:** 2026-10-16 between 03:00 and 04:00 UTC (the evening of 2026-10-15 in New York), using the Socrata metadata and SoQL APIs, api.weather.gov, PyPI and GitHub. Counts change over time. Every ingest run records the live values in the `data_source` and `ingest_run` tables, so trust those over this page.

**Status key**
- **Verified:** the schema was fetched and real rows were queried.
- **Metadata only:** the catalog entry was read, but the file itself hasn't been opened.
- **Not checked:** listed for later. Don't build on it yet.

**Licensing:** none of the NYC datasets below sets a license field in its Socrata metadata, so the NYC Open Data Terms of Use apply. We plan to commit a small demo snapshot to this public repo. Confirm the terms before publishing it.

## Summary

| Key | Dataset | ID | Use in Swale | Knowledge type | Milestone | Status |
|---|---|---|---|---|---|---|
| `nyc_catch_basins` | NYCDEP Citywide Catch Basins | `2w2g-fk3i` | Asset inventory | observed (inventory) | M1 | Verified |
| `nyc311` | 311 Service Requests from 2020 to Present | `erm2-nwe9` | Incidents (complaints plus DEP outcomes) | reported, with observed agency outcomes | M1 | Verified |
| `nyc_nta_2020` | 2020 Neighborhood Tabulation Areas | `9nt8-h7nd` | Demo-area boundary | reference | M1 | Verified |
| `floodnet_sensors` | FloodNet: Sensor Deployment Metadata | `kb2e-tjy3` | Sensor locations | observed | M2 | Verified |
| `floodnet_events` | FloodNet: Street Flooding Events | `aq7i-eu5q` | Ground truth for flooding | observed | M2 | Verified |
| `dep_stormwater_flood_maps` | NYC Stormwater Flood Maps | `9i7c-xyvv` | DEP-modeled flood extents | predicted (external) | M2 | Ingested (BK0601 clip) |
| `nws_gridpoints` | NWS API gridpoint forecast | api.weather.gov | Rainfall scenarios from the forecast | predicted (external) | M2 | Verified |
| `nyc_elevation_points` | NYC Planimetric Database: Elevation Points | `9uxf-ng6q` | Ground spot heights (if `feat_code` 3000 is ground) | observed | M2 | Partly verified |
| `nyc_dem_1ft` | 1 foot Digital Elevation Model (2010 LiDAR) | `7kuu-zah7` | Fallback terrain | observed (2010) | M2/M3 if needed | Metadata only |
| `nyc_building_footprints` | Building footprints (`BUILDING`) | `5zhs-2jue` | 3D extrusion (frontend), ground elevation | observed | optional | Verified |
| `nyc_pluto` | Primary Land Use Tax Lot Output (PLUTO) | `64uk-42ks` | Exposure factors such as basements | observed (administrative) | M3 | Verified |
| `nyc_bes` | Building Elevation and Subgrade (BES) | `bsin-59hv` | Subgrade spaces, lowest occupied floor | observed (one-time 2023 capture) | M3 optional | Schema verified |
| `nyc311_2010_2019` | 311 Service Requests from 2010 to 2019 | `76ig-c548` | Optional older history | reported | later | Catalog entry only |

---

## `nyc_catch_basins`: NYCDEP Citywide Catch Basins (`2w2g-fk3i`)

- **Publisher:** NYC Department of Environmental Protection (DEP).
- **Rows:** 154,212 citywide. That's consistent with an older DEP report of more than 148,000 basins.
- **Cadence:** "Annually". DEP describes updates as "Ongoing as part of the GIS editing process". Not automated. Rows last updated **2025-12-18**.
- **Fields (all 6):**
  - `the_geom`: Point, WGS84 lon/lat.
  - `unitid`: text catch basin ID, e.g. `CB305116`.
  - `latitude`, `longitude`.
  - `point_x`, `point_y`: State Plane coordinates, e.g. `980826.88681`, `184528.97207`.
- **CRS:** the metadata doesn't name the CRS for `point_x`/`point_y`. The values fit EPSG:2263 (NAD83 / New York Long Island, US survey feet). **This is an assumption.** M1 will reproject a sample and compare it with `latitude`/`longitude`.
- **Missing from the source:** borough, install date, condition, inspection or cleaning history, and any per-row update time. Swale gets the area by spatial clip. It only shows condition when there's evidence for it (DEP 311 outcomes, inspections) and never assumes one.
- **Demo area:** 2,093 basins fall inside the BK0601 bounding box, before clipping to the polygon.
- **Swale ID:** `catch_basin:<unitid>`. Ingest checks that `unitid` is unique and lists any duplicates in the ingest report.

## `nyc311`: 311 Service Requests from 2020 to Present (`erm2-nwe9`)

- **Cadence:** daily, automated.
- **Fields Swale keeps:**
  - Identity and timing: `unique_key`, `created_date`, `closed_date`, `due_date`.
  - Classification: `agency`, `complaint_type`, `descriptor`, `descriptor_2`.
  - Outcome: `status`, `resolution_description`, `resolution_action_updated_date`.
  - Location text: `incident_address`, `street_name`, `cross_street_1`, `cross_street_2`, `intersection_street_1`, `intersection_street_2`, `bbl`, `borough`, `community_board`.
  - Coordinates: `latitude`, `longitude`, `location`, `x_coordinate_state_plane`, `y_coordinate_state_plane`.
- **Note:** an ID found online, `erm6-fk8w`, does **not** exist (404). Use `erm2-nwe9`.
- **Time semantics:** timestamps are floating (no UTC offset, e.g. `2026-07-22T14:36:00.000`). Swale treats them as America/New_York, converts them to UTC and keeps the raw string. **Confirm this in M1** against a known event.
- **Two DEP taxonomies are in use at the same time.** Most complaints use `Sewer`, with coded descriptors such as `(SC)` or `(SJ)`. `Sewer Maintenance` uses plain descriptors and is growing. Brooklyn counts for the clogged-basin and street-flooding descriptors:

  | Year | `Sewer` | `Sewer Maintenance` |
  |---|---|---|
  | 2020 | 2,261 | 0 |
  | 2021 | 3,352 | 1 |
  | 2022 | 2,674 | 0 |
  | 2023 | 3,557 | 580 |
  | 2024 | 2,636 | 0 |
  | 2025 | 3,189 | 1 |
  | 2026 (to date) | 2,368 | 1,775 |

- **Category mapping, version 1.** Unmapped descriptors become `other` and are listed in the ingest report. Nothing is silently dropped.

  | Swale category | Source `complaint_type` / `descriptor` |
  |---|---|
  | `catch_basin_clogged` | Sewer / Catch Basin Clogged/Flooding (Use Comments) (SC); Sewer Maintenance / Catch Basin Clogged |
  | `street_flooding` | Sewer / Street Flooding (SJ); Sewer Maintenance / Flooding on Street |
  | `highway_flooding` | Sewer / Highway Flooding (SH); Sewer Maintenance / Flooding on Highway |
  | `sewer_backup` | Sewer / Sewer Backup (Use Comments) (SA); Sewer Maintenance / Backup |
  | `manhole_overflow` | Sewer / Manhole Overflow (Use Comments) (SA1) |
  | `catch_basin_damaged` | Sewer / Catch Basin Sunken/Damaged/Raised (SC1); Sewer Maintenance / Catch Basin Sunken; Sewer / Catch Basin Grating Missing (SA4); Sewer Maintenance / Catch Basin Grate Missing; Sewer / Defective/Missing Curb Piece (SC4) |
  | `catch_basin_other` | Sewer / Catch Basin Search (SC2); Sewer Maintenance / Catch Basin Search |
  | `culvert_blocked` | Sewer / Culvert Blocked/Needs Cleaning (SE) |
  | `basin_contamination` | Industrial Waste / Concrete In Catch Basin (IEA); Wastewater Into Catch Basin (IEB); Grease In Sewer/Catch Basin (IDG) |
  | `pothole` | Street Condition / Pothole |
  | `cave_in` | Street Condition / Cave-in |

- **DEP resolution outcomes, version 1** (`swale/ingest/resolutions_311.py`, rules `dep-res-*-v1`). Each rule matches the full distinguishing clause of a DEP template, ignoring case and whitespace. Counts are lower bounds (only descriptor groups of 40+ were summed), from Brooklyn DEP complaints since 2024 under the clogged-basin, street-flooding and sewer-backup descriptors.

  | `verification.status` | Rule | Matching phrase (count) |
  |---|---|---|
  | `agency_found_obstruction` | `obstruction` | "found that debris was obstructing the catch basin" (2,483) |
  | `agency_found_obstruction` | `surcharge-grease` | "surcharge conditions have been confirmed and attributed to grease" (747): a **sewer blockage**, cleared by DEP |
  | `agency_found_defect` | `surcharge-defect` | "…and is attributed to a defective sewer" (45) |
  | `capacity_surcharge` | `surcharge-rain` | "…due to rain intensity or volume" (578): sewer capacity was exceeded; **not** a blockage |
  | `capacity_surcharge` | `overtaxed-rain` | "was overtaxed due to heavy rain" (28 in BK0601) |
  | `agency_found_defect` | `repair-work`, `repaired`, `defect-found` | "has performed repair work", "inspected your complaint and repaired the problem", "a defect was found" (101 in BK0601) |
  | `agency_cleaned` | `cleaned` | "cleaned the catch basin or inlet" (2,227) |
  | `agency_functioning` | `functioning` | "the catch basin is now functioning properly" (58) |
  | `agency_not_found` | `not-found` | "could not find the problem you reported" (2,445) |
  | `agency_not_found` | `no-city-backup` | "found there was no sewer back up in the city system" (3,157) |
  | `agency_not_found` | `private-plumbing` | "there was no indication of a city sewer issue" (2,577): suspected private plumbing |
  | `duplicate` | `duplicate` | "previously reported by another customer" (two template variants) |
  | `referred` | `referred-dot`, `referred-other`, `jurisdiction` | referred to DOT, to another agency, or outside DEP's jurisdiction |
  | `pending` | `pending` | "further investigation is required" |
  | `no_inspection` | `phone` | "resolved this complaint by speaking to the complainant on the phone" (69) |
  | `none` | none | no resolution text |
  | `unknown` | none | any other text, or text matching rules that disagree; kept raw and counted in the ingest report |

  The three "surcharge confirmed" templates mean different things, which is why no rule matches on "surcharge" alone.
- **Status values** (Brooklyn `Sewer` and `Sewer Maintenance` since 2024): Closed 23,233; In Progress 516; Open 444; Started 351; Assigned 30.
- **Missing coordinates:** 266 of 24,574 Brooklyn sewer complaints since 2024 (about 1.1%) have no latitude or longitude. They're stored but kept off map layers, and the ingest report counts them.
- **Demo area, since 2020** (BK0601 bounding box, top descriptors):

  | Descriptor | Count |
  |---|---|
  | Pothole | 2,705 |
  | Cave-in | 1,505 |
  | Sewer Backup (SA) | 1,064 |
  | Catch Basin Clogged (SC) | 674, plus 74 under the new taxonomy |
  | Street Flooding (SJ) | 285, plus 65 as "Flooding on Street" |
  | Manhole Overflow | 170 |
  | Catch Basin Sunken/Damaged | 135 |
  | Sewer Maintenance / Backup | 126 |

- **Privacy:** the open data has no complainant identity. Addresses are the incident location.
- **Trust rule:** a complaint is `reported`. Only a matching DEP outcome can mark a basin as obstructed, and that outcome is attributed to DEP with its timestamp and the raw text.

## `nyc_nta_2020`: 2020 Neighborhood Tabulation Areas (`9nt8-h7nd`)

- **Fields:** `borocode`, `boroname`, `countyfips`, `nta2020`, `ntaname`, `ntaabbrev`, `ntatype`, `cdta2020`, `cdtaname`, `shape_leng`, `shape_area`, `the_geom`.
- **Proposed demo area:** **BK0601, Carroll Gardens-Cobble Hill-Gowanus-Red Hook.** Bounding box W −74.01995, S 40.66457, E −73.97962, N 40.69255. The polygon has 500 vertices.

## `floodnet_sensors`: FloodNet Sensor Deployment Metadata (`kb2e-tjy3`)

- **Rows:** 491 sensors: Bronx 72, Brooklyn 155, Manhattan 53, Queens 165, Staten Island 46.
- **Cadence:** every 2 weeks, automated. Rows last updated 2026-10-15.
- **Fields:**
  - Identity: `sensor_id` (join key), `sensor_name`.
  - Deployment: `date_installed`, `date_removed`, `tidally_influenced` (Yes/No), `lowest_point_height_delta_inches`.
  - Location: `street_name`, `borough`, `zipcode`, `community_board`, `council_district`, `census_tract`, `nta` (2020 code), `latitude`, `longitude`, `location`.
- **Demo area:** **15 sensors in BK0601**, the most of any Brooklyn NTA. **2 are tidally influenced**, so stormwater validation excludes them by default.

## `floodnet_events`: FloodNet Street Flooding Events (`aq7i-eu5q`)

- **Rows:** 3,526 events. `flood_start_time` runs from 2020-11-16 to 2026-10-05. The deepest event peaked at 46.14 in.
- **Cadence:** every 2 weeks, automated, so it is **not real time**. The live dashboard is at dataviz.floodnet.nyc. No dashboard API has been checked.
- **Fields:**
  - Identity and timing: `sensor_id`, `sensor_name`, `flood_start_time`, `flood_end_time`.
  - Depth and timing measures: `max_depth_inches`, `onset_time_mins`, `drain_time_mins`, `duration_mins`, `duration_above_4_inches_mins`, `duration_above_12_inches_mins`, `duration_above_24_inches_mins`.
  - Time-series profile: `flood_profile_depth_inches` and `flood_profile_time_secs`, each a JSON array stored as text.
- **Time semantics:** the column description says **GMT**, even though Socrata serves floating timestamps. That differs from 311.
- **Limitations:**
  - Events exist only where there are sensors.
  - No events before a sensor's install date doesn't mean no flooding.
- **Reliability:** Socrata returned HTTP 503 for this dataset twice during the checks. The client needs retries with backoff, and the demo needs a snapshot fallback. The event count for the BK0601 sensors couldn't be fetched because of the 503s.

## `dep_stormwater_flood_maps`: NYC Stormwater Flood Maps (`9i7c-xyvv`)

- **File:** `NYCFloodStormwaterFloodMaps.zip`, 33,785,094 bytes. Rows updated 2024-07-03; view updated 2024-10-17. Cadence stated as annual.
- **Scenarios:**
  - Extreme Flood (3.66 in/hr) with 2080 sea level rise.
  - Moderate Flood (2.13 in/hr) with 2050 sea level rise.
  - Moderate Flood (2.13 in/hr) with current sea levels.
  - Limited Flood (1.77 in/hr) with current sea levels.
- **Format:** one ESRI file geodatabase per scenario, read with pyogrio (GDAL's OpenFileGDB driver). CRS EPSG:2263. Field `Flooding_Category`: 1 = nuisance flooding (4 in to 1 ft), 2 = deep and contiguous flooding (1 ft or more), 3 = future high tides (sea-level-rise scenarios only). Mapped areas are at least 0.25 acres.
- **Limited (1.77 in/hr) map is unreadable** with open-source GDAL (compressed storage), so it is skipped and reported.
- **Ingest:** `swale flood-maps` downloads the zip, clips each scenario to the area, simplifies to 3 ft, converts to WGS84 and writes `sample_data/bk0601/dep_flood_maps.json.gz`; `swale ingest --from-snapshot` loads it. BK0601 polygons: 196 (Moderate, current), 437 (Moderate, 2050), 1,169 (Extreme, 2080).
- **Used by:** the `/flood-maps` layer, `/simulation-runs/{id}/compare-dep` (Swale's 2.13 in/hr run agreed with DEP at 55% of basins), and the ranking's `dep_flood_map_exposure` factor (risk-v2).
- **Knowledge type:** predicted (an external, authoritative model). Never shown as current flooding.
- **Design opportunity:** our own rainfall scenarios reuse DEP's three intensities, so Swale's demonstrator can be compared directly with DEP's maps.

## `nws_gridpoints`: National Weather Service API

- **Access:** keyless, but requests must send a `User-Agent`. Swale sends `Swale-hackathon/0.1 (+https://github.com/devauntea/Swale)`. Add a team contact email later.
- **Gridpoint lookup:** `/points/40.6745,-73.9900` (Gowanus) returns `gridId=OKX`, `gridX=34`, `gridY=40`, the `forecastHourly` and `forecastGridData` URLs, and `timeZone=America/New_York`.
- **Rainfall amounts:** `forecastGridData` returns `quantitativePrecipitation` with `uom = wmoUnit:mm`. Values cover ISO-8601 intervals, e.g. `{"validTime": "2026-10-16T06:00:00+00:00/PT6H", "value": 1.524}` (sample from gridpoint OKX/33,34). It also has `probabilityOfPrecipitation` in % and an `updateTime`.
- **Other endpoints:**
  - `forecastHourly` for OKX/34,40 returned a GeoJSON Feature.
  - `/alerts/active?area=NY` returned a FeatureCollection with 0 active alerts at check time.
- **From the project brief, not independently verified:**
  - Since 2026-01-07, the forecast endpoints no longer return past periods.
  - The radar endpoints return status only, not imagery.
- **Gap:** there's **no historical rainfall** here. Validating against past FloodNet events needs a separate source. This is an open question.

## `nyc_elevation_points`: Planimetric Elevation Points (`9uxf-ng6q`)

- **Rows:** 1,471,855.
- **Fields:** `the_geom`, `feat_code`, `elevation`, `source_id`, `sub_code`, `status`. `status` refers to the 2022 planimetrics update.
- **Feature codes:** 3000 (387,566), 3010 (1,046), 3020 (1,083,243). The `elevation` column description says roof elevation.
- **Sample:** in a Gowanus/Park Slope box (40.66–40.70 N, 74.02–73.97 W):

  | Code | Points | Mean | Range |
  |---|---|---|---|
  | 3000 | 8,569 | 43.3 ft | −8.7 to 172.6 ft |
  | 3020 | 22,498 | 99.5 ft | 14.5 to 1,048 ft |
  | 3010 | 2 | — | — |

- **Inference:** the 3020 count matches the building count (1,083,059), so 3020 is roofs, and **3000 is probably ground spot heights**. **Confirm** with the attached `Elevation_Points_Data_Dictionary.xlsx` before using it.
- **Vertical datum:** not stated in the metadata. Confirm it.

## `nyc_dem_1ft`: 1 foot DEM (`7kuu-zah7`)

- **What it is:** an external-link asset. A bare-earth, hydro-flattened model with 1 ft cells, made from **2010** LiDAR. Published by the Office of Technology and Innovation (OTI).
- **Not checked:** file format and size.
- **Use:** only if spot heights turn out to be insufficient. Clip it to the demo area.

## `nyc_building_footprints`: BUILDING (`5zhs-2jue`)

- **Rows:** 1,083,059. Updated weekly; last update 2026-10-11.
- **Fields:**
  - Geometry and identity: `the_geom` (MultiPolygon), `bin`, `doitt_id`, `objectid`, `name`.
  - Tax-lot links: `base_bbl`, `mappluto_bbl`.
  - Height and elevation: `height_roof`, `ground_elevation`.
  - Other attributes: `construction_year`, `feature_code`, `geom_source`, `last_status_type`, `last_edited_date`, `shape_area`, `shape_length`.
- **Units:** not stated for the height fields (probably feet). Confirm them.
- **Historic companion:** `ipkp-snf6`.
- **Use:** mainly for the frontend's 3D extrusion. The backend can proxy a bbox endpoint if that helps.

## `nyc_pluto`: PLUTO (`64uk-42ks`)

- **Rows:** 858,284 lots. Updated quarterly; last update 2026-08-24.
- **Fields relevant to flood exposure:**
  - Lot and building: `bbl`, `bsmtcode` (basement type), `yearbuilt`, `numfloors`, `unitsres`, `landuse`, `bldgclass`.
  - FEMA flood-zone flags: `firm07_flag`, `pfirm15_flag`.
  - Hazard designation: `edesignum`, the (E) designation.
  - Location: `latitude`, `longitude`.

## `nyc_bes`: Building Elevation and Subgrade (`bsin-59hv`)

- **Capture:** a one-time 2023 dataset with no planned updates.
- **Fields:** `z_grade` and `z_floor` (ft), `subgrade` (observed yes/no), `notes3` (how flood water may enter a subgrade space), `bin`, `bbl`, `nta2020`, `ntaname`.
- **Not checked:** coverage, i.e. which buildings it includes.

---

## Candidates not yet checked (M5+)

Verify access, timestamps, refresh rate and terms before using any of these:

- MTA subway GTFS-realtime and service-alert feeds.
- MTA subway stations (data.ny.gov).
- NYC DOT real-time traffic speeds.
- NYS DEC environmental remediation sites.
- PLUTO `edesignum` as a hazardous-materials site flag. This shows a site is present, not an active exposure.

Anchor Browser is only for public pages that have no API and whose terms allow automated retrieval.

## Tooling (checked on PyPI and GitHub, 2026-10-16)

| Package or tool | Version | Notes |
|---|---|---|
| `surrealdb` (Python SDK) | 2.0.0 (2026-04-23) | Runs **embedded** (`mem://`, `file://`, `surrealkv://`) with no server. About 5 MB wheels for macOS arm64 and manylinux x86_64. The 3.0.0 betas break the API, so pin 2.0.0. The bundled engine version must be checked in M1. |
| SurrealDB server | v3.3.0 (2026-09-28), v3.2.5 (2026-10-06), v2.7.0 | Index types: standard, UNIQUE, COUNT, FULLTEXT, HNSW/DISKANN. **No spatial index.** |
| `swmm-toolkit` | 0.17.0 | Wheels for macOS arm64, manylinux x86_64 and Windows. The SWMM engine version is read at runtime. |
| `pyswmm` | 2.2.0 | |
| `swmmio` | 0.8.6 | |
| `daytona` (SDK) | 0.224.1 | Uses `Daytona(DaytonaConfig(api_key=...))`, `daytona.create()`, `sandbox.fs.upload_file()`, `sandbox.process.exec()` / `code_run()`. Needs `DAYTONA_API_KEY`. Timeout parameters not yet verified. |
| `arize-phoenix` / `arize-otel` / `arize` | 20.23.0 / 0.14.1 / 8.59.1 | |
| `openinference-instrumentation-bedrock` | 0.1.60 | |
| `fastapi` | 0.143.2 | |
| `shapely` / `pyproj` / `rasterio` / `geopandas` | 2.2.0 / 3.8.0 / 1.5.2 / 1.2.0 | `pyproj` and `rasterio` need **Python ≥ 3.12**. |

**Local machine (macOS arm64):**
- System Python is 3.9.6, which is too old; `uv` 0.11.29 will manage Python 3.12.
- **Docker Desktop fails to start.**
- `gh` is authenticated as `devauntea`.
