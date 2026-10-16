# Detailed entrances and illustrative flood what-if — October 16, 2026

**COMPLETE for the bounded local frontend increment; station hydraulics remain unvalidated.**
Read this section before the historical candidate below. Source-linked entrance
inspection, detailed stairs and explicit local hypothetical water work in the
existing map. Current interior water remains unknown. No backend simulation runs,
new data acquisition, external-data or operational network clients, database access,
credentials or publication
were introduced by this increment.

Feature root: `/Users/kerwynjean/Swale-subway-3d`, branch
`feat/subway-infrastructure-3d`. Starting HEAD was
`326b294e7e965eabcea421ed8a53fd3e3e40cbed`. Implementation commits:
`f7fa014c6bc72c16ddb89e135f8bc87d48befe44` (entrance/model/UI),
`b0ac196a971dd198983e98df77f831f2fb61c915` (Surface visibility), and
**`74f56d04f96331c43b9d70d362d892860418a7d6`** (verified final executable code).
The following documentation-only commit records this acceptance. Main remains
`4db8f26b3298ff917987953b9ca1432e4efed106`; its unrelated preparation note and
editor files are preserved. No merge, push, PR or deployment occurred. Contract
status remains **PROPOSED — NOT YET AGREED WITH BACKEND TEAM**.

Detailed source/assumption mapping, reference-image comparison, geometry recipe,
pre-implementation equations, units, bounds, numerical tolerance and future inputs
are in [STATION_FLOOD_WHAT_IF.md](STATION_FLOOD_WHAT_IF.md). Fresh automated and
browser measurements are also recorded in
[frontend/VERIFICATION.md](../frontend/VERIFICATION.md).

## E1–E12 acceptance

PASS is scoped to the concrete checks described; unperformed subchecks are explicit.
Actual browser observations and mocked failure tests are different evidence.

