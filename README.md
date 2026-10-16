# Swale

A map-first Brooklyn planning workspace combining React/TypeScript/Vite,
MapLibre GL JS and deck.gl with a Python/FastAPI/embedded SurrealDB backend.
Connected data coverage is BK0601; the larger static station-model catalog does
not enlarge live coverage. Inventory, reports, observations, forecasts, inferences
and hypothetical scenarios retain separate identities and clocks. Swale does not
establish current flooding, blockage, station safety, closure or accessibility.

[FINAL_RELEASE.md](docs/FINAL_RELEASE.md) is the authority for the current
candidate, acceptance, runtime and publication status. Also read the
[runtime record](docs/FINAL_RELEASE_RUNTIME.md),
[assistant contract](docs/CONTEXTUAL_MASCOT_BRIEFINGS.md),
[visual semantics](docs/FINAL_VISUAL_SEMANTICS.md) and
[verification matrix](frontend/VERIFICATION.md). Older handoffs and station
acceptance records remain historical evidence; their frontend-only,
unmerged-feature or scripted-only statements do not describe the integrated scope.
Source publication, localhost verification and an actual public deployment are
separate outcomes. No publication or deployment is implied by this README.

## Overview and station exploration

The overview exposes **Normal view**, **Flood simulation** and **Explore station**.
A supported selected station offers **Explore station — Normal view** and
**Explore station — Flood simulation**. Both views share water mode, selected
identities and the local scenario snapshot. The Carroll Street F21 600-second
case remains a documented demonstration/regression example.

Normal hides hypothetical water and retains the scenario; it does not mean dry,
safe, open or operating normally. Flood simulation displays explicitly
hypothetical water with its inputs, model identity and elapsed time. Play/pause,
seek and reset use the existing bounded deterministic trajectory. Regional
surface-flood context and local station storage are not scientifically coupled.

The constrained tour frames actual modeled entrances, stairs, landings and
supported local platform components using close oblique viewpoints, component
labels, orientation controls and Return to overview. It uses one existing map.
It is not camera-based AR, a free physical walkthrough or a surveyed digital twin;
it requests no camera, microphone, location or device tracking. Virtual viewpoints
provide no real-world walking or evacuation guidance.

[SUBWAY_INFRASTRUCTURE.md](docs/SUBWAY_INFRASTRUCTURE.md) preserves source-linked
geometry, stairs/rails, X-ray and predecessor evidence.
[STATION_FLOOD_WHAT_IF.md](docs/STATION_FLOOD_WHAT_IF.md) preserves equations,
units, bounds and assumptions. Uncalibrated depths, missing ground references,
unsupported route associations and unmatched entrances remain disclosed limits.
They do not establish current interior water.

## Run the integrated localhost candidate

The tested platform is macOS with `sandbox-exec`, Python 3.12, Node >=22.12.0 and
locked dependencies. Use this checkout's own backend virtualenv and a consistent
stopped-writer database copy. The original database and original `.env` remain
preserved. Do not start another writer on either database.

[FINAL_RELEASE_RUNTIME.md](docs/FINAL_RELEASE_RUNTIME.md) records exact
locked/offline setup, copied-database evidence, credential handling, revisions,
stop and recovery. The [launcher reference](scripts/local/RELEASE_RUNTIME.md)
documents its guards. Current source root: `/Users/kerwynjean/Swale-final-release`.

Default backend start, with paid providers disabled:

```sh
/usr/bin/python3 -I -S /Users/kerwynjean/Swale-final-release/scripts/local/release_runtime.py serve \
  --root /Users/kerwynjean/Swale-final-release \
  --database /Users/kerwynjean/.local/share/swale-local/final-release-runtime/database.db \
  --runtime-dir /Users/kerwynjean/.local/share/swale-local/final-release-runtime
```

Start only after stopping the existing controller through its ownership-checked
procedure. The API/broker use fixed loopback ports 8000/8001. The launcher strips
inherited environment, avoids application dotenv loading and disables unrelated
monitoring/tracing/operator jobs. It permits reviewed data reads and explicit
contextual actions while rejecting unrelated mutations. Both development and
production-preview frontend proxies use the guarded backend contract.

Frontend production preview, in a separate terminal:

```sh
cd /Users/kerwynjean/Swale-final-release/frontend
npm run build
npm run preview -- --port 4183
```

Open **http://127.0.0.1:4183/**. Choose **Backend / snapshot + transit** for real
connected records; **Subway monitoring** supplies supported station context.
Pause other live-board tabs before resuming updates. Development `npm run dev`
uses loopback 5173 and starts only Vite.

Stop the owned controller with the same paths:

```sh
/usr/bin/python3 -I -S /Users/kerwynjean/Swale-final-release/scripts/local/release_runtime.py stop \
  --root /Users/kerwynjean/Swale-final-release \
  --database /Users/kerwynjean/.local/share/swale-local/final-release-runtime/database.db \
  --runtime-dir /Users/kerwynjean/.local/share/swale-local/final-release-runtime
```

Foreground Ctrl+C also performs bounded cleanup. The old main launch command is
not the current startup path: its pre-existing dotenv configuration triggers the
older restricted launcher's refusal. Use the documented recovery path rather
than bypassing its guard or resetting a worktree.

