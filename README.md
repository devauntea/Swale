# Swale

A map-first Brooklyn planning demonstration with a React/TypeScript/Vite frontend,
MapLibre GL JS and deck.gl, and the reviewed Python/FastAPI/embedded SurrealDB
backend. Connected coverage is BK0601. This is not a validated prediction of
flooding, blockage, station safety or closure.

Read the [current runbook](docs/LOCAL_INTEGRATION.md),
[verification](frontend/VERIFICATION.md), and
[next-feature handoff](docs/NEXT_FEATURE_HANDOFF.md). Publishing source and
successfully deploying a hosted app are separate outcomes.

This feature branch adds [schematic subway infrastructure exploration](docs/SUBWAY_INFRASTRUCTURE.md).
The current feature handoff takes precedence for its build and verification state.
It is a local candidate, separate from published main; backend code and the
operational database remain owned by the existing main runtime.

## Subway infrastructure candidate

From this worktree, keep the existing main backend/broker running, then start:

```sh
cd frontend
npm run dev -- --port 5183
```

Open **http://127.0.0.1:5183/**. Choose Backend / snapshot + transit → Subway
monitoring. Explore infrastructure from a station inspector, or browse the static
station index. X-ray reveals assumed underground geometry; Surface view restores
ordinary occlusion. Static geometry does not enlarge the backend’s live coverage.
Pause any other live board tab before activating this one.

The source builder, pinned isolated geospatial requirements, offline-cache workflow,
model QA and supplementary viewer are documented in
[tools/mta-model](tools/mta-model/README.md). Full GLB/raw data are local ignored
outputs; generated bounded map assets are distributed under
`frontend/public/infrastructure/`. No GIS acquisition occurs in the browser.
Do not run the geometry builder against the application database.

The supplementary export viewer uses pinned Three.js0.186.1, solely to inspect the
full local GLB. Its official Khronos glTF validator is pinned2.0.0-dev.3.10.
Neither package enters the main frontend or backend dependency environment.
Package lifecycle scripts were reviewed and disabled during installation.

```sh
cd tools/mta-model/viewer
npm ci --ignore-scripts
node ../../../frontend/node_modules/vite/bin/vite.js build --config vite.config.js
node validate.mjs ../output/brooklyn_mta.glb ../output/gltf_validation.json
```

Serve `tools/mta-model/output/` using an ordinary loopback-only static HTTP server
to open its `index.html`; the model must be built first. The independent viewer is
an export/debugging tool; the primary journey is inside Swale’s existing map.

## Run locally

The tested platform is macOS with `sandbox-exec`, Python 3.12, Node >=22.12.0,
locked dependencies and an existing task-owned database. The repository launcher
recreates a clean environment, isolated home and native containment. No application
credential file is needed or loaded. Do not start a second database writer.

Backend, in one terminal:

```sh
/usr/bin/python3 -I -S /Users/kerwynjean/Swale/scripts/local/runtime.py serve-live \
  --root /Users/kerwynjean/Swale \
  --database /Users/kerwynjean/Swale-integration/backend/var/local-transit-c65f03b.db \
  --runtime-dir /Users/kerwynjean/.local/share/swale-local/main-runtime
```

Frontend, in a separate terminal:

```sh
cd /Users/kerwynjean/Swale/frontend
npm run dev
```

Open **http://127.0.0.1:5173/**. Choose **Backend / snapshot + transit**, then
**Subway monitoring**, and resume updates if paused. Backend: **127.0.0.1:8000**;
managed broker: **127.0.0.1:8001**. `npm run dev` starts only Vite. Both development
and production-preview proxies restrict the frontend to validated, bounded GETs.

Ctrl+C stops each foreground service. To stop the managed backend separately:

```sh
/usr/bin/python3 -I -S /Users/kerwynjean/Swale/scripts/local/runtime.py stop \
  --root /Users/kerwynjean/Swale \
  --database /Users/kerwynjean/Swale-integration/backend/var/local-transit-c65f03b.db \
  --runtime-dir /Users/kerwynjean/.local/share/swale-local/main-runtime
```