| Check | Status | Evidence and limits |
| --- | --- | --- |
| E1 Recognizable entrance | PASS | Actual F21 `row-y4aj-tepy-nbif` view shows the opening, sidewalk collar, enclosure/posts/bars, sign, globes and landing. Source ID/type/point remain visible in the inspector. `f21-street-before.jpg` / `f21-street-after.jpg`. |
| E2 Stair detail | PASS | Actual browser shows 34 separate tread/riser faces, both flights, continuous rails and coherent switchback/bottom landings, tile/support/light context. Vertical posts were corrected to solid XYZ faces after an observed rendering defect. References A/B/C informed original schematic forms, not surveyed fidelity or copied station imagery. Staircase before/after and both themes captured. |
| E3 Geography and type | PASS | Exact source IDs/points/joins tested and catalog deterministically reproduced. 580 records, 577 validated joins, three unmatched retained. F21 Stair and F22 Station House inspected; F22 remains Station House with assumed upward access and unresolved canonical continuation. Elevator/escalator/easement/unknown templates fail closed. No canonical assets changed. |
| E4 Evidence separation | PASS | Current view explicitly says interior water is not measured; source/feed/refresh clocks are separate from elapsed scenario time. Browser run/reset/comparison retained the independent live board. Tests prevent alert/exposure/history from creating water, changing operational status or borrowing another identity. |
| E5 Calculation | PASS | 16 numerical tests cover zero supply/storage, barrier threshold, positive inflow, bounded removal, closed/disconnected spaces, overflow, nonnegative volumes, parameter/work bounds, balanced transfers, uphill equalization and resets. Worst tested conservation residual <6.35e−12 m³; declared tolerance is 1e−8 m³ + 1e−10 of supplied/initial volume. Refinement maximum final-compartment difference 0.0134 m³ meets 2%/0.02 m³ criterion. This is software conservation, not physical validation. |
| E6 Time and units | PASS | Deterministic fixed 1 s trajectories and 0.5 s refinement; exact SI conversions tested. Browser Pause/Home/End, speed, comparison and 1×→5×→1× display changes preserve corresponding physical values. Input/entrance/station changes invalidate the trajectory. |
| E7 Water interaction | PASS | Actual F21 view shows bounded prescribed street ponding, threshold overtopping/down-stair transfer, computed wet tread portions, landing/room accumulation and depth ruler. Baseline hides water while retaining values; reset removes it. F22 600 s control leaves upper landing 0 L and has no platform compartment or enabled uphill transfer. Water is clipped to local footprints. X-ray is labelled; Surface explicitly omits below-reference detail because flat road artwork is not a complete depth mask. |
| E8 Evidence/susceptibility | PASS | Actual F21 supplied exposure 27.2/100, medium, method `station-exposure-v1`, assessed/source times and missing factors remain inferred and qualified. No distinct long-term station flood-event history or interior sensor depth was available. Sensor/report associations retain location/time/distance and reported-versus-measured meaning where supplied. No invented higher score, probability, usual-flooding, closure or safe-route claim. |
| E9 Identity/failures | PASS | Actual F21/F22 identity and geometry-only D43 inspected without borrowed board/history. Generation guards, late responses, failures, missing/stale states, asset retry and reset have meaningful isolated tests; original actual index-404 recovery remains historical. New same-tab backend outage, catalog-404 and driver/context-loss browser experiments: NOT_RUN. |
| E10 Journey/accessibility | PASS | Actual pointer station-list selection → Explore → source entrance → staircase/map-component pick → explicit Run/Pause/scrub → water/comparison/reset/current evidence. A→B→A source selection retains focus and clears old scenario. Keyboard Escape/focus return, reduced-motion camera, tablet 768×1024 and mobile 390×844 controls/planning drawer observed. Both themes and persisted startup choices observed. Fresh-storage startup: NOT_RUN (unit default-light tests pass). No continuous recording. |
| E11 Lifecycle/performance | PASS | One actual canvas, existing map/overlay and polling owner retained; cancellation/hidden/unmount/cache-boundary tests pass. Three final assistant open/Escape cycles each retained one canvas, exact entrance, paused600 s and focus return. Final production native sample: 35 unique DrawFrame sequences /650 ms = 53.8462/s with active water; median gap 15.740 ms, p95 33.0577 ms, max81.406 ms, one >50 ms. Initial app transfer835,899 B, zero initial infrastructure assets. Earlier b0ac sample29.2308/s FAIL retained below. Quantitative repeated-explorer resource growth, actual GPU memory, physical display cadence and contemporaneous native viewport proof: NOT_RUN. |
| E12 Regression/scope | PASS | 245 frontend tests/26 files, strict TypeScript, production build, lint, formatting, 19 offline model/publication tests, catalog reproduction and installed-dependency checks pass. Baseline coverage retained. Main/backend/runtime helpers/proxy/dependencies/lockfiles/canonical assets and DB ownership unchanged; no DB opened or backend/helper suite rerun. No remote write or credential operation. Original I-series failures remain below. |

## Observed results and performance boundaries

Default F21 600 s illustration uses street depth0.35 m, barrier0.10 m, supply20 L/s,
removal2 L/s. Ledger: supplied12,000 L, removed1,200 L, overflow0 L, stored10,800 L;
displayed stairwell1,866 L/0.87 m, landing3,039 L/0.79 m and local room5,895 L/0.20 m
are rounded values from that hypothetical trajectory. Increasing the assumed
barrier to0.50 m invalidates the old result and a new run admits no water.
F22's default upward-access control stores about118 L in reachable low access steps,
zero in the upper landing and no water in the unreachable elevated platform.
None of these numbers describes present station conditions or a filling prediction.

Native EventTiming single samples to subsequent presentation: Run48.388 ms,
stairwell camera46.365 ms, theme124.727 ms, assistant opening39.614 ms. These are
response samples, not full animation durations. Native compositor handler-end
window sensitivity was52.3077/s. The primary dispatch-start650 ms window is used
for the target. No rAF counter substitutes for native DrawFrame evidence.

