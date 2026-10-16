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
