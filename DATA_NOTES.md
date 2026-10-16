> **Phase 1 scope annotation — October 16, 2026:** The following Phase 0 evidence
> is preserved as historical research. Current authorized work is frontend-only
> with labeled local demonstration fixtures. No new ingestion/preprocessing,
> production scoring, live NYC/NWS clients or backend integration is authorized.
> The co-founder owns those future systems. Static source types are now approved;
> future high-tide category 3 is excluded from stormwater scoring and hazard overlays.
> Historical unverified findings remain unverified; these source responses are not
> loaded as current application infrastructure data.

# Swale Phase 0 data evidence

Status: **investigation complete enough for an approval handoff; implementation
not authorized or started.** This is source evidence, not a claim of a working
application, production-ready ingestion, or validated flood prediction.

The owner's brief is dated October 15, 2026. Actual requests are timestamped in
UTC below; UTC October 16 retrievals can still fall on October 15 in New York.
The fixed 311 comparison windows are anchored to the original brief date, not
silently advanced when the local date changes. Future ingestion must use and
display its actual extraction time/window.

## Verification vocabulary and method

- `VERIFIED_RUNTIME`: an actual successful request or inspection of downloaded
  source bytes supports the specific claim. It does not certify the entire source.
- `VERIFIED_DOCUMENTATION_ONLY`: current official documentation supports the
  semantics, but runtime feature values or end-to-end behavior were not verified.
- `UNVERIFIED`: not established, including uncomputed spatial counts, complete
  topology validity, unavailable metadata, and untested browser behavior.
- `UNREACHABLE`: an attempted request failed after a bounded attempt/retry. An
  individual failed query is distinguished from a source with successful requests.

Read-only public requests used official APIs/downloads, timeouts, bounded bodies
or confirmed bounded archive size. Initial sandbox DNS restrictions were resolved
through network escalation; no source was labeled runtime-verified from search
results alone. Some Socrata aggregate queries returned 500/503/timeouts while
metadata/samples succeeded; those failures remain recorded. No API token, paid
credential, authenticated data source, scraping, external write, deployment,
preview sharing, or remote Git change was used.

Transient response bodies, metadata, HTTP manifests and investigation probes are
in `/tmp/swale-phase0/`; they are not durable application ingestion or committed
raw data. Exact source URLs/queries and results are preserved in this document so
the investigation can be repeated if that temporary directory is removed. Body
sizes measure received/decoded response content unless explicitly described as
HTTP Content-Length; they are not measurements of compressed browser transfer.
Extrapolations are labeled estimates. No processed files/browser payload exists.

Source update/issue time, source validity period, original publication time,
portal metadata-change time, HTTP modification time, and local retrieval time are
different fields. Never replace a missing source date with fetch time. Socrata
numeric columns can be JSON strings; parse and validate explicitly. GeoJSON
longitude/latitude is not a metric distance coordinate system.

## Source status overview

| Source | Verified runtime scope | Important remaining limits |
| --- | --- | --- |
| Borough `gthc-hcne` | Official metadata and all five boundary features; Brooklyn polygon available | Full GIS topology/validity checks pending |
| Basins `2w2g-fk3i` | Metadata, sample, citywide aggregates, complete Brooklyn-bbox extraction and investigative polygon selection | Selection is an investigative custom containment check, not a production GIS validity certificate |
| 311 `erm2-nwe9` | Exact legacy/current drainage pairs, full selected historical records, recent counts, location quality | Query-cache versions differ; windows fixed; population totals/other failed aggregates individually recorded |
| Flood maps `9i7c-xyvv` | Full official ZIP, measured bytes, archive inventory, embedded FileGDB schema/domain/CRS | Actual GIS feature rows/counts/validity/clipped sizes UNVERIFIED; depth semantics documentation-only |
| Buildings `5zhs-2jue` | Metadata, samples, total/BIN-coded counts, height-quality aggregates | Exact spatial Brooklyn count, full validity, and direct roof-height unit precision remain unresolved |
| OpenFreeMap Liberty | Style and TileJSON responses, schema, attribution metadata | Tiles/fonts/sprites/browser rendering UNVERIFIED; no offline collection |
| Terrain | Official source/attribution documentation reachable | Documentation-only; explicitly skipped, no runtime tiles or elevation factor |
| NWS | `/points` discovery, forecast grid and actual QPF periods/units | One representative grid, not basin/boroughwide measurements; demo-time freshness must be rechecked |
| FloodNet (optional) | Metadata/samples, full compact deployment extraction, citywide historical event aggregate | Brooklyn event count and unrestricted live per-minute access UNVERIFIED; no visualization authorized |

## Findings that affect implementation

1. The flood source is a 33,785,094-byte ZIP of File Geodatabases, not a row API
   or shapefile. Embedded schema uses EPSG:2263 / US survey feet and PolygonZ.
   Its geometry must be decoded, checked, transformed, and clipped after approval.
2. `Flooding_Category` 1/2 describe stormwater ponding classes. Extreme category 3
   is a **future-high-tide reference**, not a deeper stormwater class. Proposed
   owner-approved interpretation: score/render the required stormwater zones from
   categories 1/2 only, retain category 3 provenance/exclusion counts, and do not
   add a separate unapproved coastal layer. Do not claim point-specific exact depth.
3. Historical drainage reports span both `Sewer` and `Sewer Maintenance`. The six
   exact core category pairs in the detailed evidence must be included and kept
   distinct. Broad substring matches also catch unrelated water supply, odor,
   structural, and other complaints; do not use those as an unexamined filter.
4. Socrata responses can have different cache freshness. Fresh selected-record
   responses support 18,743 historical drainage records; one stale aggregate
   reports 18,729. Preserve per-request headers/watermarks and disclose the
   mismatch; do not pretend these were one transactionally consistent snapshot.
5. Building `height_roof` already means height above ground; do not subtract
   `ground_elevation`. City capture documentation supports feet but the current
   field table does not directly specify roof-height units/foot precision. Resolve
   the conversion basis before extrusion. A live 2,130,353-height outlier is not
   plausible; missing/nonpositive/implausible values require explicit exclusion.
6. A 100-building Brooklyn-coded GeoJSON sample measured 87,764 bytes. Its naive
   full-borough extrapolation is about 290 MB uncompressed, an estimate, not a
   measured download. Use permitted building focus-area coverage or tiling;
   preserve boroughwide basins/flood/complaints and measure actual initial transfer.
7. NWS QPF is millimeters accumulated over six-hour periods in this response, not
   inches/hour. Four complete future periods total 3.81 mm for the exact interval
   stated below. A transparent complete-bin window avoids inventing subperiod rain.
   Forecast accumulation and scenario intensity need separate explicit heuristic
   normalizers, never an implied physical equivalence.
8. Static-inventory types are inconsistent with the brief's closed I1 enum; the
   proposed `STATIC`/`STATIC INVENTORY` display-label clarification requires owner
   resolution in `PLAN.md`. Inventory never establishes present drain condition.
9. Red Hook/Gowanus navigation/filter geometries are not supplied by these sources.
   Verify named targets/radii, or an official neighborhood boundary source if
   administrative membership is required. Do not invent geography for the LLM.

## Phase 0 verification limits

Source reachability and samples are verified to the extent below. Complete GIS
topology, flood feature counts, final clips, processed artifact sizes, and build
compatibility remain unverified. No GIS dependencies were installed. Investigative
basin/complaint containment counts must be reproduced with the approved GIS pipeline
and validated geometry before being used as final app coverage claims.

Frontend/backend/scoring/assistant tests and startup are not applicable yet because
no application code exists. Payload and FPS are **not measured**, not passed. No
local app URL, Daytona preview, recording, or real LLM invocation exists. Optional
FloodNet failures and deliberately skipped terrain do not block Tier 1; required
data processing, approved real LLM access, and all acceptance tests still do.