The b0ac production sample remains **FAIL:29.2308/s**, max gap126.358 ms. Static
face/path/sign arrays were then weakly cached by immutable geometry/mode and the
fixed timestamp formatter reused. The final capture measured the resulting bytes;
older passing traces were not substituted. The final representative target passes,
with the81.406 ms gap retained as observed stutter rather than a universal guarantee.

Initial production application traffic:835,899 transferred /832,299 encoded /
3,047,379 decoded bytes,12 requests including document and worker; API0 during
that initial fixture observation. Generated infrastructure asset requests:0.
Geometry/model/control code is initial JavaScript; renderer/catalog/chunks load
on exploration. On-demand detail and API traffic are separate from this initial
budget; final optimized detail/API wire totals are **NOT_RUN**. Basemap:7 observed
requests, wire bytes **UNKNOWN** because cross-origin resource timings expose zero
sizes without transfer visibility. Resource observation CSS1636×896,DPR2.2 is
separate from native compositor viewport evidence. No actual GPU-memory claim.

Evidence lives locally in ignored `frontend/verification-artifacts/entrance/`.
Final trace `optimized-native-trace.json` SHA-256
`b720b96513b2f3c63a55698fc9bbd9b71948de1f9bdc28f3639dab952b0949df`;
analysis `optimized-native-trace-analysis.json` SHA-256
`f2e0e21854632ce2a1783b5f234c572ee3cfb38e22de03fb2ba4d51b4b2b1dc3`.
`optimized-initial-resource-timing.json` retains raw initial timings.
Screenshots: street `f21-street-before.jpg`/`f21-street-after.jpg`; staircase
`f21-staircase-before.jpg`/`f21-staircase-after.jpg`; final optimized dark comparison
`optimized-staircase-baseline-dark.jpg`/`optimized-staircase-after-dark.jpg`;
elevated control `f22-elevated-before.jpg`/`f22-elevated-after.jpg`; fresh Surface
`f21-surface-corrected.jpg`; final preview `feature-preview-handoff.jpg`.
Earlier defect/performance screenshots/traces remain intact. Final console query
returned `[]`, with capture completeness unestablished. The owned font warning was
fixed and reobserved; historical Liberty sprite/filter evidence remains historical,
not a new all-resource PASS.

## Reproduction, runtime and three-minute demo

Source roots are `frontend/src/infrastructure/`, `frontend/src/map/`, their focused
tests, `frontend/public/infrastructure/entrance-details.json` and the cached-only
publisher under `tools/mta-model/`. No new dependency/install was needed. Existing
deck.gl9.4.0, MapLibre6.14.0 and React19.3.1 pass `npm ls`; the pre-existing
`frontend/node_modules` symlink to main's installed packages is preserved.

```sh
cd /Users/kerwynjean/Swale-subway-3d/frontend
npm test
npm run typecheck
npm run lint
npm run build
npm run format:check
npm ls @deck.gl/core @deck.gl/layers @deck.gl/maplibre maplibre-gl react react-dom
cd /Users/kerwynjean/Swale-subway-3d
/Users/kerwynjean/.local/share/swale-local/subway-3d/venv/bin/python -m unittest discover -s tools/mta-model -p 'test_*.py' -v
python3 tools/mta-model/publish_entrance_details.py --check
```

Final requested preview: **http://127.0.0.1:5183/**, existing feature Vite PID14692,
cwd `/Users/kerwynjean/Swale-subway-3d/frontend`. It is left light theme, F21
`row-y4aj-tepy-nbif`, Stairwell, X-ray1×, default600 s hypothetical water **PAUSED**
and explicitly labelled. Live transit updates remain independently stoppable by
**Pause transit updates**. Restart only after checking listener/process ownership:

```sh
cd /Users/kerwynjean/Swale-subway-3d/frontend
npm run dev -- --port 5183
```

