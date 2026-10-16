# Standalone frontend verification

This report records checks actually performed on October 16, 2026. It does not
establish completion of the integrated application, scientific validity, or
production-data coverage. Infrastructure records, overlays, scores, forecast and
assistant responses are local synthetic examples. The basemap/building tiles are
the permitted OpenFreeMap resources.

## Automated checks

| Command | Actual outcome |
| --- | --- |
| `npm --prefix frontend test` | PASS: four files, 59 tests; latest run 00:54:36 EDT, Vitest 5.0.5, reported duration 125 ms. |
| `npm --prefix frontend run typecheck` | PASS: TypeScript `tsc --noEmit`, zero exit status after the tests and state changes. |
| `git diff --check` | PASS: zero exit status. |

The Node tests exercise real local modules rather than a mocked map renderer:

- Fixture/provider consistency, unmistakably synthetic IDs, valid references,
  scenario definitions and category-3 exclusion, closed geographic rings within a
  broad display extent, and stored score/contribution coherence. Extent checks
  are not administrative-boundary or production GIS validation.
- Local load/refresh makes no `fetch` calls, preserves original provenance and
  forecast times, provides empty/error/stale/unavailable examples, and prevents
  consumer mutation from changing the fixture constants.
- Zero rainfall remains a valid example, distinct from null/unavailable; units are
  accumulated millimeters over explicit validity intervals. Known instants format
  in New York, while unknown timestamps remain unknown.
- Four frontend command schemas reject unknown tools, extra fields, unsafe
  coordinates, invalid IDs, non-boolean layer values and excessive/duplicate
  highlights. Unknown IDs are rejected atomically.
- Scenario changes preserve selection/highlights/layer choices/camera requests;
  layer changes are independent; genuine snapshot replacement safely removes
  invalid references. These tests do not measure actual camera rendering.
- All five required assistant prompts exercise scripted fixture responses and
  approved UI actions, with known IDs, stored values, explicit DEMO labels and
  honest coverage/AI/backend limitations. Unsupported/safety/empty/error cases
  and selected-basin highlighting are covered.

Tests identified an actual identifier bug: a suffixed unknown ID such as
`SYNTHETIC-RH-01-extra` initially matched the valid ID as a substring. Exact-token
matching was corrected, and both explanation/highlight regressions now pass.

No DOM/WebGL mock test is counted as proof of map rendering. No backend endpoint,
LLM service, production scoring or public-data ingestion was exercised.

## Actual browser observations

Browser: Google Chrome **155.0.8059.84**, macOS **26.5.2**, arm64. CPU/RAM were not
measured. Dedicated local QA tab: `http://127.0.0.1:5173/`; no user tabs were
modified. This was the Vite development server, not a production preview.

Initial normal viewport screenshot was approximately 931 by 1158 pixels. A temporary
1440-by-900 viewport override was then used for the requested desktop layout check;
the existing browser zoom produced actual DOM dimensions of **1600 by 1000 CSS
pixels**, reported devicePixelRatio approximately **0.9**. The override was left in
place when further browser activity was stopped, as instructed; no subsequent
cleanup or UI action was attempted.

Observed before browser activity stopped:

1. Brooklyn basemap, transparent demonstration zones, basin markers, complaint
   points/density examples, dark sidebar, inspector, forecast example and visible
   OpenFreeMap/OpenMapTiles/OpenStreetMap attribution rendered.
2. Initial overview was too distant for visible building extrusions. This defect
   was reported. Selecting **Gowanus** moved to a detailed pitched city view with
   extensive pale building extrusions, visible streets and legible overlays. A
   later code correction to the initial target requires a fresh browser check.
3. At the wider desktop dimensions the map remained visible between the floating
   panels. Sidebar content scrolls at shorter heights; no complete responsive or
   keyboard-accessibility pass was performed.
4. Clicking **Extreme 2080** changed the active scenario, published intensity
   **2.13 to 3.66 in/hr**, sea-level assumption to **2080 Sea Level Rise**, selected
   `SYNTHETIC-RH-01` stored score **84 to 91**, and displayed contributions to
   **36 / 40 / 15**. The selected identifier persisted. A formal numerical camera
   retention measurement was not performed.
5. Clicking the **3D buildings** switch off visibly removed extrusions while the
   flood overlay, colored basin points and density examples remained. Other
   switches were not subsequently exercised in the browser.
6. Captured console messages at the first detailed Gowanus view contained no
   errors and seven missing Liberty sprite warnings: `sailing`, `running`, `gate`,
   `ferry_terminal`, `bicycle_parking`, `brownfield`, `office`. This observation is
   scoped to the captured log window; a final clean-console pass was not run.

The actual detailed-city screenshot was saved locally as
`/tmp/swale-ui.png` for shared visual review. A copy is retained at `frontend/docs/swale-demo.png` as a documented local
visual fallback; it is not loaded as application/map data. It shows the Gowanus city view before the later scenario and
building-visibility toggles. Screenshots were also emitted during inspection.

## Browser verification interruption

