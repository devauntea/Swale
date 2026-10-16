# Swale implementation and verification plan

Status: **Phase 0; Phase 1 NOT APPROVED.** Prepared for the owner's October 15,
2026 brief. Read `AGENTS.md` and `DATA_NOTES.md` first. This document is a proposed
implementation, not a claim that an application or processed dataset exists.

## Repository baseline

- Root: `/Users/kerwynjean/Swale`; branch `main`, tracking `origin/main`.
- Initial HEAD: `bef331c49f710fa9461cb3e61a0cb1056c010d3b` (`first commit`).
- Tracked content: `README.md` (`# Swale`). No application, dependencies,
  configuration, build scripts, tests, or existing root `AGENTS.md`.
- Existing untracked `.vscode/extensions.json` recommends `openai.chatgpt`;
  preserve and do not stage it as part of this milestone.
- Available executables: Node 22.20.0, npm 10.9.3, Python 3.13.5. Compatibility of
  the eventual pinned dependencies and native spatial wheels remains untested.
- Only the three requested documentation files are created in Phase 0. Research
  responses and temporary probes live outside the repository in
  `/tmp/swale-phase0/`, not as application code or committed raw datasets.

## Selected defaults and visual direction

Retain Vite + React + TypeScript, MapLibre GL JS + deck.gl, Python + FastAPI,
DuckDB as primary query/store, GeoPandas where GIS preprocessing benefits. No new
application service, alternative database, hosting provider, or primary-stack
change is proposed. Use local development after approval; no deployment implied.
Select and lock compatible published versions during Phase 1; do not treat a
documentation repository's `main` branch as proof of a released package version.

Use OpenFreeMap Liberty with visible OpenFreeMap/OpenMapTiles/OpenStreetMap
attribution. No terrain. Use NYC building geometries; verify the height-unit basis
(including feet precision) before converting relative roof heights to meters.
`height_roof` is already above-ground height: never subtract `ground_elevation`.
Height units remain a verification gate in `DATA_NOTES.md`. Do not replace the
NYC source silently with OSM buildings.

Image A guides a pitched city-model view, pale neutral building extrusions, and
clear depth; image B guides strong, legible analysis overlays; image C guides a
compact dark floating left sidebar with selector, layer toggles, refresh, legend,
and basin inspector. References are styling only: do not copy their geography,
measurements, depth classes, or controls outside Swale's scope. Show Brooklyn,
not the Manhattan extent pictured in C. No image assets need copying/generation.
Map usability, provenance, and working scenario changes take precedence over
small stylistic details; mobile polish remains out of scope.

Current documentation checks (documentation-only, no packages installed):