Stop that frontend with Ctrl-C in its owning terminal, or after verifying PID/cwd,
`kill -INT 14692`. Do not stop main's backend for frontend cleanup. Existing main
controller5374, broker5376(port8001), backend5377(port8000) retain their main-root
commands. The DB at `/Users/kerwynjean/Swale-integration/backend/var/local-transit-c65f03b.db`
was never opened by feature work; ordinary existing monitoring behavior continues.
Temporary production preview PID30507 on4183 was identity-checked, stopped, and
listener absence verified. Production QA tab closed; tracing streams closed,
cache/media/viewport overrides restored. No injected application instrumentation.

Three-minute local walkthrough: first40 s reset to Current evidence and inspect
source identity/unknown interior water; next40 s use Entrance/Stairwell/Landing and
Surface/X-ray while explaining assumed dimensions; next60 s open What-if, show
bounded units/defaults, Run/Pause/scrub and compare baseline/scenario; next20 s
review the independent live/exposure clocks; final20 s inspect F22's upward control
or return to F21 with playback paused. This script is prepared; continuous recording
was **NOT_RUN**.

Current task clock observations began16:54:59Z and reached17:28:26Z October16.
These are wall-clock observations, not reconstructed active history; prior cumulative
active duration remains unmeasured and the original work budget was not reset.

## Preserved inherited limits

Canonical GLB28,110,124 B SHA-256
`8dc6ce85cc166c68ecbefa64cd6af2405ea2ff6a768f5a9e09e89ee7edae34a1`;
public index178,759 B SHA-256
`564ac940440cc4d6c9b430b0cd904a261d9e339e3962498920ea08b815d7571c`;
original QA JSON815,181 B SHA-256
`57339c21d0ae75e2f75f8970486fad32ac20f96145868b5a4bb8966fefbaadb2`.
Additive catalog116,978 B SHA-256
`ce0872becb0f5a9588659d35e2c3f64bb78377251a370301a4b884632611f35a`.
Original chunks and I1–I14 evidence remain unchanged. I4 FAIL614 gradients,
I7 FAIL79 route associations with unsupported runs,1,447 off-corridor missing ground
cells, uncalibrated A1/A2 NOT_RUN, assumed dimensions/levels and three unmatched
entrances persist. None is used as a hidden flood-routing network. Current interior
depths and adequate station-event history remain unavailable. Future validated
hydraulics needs surveyed thresholds/interiors, boundary conditions, drainage/
pumping/connections and calibration evidence; that backend work is deferred.

---

# Historical subway infrastructure candidate — October 16, 2026

**CONDITIONAL — working local in-map feature; explicit model/source limitations remain.**
Read this handoff before older integration reports. This feature is on
`feat/subway-infrastructure-3d` in `/Users/kerwynjean/Swale-subway-3d`, separate from
published main. Implementation milestone: `6b6265e58a5c36725821cf627622935a590b21a5`.
The subsequent documentation commit records this report; read Git for its exact HEAD.

Fresh read-only fetch established base/main/origin/main
`4db8f26b3298ff917987953b9ca1432e4efed106`. That base is an ancestor of the feature.
Main's unrelated preparation note/editor state, all other worktrees and backup refs
are preserved. Backend production source, schemas, dependencies, parser, runtime
helpers, Vite proxy/dotenv policy and existing schedule are unchanged. No merge,
push, PR, deployment, hosting or credential operation occurred. Normal existing live
API cache/history writes remain permitted; the geometry builder never opens a DB.
The historical contract remains **PROPOSED — NOT YET AGREED WITH BACKEND TEAM**.

The owner-authorized feature scope supersedes older standalone/subway prohibitions
within this task. S7/S8 were not enabled. Source downloads ran separately from the
live broker; the browser reads only local generated geometry, the existing guarded
API and approved basemap. First explicit task clock sample was 16:14:03Z; later
checkpoint 16:36:06Z and final boundary sample 16:40:00Z. These are wall-clock observations, not reconstructed active
history. Prior cumulative duration remains unmeasured; the original budget was not reset.