Detailed source evidence follows. Every count is scoped by its stated query,
window, method, and timestamp; sample cleanliness never proves whole-source quality.


---

## Phase 0: borough boundaries, catch basins, and 311

Only public read-only source requests and temporary investigative scripts were used. No repository/application changes, credentials, paid actions, remote writes, or implementation were performed. Source endpoints are VERIFIED_RUNTIME where noted below; failed individual queries remain failed.

### Time and extraction conventions

- Actual request interval: 2026-10-16 03:55:50Z through at least 04:00:12Z (Oct 15 23:55 through Oct 16 00:00 EDT). Host UTC and original client date Oct 15 were compatible at start; client environment rolled to Oct 16 during verification.
- Reproducible 311 comparison anchor, agreed during Phase 0: `as_of = 2026-10-15T00:00:00`. Historical window `[2023-10-15T00:00:00, 2026-10-15T00:00:00)`; recent window `[2026-10-08T00:00:00, 2026-10-15T00:00:00)`. The partial Oct 15 day was intentionally excluded. These are frozen verification windows, not the rolling window as of the final report date.
- Socrata timestamps are floating timestamps with no UTC offset in JSON. Filters above are literal API floating-date filters. The API types are verified; the service-request timestamp timezone is not independently confirmed from the source dictionary. Do not append Z to request-created times.
- All sizes below are measured response-body bytes read by urllib, unless explicitly marked estimated. They are not browser transfer/compression measurements. No processed application data files were produced.
- Initial sandbox DNS requests failed. A web-tool attempt could not access the APIs. Read-only network escalation then reached the same official endpoints HTTP 200. Do not classify the sources as unreachable from those initial transport failures.

### 2.1 Borough boundaries — VERIFIED_RUNTIME

Official metadata: https://data.cityofnewyork.us/api/views/gthc-hcne.json

Sample/full small dataset: https://data.cityofnewyork.us/resource/gthc-hcne.geojson?$limit=10

- Metadata HTTP 200, 7,395 bytes; full GeoJSON HTTP 200, **3,167,672 bytes**, **5 features**, each a non-null MultiPolygon. Brooklyn is `borocode='3'`, `boroname='Brooklyn'`, one feature with **28 polygons / 28 rings / 20,907 vertices**. Water areas excluded per metadata. Current version description: 26b.
- Schema: `borocode:number`, `boroname:text`, `shape_area:number`, `shape_leng:number`, `the_geom:multipolygon`. Number values are serialized as JSON strings in properties; parse explicitly.
- GeoJSON explicitly declares `urn:ogc:def:crs:OGC:1.3:CRS84`: longitude, latitude in degrees. Official attached dictionary identifies native source CRS as **NAD 1983 StatePlane New York Long Isl FIPS 3104 (US Feet)**; source `shape_area` and `shape_leng` are internal squared units/units. Do not treat these as degree area or meters, and do not compute metric distances in CRS84.
- Brooklyn bounds from all original coordinates: longitude `[-74.04189660705046,-73.83355923946421]`, latitude `[40.569529993984325,40.739127953134535]`.
- All 118 rings across five borough features are closed and finite; no missing geometry among five. **Full topology/self-intersection validation not performed**. No repair/simplification performed.
- Source metadata `rowsUpdatedAt`: **2026-05-26T19:35:50Z**; metadata `viewLastModified`: **2026-05-26T19:35:48Z**. Data response `Last-Modified`: **2026-05-26T19:35:49Z**. Retrieval start **2026-10-16T03:56:30.137381Z**, HTTP response Date03:56:30Z. Preserve each field as supplied rather than silently unifying them.
- Attached dictionary successfully read, HTTP200, 63,099bytes: https://data.cityofnewyork.us/api/views/gthc-hcne/files/4ef9855a-f485-4c02-b246-530b6b736059?download=true&filename=data_dictionary.xlsx

### 2.2 Catch basins — VERIFIED_RUNTIME

Official metadata: https://data.cityofnewyork.us/api/views/2w2g-fk3i.json

Sample: https://data.cityofnewyork.us/resource/2w2g-fk3i.json?$limit=8

GeoJSON CRS sample: https://data.cityofnewyork.us/resource/2w2g-fk3i.geojson?$limit=3

- Metadata HTTP200, 19,342bytes; JSON eight-row sample HTTP200, 2,772bytes; three-feature GeoJSON HTTP200, 850bytes with explicit CRS84. Points are longitude,latitude. Observed identifiers are text such as `CB422934`; preserve them exactly.
- Schema matches six requested fields: `the_geom:point`, `unitid:text`, `latitude:number`, `longitude:number`, `point_x:number`, `point_y:number`; four computed-region numeric fields also appear. Numeric JSON values are strings while geometry coordinates are JSON numbers. Do not assume computed-region codes are NYC borocodes.
- Full citywide aggregate HTTP200: **154,212 rows**, **154,212 distinct unitid**, 154,212 non-null unitid / geometry / latitude / longitude. Thus zero nulls in those fields and no duplicate IDs in that runtime snapshot. This does not justify deduplicating different IDs at the same coordinates; metadata itself shows duplicate coordinate examples citywide.
- A deliberately rough bbox `within_box(the_geom,40.74,-74.05,40.56,-73.83)` returned **56,721**, which is **not a Brooklyn count**.
- The actual Brooklyn boundary's bbox returned **55,724 candidate points**. Ordered bounded requests fetched exactly **50,000 + 5,724 rows**, with 55,724 distinct IDs and no duplicate coordinates within those candidate rows. Selected fields `unitid,the_geom` measured **5,202,663 + 595,558 = 5,798,221bytes**.
- Investigative point-in-polygon result against the original unsimplified Brooklyn geometry: **37,139 inside**, **18,585 outside** from the 55,724 bbox candidates; no point-on-boundary hits detected. This is a polygon membership count rather than a bbox count. Method: local pure-Python ray crossings with polygon-hole handling and latitude segment bins; zero geometry repair/simplification. Simple ring fixtures plus known Brooklyn/Manhattan anchors passed. **It is not a GEOS/topology validation result; Phase1 must recheck with the chosen GIS engine and documented boundary-inclusion policy.**
- Native source CRS/units are confirmed by official attached dictionary: `NAD_1983_StatePlane_New_York_Long_Island_FIPS_3104_Feet`, geographic base `GCS_North_American_1983`. `point_x/point_y` are native projected coordinates in feet; API GeoJSON points are transformed CRS84. Dictionary contains an older catalog link `vu7w-gbbe`, so retain current verified dataset ID2w2g-fk3i and do not switch to the old link.
- Native dictionary HTTP200, 103,385bytes: https://data.cityofnewyork.us/api/views/2w2g-fk3i/files/5db09772-3512-4022-b979-440fc608cb6f?download=true&filename=DEP_CatchBasins_Data_Dictionary.xlsx
- Source metadata `rowsUpdatedAt`: **2025-12-18T16:29:33Z**, `viewLastModified`: **2025-12-18T19:42:17Z**; runtime data response Last-Modified **2025-12-18T16:30:07Z**. Sample retrieval start03:56:30.138134Z; bbox pages retrieval03:59:29.494336Z and03:59:31.194547Z (response page1 completed03:59:52Z).
- **Estimated only**: citywide all-fields JSON size from the eight-row sample mean is approximately **53,434,458bytes (53.4MB decimal)**. Actual citywide response was not downloaded; raw size varies. No processed Brooklyn payload size has been measured.

### 2.3 311 — VERIFIED_RUNTIME, with query-cache consistency limitation

Official metadata: https://data.cityofnewyork.us/api/views/erm2-nwe9.json

