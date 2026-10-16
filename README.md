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

## Themes and Swale Assistant

The blue/black/white interface starts in light mode on a first visit. Use the theme
control to select light or dark; the preference is stored in the browser. Both
themes keep the compact deep-navy sidebar and blue analysis layers. Map styling
changes in place so theme changes preserve geographic position, scenario and basin
selection. Yellow is reserved for the assistant mascot's artwork.

Open Swale Assistant from the compact raincoat-mascot launcher. The recognizable
local SVG is a simplified interpretation of the owner's concept, with a blue robot,
yellow coat and blue umbrella. Opening uses a short wave/umbrella animation;
reduced-motion preferences remove decorative motion. The panel supports keyboard
opening/closing, a composer, suggestions, history, processing and error states.
Actual motion smoothness, focus behavior and rendered contrast still require the
browser checks recorded in the verification report.

Assistant replies are scripted **DEMO** results from local fixtures. The five
demonstrations cover Red Hook priorities, an explanation for a valid fixture basin,
the extreme scenario, Gowanus complaint examples and the limits of a blockage
question. Only four validated UI actions can change the map: `set_scenario`,
`set_layers`, `highlight` and `fly_to`. Unsupported requests disclose the limitation;
there is no model execution, live search or actual blockage detection.

## Architecture and demonstration mode

Vite, React, TypeScript, MapLibre GL JS and deck.gl. UI components consume a typed
LocalFixtureProvider; no partner-backend requests, production scoring or LLM calls.
Only local Vite assets and approved basemap resources are requested by application
code. Theme and mascot presentation remain local and do not add data services.

The implemented standalone features are a pitched city model, two scenario overlays,
blue priority-band synthetic basin markers, recent complaint points/historical hex
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
application data. Images A/B/C guide architectural city rendering, overlay clarity
recolored blue and floating-sidebar styling. The new mascot sheet guides brand
identity and assistant artwork; its illustrative claims/features are not copied into
the application. No deployment, paid service or Git push is authorized.

## Demonstration and current limits

A three-minute walkthrough is in [frontend/DEMO.md](frontend/DEMO.md). The
[actual browser screenshot](frontend/docs/swale-demo.png) is a local visual fallback
captured during partial verification, before the final initial-camera/readability
changes and this redesign. It is not evidence of the redesigned interface or a
substitute for the interactive map.

The pre-redesign baseline passed TypeScript, production build and 59 meaningful
local tests. Earlier partial Chrome checks verified the basemap, detailed 3D
buildings, scenario metadata/example-score changes and independent building
visibility; seven missing-sprite warnings were observed. These historical checks
do not verify the redesign. Its normal browser-access request was denied by a saved
site-permission rule, so rendered acceptance remains **BLOCKED** and browser transfer,
FPS and interaction latency remain **NOT MEASURED**. See the verification report for
current automated results, sprite-investigation evidence and exact outstanding scope.

No backend or real AI is connected. Complete frontend acceptance remains pending
the required browser checks; no full rehearsal or recording is verified. The future
backend contract must still be agreed with the co-founder before integration.