## What works

The existing station inspector exposes Explore infrastructure; subway controls also
expose Browse infrastructure. One MapLibre 6.14 map and one interleaved deck.gl 9.4
MapLibreOverlay render selected-station detail. No second in-app map, Deck, canvas,
camera controller or OrbitControls exists. Existing Path/Polygon/Scatterplot layers
satisfied verified visibility and picking; no mesh-layer dependency was needed.

X-ray renders actual negative surface-relative heights after basemap layers with
per-layer depth comparison bypass and no depth writes. Surface restores ordinary
occlusion; no physical ground cutout is claimed. Close zoom up to 22, ordinary zoom
controls, entrance fitting, structure/route/platform/entrance controls, 1×–5×
exaggeration(default 2×), per-component picking and previous-map restoration work.
Themes restyle the same map; detail code/index/chunk are lazy-loaded on exploration.
Loading/error states retain controls; Escape and focus return remain usable.

Static 169-station geometry is distinct from the backend's 15 supported identities.
Exact GTFS+opaque backend identity and applicable complex membership bind model
selection to the existing inspector/live board. Names and direction suffixes are
not identity substitutes. Geometry-only stations have a separate inspector with no
prior station's board. The existing polling hook/cadence remains the sole owner;
unsupported model camera movement holds supported backend bounds. Source/model/
backend coordinates remain separate. Stale responses and cited evidence clear on
station changes. No new endpoint, direct MTA/NWS client, scoring or simulation exists.

## Source model and artifacts

Full canonical export: `tools/mta-model/output/brooklyn_mta.glb`, **28,110,124 bytes**,
SHA-256 `8dc6ce85cc166c68ecbefa64cd6af2405ea2ff6a768f5a9e09e89ee7edae34a1`.
Semantic index SHA-256:
`564ac940440cc4d6c9b430b0cd904a261d9e339e3962498920ea08b815d7571c`.
Two cached full builds match; a subsequent independent station build matches every
final chunk after resolving the ambiguous GTFS short labelS through physical-line
context to exact route_idFS. Generic/ambiguousS fails closed.

The output directory physically retains D1–D7: GLB; index.html/local viewer assets;
byte-identical single-file builder copy; data_manifest.json; assumptions.md and
level_map.csv; qa_report.json/md; README.md. Additional outputs include spatial
index, crosswalk, route coverage and entrance inventory. Full exports/raw sources
are ignored/local. Tracked distributable index/crosswalk/169chunks total
**3,168,466 bytes**; largest chunk 166,764 bytes. Full GLB is never an app startup download.
Source builder/tests/locked requirements and viewer source are under `tools/mta-model/`.

Counts: 2,075 Brooklyn source alignment parts; 169 canonical stations / 169 illustrative
platforms / 169 chunks;580 eligible entrances, 577 validated relationships and 3 explicit
unmatched source relationships;257 total route/shape associations, 184 Brooklyn-eligible
shapes across 20 source route IDs. No eligible association is wholly omitted; 79 have
unsupported runs, retained in diagnostics. Generated footprints/dimensions are assumptions.

| S1 ROW type | Source parts |
| --- | ---: |
| 1 Subterranean | 1,264 |
| 2 Elevated | 603 |
| 3 Surface | 34 |
| 4 Hidden / uncertain representation | 20 |
| 5 Open cut | 72 |
| 6 Embankment | 40 |
| 7 Viaduct | 12 |
| 8 Subterranean coincident with boundary | 30 |

S1 paged 5,805 service IDs with reconciliation. S3 source station identities/positions
and complex membership remain authoritative; close S1/S3 route/structure conflicts
are recorded as inferred associations with S1 vertical-class priority. S4 remains
the 2024 entrance edition, not a new survey. S5 is the actual water-included Brooklyn
polygon. Every final float32 vertex lies within its exact boundary; 50 m diagnostic
is separate. Original source XY is preserved; generated footprints use a disclosed
20 mm inward quantization margin, never an expanded borough.

