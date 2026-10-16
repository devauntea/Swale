# Swale Phase 1 — standalone frontend plan

Frontend implementation and local verification are approved by the October 16,
2026 owner brief. This replaces the prior full-stack plan; the co-founder owns
backend/data/scoring/AI. Historical research is preserved in DATA_NOTES.md.
No integration, live data clients, backend scaffolding, production scoring or LLM.

## Verified baseline and authority

Baseline HEAD `e5e558e`, branch `main`, one local commit ahead of origin/main.
Only README and the three Phase 0 docs are tracked; `.vscode/` is unrelated and
untracked. No frontend/dependencies exists. Preserve existing files. Local frontend
packages, tests, preview and commits are authorized. Push, deploy, remote writes,
paid usage, new services and future integration remain gated.

## Architecture and components

Use Vite + React + strict TypeScript, MapLibre GL JS and deck.gl. Use CSS with a
small consistent token system and native accessible controls. No router/store
library is needed for this single workspace. One reducer owns scenario, layers,
selected/highlighted basin IDs, camera requests and panel state. Keep a single map
instance; clean up event listeners, overlays and map resources on unmount.

- `app/App`: provider loading/error/empty states, shared state and layout.
- `components/sidebar/ControlSidebar`: branding/demo status, scenario, location,
  layer toggles, refresh, forecast and sources controls.
- `components/inspector/BasinInspector`: fixture ID, precomputed priority/factors,
  scenario, associated example complaints, provenance and limitations.
- `components/assistant/AssistantPanel`: composer/history/suggestions/loading/error,
  scripted response cards and four validated frontend commands.
- `map/SwaleMap`: imperative MapLibre, deck overlays, building style/visibility,
  camera events, marker/complaint picking and explicit rendering failure states.
- `data/providers/LocalFixtureProvider`: only implemented provider; async local
  snapshot/refresh API. Components do not import raw fixtures directly.
- `types/`: proposed structures shared across UI, provider and map.
- `tests/`: meaningful fixture/state/action/assistant regressions.

## Map and visual system

OpenFreeMap Liberty with retained OpenFreeMap/OpenMapTiles/OSM attribution. Inspect
published style/source schema and released package compatibility before using
building attributes. Use permitted actual basemap building geometries/heights,
not NYC inventory ingestion. Fallback, if needed, is limited labeled demo geometry.
WGS84 [longitude, latitude] input; building heights explicitly meters. No terrain.

A full-screen light map contrasts with charcoal floating panels, thin gray borders,
soft shadows, compact readable typography, restrained mint accents and amber demo
labels. Start pitched near Gowanus/Red Hook with camera controls. Architecture
uses pale shaded extrusions, transparent teal/blue scenario fills and distinct
priority colors. Keep labels readable and layers correctly ordered. Honor reduced
motion. Map dominates desktop; constrain panels/scrolling at shorter heights.
Images A/B/C guide appearance, never geometry or claims.

## Fixture and contract strategy

All infrastructure fixtures are synthetic, small, deterministic and visible as
DEMO. Use synthetic IDs, predefined scenario-specific scores/bands/factor values,
local complaint points and prebuilt density hexagons, separate demo scenario
polygons, forecast examples with explicit accumulated-mm validity intervals,
source/fetch metadata and honest missing/stale states. No real-world coverage claim.
No production scoring, geospatial joins or precipitation calculation occurs.

The owner now permits STATIC/STATIC INVENTORY labels and directs exclusion of
future-high-tide category 3 from future stormwater scoring and hazard overlays.
Local flood geometry is not official DEP geometry. Preserve published scenario
assumptions in metadata, distinguish accumulation from intensity and never infer
blockage from scores or nearby reports.

INTEGRATION_CONTRACT.md and TypeScript define provider snapshots, geographic units,
nullable values, provenance, freshness, scenarios, factor contributions, assistant
messages and UI actions. Status is PROPOSED — NOT YET AGREED WITH BACKEND TEAM.
No endpoint paths or operational backend adapter. Future integration is separately
approved after partner agreement and data validation.

## Interaction behavior

Every layer toggle changes rendering immediately; camera/selection survive scenario
and panel changes. Hiding basins retains selection with a visible hidden-layer hint.
Select markers or queue rows to update inspector; explicit focus flies to a known
target/basin. Scenario selection chooses stored example values and geometry only.
Manual refresh reloads fixtures without changing their source/retrieval dates and
reports that real refresh awaits integration.

