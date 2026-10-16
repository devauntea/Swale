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
npm --prefix frontend install
npm --prefix frontend run dev -- --host 127.0.0.1
```

Open the localhost URL printed by Vite. Keep the server on the local machine.
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

See frontend/VERIFICATION.md for actual browser, interaction, security and performance
results once verification is completed. A successful build alone does not establish
that the interactive map renders.

## Architecture and demonstration mode

Vite, React, TypeScript, MapLibre GL JS and deck.gl. UI components consume a typed
LocalFixtureProvider; no partner-backend requests, production scoring or LLM calls.
Only local Vite assets and approved basemap resources are fetched by the browser.

The planned standalone features are a pitched city model, two scenario overlays,
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