S2 came from the regular feed URL; actual feed_version is
`20260826-X-long-term-supplement-trip-ids`, feed validity May 26–October 31, 2026.
That static geometry vintage does not establish current operations. The backend's
reviewed operational schedule remains October 16–23, 2026; live feed clocks are separate.

S6 sampled 4,450 corridor cells at 30 m from six official TIFFs, with verified EPSG:6539,
US survey-foot units, NAVD88 metadata and existing raster overviews. The first bounded
native-read attempt received 255,861,396 bytes; improved overview reads added 5,903,058,
combined 261,764,454 model range bytes (initial probe/metadata are separately receipted).
No whole archive or native-resolution borough mosaic was downloaded. Every range
checks 206/content range/length and cached hashes; ignored Range bodies are rejected.
Derived samples validate hash/input fingerprint. **1,447 queried off-corridor reference
cells remain missing**, retaining null metadata and an explicitly assumed flat G=0
preview where needed. Bare earth/bathymetric bottom is not automatically street grade.

Processing EPSG:2263 uses CRS-derived US-foot conversion; origin [304200, 51900] m is
Brooklyn's rounded centroid. GLB +X east/+Y up/+Z south uses meters; canonical Z=G+6*l+c,
c=0. The flat map consumes surface-relativeZ; it does not paste NAVD88 into the zero
plane. Exaggeration acts onZ-G; entrances remain on the reference surface. Maximum
local float32 XY residual 0.000491528 m and chunk projection/rounding residual 0.000069730 m
are numerical transform checks, not source survey accuracy.

A1 +26.7 m is **NOT_RUN**, uncalibrated: the official NYSenate/MTA announcement supplies
nearly 90 ft context without precise platform/rail/reference-surface semantics against
NOAA ground. A2 -15.8 m is **NOT_RUN**, with no supported specific Atlantic platform/
height reference. No substitute numerical pin/residual was invented. Relative levels,
platform 150×10 m, tunnel 8×6 m, piers 30 m apart, dimensions and connectors remain schematic.

## I1–I14 acceptance

`output/model_qa_report.json` preserves builder-only QA. Root's same-hash
`output/qa_report.json/md` adds actual integration evidence below. Rebuilding resets
model-only checks; it must not automatically inherit browser acceptance for new assets.

| Check | Status | Evidence |
| --- | --- | --- |
| I1 Boundary | PASS | 508,843 final world-space vertices; 0 exact outside, 0 outside 50 m diagnostic. |
| I2 Stations | PASS | 169 eligible S3 IDs, 169 semantic records/platforms/chunks; 0 missing/unresolved. |
| I3 Vertical class | PASS | 0 schematic sign/envelope violations; absolute-ground subcheck NOT_RUN for missing reference cells. |
| I4 Gradients/topology | FAIL | 614 edges >0.08 retained with reasons; 0 smoothing passes, sourceXY/compatible endpoints preserved. |
| I5 Anchors | NOT_RUN | A1/A2 precise physical references unsupported; no fitted accuracy claim. |
| I6 Geometry/reload | PASS | 6,345 meshes / 517,611 triangles; independent Trimesh+browser GLTFLoader; official validator 0 errors / 0 warnings. |
| I7 Routes/colors | FAIL | All 257 associations accounted;184 Brooklyn shapes, 79 with unsupported runs; 0 wholly omitted; source colors/FS identity retained. |
| I8 Provenance | PASS | 30 input receipts, actual hashes/units/editions/usage and source/assumption/confidence metadata; volatile acquisition times separate. |
| I9 Entrances | PASS | 577 exact joins; 3 explicit unmatched with reasons; schematic connectors preserve source points. |
| I10 Determinism | PASS | Two full cached GLB/index hashes match; all 169 final chunks independently reproduced. |
| I11 Backend identity | PASS | Actual F21/F22 exact identity/live board;D43 geometry-only, no prior board; stale/evidence regressions pass. |
| I12 User journey | PASS | Genuine station/platform/entrance/segment picks; Explore/X-ray/fit/Return; keyboard/reduced motion observed. |
| I13 Lifecycle/failures | PASS | One canvas; in-place themes; real same-tab asset404/Retry; cache/cancellation/context-retry tests. |
| I14 Regressions/performance | PASS | 188 frontend tests,16 model tests, strictTS/build/lint/format;822 KB initial app; representative 69.23 compositor frames/s. |