Sample: https://data.cityofnewyork.us/resource/erm2-nwe9.json?$where=borough%3D%27BROOKLYN%27%20AND%20complaint_type%3D%27Sewer%20Maintenance%27&$limit=8

- Official attached311 dictionary HTTP200,424,095bytes, saved311-dictionary.xlsx; describes latitude/longitude in decimal degrees and created date as submission date/time, but does not specify a timezone or CRS datum. URL: https://data.cityofnewyork.us/api/views/erm2-nwe9/files/c5cc6926-45bb-4af3-8aab-0ee6a29bcf4d?download=true&filename=311_ServiceRequest_2020-present_DataDictionary_Updated_2025.xlsx
- Metadata HTTP200,25,591bytes. Metadata title remains **311 Service Requests from2020 to Present**; description points 2010–2019 users to76ig-c548. This source matches the brief's intended scope. Do not use an old assumption that erm2-nwe9 includes2010–2019.
- Confirmed requested API fields: `unique_key:text`, `created_date:calendar_date` (header floating_timestamp), `closed_date:calendar_date`, `agency:text`, `complaint_type:text`, `descriptor:text`, `borough:text`, `latitude:number`, `longitude:number`, `status:text`. Geometry field is **`location:point`**, not `the_geom`; coordinate pair order is longitude,latitude. Other fields include `descriptor_2` and state-plane coordinate fields. Unclosed requests can omit `closed_date` entirely. IDs and numeric-coordinate JSON strings must be parsed intentionally.
- Sample eight rows HTTP200,2,673bytes. Display labels `Problem` and `Problem Detail` map to `complaint_type`, `descriptor` per metadata. Actual current categories include **Sewer Maintenance / Backup** and **Sewer Maintenance / Flooding on Street**, while historical labels remain in the same source.
- Runtime all-category Brooklyn total: **6,850,293** (`borough='BROOKLYN'`, no time filter), HTTP200. This is not the drainage subset, not a spatial count, and not a three-year count.
- **Citywide total remains UNVERIFIED:** `select=count(*) as total` HTTP500; one conservative retry `select=count(*)` timed out55seconds. No inferred metadata row count is substituted.
- Broad uppercase substring grouping over the3year Brooklyn window timed out55seconds. Split exact complaint-type queries succeeded instead. DEP type enumeration returned16 exact types, including Sewer(22,289), Sewer Maintenance(3,843), Water System(55,746), Water Maintenance(6,411), and Green Infrastructure(86). Full known-pair enumeration for Sewer/Sewer Maintenance/Water System returned45 pairs (<1,000limit); further candidate water/green types returned34 pairs. This verifies the selected drainage categories without claiming an exhaustive citywide semantic taxonomy.

#### Proposed narrow drainage evidence allowlist (preserve all six raw pairs)

| complaint_type | descriptor | Historical raw rows | Recent raw rows | Historical polygon-inside rows |
|---|---|---:|---:|---:|
| Sewer | Sewer Backup (Use Comments) (SA) | 7185 | 0 | 7181 |
| Sewer | Catch Basin Clogged/Flooding (Use Comments) (SC) | 5679 | 0 | 5627 |
| Sewer | Street Flooding (SJ) | 3118 | 0 | 3060 |
| Sewer Maintenance | Catch Basin Clogged | 1193 | 62 | 1186 |
| Sewer Maintenance | Backup | 985 | 68 | 985 |
| Sewer Maintenance | Flooding on Street | 583 | 39 | 576 |

- Historical raw full-record extraction HTTP200: **18,743 rows**, **18,743 distinct unique_key**, **127 missing latitude/longitude/location**, **18,616 coordinate-valid points**, zero missing categories within the filtered subset, no geometry-to-lat/lon differences greater than1e-9degree, no invalid coordinate ranges or non-Point locations among present geometries. All18,743 rows were downloaded (limit25,000), response measured **5,301,727bytes**.
- Full original-boundary membership: **18,615 inside**, **1 outside**, zero boundary hits, using the same investigative method as basins. Outside record is unique_key`70008970`, created`2026-08-09T17:09:59.000`, Sewer Maintenance/Catch Basin Clogged, point[-73.866597911189,40.685270206714]. Exclude/flag this borough-label mismatch when enforcing polygon coverage rather than silently retaining it.
- Recent raw/full-valid/full-inside counts are all **169**, with169 distinct IDs, zero missing locations/categories, and subtype counts Catch Basin Clogged62, Backup68, Flooding on Street39. Seven-day subset was independently returned by aggregate/category queries and identified inside full historical records.
- Category null counts for all6.85million Brooklyn requests were **not measured**. Zero selected-category nulls is partly inherent in the exact-pair filter and must not be generalized.
- These six pairs are a recommended narrow definition of clog/flood/backup reports. Additional drainage-adjacent candidates need explicit inclusion policy before scoring: manhole overflow(legacy1,075 + current325), culvert blocked/cleaning(419+77), highway flooding(31+22), and rain-garden flooding(1). Basin search, sunken/damaged basin, missing covers/grates, curb pieces, odors, plantings, and water-supply requests are distinct evidence categories and must not be swept into the six pairs.
- Concrete false matches/irrelevant broad matches from actual rows: Sewer/Sewer Odor(SA2)1,144, Sewer Maintenance/Odor208, Sewer/Catch Basin Search(SC2)1,298, Water System/Hydrant Running(WC3)9,499, Water System/Excessive Water In Basement(WEFB)1,329, Water Maintenance/Water Main Break611, Water Maintenance/Water in Basement102, Green Infrastructure/Rain Garden86. A catch-basin or flooding substring by itself is not a sufficient inclusion rule.

#### Source timestamps and query caches

- Metadata `rowsUpdatedAt` **2026-10-16T01:37:53Z**; metadata `viewLastModified` **2025-12-29T15:25:00Z**. Do not mistake metadata-view modification for latest row publication.
- Fresh full extraction and category queries: retrieval03:57:59Z–03:59:29Z, response Last-Modified/Truth/Secondary **2026-10-16T02:20:02Z**, `X-SODA2-Data-Out-Of-Date:false`. Their totals agree at18,743.
- Eight-row latest sample and historical aggregate query return `X-SODA2-Data-Out-Of-Date:true`, source Last-Modified **2026-10-15T02:31:20Z**. The stale aggregate returned **18,729** historical rows,18,602 with location, **14fewer than the fresh complete extraction**. Do not merge these responses into a single consistent snapshot or suppress the discrepancy. Use the fresh full-download count18,743 for this report and require ingestion to detect/retry or flag stale responses.
- Recent aggregate returned169 and fresh-cache headers. Sample/latest-row results only reachedOct14, while a separately queried fresh source has a newer publication timestamp; this does not prove an absence of newer requests.
- Freshness and retrieval are distinct; source publication times and API cache-copy Last-Modified values are both recorded, not silently substituted.

#### Exact API query provenance

Each `*-http.json` in `/tmp/swale-phase0` preserves the complete percent-encoded request URL, retrieval-start UTC, HTTP status, measured bytes, response headers, and duration. Important names: `boundary-all`, `basins-counts`, `basins-boundary-bbox-count`, `basins-boundary-bbox-page1`, `basins-boundary-bbox-page2`, `311-brooklyn-count`, `311-dep-types`, `311-drain-pairs`, `311-more-dep-pairs`, `311-recent-drain-pairs`, `311-core-historical-records`, `311-core-historical-counts`(stale), and`311-core-recent-counts`.

Investigative scripts `verify_basins_311*.py` and `check_boundary_membership.py`, samples/metadata, and `boundary-membership-summary.json` remain in `/tmp/swale-phase0`. They are temporary evidence, not durable application ingestion or raw datasets committed to git.

### Remaining verification / plan implications

