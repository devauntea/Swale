# Swale Phase 1 — standalone frontend redesign and verification

Frontend implementation, the blue/black/white redesign, light/dark themes, local
mascot artwork/animation and local verification are approved by the October 16,
2026 owner briefs. This replaces conflicting older visual requirements and the
prior full-stack implementation plan; the co-founder owns backend/data/scoring/AI.
Historical research is preserved in DATA_NOTES.md.
No integration, live data clients, backend scaffolding, production scoring or LLM.

## Verified baseline and authority

Redesign baseline inspected at HEAD `25a44f5`, branch `main`, with the existing
standalone frontend and only unrelated `.vscode/` untracked. Historical verification
reported 59 passing tests, TypeScript and build; those are baseline evidence, not a
new redesign pass. The original fixture/provider/map foundation must be preserved.
Local frontend packages, tests, preview and commits are authorized. Push, deploy,
remote writes, paid usage, new services and future integration remain gated.

## Architecture and components

Use Vite + React + strict TypeScript, MapLibre GL JS and deck.gl. Use CSS with a
small consistent token system and native accessible controls. No router/store
library is needed for this single workspace. One reducer owns scenario, layers,
selected/highlighted basin IDs and camera requests. Local React state owns theme
and panel presentation, separate from fixture science/data semantics. Keep a single
map instance; clean up event listeners, overlays and map resources on unmount.

- `app/App`: provider loading/error/empty states, shared state and layout.
- `components/sidebar/ControlSidebar`: branding/demo status, scenario, location,
  layer toggles, refresh, forecast and sources controls.
- `components/inspector/BasinInspector`: fixture ID, precomputed priority/factors,
  scenario, associated example complaints, provenance and limitations.
- `components/assistant/AssistantPanel`: expandable composer/history/suggestions,
  local mascot launcher/illustration, presentation states, processing/error cards
  and four validated frontend commands. No model or server-side tools.
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

A full-screen map contrasts with the compact deep-navy floating left sidebar.
Central semantic tokens use blue/black/white, neutral borders, soft shadows and
readable typography. Yellow is exclusively mascot artwork, never Swale-owned
controls, overlays, markers, legends, alerts or loading states. External basemap
artwork may contain other colors. Retain published flood classes; distinguish blue
analysis layers through intensity, opacity, borders and explicit labels.

First-time visitors start in light mode. Store an explicit light/dark preference,
apply it before rendering to avoid a wrong-theme flash, and provide a visible
accessible toggle. Storage failure falls back safely to light without blocking
the app. Light map styling uses white/light-gray architectural extrusions; dark
mode uses a compatible in-place treatment of the same approved Liberty style.
Do not invent a dark basemap URL or reset/recreate the map on a theme change.
Camera, scenario, layers, selection and highlights survive theme/panel changes.

Start pitched near Gowanus/Red Hook with camera controls. Keep labels readable and
layers correctly ordered. Map dominates desktop; constrain panels/scrolling at
shorter heights. A guides architectural city appearance, B overlay distinction
recolored blue, C compact floating controls, and the new mascot concept guides the
brand/assistant. References never provide geometry, measurements or scientific claims.

The local mascot uses a recognizable simplified SVG fallback: blue robot/hood,
dark faceplate, white oval eyes, yellow raincoat and blue umbrella. Do not display
the full concept sheet or claim exact reproduction. Its opening wave/umbrella motion
targets about 650 ms, coordinated with panel reveal without delaying interaction.
State-driven neutral/greeting/thinking/pointing/acknowledgement/error/closing poses
should be calm and efficient. Avoid continuous idle loops or new animation engines.
Respect reduced motion, keyboard activation/closing, expanded state, focus and
return-to-launcher behavior. Rerenders must not replay decorative motion or clear
chat history. Browser tests establish actual smoothness, stacking and clipping.

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

1. Inspect current code/assets/status and reconcile documentation, preserving Phase 0
   evidence. Proceed immediately with the authorized redesign.
2. Centralize blue/black/white UI/map tokens; eliminate owned non-mascot yellow.
3. Implement persistent default-light themes and update map paint in place.
4. Add recognizable local mascot SVG, restrained opening motion, expressions,
   reduced-motion behavior and accessible panel focus/closing semantics.
5. Integrate assistant/sidebar/inspector/forecast/control styling while preserving
   fixture provider, scenario semantics, map selection and four-command validation.
6. Investigate all seven historical missing-sprite warnings. Correct verified
   frontend defects without filtering the console or falsely claiming runtime repair.
7. Run strict typecheck, meaningful regression tests, production build, formatting/
   diff checks, secret-pattern review and frontend/network-scope review. No lint pass
   is implied if no linter is configured.
8. If normal authorized Chrome access succeeds, verify both themes, mascot behavior,
   original interactions, references and resources; measure performance and correct
   bounded defects. On saved-permission denial stop browser attempts immediately.
9. Preserve local servers, report observed versus blocked/unmeasured acceptance,
   prepare/rehearse the three-minute demo where possible and commit task files on main.

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
method/zoom/layers documented, otherwise NOT MEASURED. Also measure scenario-switch
latency, assistant opening responsiveness and theme rendering latency where possible.
V11 inspect real screenshots against A/B/C and the mascot concept, contrast, panel
clipping, overlays/architecture/chat and console.
V12 scenario/selection, independent layers, assistant failure/map independence,
refresh/source times, invalid IDs and missing-data regressions. V13 default-light
startup, persistent selection, invalid/unavailable storage, both toggle directions,
keyboard/reduced-motion behavior and no scenario/selection/camera reset. V14 mascot
identity, yellow-only-in-artwork rule, opening/repeated-open/close transitions,
focus/typing responsiveness, expressions and no clipping/layout shift. V15 each
historical sprite warning reproduced/resolved/external/visible-impact status;
runtime success is required before calling resource behavior PASS.

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

0:00 explain planning purpose and synthetic data; 0:20 pitched city, controls,
layers and light/dark change; 0:50 switch exact scenarios and compare example values;
1:20 select basin and explain factors/provenance; 1:50 open mascot assistant and run
a scripted map action; 2:20 uncertainty and blockage question; 2:40 partner-owned
production backend/integration next steps.
Keep local demo available; screen recording if practical, no external preview.

## Deferred partner-owned work

The historical FastAPI/DuckDB/GIS/scoring/OpenAI requirements are future partner
responsibilities, not removed product goals. Agreement on schema/API/auth/error
semantics, verified data, accurate unit/CRS/time handling and separate owner approval
precede integration. No such code/service is created in this phase.

## Historical baseline and current acceptance boundary

Before this redesign, 59 local tests, strict TypeScript and production build passed.
Partial Chrome observations established an architectural 3D map, scenario/example
changes and independent building visibility on that earlier version; seven missing
Liberty sprites were observed. `frontend/docs/swale-demo.png` is an earlier actual
capture, not evidence of the redesigned interface or final camera/readability fixes.

The redesign's authorized normal Chrome request was denied by the saved-site-
permission gate, so browser attempts stopped. This does not imply a defect in the
rendered app, but current rendered visual/interaction acceptance is BLOCKED. FPS,
initial transferred bytes and scenario/theme/assistant latency are NOT MEASURED.
Automated checks and any source-level corrections must be recorded separately from
browser evidence in `frontend/VERIFICATION.md`; no full frontend or integrated-app
completion can be claimed while those acceptance checks remain blocked. The local
demo script is prepared in `frontend/DEMO.md`; rehearsal/recording remain pending.