I4 includes source relative-level transitions, sampled 2017 surface variation and
missing-reference flat-fallback discontinuities. Those diagnostics are not certified
engineering grades. I7 failures remain honest incomplete matching, never invisible
invented bridges. I13 actual driver context loss and same-tab backend outage recovery
were **NOT_RUN**; context retry uses meaningful map doubles, while real same-tab
recovery below concerns static assets. No exhaustive device/accessibility certification.

## Actual browser and performance evidence

Original authorized Chrome connection; no permission denial or alternate surface.
Production 4183 first showed visible missing-index HTTP 404. Publishing local assets
then Retry recovered in that same mounted tab without reload/backend restart.

Ordinary station pointer 463,453 selected Carroll F21 after clearing the inspector;
Explore opened its underground X-ray with exact `subway_station:F21`/GTFS binding
and matching live arrivals. First slice pointer 444,470 selected its platform;
341,532 selected source entrance `row-y4aj-tepy-nbif`. Surface actually occluded
underground geometry; X-ray revealed it. Theme retained selection/camera.
Final complete-model pointer 809,460 picked `seg_8102970_1_0_0_local0_0` and 809,478
picked its entrance connector. Final Smith F22 pointer 870,247 selected its platform
with visible deck/piers and matching `subway_station:F22` board. Earlier 430,268
selected source segment8102967. These are UI evidence coordinates, not data.

Coney Island D43 displayed GEOMETRY ONLY / NO LIVE COVERAGE with no service inspector.
Its camera did not issue a Coney Island backend bbox; observed requests retained
supported Carroll bounds. Return/Escape restored ordinary selection/camera; focus
returned to usable Browse infrastructure, Enter reopened it. Reduced-motion emulation
matched true; keyboard selected F21/platform. Exaggeration 5× retained entrance 0 m;
1×–5×/default 2× and fit-to-entrances were exercised. Temporary media/cache overrides
were restored. A full three-minute recording was not produced.

The locally bundled standalone viewer loaded 6,345 semantic meshes, inspected
`station_F21` with source metadata, toggled groups and 1× exaggeration; final build
shows persistent schematic/exaggeration badge and actual group counts, with empty
optional groups disabled. It has no runtime CDN and is not the primary acceptance.

Fresh final production Native ResourceTiming: 12 application requests,
**822,113 transferred / 818,513 encoded / 3,000,004 decoded bytes**, including document
and worker; 0 initial model/renderer requests. Three on-demand requests(index+detail
renderer+F21) transferred 20,973 bytes, 197,605 decoded, 106.9 ms network span. Selected F21
chunk 2,683 transferred bytes, 32 primitives / 126 coordinates; owned JS estimate 56,126 bytes.
This estimate is not measured GPU memory. Cold click-to-fully-visible is NOT_RUN.
A separate cumulative API sample 25 requests / 697,535 transferred bytes is not the
initial-load interval. Basemap ResourceTiming sizes are cross-origin unknown/zero;
basemap wire bytes are NOT_RUN, not zero traffic.