1. Reverify polygon topology and membership using approved GIS preprocessing in Phase1, keeping the original boundary's CRS and the chosen boundary-inclusion policy. Do not claim full V1 geometry validation passed.
2. Confirm request-created timestamp timezone before UTC arithmetic; retain literal original timestamp values and log rolling-window boundaries at each ingestion.
3. Preserve legacy/current category distinctions; implement an explicit versioned allowlist from actual values rather than a broad substring filter. Recommended six core pairs have source evidence, while expansion candidates need a documented semantic decision.
4. Implement bounded pagination and cache-staleness checks; source API individual queries can fail or return stale copies even when other queries succeed. No verified cache exists in the repository yet.
5. Exact citywide311 total and general missing-category rate remain unverified. They are not prerequisites to fetching the bounded chosen Brooklyn subset, but must not be reported as measured.
6. Measured payloads are source-investigation bytes, not processed/browser payloads; V2 performance and initial20MB budget have not been tested.


---

## Modeled stormwater flood zones — `9i7c-xyvv`

**Classification:** `VERIFIED_RUNTIME` for download reachability, bytes, archive inventory, and actual embedded FileGDB schema/domain/CRS metadata. `VERIFIED_DOCUMENTATION_ONLY` for the physical interpretation of categories from the downloaded official XLSX data dictionaries. **Actual feature rows, category frequencies, geometry validity, total/Brooklyn counts and clipped output size remain `UNVERIFIED`.** No GDAL, Fiona, GeoPandas, Shapely or DuckDB executable/library was present, and no geospatial dependency was installed during Phase 0.

### Requests and measured payload

- HEAD with redirects: `https://data.cityofnewyork.us/download/9i7c-xyvv/application/zip` → HTTP 302 → HTTP 200; terminal `Content-Length: 33785094`, `Accept-Ranges: bytes`, `Content-Type: application/octet-stream`.
- Redirect target: `https://data.cityofnewyork.us/api/views/9i7c-xyvv/files/6ce7b252-a38c-47ae-a823-680f443227e5?filename=NYCFloodStormwaterFloodMaps.zip`.
- Full official ZIP GET after confirming bounded size: HTTP 200; **33,785,094 bytes measured** (32.22 MiB), saved only to `/tmp/swale-phase0/flood.zip`. No multi-GB request or range workaround needed. ZIP contains **199 entries**, **51,618,698 bytes uncompressed** including metadata and directories; this is not the browser payload or feature count.
- Metadata: `https://data.cityofnewyork.us/api/views/9i7c-xyvv.json` → HTTP 200, **4,508 bytes**.
- Retrieval completed approximately **2026-10-16T03:56:06Z**, which is October 15 in the user's America/New_York timezone. Source metadata separately reports `rowsUpdatedAt=2024-07-03T21:04:08Z`; `publicationDate=2024-07-03T21:21:04Z`; `viewLastModified=2024-10-17T18:10:13Z`. “Annually” is the declared update frequency, not proof the underlying model was rerun annually or in 2026.
- Initial sandboxed requests failed DNS; reissued with the authorized network escalation and succeeded. No credentials were supplied.

### Archive structure and exact selected members

The source contains **four File Geodatabases**, each paired with a named `.xlsx` data dictionary; it is not a conventional Socrata table and not a set of shapefiles. Under `NYCFloodStormwaterFloodMaps/`:

1. `NYC Stormwater Flood Map - Moderate Flood (2.13 inches per hr) with Current Sea Levels/NYC_Stormwater_Flood_Map_Moderate_Flood_2_13_inches_per_hr_with_Current_Sea_Levels.gdb/`
2. `NYC Stormwater Flood Map - Extreme Flood (3.66 inches per hr) with 2080 Sea Level Rise/NYC_Stormwater_Flood_Map_Extreme_Flood_3_66_inches_per_hr_with_2080_Sea_Level_Rise.gdb/`
3. `NYC Stormwater Flood Map - Moderate Flood (2.13 inches per hr) with 2050 Sea Level Rise/NYC_Stormwater_Flood_Map_Moderate_Flood_2_13_per_hr_with_2050_Sea_Level_Rise.gdb/` (the actual GDB name omits `inches`)
4. `NYC Stormwater Flood Map - Limited Flood (1.77 inches per hr) with Current Sea Levels/NYC_Stormwater_Flood_Map_Limited_Flood_1_77_inches_per_hr_with_Current_Sea_Levels.gdb/`

Each selected feature class name equals its GDB basename without `.gdb`. The two selected data-dictionary files have these exact basenames, inside the corresponding scenario directory:

- `NYC Stormwater Flood Map - Moderate Flood (2.13 inches per hr) with Current Sea Levels.xlsx`
- `NYC Stormwater Flood Map - Extreme Flood (3.66 inches per hr) with 2080 Sea Level Rise.xlsx`

Embedded XML read directly from each actual `a00000004.gdbtable` declares:

| Field | Actual embedded schema |
| --- | --- |
| `OBJECTID` | `esriFieldTypeOID`, nonnullable |
| `Shape` | `esriFieldTypeGeometry`, nullable |
| `Flooding_Category` | `esriFieldTypeSmallInteger`, nullable; coded domain `Flooding Category` |
| `Shape_Length` | `esriFieldTypeDouble`, nullable |
| `Shape_Area` | `esriFieldTypeDouble`, nullable |

Both selected layers declare `esriGeometryPolygon`, `HasZ=true`, `HasM=false`, horizontal CRS **EPSG:2263**, NAD83 / New York Long Island State Plane, **US survey feet** (`Foot_US`, conversion factor `0.3048006096012192`). Geodatabases can store multipart polygons; actual decoded Polygon/MultiPolygon distributions remain unverified. The source XY coordinates are projected feet, unlike the building/boundary GeoJSON longitude/latitude coordinates. Reproject before any joins. The Z values are not documented as exact ponding depths and must not be treated as such. `Shape_Length` is feet and `Shape_Area` square feet according to bundled dictionaries.

### Confirmed category meaning and important mismatch

Embedded coded domains and downloaded official XLSX dictionaries agree:

| `Flooding_Category` | Moderate Current | Extreme 2080 |
| --- | --- | --- |
| 1 | Nuisance Flooding: ponding depth **>=4 inches and <1 foot** | Same |
| 2 | Deep and Contiguous Flooding: ponding depth **>=1 foot** | Same |
| 3 | Not in this domain | **Future High Tides 2080**, separate coastal tidal inundation reference; dictionary says 2080s high estimate of **58 inches sea-level rise** |

Category 3 is **not a third stormwater ponding-depth class**. An extreme-scenario union that blindly includes every category would conflate a tidal-reference footprint with the modeled stormwater footprint. Proposed implementation treatment: use categories 1 and 2 for the stormwater exposure factor; either omit category 3 from Tier 1 or display it as a separately identified reference, only within approved scope. Do not score category 3 as “deeper flooding.” Owner should confirm this semantic selection in the Phase 1 approval.

Dictionaries state the maps generally show potential flooding at least **0.25 contiguous acres** and depths at least 4 inches; some smaller areas remain because of masking/proximity. These classes do **not** give exact depth at an arbitrary location. They describe planning scenarios and omit site-specific conditions including obstructed/clogged drains. Both rainfall intensity and sea-level assumptions change between selected scenarios. The Extreme workbook's method cell contains boilerplate wording “moderate rainfall” even though its title and dataset-description cell identify Extreme 3.66 inches/hour; preserve the scenario title/rate rather than copying that boilerplate.

### Work still needed after approval

Open the selected FileGDB feature classes with a supported GIS reader, verify actual row/category/null counts and geometry validity, discard or explicitly document unknown categories, reproject to the accepted working CRS, clip accurately to Brooklyn and measure processed bytes. No runtime claim about decoded rows or Brooklyn flood geometry is justified by this Phase 0 archive-metadata inspection alone.

