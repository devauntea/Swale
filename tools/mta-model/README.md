# Brooklyn subway schematic model

This is a bounded static infrastructure illustration integrated into Swale's existing
map. It is not a surveyed digital twin, engineering model, navigation system, live
camera, train-position feed, or flood simulation. Backend live coverage remains the
existing fifteen supported station identities; static geometry covers Brooklyn.

The complete implementation is `build_brooklyn_mta.py`. It does not import private
project modules or application code, write application records, access a database,
load dotenv, use credentials, or create a live data collector. S7 buildings and S8
secondary GTFS remain disabled. Their CLI flags are preserved and fail explicitly
before acquisition rather than silently acquiring optional data.

## Isolated environment and executed build

Tested Python 3.13.5 on macOS arm64. All packages came from official PyPI binary
wheels with no source builds or install scripts. The isolated environment is outside
both the backend and source checkout. `requirements.lock` includes all eleven exact
package versions and SHA-256 hashes for the tested wheels. `requirements.txt` is the
portable exact-version list for other supported wheel platforms; a different
platform needs its own reviewed wheel hashes. No application package was upgraded.

```sh
cd /Users/kerwynjean/Swale-subway-3d
python3 -m venv /Users/kerwynjean/.local/share/swale-local/subway-3d/venv
/Users/kerwynjean/.local/share/swale-local/subway-3d/venv/bin/python -m pip install --only-binary=:all: --require-hashes -r tools/mta-model/requirements.lock

# Network acquisition is bounded to the approved public S1–S6 sources.
/Users/kerwynjean/.local/share/swale-local/subway-3d/venv/bin/python tools/mta-model/build_brooklyn_mta.py --data-dir /Users/kerwynjean/.local/share/swale-local/subway-3d/data --output-dir tools/mta-model/output --publish-dir frontend/public/infrastructure

# Executed final cached rebuild, including two-build determinism verification.
/Users/kerwynjean/.local/share/swale-local/subway-3d/venv/bin/python tools/mta-model/build_brooklyn_mta.py --data-dir /Users/kerwynjean/.local/share/swale-local/subway-3d/data --output-dir tools/mta-model/output --offline --verify --publish-dir frontend/public/infrastructure

/Users/kerwynjean/.local/share/swale-local/subway-3d/venv/bin/python -m unittest discover -s tools/mta-model -p 'test_*.py' -v
```

The original CLI is retained: `--data-dir ./data`, `--with-buildings`,
`--with-secondary`, and `--level-height 6.0`. Added controls include `--output-dir`,
`--offline`, `--verify`, `--publish-dir`, `--no-dem`, `--dem-budget-mb`, and an explicitly
partial `--stations F21 F22` renderer-checkpoint mode. A partial build is not the
borough deliverable. Source absence follows the owner's degradation rules; S1/S5
absence blocks their required outputs, never a fabricated alignment or rectangle.

Packages serve these purposes: Shapely clips footprints and tests topology;
pyproj transforms EPSG:4326/2263/6539 with CRS-derived US-foot conversion; NumPy
creates deterministic numeric buffers; Rasterio reads official DEM header/windows;
Trimesh independently reloads GLB. Remaining packages are pinned transitive binary
wheel dependencies. GeoPandas/Pandas and compression packages were unnecessary.

## Outputs and serving

The ignored `tools/mta-model/output/` directory contains D1–D7:
`brooklyn_mta.glb`, supplementary `index.html` and local `assets/`, `data_manifest.json`,
`assumptions.md`, `level_map.csv`, `qa_report.json`, `qa_report.md`, and `README.md`.
The single-file builder is D3 at the path above. Also generated are
`identity_crosswalk.json`, `spatial_index.json`, `route_coverage.json`,
`entrance_inventory.json`, `index.json`, and `stations/*.json` detail chunks.

The supplementary viewer has its own pinned local Three.js build under `viewer/`;
see that directory's build instructions. Serve the output via ordinary local HTTP:

```sh
cd /Users/kerwynjean/Swale-subway-3d/tools/mta-model/output
python3 -m http.server 8783 --bind 127.0.0.1
```

Open `http://127.0.0.1:8783/`; stop this supplementary viewer with Ctrl+C after
inspection. Swale's primary integrated preview is `http://127.0.0.1:5183/`. The full
GLB is never an initial Swale download. Only intentional bounded distributable
index/crosswalk/station chunks live in `frontend/public/infrastructure/`; raw
sources, byte ranges and full exports remain outside tracked source or ignored.

## Data provenance and source limitations

S1 NYC OTI/DCP Subway Lines: the publisher describes a representative single-line
network, not individual rails. All 5,805 service object IDs were reconciled against
ordered 500-row pages, with no duplicates or truncation. Brooklyn clipping includes
2,075 source parts, keyed by SEGMENTID/ROW rather than export order. The service's
RAIL_TYPE domain is contradictory (a different railway domain); the publisher's
2026-01-27 SubwayLines metadata explicitly defines 1=Subway and governs filtering.
Level domains absent from service fields are decoded from that metadata.
CREATED_BY/MODIFIED_BY are excluded from acquisition pages and distribution.

S2 MTA regular subway GTFS URL: all 257 trip-associated route/shape branches are
accounted for; no single-shape-per-route shortcut. Exact feed_info validity/version
is in the manifest and is distinct from current operations and backend schedule
validity. Route tubes match only within 25m of supported S1 source context; no
unsupported/disconnected run is bridged. Identical effective geometry/material
may be deduplicated while retaining every source association. Unsupported runs
remain in route_coverage.json and keep I7 FAIL where applicable. Missing colors
use logged #808080; GTFS source colors stay in GLB/viewer while Swale remaps its
owned rendering to blue/black/white. Shared short label S is ambiguous across GTFS
GS/FS/H; unique source physical-line context resolves Franklin to actual route_id FS,
and ambiguous contexts fail closed instead of citing a nonexistent S route record.