Stop verifies the controller identity and supervises bounded backend/broker cleanup.
[Runtime tooling](scripts/local/README.md) documents clean, locked, offline setup,
preflight, enforcement probes and tests. The runbook records exact tested local
paths and evidence. Other machines need their own absolute DB path and locked
virtualenv. Local databases and private runtime output are not published. Generic
partner setup examples do not replace this restricted workflow.

## Features and data meaning

| View | Supported connected scope |
| --- | --- |
| Snapshot | Health/capabilities, source freshness, catch basins and 311 reports, full-ID details, viewport loading and bounded pagination |
| Subway | MTA stations/entrances, predicted arrivals, available schedule comparisons, applicable alerts and monitoring history |
| Flood context | Inferred station exposure, DEP modeled polygons, derived sensor buffers and historical FloodNet event evidence |
| Weather | Separate NWS observations, interval-based forecast accumulation and supplied official alerts |
| Fixture / demo | Two synthetic scenarios, example priorities, inspector and scripted DEMO assistant, separate from backend records |

The parser repair in `backend/swale/api/params.py` reverses the installed SDK's
printed string-key delimiters. Collection-produced full event IDs now retrieve
matching details/profiles after normal URL encoding. Frontend IDs are unchanged;
wrong-table, empty, malformed and nonexistent IDs remain errors. Path404/query422
semantics are preserved. The existing single-segment HTTP routes do not support
actual slashes inside keys; current stored collection IDs are unaffected.

Live transit/weather retrieval does not make inventory, complaints or historical
sensor events live. One visible board owner polls no faster than 60 seconds, with
Pause/Resume, backoff and hidden/inactive suspension; weather has a separate
approximately 600-second boundary. Source, fetch, event, forecast and ingest times
remain distinct. Errors stay visible without automatic fixture substitution.

The committed schedule covers **October 16–23, 2026**. Expired/unmatched comparisons
are unavailable, never zero delay or proof of normal service. A non-destructive
schedule refresh/export remains partner work: the existing acquisition CLI
rewrites tracked snapshots and is not exposed by this launcher.

Monitoring samples are not distinct long-term station flood events. Train rows
are stop-associated; exact vehicle positions, destinations and station interiors
are unavailable. Exposure is unvalidated inference. Sensor buffers are derived
context, not measured flood boundaries. No emergency, closure, maintenance or
safe-route instructions are supplied.

## Themes and assistant

First visits default to light; explicit light/dark preference persists. Theme
changes restyle one map in place. Blue/black/white tokens span both themes; yellow
is reserved for the local mascot. Its simplified SVG robot/raincoat/umbrella is
an interpretation of the supplied concept. The short opening wave respects
reduced motion; keyboard focus, history and map state remain functional.

Replies use scripted **DEMO** fixtures and four validated frontend commands:
`set_scenario`, `set_layers`, `highlight`, `fly_to`. Backend actions and real
conversational AI are not connected.

## Verification and boundaries

```sh
cd /Users/kerwynjean/Swale/frontend
npm test
npm run typecheck
npm run build
npm run lint
npm run format:check
```

The runbook also provides contained backend/helper tests. Verification separates
fresh automated, API, browser and compositor/transfer evidence from historical
results. Three upstream Liberty filter warnings and imported EOF whitespace
findings remain documented; no universal clean-console or production-security
claim is made.

The broker enforces exact MTA/NWS CONNECT authorities in software with normal TLS.
Its native TCP443 permission is coarse; encrypted methods/paths are not inspected.
The stock backend mounts additional loopback routers. Frontend guards and CORS
are not server authorization. Backend request coalescing, cancellation, retention
and production authentication/hosting remain follow-ups. Keep localhost private.

The October 16 final instruction authorizes this bounded repair, normal main
promotion/publication and existing push-triggered automation. It does not authorize
manual hosting changes, credentials, paid services, new features or unrelated
backend edits. Broader partner references are [backend overview](backend/README.md),
[API draft](docs/api/v1.md) and [source register](docs/data-sources.md); they describe
more than this UI executes. The historical frontend contract remains
**PROPOSED — NOT YET AGREED WITH BACKEND TEAM**. Older standalone-only authority
entries are superseded within the approved scope.