## Building footprints — `5zhs-2jue`

**Classification:** `VERIFIED_RUNTIME` for reachable JSON/GeoJSON APIs, metadata schema, citywide count, Brooklyn BIN-coded count, 103 sampled geometries, quality aggregates and source edit time. **Boundary-filtered Brooklyn count, complete geometry validity and browser transfer size remain `UNVERIFIED`.** Relative roof semantics are `VERIFIED_DOCUMENTATION_ONLY` from the City-owned data dictionary. Feet are supported by the City capture rules' feet elevation definition and building-height derivation; the current `HEIGHT_ROOF` field description itself does not directly declare a unit, so document the conversion basis explicitly before rendering.

### Requests and actual results

All successful queries below returned HTTP 200 without an app token. Query strings are shown decoded for readability; requests used `curl --get --data-urlencode`.

| URL and query | Result | Measured response bytes |
| --- | --- | --- |
| `https://data.cityofnewyork.us/api/views/5zhs-2jue.json` | Metadata/schema | 28,830 |
| `https://data.cityofnewyork.us/resource/5zhs-2jue.geojson?$limit=3` | 3 geometries | 3,346 |
| `https://data.cityofnewyork.us/resource/5zhs-2jue.json?$select=count(*) as total` | **1,083,059 citywide rows** | 22 |
| same `.json`, `$select=count(*) as total`, `$where=bin >= 3000000 AND bin < 4000000` | **330,121 Brooklyn BIN-coded rows** | 21 |
| same `.geojson`, `$limit=100`, `$where=bin >= 3000000 AND bin < 4000000` | 100 Brooklyn-coded rows | **87,764** |
| same `.json`, `$select=count(*) as total`, `$where=height_roof IS NULL OR height_roof <= 0` | **719** missing/nonpositive citywide heights | 18 |
| same `.json`, `$select=count(*) as total`, `$where=bin >= 3000000 AND bin < 4000000 AND (height_roof IS NULL OR height_roof <= 0)` | **214** missing/nonpositive Brooklyn-coded heights | 18 |
| same `.json`, `$select=bin,doitt_id,height_roof,ground_elevation`, `$order=height_roof DESC`, `$limit=5` | 5 highest roofs; outlier below | 435 |
| same `.json`, `$select=max(last_edited_date) as latest_edit` | **2026-10-09T20:56:34.000Z** | 45 |

A larger combined min/max/count aggregate initially returned HTTP 500 with an internal-error ID; simpler aggregate retries above succeeded. Reachability is demonstrated, but ingestion still needs bounded retries/timeouts.

Retrieval window **2026-10-16T03:55:51Z–03:58:05Z**. API source metadata separately reports `rowsUpdatedAt=2026-10-11T08:17:59Z`, `viewLastModified=2026-07-08T15:52:04Z`, and original `publicationDate=2025-05-27T20:48:01Z`. Do not substitute portal metadata-change or original-publication time for the row-update time. Metadata declares weekly releases; feature edits can be daily.

### Verified schema, coordinates and samples

Metadata API types:

- `the_geom`: `multipolygon`.
- `bin`, `doitt_id`, `objectid`, `construction_year`, `feature_code`, `ground_elevation`, `height_roof`, `shape_area`, `shape_length`: `number`.
- `last_edited_date`: `date`.
- `name`, `base_bbl`, `mappluto_bbl`, `geom_source`, `last_status_type`: `text`.

Actual GeoJSON properties encode numeric attributes as **JSON strings**, e.g. `height_roof:"9.16"`, not JavaScript numbers. Parse explicitly and reject invalid/nonfinite values. The geometry coordinates are numbers. The GeoJSON response explicitly declares **`urn:ogc:def:crs:OGC:1.3:CRS84`**: longitude first, latitude second, degrees. All 103 sampled geometries were MultiPolygon. For example Brooklyn `bin=3373792`, `doitt_id=273343`, `height_roof=9.16`, `ground_elevation=24` has coordinate approximately `[-73.9443,40.6264]`.

The 100-row Brooklyn-coded sample had 0 null geometries, 0 null/nonpositive roof values, 0 duplicated `doitt_id`, roof values 9.54–163.41, and 100 MultiPolygons. This sample is insufficient for whole-source null, duplicate or validity guarantees. City metadata cache reports 570 ground-elevation nulls and zero roof nulls; those are metadata statistics, separate from runtime row aggregates. Negative ground elevation can be legitimate and is not the same as an invalid negative building height.

Brooklyn selection: BIN first digit 3 is officially documented as Brooklyn, but is only a preliminary server filter. Use actual boundary geometry for final inclusion/clipping and count/report exceptions. `bin` is not a guaranteed unique feature key (unknown BINs and split footprints can duplicate it); prefer `doitt_id`, documented as the stable unique identifier, while checking actual duplicates.

### Roof semantics, units, outlier and payload risk

City-owned official metadata:

- `https://github.com/CityOfNewYork/nyc-geo-metadata/blob/main/Metadata/Metadata_BuildingFootprints.md` (raw text requested successfully, HTTP 200, 12,973 bytes).
- `https://github.com/CityOfNewYork/nyc-planimetrics/blob/master/Capture_Rules.md` (raw text requested successfully, HTTP 200, 86,393 bytes).
- Additional City-owned feature-service metadata query: `https://services6.arcgis.com/yG5s3afENB5iO9fj/arcgis/rest/services/BUILDING_view/FeatureServer/0?f=pjson`, HTTP 200, 15,404 bytes; it has numeric `HEIGHT_ROOF` and `GROUND_ELEVATION` fields but does not supply a clearer height-unit declaration.

`HEIGHT_ROOF` means **roof height above the building's ground elevation**, not roof elevation above sea level. **Do not compute `height_roof-ground_elevation`.** `GROUND_ELEVATION` means lowest ground elevation, generally NAVD88 when from modern/photogrammetric sources. Zero/NULL roof means unavailable. Capture rules define elevation values in feet and say building elevation points are transferred into the footprint to calculate the height attribute. The native horizontal coordinates are US feet; the Socrata GeoJSON geometry has already been transformed to geographic degrees. Current documentation's `HEIGHT_ROOF` table does not independently state feet vs US-survey-foot precision; do not infer height units from GeoJSON coordinates.

Highest live record: `bin=2130353`, `doitt_id=1307001`, `height_roof=2130353`, `ground_elevation=17` — roof height exactly equals its BIN, an obvious implausible height. The next returned heights are 1,550; 1,428; 1,408.377901; 1,401. Exclude/flag implausible heights and record exclusions; do not replace them with invented defaults. At least 719 citywide/214 Brooklyn-coded missing or nonpositive values also need explicit treatment.

**Measured sample size** 87,764 bytes / 100 rows = 877.64 bytes/row. Multiplying by current count gives an **uncompressed, nonrepresentative estimate**, not a downloaded size: ~289,727,394 bytes (276.3 MiB) Brooklyn-coded; ~950,535,901 bytes (906.5 MiB) citywide for the same full-property GeoJSON format. Compression, selected fields, geometry complexity, viewport and sampling order change transfer size substantially. Full-borough raw buildings are unlikely to fit the 20 MB application transfer budget. Plan either tiles or the already-authorized building focus area while retaining boroughwide core layers. No processed or browser payload has been measured.

City metadata also warns source `shape_area` and `shape_length` are generated in Web Mercator and should not be used for accurate area/distance calculations. Derive measurements from geometry in an appropriate projected CRS instead.


---

## Phase 0 — weather, basemap, optional sensors, skipped terrain