Further browser actions were stopped immediately after the root session reported
that browser creation/access had been denied, with a tool instruction stating
that the user declined browser permission and forbidding alternate access. No
attempt was made to continue through another tab, browser surface or automation
tool. Existing screenshot evidence and safe Node checks were retained.

The following remain **NOT EXECUTED in the browser**, despite relevant pure unit
tests passing:

- All five assistant prompts, composer/loading/history/error behavior and their
  resulting rendered map actions.
- Actual marker click/hover selection, complaint picking, focus/reset/2D controls,
  zoom/pan/rotation regression checks and selected marker emphasis.
- Catch basin/flood/complaint toggle behavior, dynamic legend changes, hidden
  selection hints, and full independent-layer regression sequences.
- Refresh interaction and unchanged on-screen source times; source settings,
  empty/error recovery, and stale/unavailable forecast presentation.
- Forced WebGL/context-loss or basemap-unavailable behavior.
- Final initial-camera fix, final visual/console review, shorter desktop viewport,
  keyboard navigation and focus behavior.
- A complete three-minute browser rehearsal and screen recording.

These checks require renewed browser access. The partial observations above must
not be reported as all V3–V12 requirements passed.

## Scope/security and performance limits

Source inspection of `frontend/src` found no `fetch(`, `XMLHttpRequest`, WebSocket,
NWS, NYC Open Data or OpenAI endpoint clients. The only HTTP URLs found were the
approved OpenFreeMap style and basemap provenance links. The provider test also
asserts zero network fetches during local load/refresh. This is not a complete
browser network capture or a substitute for the final repository secret/diff audit.

**Initial app-controlled transferred bytes: NOT MEASURED.**
**Basemap transferred bytes: NOT MEASURED.**
**Representative map FPS/frame-time distribution: NOT MEASURED.**
**Scenario-switch latency: NOT MEASURED.**

No pass is claimed for the 20 MB transfer or 30 FPS targets. Asset sizes from a
build, perceived smoothness and Node test timing do not establish browser
transfer/rendering performance. Production-preview measurements and an actual
browser interaction trace remain outstanding.

Frontend compilation and the tested local contracts pass. Frontend end-to-end
acceptance remains partially verified because the remaining browser checks were
blocked. Backend implementation/integration and real AI remain deferred.

## Final code/build review after partial browser inspection

The initial camera now starts at the verified Gowanus basemap label point at zoom
15.5 and ignores the initialization-only nonce; the initial selected fixture is
`SYNTHETIC-GW-01`. The location selector follows valid navigation requests. A map
retry replays genuine pending camera requests. These fixes pass TypeScript and
unit tests but were not rechecked in the browser after permission was declined.

The pending scripted-chat callback now reads the latest loaded snapshot/state,
avoiding actions against a fixture replaced during its local loading indicator.
Small provenance/body text was enlarged and contrast improved; exact score wording
is also present in the queue. These final visual changes await a browser recheck.

`npm --prefix frontend run build` passes with Vite 8.3.4. The map is a lazy module
so the React workspace shell can load separately. Final minified build output is
approximately 272.17 kB for the app shell, 1,741.26 kB for the map module and
507.71 kB for the bundled MapLibre worker, plus CSS and smaller rendering modules.
These are artifact sizes, **not actual transferred-byte measurements**. The build
no longer reports a chunk-size warning at the configured 1,800 kB map threshold.

A prepared walkthrough is in `frontend/DEMO.md`; a full rehearsal and recording
remain unexecuted. No production preview sharing, deployment, paid calls or push
occurred. Root reviewed the captured screenshot against images A/B/C; it confirms
the architectural city and floating-panel direction before the final refinements.

Phase 1's first explicitly recorded work timestamp was 2026-10-16T04:36:25Z, after
documentation reconciliation. Earlier active duration (including Phase 0) is not
precisely measured; this report does not reset or claim a fresh eight-hour budget.

Final staged security/scope checks: `git diff --cached --check` passed;
`git grep --cached` credential patterns returned no matches (exit 1). A separate
credential scan of all staged text files also found no matches. Only frontend
files and explicitly needed root docs/config are staged; `.vscode/`, `.env`,
`node_modules` and `dist` are excluded. `git check-ignore` confirms env/dependency/
build paths are ignored. Phase 0 DATA_NOTES evidence was verified byte-for-byte
preserved after its additive scope annotation. No lint configuration is present;
no lint pass is claimed. The source has been formatted consistently with Prettier.

Final safe-check documentation timestamp: 2026-10-16T04:55:47+00:00.


## Permission diagnosis and current acceptance matrix

Updated: 2026-10-16T05:10:10+00:00. Implementation baseline remains local commit
`f3ab496`; no application code or browser permissions were changed during this
follow-up. The existing preview and development servers were preserved.

### Connection and required permission

Read-only browser discovery identifies **Chrome**, browser connection `1`, profile
`K.`, transport `extension` (the ChatGPT browser extension). The denied operation
was opening `http://127.0.0.1:4173/`; the tool explicitly reported that website
permission had been declined. Discovery confirms the connection exists, not that
this website is authorized. No denied URL was retried during this diagnosis.