Native final trace has 45 unique renderer-Compositor `DrawFrame` sequences over the
requested 650 ms zoom window: **69.2308 frames/s**. Gaps median 13.202 ms, p95 19.1092 ms,
maximum 67.845 ms (one >50 ms). This representative average passes 30 while preserving
the stutter. It is not rAF, GPU completion or physical-display cadence. Native
compositor viewport 2038×1972 was stable through that window; exact CSS/DPR was not
measured then. Later DOM 1636×896 / DPR 2.2 is separate. EventTiming: zoom 43.338 ms,
theme 94.890 ms, assistant 64.788 ms to subsequent presentation; Escape next-paint NOT_RUN.
Fresh scenario latency was not measured. Earlier slice trace lacked literal DrawFrame;
it remains NOT_RUN for FPS and is not substituted for the final native trace.

Local ignored evidence: `frontend/verification-artifacts/subway/` includes raw
trace/analysis, transfer summaries, screenshots and console sample. Native console
API returned no entries in the final query; capture completeness is not established.
Historical Liberty filter/sprite diagnostics remain preserved in older verification;
no universal clean-console or all-resource pass is asserted. First model/validator
failures remain in external logs; empty-child-array errors were repaired and same-hash
final validator rerun passed. Frontend/backend/helper historical baselines are not
relabeled fresh: unchanged backend/helper suites were retained, not rerun.

## Run, stop and next handoff

Executed build/offline commands and package purposes are in `tools/mta-model/README.md`;
viewer build/validation in `tools/mta-model/viewer/README.md`. Main frontend packages
are reused via an ignored local node_modules symlink; frontend manifest/lock remain
unchanged. Python's pinned/hash-locked 11 wheels are isolated outside the backend.

```sh
cd /Users/kerwynjean/Swale-subway-3d/frontend
npm run dev -- --port 5183
# Temporary production QA only:
npm run build
npm run preview -- --port 4183
```

Final feature URL: **http://127.0.0.1:5183/**, source-verifiedCarroll F21 X-ray 2× with
matching supported transit. Strict loopback/strict-port behavior was executed;
occupied 5183 failed explicitly. Both proxies returned health 200 and rejected
POST 405 / wrong-area 404. `envDir:false` and exact guarded proxy remain unchanged.

Observed feature Vite PID 14692, command/cwd from this feature worktree. Main controller
5374 / broker 5376 / backend 5377 remain from `/Users/kerwynjean/Swale`, ports 8000/8001;
main Vite 4264 remains on 5173. Main browser board is paused; only final feature tab owns
visible polling. Temporary 4183 preview PID 16555 and 8783 viewer PID 19361 were verified,
stopped with SIGINT, and their listeners disappeared. No independent collector remains.
Verify identities freshly before any future stop. Ctrl+C stops the feature foreground
server; for this observed instance only, after verifying its command, `kill -INT14692`.
Do not kill/restart the existing backend merely to restart the frontend. Its managed
stop/run commands remain in the existing main runbook; geometry work never changes DB paths.

Three-minute walkthrough: 0:00 choose Backend/Subway and locate Carroll; 0:30 select marker/
Explore; 1:00 inspect platform/entrance and source assumptions; 1:30 compare Surface/X-ray/
exaggeration and matching live freshness;2:00selectSmithF22/piers, thenConeyD43 geometry-only;
2:30 Return, show retained station/layers and Pause. No emergency/navigation interpretation.

Five consequential limitations: (1) relative depths/dimensions are uncalibrated and
A1/A2 unsupported; (2) 1,447 queried reference cells lack sampled ground and use disclosed
flat assumptions, with bathymetry/street-grade uncertainty; (3) 614 gradient diagnostics
remain, preserving source geometry; (4) 79 route/shape associations have unsupported
runs and 3 entrance relationships remain unmatched; (5) live coverage remains 15 stations,
while performance/GPU/recovery evidence has the explicit measurement limits above.

Next action: review this local candidate and its disclosed model gaps. A main merge,
push, PR, deployment, optional dataset acquisition or backend change requires separate
owner authorization. Do not repeat verified source acquisition or runtime setup;
reuse hash-checked caches. New geometry must rerun model, contract, browser and
performance acceptance rather than inheriting this report automatically.
