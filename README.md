# Swale

A map-first Brooklyn flood-readiness planning demonstration built with React,
TypeScript, Vite, MapLibre GL JS and deck.gl. The established default experience
uses explicitly synthetic **DEMO** fixtures. It does not identify blocked drains,
show live flooding or provide emergency guidance.

This isolated local integration candidate preserves the frontend and imports the
co-founder-owned backend. The approved connection is limited to read-only catch-
basin inventory, 311 reports, source metadata and health from a committed BK0601
snapshot. Implementation and acceptance progress are recorded in
[docs/LOCAL_INTEGRATION.md](docs/LOCAL_INTEGRATION.md). Passing standalone checks
does not establish a working integrated candidate.

## Local preview

Use the prepared integration checkout and task-owned credential-free launcher.
The backend environment and its own snapshot database must first be initialized
as recorded in the runbook. Do not create or load a credential file.

In one Terminal:

```sh
/usr/bin/python3 -I -S /Users/kerwynjean/.local/share/swale-local/backend.py integration serve
```

In a separate Terminal:

```sh
cd /Users/kerwynjean/Swale-integration/frontend
npm run dev
```

The intended frontend URL is http://127.0.0.1:5173/; the backend binds only to
127.0.0.1:8000. `npm run dev` starts the frontend only. The runbook records whether
these services have actually been started and observed. Stop each foreground
process with Ctrl+C in its own Terminal. Keep the preview on this Mac.

The existing locked frontend dependencies require Node >=22.12.0 and npm. The
task-owned backend uses Python 3.12 and its unchanged uv lockfile. Setup, isolated
test/ingest commands and containment limits are in the runbook; generic backend
commands in partner documentation are not the credential-free local workflow.
OpenFreeMap supplies the approved basemap and compatible building presentation;
no API key is required. Its resources require internet access in the browser.

## Data modes and limits

Fixture/demo mode preserves the pitched city model, two scenario overlays,
synthetic basin priorities, complaint points and historical hex examples, forecast
examples, selection/inspector, layer controls and scripted assistant. Its scenarios
are exactly `moderate_current` (2.13 in/hr, current sea levels) and `extreme_2080`
(3.66 in/hr, 2080 sea-level rise). Example values are stored, not scientifically
calculated; local fixture refresh does not advance source timestamps.

The approved backend mode is a separate snapshot-backed view with actual coverage,
source times and trust labels. Inventory says nothing about current basin
condition. A public complaint is reported evidence; historical agency findings and
inferred nearby-basin associations must remain distinct. Backend errors must stay
visible without automatically substituting fixtures. See the runbook for the
current implementation status and mode-selection instructions.

Sensors/flood observations, DEP flood-map presentation, simulations, rainfall
workflows, rankings, field-entry workflows, briefings, audio, conversational AI,
NWS/live ingestion and cloud runners remain outside this first connection. The
stock local backend mounts more routes than the frontend may call. Its CORS and
the frontend request allowlist are not server authorization controls.

## Themes and Swale Assistant

First visits start in light mode; the visible theme control persists an explicit
light/dark choice. Both themes preserve the deep-navy sidebar, architectural city
and blue analysis styling. Theme changes restyle the existing map in place.
Yellow is reserved for assistant mascot artwork.

The assistant uses a local simplified SVG interpretation of the owner's blue
robot, yellow raincoat and blue umbrella concept. Its short opening wave respects
reduced motion. Keyboard opening/closing, focus return, composer, suggestions and
history are preserved. Fixture replies remain scripted **DEMO** results, with only
four validated map commands: `set_scenario`, `set_layers`, `highlight`, `fly_to`.
Backend data actions are outside this slice; fixture history must never appear
grounded in backend records. No model execution is connected.

## Verification and ownership

```sh
cd /Users/kerwynjean/Swale-integration/frontend
npm run typecheck
npm test
npm run build
npm run lint
npm run format:check
git diff --check
```

[frontend/VERIFICATION.md](frontend/VERIFICATION.md) preserves the actual historical
standalone acceptance evidence and will record fresh candidate results separately.
The three upstream Liberty filter warnings remain documented. Historical browser
performance and screenshots do not establish new integrated acceptance.
[frontend/DEMO.md](frontend/DEMO.md) contains the standalone walkthrough.

The co-founder owns backend source, databases, ingestion/GIS, scoring and real AI.
Partner references remain available: [backend overview](backend/README.md),
[draft API](docs/api/v1.md), [source register](docs/data-sources.md), and
[backend design](docs/design/2026-10-15-swale-backend-design.md). These references
describe broader capabilities; they do not authorize executing them.

Read AGENTS.md and PLAN.md alongside the owner's October 16 bounded integration
authorization. DATA_NOTES.md preserves historical Phase 0 investigation.
INTEGRATION_CONTRACT.md remains **PROPOSED — NOT YET AGREED WITH BACKEND TEAM**;
this owner-approved local consumer slice does not imply agreement to that entire
proposal. Main and its original worktree remain unchanged. A later explicit owner
instruction is required before merging into main. Push, PR, deployment, public
sharing, credential activation and connected-service changes are not authorized.