Assistant supports five required scripted requests, presents DEMO on responses,
executes only set_scenario/set_layers/highlight/fly_to after validation, and uses
only available fixture IDs/numbers/known verified targets. Requests beyond fixture
coverage disclose the limit. Unsupported questions show the demo limitation.
Blockage response states the heuristic cannot establish whether a drain is blocked.
No backend data-tool implementations and no implication of a live LLM.

## Implementation order and time budget

1. Reconcile documentation (AGENTS, PLAN, README, proposed integration contract;
   additive DATA_NOTES scope annotation). Proceed immediately to implementation.
2. Scaffold/install only free frontend dependencies and ignore generated artifacts.
3. Typed fixture/provider/state contracts and map/building integration in parallel.
4. Sidebar, scenarios, basin/flood/complaint layers and selection.
5. Inspector, forecast states, source presentation and scripted assistant.
6. Typecheck/tests/build, actual local browser inspection, interaction corrections.
7. Measure payload/FPS where possible, refine significant defects, rehearse demo,
   record evidence/limitations and commit verified milestones on main.

The original total target is approximately eight active hours, feature freeze at
6:45, then verification/critical fixes/rehearsal. Exact historical active duration
is unmeasured; do not restart the eight-hour allocation or fabricate elapsed time.
Record Phase 1 start/end timestamps from the actual clock. No optional Tier 2/3.

## Frontend acceptance and verification

Run actual commands once scaffolded:

- `npm --prefix frontend run typecheck`
- `npm --prefix frontend test`
- `npm --prefix frontend run build`
- `npm --prefix frontend run dev -- --host 127.0.0.1`
- `git diff --check`, secret-pattern checks, complete changed-file/scope review,
  and `git check-ignore .env frontend/.env`.

V1 scope: only frontend plus needed root docs/config; no backend, production API,
production scoring, real LLM or unauthorized writes. V2 strict TS/build/tests.
V3 actual 3D Brooklyn load, camera, buildings, attribution, layer ordering and WebGL
failure UI. V4 both scenarios change geometry/legend/stored values while preserving
camera/layers/selection. V5 click/queue selection, ID-safe highlights and exact score
wording. V6 every control works, refresh honesty, matching legends/state retention.
V7 run five scripted prompts below and unsupported/error cases. V8 audit provenance,
DEMO/forecast/scenario distinctions and timestamps. V9 no secrets/production calls,
ignored env paths, fail-closed commands. V10 actual initial app transfers <=20 MB,
basemap transfers separately; representative map interaction >=30 FPS, browser/device/
method/zoom/layers documented, otherwise not measured. V11 inspect real screenshots
against A/B/C, contrast, panel clipping, overlays/architecture/chat and console.
V12 scenario/selection, independent layers, assistant failure/map independence,
refresh/source times, invalid IDs and missing-data regressions.

Required assistant requests:

1. Top 10 basins to inspect in Red Hook before tomorrow's rain
2. Why is basin [valid fixture ID] ranked high?
3. Switch to the extreme scenario and show the top 20
4. Show recent flooding complaints near Gowanus
5. Is this drain blocked?

Pure tests must validate actual UI command contracts, fixture consistency, state
preservation, no invented IDs, stored values, supported/unsupported scripts, and
forecast null/zero/units/staleness handling. They do not establish WebGL success.
Map must be verified separately in a browser. Record actual outcomes in a frontend
verification report; do not claim integrated-app completion from a passing build.

## Three-minute demo

0:00 explain planning purpose and synthetic data; 0:20 pitched city, controls and
layers; 0:50 switch exact scenarios and compare example values; 1:20 select basin
and explain factors/provenance; 1:50 scripted assistant/map action; 2:20 uncertainty
and blockage question; 2:40 partner-owned production backend/integration next steps.
Keep local demo available; screen recording if practical, no external preview.

## Deferred partner-owned work

The historical FastAPI/DuckDB/GIS/scoring/OpenAI requirements are future partner
responsibilities, not removed product goals. Agreement on schema/API/auth/error
semantics, verified data, accurate unit/CRS/time handling and separate owner approval
precede integration. No such code/service is created in this phase.