This is a read-only source verification report. No feature code or repository files were changed. Evidence JSON bodies and request manifests are in `/tmp/swale-phase0/`; they are transient verification artifacts, not production ingestion. Requests used 25–30 second timeouts and body caps of 1–2 MB. No map or terrain tiles were downloaded. Byte counts below measure the response body read by Python (not a network-transfer/compression estimate). Retrieval timestamps use UTC; all requests occurred October 15, 2026 EDT (late evening), despite UTC dates crossing October 16.

### National Weather Service — VERIFIED_RUNTIME

Official documentation:

- https://www.weather.gov/documentation/services-web-api
- https://weather-gov.github.io/api/gridpoints
- https://api.weather.gov/openapi.json

Context7 was resolved to `/websites/weather_gov` and queried; the official website, gridpoint FAQ, and live OpenAPI schema were also inspected. Runtime JSON has precedence over the documented examples.

**Representative point chosen for this prototype:** latitude `40.6782`, longitude `-73.9442`, labeled “Brooklyn representative forecast point (40.6782, -73.9442)”. This is one approximately 2.5 km NWS grid square and is not boroughwide forecast coverage. The point response returns county `NYC047` and timezone `America/New_York`; it has no neighborhood field to justify a more specific neighborhood label.

**Identity and contact:** Read-only git configuration gives origin `https://github.com/devauntea/Swale.git`; its public page `https://github.com/devauntea/Swale` returned HTTP 200. Requests used `User-Agent: SwalePrototype/phase0 (https://github.com/devauntea/Swale)`. No email address was invented or read from local account configuration. The current official NWS documentation requires an application-identifying User-Agent and says website/email contact lets NWS contact the developer; it treats contact as optional recommendation rather than the prompt’s wording of mandatory. The stricter prompt requirement is satisfied using the verified public project URL, so no owner-contact blocker remains. An owner may choose a dedicated contact later.

#### Runtime request chain

| Request | HTTP | Body bytes measured | Retrieved UTC |
|---|---:|---:|---|
| `https://api.weather.gov/points/40.6782,-73.9442` | 200 | 3,917 | 2026-10-16T03:56:30.362294Z |
| `https://api.weather.gov/gridpoints/OKX/36,41` | 200 | 196,281 | 2026-10-16T03:57:07.308985Z |
| `https://api.weather.gov/openapi.json` | 200 | 122,897 | 2026-10-16T03:57:07.316562Z |

The grid URL was read from `properties.forecastGridData`; it was not hardcoded. Discovery returned `gridId: "OKX"` (string), `gridX: 36`, `gridY: 41` (integers). The point is a GeoJSON Point with `[-73.9442,40.6782]`. The grid response is a GeoJSON Polygon with coordinates in longitude, latitude degrees:

`[[-73.9196,40.6701],[-73.9151,40.6918],[-73.9437,40.6952],[-73.9482,40.6735],[-73.9196,40.6701]]`.

Geographic GeoJSON coordinates must not be treated as meter distances. Forecast grid elevation is `18.8976`, `unitCode: wmoUnit:m`; it is not basin elevation and must not supply the disabled relative-elevation score factor.

#### Runtime precipitation structure and provenance

- `properties.updateTime`: `2026-10-15T18:36:14+00:00`.
- HTTP `Last-Modified`: `Thu, 15 Oct 2026 18:36:14 GMT`, consistent with updateTime.
- `properties.validTimes`: `2026-10-15T12:00:00+00:00/P7DT13H`.
- `properties.quantitativePrecipitation`: object with `uom: "wmoUnit:mm"` and `values: array`.
- Each values entry contains `validTime: string` and `value: JSON number` in this sample. The formal schema allows `number` or `null`.
- All **14** sampled QPF entries are six-hour intervals (`PT6H`); **0** nulls; **9** zeros; **5** positive values. A real zero is valid rainfall data and must not be treated as missing.
- QPF coverage is **2026-10-15T12:00Z to 2026-10-19T00:00Z**, shorter than the envelope’s global validTimes. Do not extend it to the grid’s full seven-day window.
- The official gridpoint FAQ calls quantitativePrecipitation the amount of liquid precipitation, and documents interval/value pairs, nullable missing data, and layer-level units. It distinguishes probabilityOfPrecipitation from quantitativePrecipitation.
- `Access-Control-Allow-Origin: *` observed, but a browser must still not be expected to set the forbidden User-Agent header; plan server-side NWS ingestion with the truthful UA.

QPF entries (UTC start; each lasts six hours; millimeters):

| Start | mm |
|---|---:|
| Oct 15 12:00 | 0 |
| Oct 15 18:00 | 0 |
| Oct 16 00:00 | 0 |
| Oct 16 06:00 | 0.508 |
| Oct 16 12:00 | 0.508 |
| Oct 16 18:00 | 1.016 |
| Oct 17 00:00 | 1.778 |
| Oct 17 06:00 | 0.508 |
| Oct 17 12:00 | 0 |
| Oct 17 18:00 | 0 |
| Oct 18 00:00 | 0 |
| Oct 18 06:00 | 0 |
| Oct 18 12:00 | 0 |
| Oct 18 18:00 | 0 |

**Implementation implications, not implementation performed:** QPF is an accumulation in mm for a stated period, not mm/hour or inches/hour. Summing complete nonoverlapping forecast periods is supportable. Do not multiply the amount by the period duration, double-count overlapping intervals, treat every entry as one hour, or assume uniform rain within a partial interval. The schema accepts start/end, start/duration, and duration/end ISO8601 intervals, including days; observed QPF uses start/PT6H, and the global interval uses P7DT13H. Parse explicit duration semantics rather than relying on string slices or host local time. Reject unsupported forms rather than silently fabricating periods.

A conservative proposed display/score window is the next **complete** 24-hour forecast block starting at the next forecast interval boundary. In this snapshot that is `2026-10-16T06:00Z` to `2026-10-17T06:00Z` and totals **3.81 mm** (derived by summing four verified complete periods). This must be labeled by those exact times; it is not exactly “the next 24 hours from now.” Another aggregation policy remains a documented implementation choice. The prompt leaves rainfall normalization/window unspecified; depth over a forecast window and a scenario intensity in inches/hour must not be silently normalized as though they had the same units. Store quantity kind, unit, window, and source-specific normalization transparently.

For missing/null/nonfinite/negative values, unsupported units, invalid intervals, gaps/overlaps, incomplete chosen-window coverage, HTTP errors or stale data: show the forecast’s actual availability/coverage and apply the prompt’s clearly labeled SCENARIO fallback when a usable quantitative value cannot be extracted. No probability-to-depth conversion. Preserve updateTime, valid interval and local fetch time separately. Check /points periodically because office/grid mapping can change. The official FAQ supports conditional requests using Last-Modified/If-Modified-Since.

No current NWS runtime blocker found. Demo-time freshness and availability must be rechecked then; this verification is not a promise of future availability.

### OpenFreeMap Liberty — VERIFIED_RUNTIME for style/metadata; documentation-only for rendered tile availability

Official sources inspected:

- https://openfreemap.org/
- https://openfreemap.org/quick_start/
- https://openfreemap.org/tos/
- https://github.com/hyperknot/openfreemap

Context7 resolved `/hyperknot/openfreemap`, the official repository, and returned current provider setup and attribution guidance. Website quickstart remains the authoritative current integration reference.

| Request | HTTP | Body bytes measured | Retrieved UTC |
|---|---:|---:|---|
| `https://tiles.openfreemap.org/styles/liberty` | 200 | 43,079 | 2026-10-16T03:56:30.296102Z |
| `https://tiles.openfreemap.org/planet` | 200 | 19,254 | 2026-10-16T03:57:07.066251Z |

Style: JSON object, `version: 8` (integer), **111** layers (array). Two sources:

