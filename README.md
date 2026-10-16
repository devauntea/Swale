# Swale

A standalone 3D Brooklyn flood-readiness planning frontend. The current experience
uses small, explicitly synthetic demonstration fixtures. It does not identify
blocked drains, show live floods or provide emergency guidance.

The co-founder owns the production backend, data ingestion/GIS, scoring and real AI.
No backend implementation or integration is included. OpenFreeMap supplies the
permitted basemap and compatible building presentation. No API key is required.

## Local development

Prerequisites: a current supported Node LTS and npm, a desktop browser with WebGL2,
and internet access for the approved OpenFreeMap basemap resources.

```sh
npm --prefix frontend ci
npm --prefix frontend run dev -- --host 127.0.0.1
```

Open http://127.0.0.1:5173/ (the local URL printed by Vite). Keep the server on the local machine.
Production preview, after building:

```sh
npm --prefix frontend run build
npm --prefix frontend run preview -- --host 127.0.0.1
```

## Verification

```sh
npm --prefix frontend run typecheck
npm --prefix frontend test
npm --prefix frontend run build
git diff --check
```

See [frontend/VERIFICATION.md](frontend/VERIFICATION.md) for actual passing checks, partial browser observations and outstanding visual/performance checks. A successful build alone does not establish
that the interactive map renders.

## Architecture and demonstration mode

Vite, React, TypeScript, MapLibre GL JS and deck.gl. UI components consume a typed
LocalFixtureProvider; no partner-backend requests, production scoring or LLM calls.
Only local Vite assets and approved basemap resources are fetched by the browser.

The implemented standalone features are a pitched city model, two scenario overlays,
priority-colored synthetic basin markers, recent complaint points/historical hex
examples, layer controls, selection/inspector, forecast examples and scripted chat.
Every value and local geographic overlay is labeled DEMO. Published scenario
assumptions are separate from demonstration geometries. Example scores are stored,
not calculated. Refresh reloads local fixtures and reports integration pending;
source timestamps do not advance. Unsupported assistant requests explain the limit.

Contract: **PROPOSED — NOT YET AGREED WITH BACKEND TEAM** in
INTEGRATION_CONTRACT.md. Future integration needs agreement and separate approval;
no API paths, auth, server framework or database are assumed.

## Project guidance

Read AGENTS.md and PLAN.md for current frontend authority and acceptance criteria.
DATA_NOTES.md preserves historical Phase 0 source investigation; it is not live
application data. Images A/B/C guide architectural city rendering, overlays and
dark sidebar styling. No deployment, paid service or Git push is authorized.

## Demonstration and current limits

A three-minute walkthrough is in [frontend/DEMO.md](frontend/DEMO.md). The
[actual browser screenshot](frontend/docs/swale-demo.png) is a local visual fallback
captured during partial verification, before the final initial-camera/readability
changes. It is not a substitute for the interactive map.

TypeScript, the production build and 59 meaningful local tests pass. Partial Chrome
checks verified the basemap, detailed 3D buildings, scenario metadata/example-score
changes and independent building visibility. Remaining browser checks were blocked
when local-preview browser permission was declined. Browser transfer/FPS targets
are unmeasured, and no screen recording was made. See the verification report for
the exact scope and the seven upstream missing-sprite warnings observed.

No backend or real AI is connected. The frontend is implemented; complete
end-to-end acceptance remains pending the remaining browser checks. The future
backend contract must still be agreed with the co-founder before integration.