S3 MTA 39hk-dx4f: 169 eligible Brooklyn GTFS station identities, complex membership,
source positions, per-station structures and routes are retained. S1 alignment and
vertical class have priority over coarser S3 structure. Near matches corroborated
by physical-line context retain explicit source conflicts, including Brighton
Open Cut versus S1 Embankment/Elevated and Bergen's contradictory source route
attribute. These are inferred associations, not amended source records. No name
matching or direction-suffix stripping is used for backend identity. Every current
model pick is validated against the live inventory's exact gtfs_stop_id; unsupported
stations remain geometry-only.

S4 MTA i9wp-a4ja is the 2024 static edition, uploaded in December 2025, not a fresh
entrance survey. 580 eligible entrances are retained. 577 have exact S3 GTFS,
station-ID and complex-ID joins. Three conflicting source relationships are retained
unmatched with reasons; no connector is invented for them. Markers preserve source
coordinates; connectors are generated vertical/lateral associations, not stairs,
accessibility paths or evacuation routes.

S5 DCP's actual water-included Brooklyn administrative polygon bounds the export;
no guessed shoreline or 50m expanded coverage. Source geometry is retained.
Generated mesh footprints use a documented 20mm inward quantization margin before
float32 local-frame storage, and exact final-world-space vertices are tested against
B separately from the requested 50m diagnostic. Source line XY is not moved.

S6 NOAA NYC 2017 bare-earth topobathymetry: official VRT catalogue and TIFF headers
verified EPSG:6539, US survey feet, NAVD88 metadata, actual nodata and overviews.
Only intersecting source corridor cells are read. A native-pixel attempt was bounded
at 255,861,396 received bytes and retained as historical evidence. The improved
30m-footprint averaged overview read acquired 5,903,058 additional bytes, yielding
all 4,450 requested corridor cells from six official TIFFs. Combined actual bytes:
261,764,454, not the 20GB archive. No borough full-resolution mosaic was made.
Each Range is status206 with exact Content-Range/content length and actual received
hash; ignored Range responses are rejected before reading their body. Cached byte
ranges and derived samples validate stored checksums and source fingerprints.
The range receipt never claims a hash of a remote whole TIFF. Missing off-corridor
reference cells remain null in metadata and explicitly use a flat G=0 rendering
assumption; actual mesh/cell misses keep absolute-ground checks NOT_RUN. Bare earth
can represent bathymetric bottom and is not automatically street grade.

Input URLs, bytes, hashes, source vintages, schemas, CRS/units, publisher attribution,
terms and usage are in `data_manifest.json`; raw acquisition times remain in the
external `data/acquisition.json` so they cannot perturb canonical deterministic
GLB or semantic-index bytes. Public access does not imply an invented open-source
license. The read-only existing local backend station snapshot has its own hash
and URL receipt; the builder never reads or mutates the application database.

## Vertical and rendering model

EPSG:2263 processing feet are converted using the CRS unit conversion. The origin
is B's centroid rounded to 100m. GLB meters use +X east, +Y up, +Z south, a rotation
without reflection. Canonical unexaggerated Z=G+6*l+c uses source relative levels;
c=0 because A1/A2 precise physical reference semantics remain unsupported. Smith–9
Sts' official nearly-90ft context does not justify a precise 26.7m platform pin against
NOAA bare earth. Atlantic Av–Barclays' -15.8m reference lacks a supported specific
platform/reference. Both calibration subchecks remain NOT_RUN.

Tunnel centerline ±3m, elevated deck top, platform surface and entrance reference
are explicit. Widths, 150×10m platform, route tube radius1m, display offset2.5m and
30m illustrative piers are schematic assumptions, not observed members/counts.
Source XY and compatible endpoints are preserved. Source-level interpolation is
computed along original cumulative distance before clipping. Planar crossings do
not create connections; grade separation/gaps remain. Zero smoothing passes retain
linear source-level interpolation; every remaining gradient>0.08 is logged as a
violation, not engineering-safe. I4 remains FAIL when those violations remain.

The current map is flat and consumes surface-relative Z, not absolute NAVD88.
The standalone GLB retains canonical heights and per-vertex _REFERENCE_ELEVATION;
viewer exaggeration1x–5x (default2x) applies around that reference, not absolute
altitude. Source elevations, map flattening, model vintage and live freshness remain
separate. Every generated mesh carries source/assumption/confidence metadata;
per-mesh source-reference coverage counts distinguish sampled from flat fallbacks.

## Resource and QA scope

No buildings/secondary inputs are enabled. Full GLB is below the decimal50MB budget,
without compression/decoder dependencies. GLB decoded vertices/triangles and
independent-reader checks are recorded separately from disk bytes. In-map limits:
2MB per chunk, four chunks/8MB decoded estimate, two concurrent requests, abort and
stale-selection guards. Only selected-station detail loads on demand.

`qa_report.json` records all I1–I14 with PASS/FAIL/NOT_RUN, exact counts, missing IDs,
source conflicts, gradients, route gaps, reload/transform residuals, and two-build
hashes. Model tests cover archive traversal/symlinks, exact TLS host allowlists,
byte budgets, ignored Range rejection before body read, corrupted caches, vertical
codes, original-segment clipping interpolation, known structure/route filtering,
20m densification, GLB axes/reflection/reference attributes, invalid geometry,
and clipped polygon holes. Root feature verification supplies browser-loader,
interaction, backend identity, lifecycle, regression and compositor evidence; file
creation alone cannot certify them. A1/A2 and optional S7/S8 are deliberately NOT_RUN.