- `ne2_shaded`: raster, tileSize 256, maxzoom 6; template `https://tiles.openfreemap.org/natural_earth/ne2sr/{z}/{x}/{y}.png`.
- `openmaptiles`: vector, URL `https://tiles.openfreemap.org/planet`.

Glyphs: `https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf`; sprite root: `https://tiles.openfreemap.org/sprites/ofm_f384/ofm`.

Source timestamps are **HTTP modification times**, not necessarily source OSM edit dates:

- Liberty style Last-Modified: `2026-10-15T06:24:01Z`.
- Planet TileJSON Last-Modified: `2026-10-11T23:45:56Z`.
- TileJSON references tile generation path `20261011_080001_pt` (generation token, not independently verified per-feature OSM freshness).
- TileJSON `tilejson: "3.0.0"`, `version: "3.16.0"`, `minzoom: 0`, `maxzoom: 14`, world bounds `[-180,-85.05113,180,85.05113]`.
- Template: `https://tiles.openfreemap.org/planet/20261011_080001_pt/{z}/{x}/{y}.pbf`.
- Style and TileJSON return CORS `*`.

Observed TileJSON attribution:

`<a href="https://openfreemap.org" target="_blank">OpenFreeMap</a> <a href="https://www.openmaptiles.org/" target="_blank">&copy; OpenMapTiles</a> Data from <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>`.

Keep this attribution visible in the application and demo. Provider says MapLibre automatically adds its source attribution; verify this visually during implementation. OpenFreeMap branding is optional in provider docs, but the prompt explicitly requests OpenFreeMap/OpenMapTiles/OpenStreetMap attribution, so retain all three. MIT applies to project/style code, while OSM data retains its own licensing obligations. Basemap does not replace the required NYC building footprints layer.

**Current documentation corrections/changes:** Terms show **Last Updated: October 14, 2026**. They prohibit automated collection except the described offline-download exception, which allows each offline area download of at most **3,000 tiles or 50 MB**, at most **4** parallel requests, and a unique app User-Agent; larger downloads require contacting the provider. The current quickstart includes explicit Vite MapLibre worker setup (`setWorkerUrl` with worker URL import); confirm against chosen MapLibre version when implementing. Main docs state public service is free with no registration/API key and no request/view limits, but no SLA guarantee. This Phase 0 downloaded no tiles, glyphs, sprites, offline packages, or paid resources; end-to-end map rendering remains unverified.

### Terrain — VERIFIED_DOCUMENTATION_ONLY; deliberately skipped

- AWS Registry: https://registry.opendata.aws/terrain-tiles/ — official registry page reachable through the browser tool.
- Linked license/attribution: https://github.com/tilezen/joerd/blob/master/docs/attribution.md — reachable.
- Registry describes bare-earth terrain heights in S3 and delegates licensing to the linked attribution document. It does not justify one blanket unrestricted license for all source tiles.
- Per resolved prompt decision, no terrain rendering, tile request, bucket listing, download, or elevation score input was attempted. CRS/encoding/units of any particular tile and selected-source licensing remain UNVERIFIED and irrelevant to Tier 1. No terrain runtime classification should be claimed.

### Optional FloodNet — VERIFIED_RUNTIME metadata and historical event summaries

Official sources:

- Metadata: https://data.cityofnewyork.us/d/kb2e-tjy3
- Event summaries: https://data.cityofnewyork.us/d/aq7i-eu5q
- Source methods: https://www.floodnet.nyc/methodology

Official methods state per-minute readings feed their dashboard and complete per-minute measurements are available by request. The two Socrata datasets below do not establish unrestricted public access to live sensor readings. No dashboard scraping, request submission or contact message occurred. Keep optional FloodNet out of Tier 1 scope.

Runtime endpoints and measured sizes:

| Request | HTTP | Body bytes | Retrieved UTC |
|---|---:|---:|---|
| `/api/views/kb2e-tjy3.json` | 200 | 37,909 | 2026-10-16T03:56:30.422700Z |
| `/api/views/aq7i-eu5q.json` | 200 | 47,731 | 2026-10-16T03:56:30.480405Z |
| `/resource/kb2e-tjy3.json?$limit=5` | 200 | 3,078 | 2026-10-16T03:56:30.546866Z |
| `/resource/aq7i-eu5q.json?$limit=5` | 200 | 17,210 | 2026-10-16T03:56:43.951969Z |
| sensor projected extraction (`$select=sensor_id,borough,latitude,longitude,location,date_removed&$limit=1000`) | 200 | 90,906 | 2026-10-16T03:57:19.457915Z |
| event `$select=count(*)` | 200 | 19 | 2026-10-16T03:56:30.753945Z |
| event time/min/max/null aggregate | 200 | 248 | 2026-10-16T03:57:07.496272Z |

All Socrata URLs use origin `https://data.cityofnewyork.us`; exact encoded queries and HTTP headers are stored in `floodnet-*.request.json`.

#### Sensor metadata, `kb2e-tjy3`

- Dataset title: `FloodNet: Sensor Deployment Metadata`; metadata provenance `official`.
- Source rowsUpdatedAt: **2026-10-15T13:00:37Z**; metadata viewLastModified: **2026-10-15T13:00:04Z**. Update schedule says every two weeks, change frequency as needed.
- **491 citywide sensor deployment rows**, verified by complete compact extraction under the requested 1,000-row cap and consistent with metadata cached counts. **155** have exact `borough='Brooklyn'`; these are source-label counts, not a geometric boundary-clip result.
- **44** citywide and **14** Brooklyn rows have date_removed; the remaining **447** citywide and **141** Brooklyn rows have no removal date. Absence of removal does not prove a currently functioning sensor.
- Compact extraction: zero missing IDs, zero duplicate sensor IDs, zero missing location objects. All 491 location coordinates exactly match numeric longitude/latitude field values. This verifies point structure and plausible NYC degrees; do not use degrees for meter joins.
- String fields: `sensor_name`, `sensor_id`, `tidally_influenced`, `street_name`, `borough`, `zipcode`, `council_district`, `census_tract`, `nta`.
- calendar_date: `date_installed`, `date_removed` (JSON strings with no zone suffix).
- number columns: `community_board`, `latitude`, `longitude`, `lowest_point_height_delta_inches`; Socrata JSON serializes these number fields as strings.
- point: `location` -> GeoJSON `{type:'Point',coordinates:[longitude,latitude]}`.
- Auto-computed region columns exist and must not replace verified Brooklyn boundary geometry.
- Metadata cached null count: `date_removed` 447; `lowest_point_height_delta_inches` 1; other primary fields have zero cached nulls. The low-point delta is a sensor/local-low-point offset in inches, not basin elevation.
- First runtime sample: `BK-richardson-st-n-11th-st-1x59w1`, coordinates `[-73.952866,40.718566]`, borough `Brooklyn`, date_installed `2024-06-06T00:00:00.000`.

Five full sample rows measure 3,078 bytes; extrapolating their average to 491 rows estimates **302,259.6 bytes (~0.30 MB)** for full JSON rows. This is explicitly an estimate with sample bias; the 90,906-byte six-field compact extraction is measured.

#### Historical event summaries, `aq7i-eu5q`