The required permission is ChatGPT website access to host **127.0.0.1** so the
existing Chrome connection can read and interact with the local preview. Official
documentation describes host-based site decisions. The actual blocklist entry was
not inspected, so its exact stored representation is not asserted.

Supported user action, from the [official browser-extension documentation](https://learn.chatgpt.com/docs/chrome-extension#manage-allowed-and-blocked-websites):
open desktop-app Settings > Computer Use, choose Manage beside Chrome, and remove
127.0.0.1 from blocked websites if present. This lets a subsequent website request
ask again; approve only that site/occasion when prompted. Chat confirmation alone
has not restored tool access. No permission mutation, alternate browser, CDP,
headless automation, hostname substitution or indirect access was used.

The agent will wait for explicit confirmation that the actual setting has been
restored before making one normal browser request. If it is denied again, stop
rather than retry. Remaining acceptance must use the original three visual
references and actual current rendered behavior.

### Current checks and evidence

| Check | Status | Actual evidence / scope |
| --- | --- | --- |
| Existing implementation preserved | PASS | Follow-up started at HEAD f3ab496 with no tracked changes; application source was not edited. |
| Production preview preserved | PASS | Existing node PID 61855 listening on 127.0.0.1:4173; no restart/stop or HTTP/browser probe used for this check. |
| Development server preserved | PASS | Existing node PID 58514 listening on 127.0.0.1:5173. |
| TypeScript | PASS | `npm run typecheck` in frontend: zero exit status, October 16 follow-up. |
| Local unit/contract tests | PASS | `npm test`: 59 tests across four files, 01:08:25 EDT, 95 ms; all passed. |
| Production build | PASS | `npm run build`: zero exit status; 964 modules; Vite reported 270 ms. |
| Built local assets | PASS | 13 dist files, 2,802,357 total disk bytes; HTML's local asset references exist. This is not network transfer. |
| Credential-pattern scan | PASS | Tracked textual scan returned zero matches; this is pattern evidence, not an exhaustive security guarantee. |
| Ignore rules | PASS | Env, local env, dependency and build paths matched .gitignore. |
| Whitespace/diff check | PASS | `git diff --check` returned zero exit status. |
| Frontend-only source scope | PASS | Source scan found no production NYC/NWS/OpenAI client or backend implementation; approved OpenFreeMap URLs remain. |
| Historical detailed 3D view / attribution | PASS | Prior captured Chrome Gowanus view in docs/swale-demo.png; not a final-version recheck. |
| Historical scenario presentation | PASS | Prior Chrome click changed intensity, sea-level assumption and stored score while retaining selected ID; not a formal current camera measurement. |
| Historical buildings visibility | PASS | Prior Chrome switch removed extrusions while other overlays remained. |
| Original startup camera | FAIL | Original browser view was too distant. Code/default-target correction is committed; final browser validation remains BLOCKED below. |
| Captured missing-sprite resources | FAIL | Seven upstream Liberty missing-sprite warnings in prior captured console window; no final clean-console check. |
| Website permission for current preview | BLOCKED | Last actual URL-access attempt was rejected as user-declined. No retry during this diagnosis. |
| Final visual comparison with A/B/C | BLOCKED | Current camera/readability refinements still need actual browser inspection. |
| Five assistant UI prompts / loading / responses / map effects | BLOCKED | Unit scripts pass; actual browser flows not yet executed. |
| Marker click/hover, complaint pick, selection/focus | BLOCKED | Needs browser interaction, not inferred from unit tests. |
| All layers, legends, scenario/camera/selection regressions | BLOCKED | Only historical partial observations above exist; complete current sequence outstanding. |
| Refresh and source timestamp display | BLOCKED | Pure provider tests pass; browser controls/unchanged dates outstanding. |
| Stale/unavailable forecast, empty/error recovery UI | BLOCKED | Data contract tests pass; actual rendered states outstanding. |
| Zoom/pan/rotation, 2D/3D/reset, keyboard/short desktop | BLOCKED | Complete current browser sequences outstanding. |
| WebGL/context-loss and basemap-unavailable UI | BLOCKED | No browser fault-injection check performed. |
| Final console and browser network scope | BLOCKED | Static source scan is not a complete runtime capture. |
| App-controlled initial transferred bytes | NOT MEASURED | Browser capture unavailable; build disk sizes cannot substitute. |
| Basemap transferred bytes | NOT MEASURED | No browser network capture. |
| Map FPS / frame-time distribution | NOT MEASURED | No representative browser performance trace. |
| Scenario-switch latency | NOT MEASURED | No browser interaction timing capture. |
| Complete three-minute rehearsal / recording | BLOCKED | Walkthrough is prepared; interactive rehearsal and recording remain outstanding. |
| Frontend fully verified | BLOCKED | Browser acceptance and performance evidence remain incomplete. |

The historical FAIL entries are retained as observed findings rather than hidden
by passing builds. No backend changes, Git push, deployment or scope expansion
occurred. Do not interpret the passing non-browser checks as complete frontend
verification.