- Context7 selected `/maplibre/maplibre-gl-js` and `/visgl/deck.gl`, both official
  high-reputation projects. MapLibre geographic input uses WGS84 `[longitude,
  latitude]`; [extrusion height is meters](https://maplibre.org/maplibre-style-spec/layers/#fill-extrusion-height).
- Current [deck.gl MapLibre guidance](https://deck.gl/docs/developer-guide/base-maps/using-with-maplibre)
  describes `MapLibreOverlay` / `@deck.gl/maplibre`, interleaved rendering, WebGL2,
  and `beforeId` layer ordering. Confirm these exports exist in the selected
  released version; use the version's documented compatible integration. Test
  label ordering and building occlusion, rather than assuming old Mapbox examples
  apply unchanged. Surface unavailable WebGL capability as an explicit error.
- The [official OpenAI function-calling guide](https://developers.openai.com/api/docs/guides/function-calling)
  documents application-executed tools. Explicit strict schemas complement local
  validation; they do not establish groundedness. No OpenAI account, model access,
  credential, quota, or paid request has been verified/used in Phase 0.

## Dependencies, blockers, and decisions

Source-specific runtime results, counts, field mismatches, and unresolved checks
are in `DATA_NOTES.md`; consult those before choosing ingestion filters. Required
data must be successfully processed and verified before Tier 1 can be complete.

1. **Owner gate:** explicit approval to begin Phase 1. No implementation has begun.
2. **LLM gate:** identify an owner-approved existing OpenAI credential through local
   environment configuration, an available tool-capable model, and explicit paid
   usage authorization before making any paid request. Do not paste credentials
   into chat. Missing approval/credential blocks the LLM requirement, not map work.
3. **Data gates:** resolve all field/unit/geometry issues in `DATA_NOTES.md` during
   ingestion. Source availability is not proof of clean boroughwide coverage.
   Counts obtained by borough labels or bounding boxes are not spatial counts.
   The extreme archive's category 3 is future high tides, not another stormwater
   depth. Proposed interpretation for approval: score stormwater categories 1/2
   only; retain category 3 metadata and exclusion counts without adding an
   unapproved coastal layer. Include both legacy/current exact 311 category pairs.
4. **Static taxonomy decision:** the brief calls infrastructure/basemap STATIC
   INVENTORY/STATIC, but invariant I1 lists only OBSERVED, FORECAST, HISTORICAL,
   MODELED, SCENARIO, and HEURISTIC SCORE. Proposed owner clarification: permit an
   additional `STATIC INVENTORY`/`STATIC` type for boundary/basins/buildings/basemap,
   retaining source-update/retrieval times. Do not imply inventory is a current
   observation of drainage condition. Keep this unresolved rather than silently
   relabeling it as flood observations.
5. **Geographic targets:** the brief supplies a borough boundary, not neighborhood
   polygons. Proposed default: Red Hook/Gowanus are verified named navigation
   targets with explicitly labeled radius/extent filters, not administrative
   neighborhood membership. Obtain official geocoded/geometry evidence and include
   target/filter/radius in tool results. If precise neighborhood membership is
   required, approve/verify an official boundary source first. Never invent targets.
6. **Optional tiers:** Arize, Daytona, backtest, voice, alternate store, rainfall
   animation, and FloodNet visualization are unapproved; do not implement them.

## Data processing architecture

After approval, add the brief's layout: `frontend/`, `backend/`,
`scripts/ingest/`, `scripts/preprocess/`, `data/raw/`, `data/processed/`,
`config/score_weights.yaml`, and `.gitignore`; expand README with actual commands.

1. Each ingestion artifact has a manifest: dataset ID, exact query/download URL,
   source issue/update timestamp, applicable/valid period, extraction timestamp,
   schema/units/CRS, measured bytes, record count, checksum, and warnings. An HTTP
   Date or fetch time is never substituted for source publication time.
2. Fetch static official inventory and stormwater archive once; cache historical
   complaints. Use explicit pagination/order, bounded pages/timeouts, a small retry
   cap/backoff, and snapshot/watermark metadata. Keep raw artifacts ignored. Never
   store credentials in a manifest or commit raw downloads >50 MB.
3. Validate Brooklyn boundary; check geometry validity, repair only with a recorded
   method/area change, and keep source geometries/checksums. Spatially select
   basins and complaints using this boundary; report labeled-borough conflicts,
   offshore/boundary exclusions, nulls, duplicates, and geometry exceptions.
   Do not discard boroughwide core coverage to make buildings faster.
4. Ingest exact verified complaint category pairs, preserving their meanings.
   Deduplicate `unique_key`; retain real event timestamps and valid coordinates.
   The source omits timestamp offsets and its dictionary does not confirm a
   timezone; verify that semantics before UTC conversion/rolling-date arithmetic.
   Production windows roll from the actual extraction instant in NYC local time;
   the fixed Phase 0 count windows are only a reproducible investigation snapshot.
5. Use WGS84 for display. Perform proximity in an appropriate local metric CRS
   (proposed EPSG:32618, verify transform/extent) or geodesically. Never buffer
   longitude/latitude degrees as meters. Convert all source projected units
   explicitly; do not assume state-plane feet are meters.
6. Read the two actual flood GIS layers, retain official scenario metadata, fix
   invalid geometry transparently, reproject, and clip to Brooklyn. Preserve depth
   classes only when actual field values/thresholds and documentation agree;
   otherwise use binary zone intersection, labeled accordingly. Both scoring
   choices use only stormwater categories 1/2, excluding tidal category 3.
   Simplify display
   geometries after scoring against the authoritative processed geometry.
7. Clean NYC buildings: strict numeric parsing, known units/relative-height
   semantics, positive/plausible-height validation, exclusions and counts. No
   fabricated heights. Start with an explicitly labeled focus-area extrusion
   dataset if necessary; otherwise tile. Use boroughwide basins/floods/311.
8. Store verified tables and spatial indices/query structures in DuckDB; compact
   GeoParquet for backend processing and minimal GeoJSON/aggregated payloads for
   the browser. Export only needed properties; compress HTTP responses. Keep the
   initial app-controlled transfer <=20 MB, measuring basemap transfers separately.
9. NWS: use truthful application/contact User-Agent, discover grid through `/points`,
   parse QPF interval durations and units, and retain issue/valid/fetch times. A
   single representative grid is not boroughwide street rainfall. Numeric zero
   is valid FORECAST rainfall. Nulls/gaps/overlaps affecting the selected window,
   stale issue times, or unusable selected-window coverage cause unavailable forecast;
   never substitute probability for depth or assume equal time steps.
   Runtime values are six-hour accumulations: prefer a clearly displayed upcoming
   24-hour window aligned to complete bins (four in this six-hour snapshot, but
   validate actual durations instead of hardcoding four). Do not prorate a partial bin or
   label a delayed aligned window as the rolling next 24 hours.
10. Cache static/history data; refresh only recent 311/NWS every ten minutes and
    manually. Refresh complete snapshots atomically; show per-layer failures,
    last-success and STALE indicators. Preserve selection/scenario/static layers
    when refresh fails. No valid cache means disabled feature and reported blocker.
    NWS exception: show forecast unavailable and activate the labeled SCENARIO
    rainfall factor; required missing inventory/history/flood cannot use that fallback.

## Heuristic scoring contract

Backend deterministic score: `100 * (.45 * history + .40 * exposure + .15 * rain)`;
relative elevation weight remains zero. Weights live in YAML, sum to one, and have
a version/hash. Raw contributions are `weight * normalized_factor`; display
contributions are `100 * weight * normalized_factor` in score points and sum to
the displayed 0–100 score. Each factor and contribution has units, source, window,
normalization parameters, and missing-data policy. Always show **Inspection
priority (heuristic, not validated)**, plus proximity does not prove cause/blockage.

Proposed normalization, to finalize against verified data before coding tests:

- History: count qualifying reports within configurable default 100 m; normalize
  `log1p(count) / log1p(max(1, corpus_p95_count))`, capped at one only after checking
  counts/nonnegativity. Freeze the reference percentile over the loaded historical
  corpus, report its value and version, and use it for both scenarios. Preserve
  per-category counts. Zero complaints is zero evidence, not proof of a clear drain.
- Exposure: use verified depth classes with an explicit ordered mapping if
  supported; otherwise binary 0/1 intersection. Scenario changes rejoin basin
  points to the selected scenario geometry. Do not force extreme scores to exceed
  moderate scores for all basins; test actual intersections.
- Rain: usable NWS accumulated QPF for an explicitly shown upcoming 24-hour window
  of complete forecast bins, normalized against an explicit
  configurable demonstration reference (proposed 100 mm/24 h), with full period
  coverage validation. Reject invalid/nonfinite/negative inputs; then cap the
  normalized ratio at one (test values exceeding the reference explicitly).
  When unavailable, use the published scenario intensity
  normalized against the selected pair's maximum rate (3.66 in/hr), labeled
  SCENARIO with original units. These are different heuristic inputs, not a
  conversion of forecast accumulation to scenario intensity; expose the active
  formula/reference and prohibit scientific comparison of their raw quantities.
  A constant boroughwide rain factor changes absolute scores, not necessarily rank.
- Required inventory/history/flood missing: no valid score; do not silently treat
  missing data as zero. NWS alone has the explicit scenario fallback. Exclude or
  flag invalid data; document the outcome. Ties sort deterministically by basin ID.

## Assistant contract

Use only six schema-validated tools: backend `search_basins(filters, sort, limit)`
and `explain_basin(id)`; frontend `set_scenario(name)`, `set_layers(visibility)`,
`highlight(ids)`, `fly_to(target)`. The backend executes/validates UI requests
against current verified IDs/targets before returning commands; frontend validates
again and acknowledges application state. Unknown names/arguments fail closed.

Results include structured IDs, ranks/limits, values/units, filter extents,
scenario assumptions, sources, source/valid/fetch timestamps, and config version.
Scenario changes complete and scores recompute before rankings are returned. Do
not add a seventh complaint-search or SQL tool: the recent-complaints scripted
query uses allowlisted `set_layers` and verified Gowanus `fly_to`, without claiming
unreturned complaint counts. Assistant prose may use only numbers from same-turn
approved results, including user-requested numbers; implement assertions plus
constrained result-based rendering for numeric summaries. Strict argument schemas
alone cannot prevent hallucinated final prose. Reject ungrounded output and show
an explicit assistant error. A deterministic harness is for testing, not the LLM.

## Implementation order and time budget

Times are active work since project start; waiting for required approvals pauses
the clock. The table preserves the brief's order, not a promise that unverified
sources or optional work will fit.

| Active time | Milestone and acceptance |
| --- | --- |
| 0:00–0:45 | Phase 0: repository/source checks, three documents, owner handoff. Stop. |
| 0:45–2:00 | After approval: scaffold, ignore rules, bounded ingestion, Brooklyn clip, data manifests, payload sizing. |
| 2:00–3:30 | 3D map, boroughwide basins/flood/311, building focus coverage, two scenarios, sidebar/provenance. |
| 3:30–4:30 | DuckDB score/query endpoints, YAML configuration, factors/details, meaningful score tests. |
| 4:30–5:45 | Authorized OpenAI Responses integration, six tools, validation/grounding and map commands. |
| 5:45–6:45 | Tier 1 fixes first; Tier 2 only if separately approved and Tier 1 works end to end. |
| 6:45 | Freeze new features, even if incomplete. |
| 6:45–7:30 | Required checks, actual performance measurements, critical fixes/regression verification. |
| 7:30–8:00 | Three-minute rehearsal, verified local fallback, backup screen recording. |

Commit verified milestones locally on `main`; never include unrelated `.vscode/`
changes. No push/merge/deployment or preview sharing without explicit approval.
Stop optional work after 30 minutes without meaningful progress. Never bypass an
invariant to meet the clock; report incomplete requirements honestly.

## Verification commands and expected evidence

**Future commands below are planned contracts; no corresponding files/scripts
exist yet, and none has passed.** Implement these meaningful checks alongside the
approved feature they validate. Do not create tests merely mirroring UI markup.

| Check | Planned command / method | Required evidence |
| --- | --- | --- |
| V1 data | `python scripts/preprocess/verify_data.py` | Actual input/output counts, Brooklyn spatial counts, schemas, CRS/units, validity, duplicates/nulls/exclusions, manifests, boundary containment/exceptions. |
| V2 payload | Browser DevTools Network; cold-cache reload, export sanitized HAR | Browser/device, zoom/layers, transferred app+data bytes <=20 MB; basemap tile bytes separately. |
| V2 frames | Browser performance trace during pan/zoom/scenario toggle | Same device/layers, measured FPS/frame-time distribution, >=30 FPS; not inferred from appearance. |
| V3 scores | `python -m pytest backend/tests/test_scoring.py` | Eight score cases listed below, actual pass/fail. |
| V4 contracts | `python -m pytest backend/tests/test_assistant_contract.py` | Six tool allowlists/schemas/limits, invalid IDs/targets, current-turn numeric grounding, no arbitrary tools. |
| V4 live LLM | `python scripts/verify_assistant_demo.py` only after credential/usage approval | Actual five prompts, real tool execution, replies and acknowledged map states. Harness alone does not pass. |
| V5 provenance | `python -m pytest backend/tests/test_provenance.py` plus browser inspection | Every rendered layer/legend/panel/number/reply has type/source/time and correct limitations. |
| V6 security | `git grep -n -I -E '(sk-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN .*PRIVATE KEY-----)'`; staged equivalent | Review every match; full changed-file diff; no credential values in source/logs/examples. |
| V6 ignores | `git check-ignore .env frontend/.env backend/.env` | All secret paths ignored after ignore rules are implemented; no committed `.env`. |
| V7 types/build | `npm --prefix frontend run typecheck`; `npm --prefix frontend run build` | Actual zero exit status and build artifacts. |
| V7 backend | `python -m pytest backend/tests` | Backend, score, contract, provenance, regression suites pass. |
| V7 startup | `python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000`; `npm --prefix frontend run dev -- --host 127.0.0.1` | Local startup, health/data API responses, map load; actual README module/ports must match final code. |
| V8 regressions | Automated state checks plus browser interaction | Assistant disabled/map works; scenario/selection survive; refresh does not replace static layers; missing data never invented; stale indicators. |

V3 covers: weights sum to one; all factors in [0,1]; contributions sum; 0–100
scaling; missing-data fallback; actual extreme-only fixture increases exposure;
controlled ranking change/no-change explanation; identical inputs give identical
outputs. Use a real verified basin for the live explanation test.
Rainfall cases also cover all-zero QPF, values above the normalization reference,
nulls inside versus outside the selected window, gaps/overlaps, variable interval
duration, and missing forecast activation of the SCENARIO fallback.

Run exactly these five scripted assistant queries for V4:

1. "Top 10 basins to inspect in Red Hook before tomorrow's rain"
2. "Why is basin `<id>` ranked high?" (replace with an actual loaded ID)
3. "Switch to the extreme scenario and show the top 20"
4. "Show recent flooding complaints near Gowanus"
5. "Is this drain blocked?"

For each, record correct tools/arguments, execution, valid IDs, current-turn
numerical evidence, expected map state, no unsupported inference or unauthorized
tool. Query 5 explicitly states that the heuristic cannot establish blockage.
Use local grounding assertions; claim Arize only if separately approved and its
actual traces/groundedness logs are verified.

Invariant coverage: I1 -> V1/V5; I2 -> V3/V4/V5; I3 -> V4/V6; I4 -> V3/V5/V8;
I5 -> V4 plus content inspection; I6 -> V6; I7/I8 -> changed-file/scope review,
approval ledger, and repository/external-action audit. These checks also cover
all formal invariants in `AGENTS.md`; do not mark any unexecuted check passed.

## Tier 1 completion checklist

- [ ] Verified reproducible Brooklyn inventory/history/flood/building ingestion;
  exact schemas/units/counts/exclusions, compact payloads and per-layer metadata.
- [ ] Pitched MapLibre/deck.gl 3D Brooklyn map, NYC building extrusions, basins,
  selected modeled flood zones, recent seven-day points and three-year hex density
  with category distinctions; boroughwide core coverage.
- [ ] Both exact scenarios change zones and computed scores; full rainfall and
  sea-level assumptions displayed.
- [ ] Basin points/markers are colored by inspection priority and clickable.
  Interactive basin panel shows verified ID, exact heuristic label/formula,
  normalized factors/contributions, sources/update/retrieval/version/uncertainty.
- [ ] Manual refresh and ten-minute recent 311/NWS refresh, error/stale indicators,
  forecast/fallback behavior, and unaffected static layers.
- [ ] Real authorized tool-capable OpenAI Responses assistant; six validated tools,
  same-turn numeric grounding, valid highlights/targets, map independence on failure.
- [ ] Type/source/timestamps on all layers/numbers, required attribution and
  limitations, no blockage or prohibited safety claims, no committed secrets.
- [ ] V1–V8 actual results recorded; <=20 MB initial app-controlled transfers and
  >=30 FPS measured with browser/device/method/zoom/layers specified.
- [ ] Three-minute demo rehearsed, local verified fallback and recording prepared;
  missing criteria reported, no unsupported completion claims.

Current verification: repository inspection and source investigation only.
Application tests/build/startup are **not applicable yet**; payload/FPS **not
measured**. No app, local demo URL, Daytona preview, or recording exists.

Phase 0 documentation checks executed: an inline Python check confirmed all three
files are UTF-8, end with a newline, have no trailing whitespace, retain I1–I8,
list all seven NYC dataset IDs and all four verification-status classes. A
credential-pattern scan of the new documents found no matches. The `git grep`
pattern command above also returned exit 1 / no matches on tracked baseline
files. After staging, its cached scan matched this document's own literal private-
key search pattern in the V6 command table; inspection confirmed a documented
regex, not a key. The stricter new-document credential scan found no matches.
`git diff --cached --check` passed; only the three requested documents were staged.
These are documentation/security checks, not application-test results.

## Owner handoff

Approve Phase 1 only after reviewing this plan and `DATA_NOTES.md`. Resolve the
static-label taxonomy and any source mismatches that affect acceptance. Authorize
existing OpenAI credential use/model/budget separately before paid calls. No other
approval gate is implied by approval to build locally.