- Dataset title: `FloodNet: Street Flooding Events Measured by FloodNet Sensors`; metadata provenance `official`.
- Source rowsUpdatedAt: **2026-10-15T13:00:23Z**; metadata viewLastModified: **2026-10-15T13:00:05Z**.
- **3,526 citywide events**, verified aggregate and matching metadata cached counts.
- Earliest event start **2020-11-16T01:41:17.000**; latest event end **2026-10-05T11:32:24.000**; documentation specifies GMT although Socrata floating timestamp strings omit offset. Do not reinterpret them in host local time.
- Fields `sensor_name`, `sensor_id`: text; `flood_start_time`, `flood_end_time`: calendar_date.
- Number columns (JSON strings): `max_depth_inches`, `onset_time_mins`, `drain_time_mins`, `duration_mins`, `duration_above_4_inches_mins`, `duration_above_12_inches_mins`, `duration_above_24_inches_mins`.
- `flood_profile_depth_inches` and `flood_profile_time_secs`: text containing JSON arrays (not native JSON arrays). Times are seconds relative to event start; depths inches. Do not assume consecutive/minutely sampling from the text arrays; inspect pairs.
- No borough or location geometry fields in event table. Associate by **sensor_id** to the verified sensor metadata and then use its borough/geometry. Do not infer borough solely from a name/ID prefix.
- Runtime aggregate confirms all 3,526 rows have sensor_id/start/end/max_depth/duration. Cached metadata shows one null drain_time_mins. Cached metadata also contains an implausible maximum onset_time_mins `1599336.5` while maximum duration is `4542.91`; do not blindly present all derived fields without consistency checks. This is observed metadata evidence, not an audited corrected event.
- Source description defines an event using water depth measurements greater than 10 mm and says reported events were human quality controlled. A summary is an OBSERVED historical event at the sensor location, not live boroughwide flooding or evidence that any specific drain is blocked.

Five complete event sample rows measure 17,210 bytes; naive average extrapolation to 3,526 rows estimates **12,136,492 bytes (~12.14 MB)** for all full rows. This is an estimate, especially sensitive to variable profile lengths. Do not download all profiles for the core demo; projected summaries can be much smaller.

Some optional requests returned server errors: sensor count HTTP 500 then 503; borough aggregate 503; per-sensor event-count aggregate 503; projected all-event IDs 503. Those particular queries remain UNVERIFIED, while successful dataset metadata/samples remain VERIFIED_RUNTIME. No source was silently replaced. The sensor total/borough counts are independently supported by complete compact extraction. A final bounded count request using the exact 155 verified Brooklyn sensor IDs returned HTTP 500 at 2026-10-16T03:58:41.662740Z; exact Brooklyn event-summary count remains UNVERIFIED. Live minute-by-minute API access is UNVERIFIED and not a Tier 1 blocker.

### Remaining implementation decisions / bounded risks

1. Select and document exact NWS complete-interval aggregation window, per-source normalization, staleness threshold, and missing-data behavior. No dataset provides a validated basin-level rainfall value.
2. Keep rainfall constant across Brooklyn if using this one representative point and disclose that this constant can change score magnitudes without changing relative rankings.
3. Verify OpenFreeMap tile/font/sprite/browser rendering and attribution only after Phase 1 approval. No paid/provider account is needed for the selected default.
4. Retain the terrain skip. Optional sensor rendering and live feed access remain outside Tier 1 and unapproved.
5. The optional API’s intermittent 500/503 responses require bounded retry/error indicators if it is ever approved; they do not prevent Tier 1.


---

## Durable Phase 0 request recipes

The exact public endpoint and decoded query parameters below preserve key requests independently of temporary sidecars. Encode parameter values when sending HTTP GETs. These are historical investigation recipes, not implemented ingestion. Source data may change when rerun.

### basins-counts

Endpoint: `https://data.cityofnewyork.us/resource/2w2g-fk3i.json`

```json
{
  "$select": "count(*) as total,count(the_geom) as geom_present,count(unitid) as id_present,count(distinct unitid) as distinct_ids,count(latitude) as lat_present,count(longitude) as lon_present"
}
```

### basins-boundary-bbox-count

Endpoint: `https://data.cityofnewyork.us/resource/2w2g-fk3i.json`

```json
{
  "$select": "count(*) as bbox_count",
  "$where": "within_box(the_geom,40.739127953134535,-74.04189660705046,40.569529993984325,-73.83355923946421)"
}
```

### basins-boundary-bbox-page1

Endpoint: `https://data.cityofnewyork.us/resource/2w2g-fk3i.json`

```json
{
  "$select": "unitid,the_geom",
  "$where": "within_box(the_geom,40.739127953134535,-74.04189660705046,40.569529993984325,-73.83355923946421)",
  "$order": "unitid",
  "$limit": "50000"
}
```

### basins-boundary-bbox-page2

Endpoint: `https://data.cityofnewyork.us/resource/2w2g-fk3i.json`

```json
{
  "$select": "unitid,the_geom",
  "$where": "within_box(the_geom,40.739127953134535,-74.04189660705046,40.569529993984325,-73.83355923946421)",
  "$order": "unitid",
  "$limit": "10000",
  "$offset": "50000"
}
```

### 311-drain-pairs

Endpoint: `https://data.cityofnewyork.us/resource/erm2-nwe9.json`

```json
{
  "$select": "complaint_type,descriptor,count(*) as n",
  "$where": "borough='BROOKLYN' AND created_date >= '2023-10-15T00:00:00' AND created_date < '2026-10-15T00:00:00' AND complaint_type in ('Sewer Maintenance','Sewer','Water System')",
  "$group": "complaint_type,descriptor",
  "$order": "n DESC",
  "$limit": "1000"
}
```

### 311-core-historical-records

Endpoint: `https://data.cityofnewyork.us/resource/erm2-nwe9.json`

```json
{
  "$select": "unique_key,created_date,complaint_type,descriptor,latitude,longitude,location",
  "$where": "borough='BROOKLYN' AND created_date >= '2023-10-15T00:00:00' AND created_date < '2026-10-15T00:00:00' AND ((complaint_type='Sewer' AND descriptor in ('Catch Basin Clogged/Flooding (Use Comments) (SC)','Sewer Backup (Use Comments) (SA)','Street Flooding (SJ)')) OR (complaint_type='Sewer Maintenance' AND descriptor in ('Catch Basin Clogged','Backup','Flooding on Street')))",
  "$order": "unique_key",
  "$limit": "25000"
}
```

### 311-core-historical-counts

Endpoint: `https://data.cityofnewyork.us/resource/erm2-nwe9.json`

```json
{
  "$select": "count(*) as total,count(distinct unique_key) as distinct_ids,count(latitude) as lat_present,count(longitude) as lon_present,count(location) as geom_present,count(complaint_type) as category_present,count(descriptor) as descriptor_present,min(latitude) as lat_min,max(latitude) as lat_max,min(longitude) as lon_min,max(longitude) as lon_max",
  "$where": "borough='BROOKLYN' AND created_date >= '2023-10-15T00:00:00' AND created_date < '2026-10-15T00:00:00' AND ((complaint_type='Sewer' AND descriptor in ('Catch Basin Clogged/Flooding (Use Comments) (SC)','Sewer Backup (Use Comments) (SA)','Street Flooding (SJ)')) OR (complaint_type='Sewer Maintenance' AND descriptor in ('Catch Basin Clogged','Backup','Flooding on Street')))"
}
```

### 311-core-recent-counts

Endpoint: `https://data.cityofnewyork.us/resource/erm2-nwe9.json`

```json
{
  "$select": "count(*) as total,count(distinct unique_key) as distinct_ids,count(latitude) as lat_present,count(longitude) as lon_present,count(location) as geom_present,count(complaint_type) as category_present,count(descriptor) as descriptor_present,min(latitude) as lat_min,max(latitude) as lat_max,min(longitude) as lon_min,max(longitude) as lon_max",
  "$where": "borough='BROOKLYN' AND created_date >= '2026-10-08T00:00:00' AND created_date < '2026-10-15T00:00:00' AND ((complaint_type='Sewer' AND descriptor in ('Catch Basin Clogged/Flooding (Use Comments) (SC)','Sewer Backup (Use Comments) (SA)','Street Flooding (SJ)')) OR (complaint_type='Sewer Maintenance' AND descriptor in ('Catch Basin Clogged','Backup','Flooding on Street')))"
}
```
