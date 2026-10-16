# Three-minute local Swale demonstration

Prepared walkthrough for the blue/black/white redesign; a complete browser
rehearsal and recording are not yet verified. A normal authorized local-preview
request was denied by the saved-site-permission gate, so browser checks stopped.
Do not describe this as an integrated production application.

Start with `npm --prefix frontend run dev`, then open http://127.0.0.1:5173/.
A WebGL2 desktop browser and internet for OpenFreeMap are required.

1. **0:00–0:20 — Purpose.** Explain that Swale is a proposed planner workspace for
   inspection priorities. Point to DEMONSTRATION and the synthetic-data footer.
   All infrastructure records and values are examples; only the basemap is real.
2. **0:20–0:50 — City view and themes.** Show the pitched Gowanus city model,
   pale buildings, transparent blue overlay and blue synthetic basin markers.
   Toggle light/dark and show that scenario, selection and camera remain intact.
   Explain the static
   OpenFreeMap building estimates. Zoom/rotate with map controls and use the
   location selector to move to Red Hook if desired. No administrative boundaries
   or boroughwide infrastructure coverage is claimed.
3. **0:50–1:20 — Scenarios.** Select Extreme 2080. Show changed illustrative zones
   and predefined score values. Read the rainfall/sea-level assumptions. Both
   assumptions differ; these shapes are not official DEP flood polygons. Switch
   back to Moderate Current and show that selection/layer choices remain.
4. **1:20–1:50 — Evidence.** Click a synthetic marker or queue entry. Show its ID,
   score, stored factors and weighted contribution points. Open source timestamps.
   Read “Inspection priority (heuristic, not validated)”. Nearby complaint examples
   are not proof of cause or blockage.
5. **1:50–2:20 — Assistant UI.** Open Swale Assistant using the raincoat mascot
   launcher. Point out the brief greeting wave/umbrella movement (or instant
   reduced-motion opening) and DEMO indicator. Use “Priorities in Red Hook”.
   The scripted response highlights only available fixture IDs and discloses its
   limited coverage. Use “Switch to extreme” or explain a selected basin. Explicitly
   say no LLM or backend query is connected.
6. **2:20–2:40 — Trust.** Ask “Is this drain blocked?” and show the explicit
   limitation. Open Sources & freshness and preview stale/unavailable forecast
   examples. Refresh only reloads local examples; source timestamps never advance.
7. **2:40–3:00 — Next phase.** Explain the co-founder owns production ingestion,
   GIS, scoring and real AI. Typed provider contracts isolate the UI, but the
   proposed contract and integration still need agreement and approval.

## Local fallback

`frontend/docs/swale-demo.png` is an actual captured browser screenshot with the
architectural city, sidebar and inspector. Capture predates the final camera and
readability fixes and this redesign. It does not depict the new theme or mascot.
Use only as an explicitly identified historical visual fallback if the
basemap is unavailable. Do not claim it is a working offline map.

The app shows a visible rendering error if WebGL/basemap fails. It does not switch
to an unapproved provider or invent infrastructure data. A fresh WebGL/browser
interaction pass must verify both themes, persisted preference, reduced-motion and
keyboard behavior, mascot repeatability and all original map actions. Real network,
frame and interaction-latency measurements remain necessary. No external
preview, deployment, paid service or Git push was created.

## Three-minute integrated candidate walkthrough — October 16

The earlier walkthrough above is retained as historical standalone preparation.
The frozen code checkpoint **63fd30e** adds an explicit snapshot mode. Overall
verdict is **CONDITIONAL**: direct basin-marker picking still needs manual
confirmation. Inventory list selection/detail/focus, direct incident map picking,
assistant, recovery, representative performance and repository audit passed.
No complete three-minute rehearsal recording was produced.
The retained development tab is healthy at port 5173; temporary production preview
was stopped after verification. Read docs/LOCAL_INTEGRATION.md for current
acceptance, service/process state and safe shutdown. Use the integration checkout.

In one Terminal, start the prepared credential-free backend:

```sh
/usr/bin/python3 -I -S /Users/kerwynjean/.local/share/swale-local/backend.py integration serve
```

In a separate Terminal:

```sh
cd /Users/kerwynjean/Swale-integration/frontend
npm run dev
```

Open **http://127.0.0.1:5173/**. If either intended port is occupied, reconcile its
owner; do not kill unrelated processes or choose a silent fallback. If the servers
are already running, use them without opening a second database writer.

1. **0:00–0:30 — Fixture baseline.** Point to **Data mode → Fixture / demo**.
   Show the pitched city, blue overlays and synthetic selected basin. The exact
   Moderate Current/Extreme 2080 assumptions apply only to these DEMO examples.
   Switch scenario once, emphasizing stored heuristic examples rather than a run.
2. **0:30–1:00 — Appearance and assistant.** Toggle light/dark without moving the
   map. Open the raincoat mascot; note the short wave or reduced-motion opening.
   Fixture replies are scripted DEMO, with existing history and keyboard closing.
3. **1:00–1:30 — Explicit snapshot mode.** Choose **Data mode → Backend / local
   snapshot**. Show observed catch-basin inventory and outlined reported incidents.
   This is committed BK0601 snapshot coverage, not a live feed or all Brooklyn.
   Loaded counts refer to the viewport/subset and can be capped/partial.
4. **1:30–2:00 — Source-grounded detail.** Select an inventory list row, then a report.
   Explain that inventory does not describe present condition; historical agency
   findings and inferred nearby-basin links are distinct from a public complaint.
   Missing fields stay unavailable. No scores, forecasts or polygons are invented.
5. **2:00–2:30 — Times and unavailable actions.** Open Sources and distinguish
   source update, original fetch and local ingest times. Refresh reloads the local
   snapshot, not NYC data. Open the mascot in backend mode: its data actions are
   explicitly unavailable; fixture chat is not an answer about these real records.
6. **2:30–3:00 — Return and boundary.** Return explicitly to **Fixture / demo** and
   show retained fixture context/history. Explain that backend errors stay visible
   without automatic fixture substitution. Simulations, rankings, sensors, AI/audio
   and live ingestion remain deferred. This local candidate has no main-merge or
   publication authority; partner-owned backend/science is unchanged.

Keep requests within the approved GET controls. Do not open the backend dev map,
submit deferred operations or stop services merely to stage a demonstration. The
separate QA record covers the actual visible disconnect and successful clean-launch
Retry recovery. The local reporting commit remains separate from this tour; neither
the walkthrough nor passed checks authorize a main merge or publication. Before
declaring complete browser acceptance, manually click a visible solid blue inventory
marker and confirm its full basin ID and inspector. Prior coordinate/window-mapping
errors and unconfirmed pointer hits are an evidence gap, not a demonstrated defect.