Provider execution defaults to **zero budget**. Authorized positive allowance
also requires an explicitly selected private 0600 server credential file outside
the checkout. Secrets never enter browser assets, process arguments or commits.
The task's explicit $1 verification allowance has reserved **$0.81696**, consuming
all **3 model / 1 provider-audio attempts**. Remaining unreserved funds do not
grant more attempts. Preserve the same persistent ledger across restarts; never
reset it to replenish allowance. This README grants no new paid execution.

## Connected evidence and assistant

| Capability | Meaning and boundary |
| --- | --- |
| Snapshot | Inventory, 311 reports, full opaque-ID details, source freshness and bounded viewport paging |
| Subway | Supported MTA stations/entrances, predicted arrivals, available schedule comparisons, applicable alerts and monitoring samples |
| Flood context | Inferred exposure, DEP modeled polygons, derived sensor buffers and historical FloodNet evidence; not present flood extent |
| Weather | Separate NWS observations, interval-based forecast accumulation and supplied official alerts |
| Contextual assistant | Server-resolved selected evidence, explicit real-model requests and validated reversible UI actions |
| Fixture / DEMO | Separate synthetic scenarios, example priorities and scripted DEMO responses; never substituted for failed backend data |

The connected assistant uses the real backend and a bounded provider path. Its
English model selects server-prepared evidence sentences and validated actions;
it receives no arbitrary SQL, shell access, URLs or administrative tools.
Automatic selections use provider-disabled explanations. Explicit model requests
have separate opt-in, budget and attempt gates. Unavailable/rejected generation
is labelled as a template fallback, never successful AI. The existing fixture
assistant remains explicitly **DEMO** and scripted.

The mascot is a local simplified SVG interpretation of the supplied robot,
raincoat and umbrella concept. One hand-carried character follows selected
context. Separate motion/camera preferences and reduced motion retain useful
static explanations. Camera ownership, clipping and choreography acceptance
belong to browser evidence, rather than a claim based only on source.

Live verification covers genuine English model responses, Spanish machine
translation and explicit English provider-MPEG and Spanish local Mónica playback controls.
Provider English audio generation/binary retrieval is also recorded.
Translations remain **machine translated, not human reviewed**. Chinese, Arabic,
Russian and French are configured but not live verified here. Voice language is
distinct from translation and provider availability. Playing/paused/resumed/
stopped/replayed states do not establish human audibility or complete auditory
transcript agreement; those limits remain in the release record. There is no
autoplay. Context changes cancel incompatible explanations and narration.

Live transit/weather requests do not make inventory, reports or historical events
live. Source, fetch, event, forecast, ingest and hypothetical elapsed times remain
distinct. Errors stay visible without fixture substitution. The committed
schedule covers **October 16–23, 2026**; expired/unmatched comparisons are
unavailable, never zero delay or proof of service health. Monitoring samples are
not distinct long-term flood events. Stop-associated rows are not precise train
positions. Inventory, exposure, dated findings and administrative closure do not
prove present condition, causation, cleaning or accessibility.

## Themes, routes and report indicators

First visits default to light; explicit light/dark preference persists. Theme
changes restyle one map while preserving selection, view modes and scenario.
Light mode uses cool-white/pale-blue surfaces and navy text; dark mode retains
its established navy presentation.

The shared [official MTA palette](docs/FINAL_VISUAL_SEMANTICS.md) identifies
services across badges and source-associated route paths. Authentic yellow
N/Q/R/W services are the explicit exception to the mascot-only yellow rule.
Official fills do not change with theme, health or flood risk. Mixed-service
stations retain all supplied route labels.

Drain reports use a grate icon; pothole reports use a separate cracked-road
silhouette. A restrained red halo applies only to recognized recent unresolved
reports meeting the documented status/freshness gates; it does not confirm
current obstruction. Inventory, dated findings, historical/closed and uncertain
records remain static; closure never proves cleaning. Density grouping preserves
source counts and selected identities. Persisted pause and reduced motion retain
static, identifiable indicators.

## Verification and source tooling

```sh
cd /Users/kerwynjean/Swale-final-release/frontend
npm test -- --maxWorkers=4
npm run typecheck
npm run build
npm run lint
npm run format:check
```

The runtime documentation contains contained backend/helper test commands.
[FINAL_RELEASE.md](docs/FINAL_RELEASE.md) and the
[verification matrix](frontend/VERIFICATION.md) record fresh results and exact
revisions. Historical totals, compositor samples and resource warnings remain
historical. Browser matrix, motion, performance, native enforcement and final
runtime status are separate checks. No universal clean-console, hydraulic
validation or public-production-security claim is made.

The cached geometry builder and supplementary export viewer are documented in
[tools/mta-model](tools/mta-model/README.md). Full GLB/raw outputs remain ignored
local artifacts; bounded distributable assets live under
`frontend/public/infrastructure/`. The browser acquires no GIS datasets and the
builder does not operate on the application database. The separate export viewer
does not replace in-application acceptance.

The latest owner instruction authorizes scoped integrated implementation and
ordinary main publication after required verification; actual publication and
deployment must still be observed. It grants no new infrastructure, destructive
operations, unrelated features or additional paid usage. Broader
[backend documentation](backend/README.md) and [API contracts](docs/api/v1.md)
also describe operator features outside this guarded public flow. The historical
frontend contract remains **PROPOSED — NOT YET AGREED WITH BACKEND TEAM**.
