# Local integration checkpoint — October 16, 2026

**CONDITIONAL — direct basin-marker picking requires manual confirmation.**
Backend gate, 125 frontend tests, actual API, frozen disconnect/recovery,
assistant, production preview, measured performance and the pre-documentation
repository audit passed. Complete browser acceptance is not established: basin
list selection/detail/focus and direct incident map picking passed, but a direct
basin-marker hit was not confirmed. Chrome displayed both modes. A successor must
reconcile fresh state before continuing. First current-session clock sample:
**2026-10-16T10:48:46Z**, with final browser evidence through approximately
**11:38Z**; these clock samples are not total active-work accounting. Historical
cumulative active time remains unmeasured and the original budget is not reset.

## Authority and frozen inputs

The owner's October 16 “Authorized Local Integration, Regression Verification, and
Preview” instruction authorizes the bounded local candidate, prerequisite setup,
containment, selected offline tests, committed-snapshot initialization, isolated
merge, frontend consumer and loopback preview. It supersedes older preparation-only
restrictions only for these actions. Broader partner capabilities remain deferred.

| Input | Verified value |
| --- | --- |
| Original checkout | `/Users/kerwynjean/Swale`, branch `main` |
| F: preserved frontend | `5fad6b4ebf17c58a1ca427a3ba742d1e843f9e7b` |
| Unpublished commits retained | `9ad3aa1`, `6f33d40`, `5fad6b4` |
| Observed origin/main | `aa08a17d166cbf0f23281627a74289fe8f7efe43` |
| B: reviewed backend | `c4a438bd7b4cb6cd1b199706414dda0790e75ae9` |
| Original review, preserved | `/Users/kerwynjean/Swale-backend-review`, detached `32901ecb1cc7dbe4b4268f76cbc96b6f700f45dc` |
| Fresh detached review | `/Users/kerwynjean/Swale-backend-review-c4a438b`, B |
| Integration checkout | `/Users/kerwynjean/Swale-integration` |
| Integration branch | `integration/frontend-backend-v1`, created from F |
| Local merge commit | `8e4734b47ab993b9025aca9bfe2186b7df60fbe4` |
| Frozen code checkpoint | `63fd30e47d852b592dd620f1a991838217c0fac4` |
| Final reporting checkpoint | A following documentation commit records acceptance; its own SHA is reported externally rather than self-referenced here. |

Fresh authorized fetch advanced the backend by three commits. Read-only delta
review covered dependency, schema, startup, approved route and selected test
assumptions. New weather/flood-map/inspection routers are mounted but do not call
external services at import/startup. Snapshot ingest now also loads committed DEP
polygons offline. New locked dependency: pyogrio 0.13.0. Only README.md/.gitignore
conflicted; both were manually reconciled, preserving frontend features and partner
references. Root committed the local merge after verifying F and B ancestry,
backend tree equality to B and frontend equality to F. Its staged 103-path scan
reported zero secret/artifact findings and diff check passed. No backend-owned
file was edited. Final ancestry/backend/lockfile/main/file/index checks were
repeated after implementation and documentation staging.

## Prerequisites and offline gate

Task-owned root: `/Users/kerwynjean/.local/share/swale-local/`. Sanitized logs under
its `logs/` directory were inspected; operator results establish this slice's gate,
not full backend readiness.

- uv **0.13.1** release archive checksum verified:
  `cfe454573412ff7380d15fc7dae5997ab53ffce72fce0a78e91ddbc84001acd2`.
  uv-managed Python **3.12.15** and existing locked dependencies installed into
  approved task paths. Integration has its own locked environment and snapshot DB;
  download caches were reused, virtualenvs were not copied.
- Six source-reviewed modules passed: **113 tests / 8.02 seconds**:
  test_core.py, test_311_rules.py, test_db.py, test_ingest.py, test_api.py,
  test_contract.py. These use in-memory DBs/recorded fixtures/in-process HTTP. No
  full-suite collection or live/simulation/ranking/briefing execution occurred.
- Before adapter changes, integration frontend `npm ci --ignore-scripts` preserved
  its lockfile. **95 tests across 7 files**, typecheck, build, lint and format passed
  on Vite **8.3.4**. This is baseline evidence, not candidate acceptance.

Logs: `backend-offline-tests.txt`, `backend-sync.txt`, `frontend-npm-ci.txt`,
`frontend-baseline.txt`, `backend-integration-sync.txt`,
`backend-integration-ingest.txt`.

## Clean environment and containment

Helper: `/Users/kerwynjean/.local/share/swale-local/backend.py`, invoked with
`/usr/bin/python3 -I -S`. Each launch checks checkout backend/.env absence without
reading it, creates an explicit environment and isolated runtime home, excludes
inherited credentials/profiles/proxies/Python/pytest configuration, disables PROJ
networking, selects an absolute database URL, closes extra descriptors and executes
that checkout's virtualenv under native sandbox-exec. It creates no .env files.
The real `/Users/kerwynjean/.env` was not read, copied, changed, activated or validated.

Backend Settings automatically loads checkout-local backend/.env; absence guarding
and sandbox read restrictions account for that behavior. Startup applies schema,
seeds three design storms per loaded area and marks interrupted runs failed, without
submitting simulations. Credential-driven Arize startup is prevented by clean env.

Credential-free positive controls established working TCP/UDP. Offline and serving
profiles produced **EPERM** for tested loopback/reserved-external IPv4 outbound
TCP/UDP, including exec-created child inheritance. Offline also denies loopback.
Serving permits the intended 127.0.0.1:8000 inbound/listen response while denying
new outbound connections. A temporary loopback probe responded and was closed.
Nonsecret marker read/write probes were denied; credential reads were never used.
Profiles deny resolver IPC. These probes establish their tested enforcement scope,
not universal isolation or exhaustive DNS/platform coverage. Evidence:
`logs/containment.json`, `logs/containment-python312-output.json`, `profiles/offline.sb`,
`profiles/serve.sb`. Dependency downloads/audit are separate tooling network steps;
backend external-network permission remains zero.

## Snapshot counts and timestamps

With servers stopped, new task-owned databases were initialized from committed
sample_data/bk0601 in each checkout's `backend/var/local-integration-v1.db`. No
existing DB was replaced. Review and integration counts match:

| Table | Count |
| --- | ---: |
| area | 1 |
| catch_basin | 2,093 |
| incident | 7,472 |
| sensor | 17 |
| flood_event | 83 |
| near_basin | 5,594 |
| data_source | 6 |
| ingest_run | 5 |
| flood_map_feature | 1,802 |

All original transform rejects were **0**; accepted source counts match this
manifest, not a rule to force future totals. **726 basins are outside the BK0601
polygon** and retain empty area_ids. Coverage is the source bbox
`[-74.01995197798658,40.66456833578927,-73.97961680019212,40.692549071104274]`.
Near-basin links are existing inferred nearest-within-150-ft associations, not
causation or current obstruction. Backend transform rejects missing coordinates;
nullable API detail geometry still needs frontend handling without invented points.
Of 7,472 incidents, 5,594 have such a link and 1,878 are unlinked.

Original bundle fetched_at stays **2026-10-16T05:30:00Z**, since **2020-01-01**.
Review ingested_at is **2026-10-16T10:53:45Z**. Dataset updates remain NTA
2026-05-28T15:11:19Z; basins 2025-12-18T16:29:33Z; 311 2026-10-16T01:37:53Z;
sensors 2026-10-15T13:00:37Z; events 2026-10-15T13:00:23Z.

DEP snapshot adds 196 moderate/current, 437 moderate/2050 and 1,169 extreme/2080
polygons offline. Original fetched_at is **2026-10-16T09:21:38Z** (fractional seconds
in snapshot), review ingested_at **2026-10-16T10:53:48Z**, dataset update **null**.
Limited scenario is unavailable due to the recorded compressed-format issue. These
stored capabilities remain undisplayed/deferred; category 3 is future high tide,
not stormwater. No live download CLI was run. All six sources were nonstale at
review audit time; freshness remains calculated from original fetch, not replay.

Source update, fetched, ingested, reported/closed/finding and response-generated
timestamps remain distinct. 311 source.updated_at is its resolution-action time,
not a general row-update measurement. Integration original-source run keys record
**2026-10-16T10:56:55Z**, distinct from the earlier review initialization; final API
evidence must retain actual integration ingest times and original source fetch times.
Evidence: `logs/backend-review-ingest.txt`, `logs/backend-review-audit.json`, plus
integration-specific logs in the same task-owned directory.

The initial integration DB was ingested before merge while HEAD was F. With the
server stopped, a direct offline audit confirmed all five ingest runs recorded
`code_version=5fad6b4`; backend working content was B. That original DB is preserved,
with evidence in `logs/backend-integration-baseline-audit.json`.

After freezing code at **63fd30e**, the unchanged backend initialized a separately
named final DB:
`/Users/kerwynjean/Swale-integration/backend/var/local-candidate-63fd30e.db`.
Original sources ingested at **2026-10-16T11:14:46Z**, DEP at **11:14:49Z**;
original fetch/update times remain unchanged. A direct offline audit verified the
same table counts, all five run `code_version=63fd30e`, snapshot mode and zero
transform rejects. No DB was replaced or provenance rewritten. The launcher now
selects this final DB for integration. Evidence: `logs/backend-final-ingest.txt`,
`logs/backend-final-audit.json`. No DB audit ran simultaneously with the server.

## Implemented consumer boundary

`frontend/src/backend/{contracts,client,provider,useBackendData,routes}.ts` supplies
separate snapshot models, runtime validation, source-aware transport/adaptation and
request lifecycle. App/map and new backend panels/stylesheet expose **Data mode**:
**Fixture / demo** remains default; **Backend / local snapshot** selects real local
snapshot records. LocalFixtureProvider and synthetic fixture meaning are preserved.
Backend records are not coerced into DemoSnapshot.

One shared guard permits only seven GET route shapes: health, layers, sources,
catch-basins, catch-basins/{full ID}, incidents, incidents/{full ID}. Client and
Vite dev/preview proxy use it; isolated guard tests submit no real prohibited POST.
Vite binds strict loopback ports 5173/4173 and targets 127.0.0.1:8000, with env loading
at frontend root. `allowImportingTsExtensions` enables Vite 8's native loading of
the shared TypeScript guard without its earlier native-loading warning.

Settled viewport requests debounce **250 ms**; each collection is bounded at
**4 pages × 500 / 2,000 features**. Incident time filters freeze per pagination
sequence. Abort signals and generation checks reject stale responses, modes/bounds
reset paging, repeated cursors fail visibly, and the client enforces a **10-second
timeout / 4 MiB response-body cap**. Opaque encoded IDs, lon/lat, nullable geometry,
zero, source/ingest/fetch/generated times and safe source text/links are retained.
Partial/truncated/stale/loading/empty/error states remain explicit. HTTP 200
degraded health stays degraded; errors never substitute fixture records.

The single map instance and mode-scoped selections/history remain separate.
Backend inventory, reported complaints, observed historical agency findings and
inferred associations receive distinct labels. Backend mode disables fixture
scenarios, polygons, priorities, forecasts and assistant data commands; mascot,
opening/focus and clear read-only explanation remain available. Sensors, flood
observations, DEP presentation, simulations, rankings, inspection-entry workflows,
briefings/audio/AI, NWS and live ingestion remain deferred. Mounted stock backend
routers are a local-exposure limitation: frontend guard/CORS are not backend
authorization. Dev map stays off. The broader integration contract stays proposed.

## Actual API and candidate verification

At **11:04:38–11:04:40Z**, a clean isolated stdlib client performed **22 approved
GET requests** against the actual contained backend. Health was HTTP 200 **ok**,
embedded DB, six nonstale sources and four false optional-integration flags; flags
are not authentication evidence. Full encoded IDs, detail provenance, two distinct
cursor pages per collection, fixed incident filters, category/verification/basin
filters, empty collections and safe 422/404 problem responses passed.

Exact manifest bbox returns **2,092 basins**, correctly excluding committed
CB306880 just east of its max longitude; both original geometry and row longitude
place it outside. Slightly expanded bbox returns all **2,093**. The first probe's
incorrect raw-count-equals-bbox assertion is preserved in evidence, then reconciled
from committed rows without backend edits. The one-year explicit window
2025-10-16T00:00Z through 2026-10-16T10:56:55Z returned **1,398 reported incidents**:
1,097 inferred links, 301 null links, 414 null addresses and 115 null closed times.
All inspected coordinates were finite, ordered and within requested bbox. Filter
results were 174 clogged-basin reports, 85 agency-obstruction findings and 9 linked
to the selected basin. No null geometry or zero-distance link occurred in this
actual sample; those and degraded-200 behavior are covered with labelled mocks.
The generated basin-to-incidents link lacks required bbox, so the client constructs
its own parameters. No arbitrary links, prohibited routes, raw payload/source text
logs or simultaneous database audit were used.

Evidence: task-owned `logs/api-actual.json` (including the earlier failed assumption).
Bodies total **3,933,502 decoded JSON bytes across 22 requests**; this is API probe
volume, not browser initial-transfer or wire-performance evidence.

After final DB initialization and confirming its loopback listener, the same
22-request GET verification passed again against frozen code and the final DB;
new evidence is `logs/api-final.json`, preserving `api-actual.json` untouched.
The explicit final incident window ends **2026-10-16T11:14:46Z**. Counts/trust/null/
filter/error results match the earlier pass; API health reports build **63fd30e**
and the new actual ingest times, with original fetch timestamps retained.

| Candidate check | Current evidence |
| --- | --- |
| Automated frontend checks | PASS: **125 tests / 11 files**, original 95 retained plus 30 new; strict TS, build, lint and format pass. |
| New test scope | Validation/problem/degraded health/null/zero/provenance; timeout/body caps/cancellation/races/paging; explicit mode/selection/assistant isolation; partial/error recovery and Sources focus. Backend failure/degraded/null edge tests use mocks. |
| npm security audit | PASS: zero reported vulnerabilities, separately authorized registry metadata operation. |
| Chrome candidate rendering | PASS for inventory list selection/detail/focus, direct incident map picking, one map canvas and visually retained camera through mode/theme changes. Native preview 4173 displayed both modes; dev/preview proxies responded. Direct basin-marker picking remains UNCONFIRMED below. |
| Remaining browser acceptance | CONDITIONAL: manually click a visible solid blue inventory marker and confirm its full basin ID and inspector. Native coordinate actions returned windowNotFoundAtPosition; pointer/canvas-center attempts did not establish a marker hit. This is an evidence gap, not a demonstrated picking defect, permission denial or security block. No complete browser pass is claimed. |
| Themes/startup | PASS: explicit light and dark preferences survived reload, initial source mode remains fixture. In-place theme changes preserve the map. |
| Responsive layouts | PASS in both modes/themes at tablet 768×1023, narrow 622×720 and mobile 390×842; no observed overflow or inspector/legend overlap. Sources/error placement and read-only mobile assistant/focus passed. These sizes are not exhaustive device coverage. |
| Frozen real disconnect/recovery | PASS: stopped final backend, Refresh showed HTTP 502 while retaining Backend mode without fixtures. Restart through exact clean launcher, Retry restored 1,668 basins/1,001 incidents at the actual 974×896 viewport; original fetch/ingest times retained. Earlier development HMR reset is distinct from this frozen pass. |
| Fixture assistant and mode isolation | PASS: all five scripts exercised; backend history unchanged, suggestions/result actions disabled, composer read-only and no scenario controls. Selected CB305000 restored after mode cycle. |
| Mascot/motion/focus | PASS: normal opening/settled views, wave/umbrella CSS duration 0.65 s, cleanup/cancellation around 0.625–0.650 s and no continuous motion. Native reduced-motion emulation matched true with no active mascot/decorative animations; keyboard opening focused input and Escape closed/returned focus. Emulation restored. |
| Performance | PASS for representative measured compositor camera windows and <=20 MB application transfer; details/limits below. |
| Palette/contrast | PASS source audit: 36 owned files, yellow only mascot; 16 enabled text token pairs/theme, light minimum 4.8962 and dark 5.3408 (>=4.5). Static calculations, not formal WCAG certification. |
| Repository/security finalization | PASS before documentation commit: F/B ancestors, backend exactly B, frontend manifest/lock exactly F, original main/files/index unchanged; no active hooks, secret/artifact findings or whitespace errors. Root repeats after staging/reporting commit. |

Logs: `logs/frontend-final-checks-pass.txt`, `logs/npm-audit.json`,
`logs/final-style-audit.json`.
Browser screenshots are local ignored evidence under
`frontend/verification-artifacts/integration/`, including backend-dark,
tablet-768-backend-light/dark, mobile Sources/assistant/disconnected views.
Three documented upstream Liberty warnings remain. Native console also showed
repeated `runtime.lastError: Receiving end does not exist`; extension attribution
is plausible but unproven. No clean-console claim or warning suppression is made.
Initial HAR has no failed request/unexpected origin. Historical evidence in
frontend/VERIFICATION.md is unchanged. A walkthrough is prepared; no complete
three-minute rehearsal recording was produced.

Final browser qualification is recorded in
`frontend/verification-artifacts/integration/browser-final-qualification.json`.
Coordinate/window-mapping failures and unconfirmed pointer hits do not establish
an application defect or justify attributing the gap to an extension. Browser
experiments stopped; overview camera and incidents were restored, with healthy
CB305000 selected from the inventory list. The remaining review is one actual
visible basin-marker click and matching full-ID inspector confirmation.

Final repository evidence: `logs/final-repository-audit.json`; 166 tracked paths
scanned. Original main HEAD is F; original index SHA-256
`1de684dc036a122068ea24f4077983bbce969f495b9d1a256c121fbdb7acd9f0` matches its
initial value, tracked files are clean, and the same unrelated `.vscode/` and
preparation report remain untracked. One fixed example.com credential-URL negative
test was manually distinguished from real credentials; the initial false-positive
audit is preserved in `logs/final-repository-audit-first-attempt.json`. No real
credential/artifact finding remains. This pattern scan is not universal secret
detection. Documentation staging passed the same audit; the reporting commit's
SHA is recorded externally in the final response and task-owned audit log.

## Fresh performance evidence and limits

Native Chrome production preview, 974×896 CSS px and DPR about 2.2. Canonical
Resource Timing totals separate application assets and the first backend-mode
request sequence; HAR supplies basemap accounting:

| Traffic | Requests | Transferred | Encoded / decoded bodies |
| --- | ---: | ---: | ---: |
| Application assets, including worker | 12 | **788,287 B** | 784,687 / 2,864,037 B |
| First backend sequence | 10 GET | **1,906,938 B** | 1,903,938 / 1,903,938 B |
| Basemap, HAR | 23 | **4,158,231 B** | Encoded unavailable / 7,044,636 B decoded |

Application assets meet <=20 MB; app plus separately sampled API totals 2,695,225 B,
also below target, without claiming one combined initial-load interval. The initial
fixture-load HAR contains 35 requests, all 200, only localhost/OpenFreeMap; it
contains no API entries. HAR reports worker transfer 303 B while Resource Timing
reports 144,914 B. Its 644,560 B app total and noncanonical worker-adjusted 789,171 B
cross-check differ from canonical 788,287 B. Preserve the accounting discrepancy;
do not add or substitute these alternative totals.

Native Performance trace counts actual compositor **DrawFrame** events in active
camera windows, excluding idle gaps: interrupted 2D transition **25/0.304779 s =
82.03 FPS**, zoom **76/0.65 s = 116.92 FPS**, overview **120/1.2 s = 100 FPS**.
These representative windows exceed >=30 FPS; the first is brief/interrupted and
one **50.623 ms** gap remains. They are compositor-event rates, not rAF timing,
per-frame data freshness, GPU completion or exact physical-display presentation.
The native trace UI reported **INP 101 ms / CLS 0** for this recording.

Two-rAF UI latency approximations: assistant opening **16.5 ms**, theme **39.8 ms**,
scenario **17.8 ms**. They do not measure the complete mascot animation, tile load,
GPU completion or physical display. Evidence:
`frontend/verification-artifacts/integration/candidate-rendering-summary.json`,
`initial-load-candidate-summary.json`, and their local native trace/HAR. Historical
standalone measurements are comparisons, not substituted candidate results.

## Exact local runbook

Integration environment and snapshot DB initialization have completed; the candidate
has been observed through Chrome. Inspect intended port ownership before restart; do not
kill unrelated listeners or silently choose other ports. In one Terminal:

```sh
/usr/bin/python3 -I -S /Users/kerwynjean/.local/share/swale-local/backend.py integration serve
```

In a separate Terminal:

```sh
cd /Users/kerwynjean/Swale-integration/frontend
npm run dev
```

Observed frontend **http://127.0.0.1:5173/**; backend **127.0.0.1:8000**.
`npm run dev` starts Vite only. Keep Vite env loading at frontend root. Temporary
production preview uses `npm run build` then `npm run preview`, port 4173; native
Chrome verified that production preview and its relative API proxy. Final observed
listeners: development **53870** on 127.0.0.1:5173 and backend **58453** on
127.0.0.1:8000 (clean restart after real disconnect). Temporary preview **55860**
was stopped by SIGINT after task-checkout verification; no 4173 listener remains.
Logs: `logs/frontend-dev.txt`,
`logs/backend-integration-serve.txt`, `logs/frontend-preview.txt`. The final backend
restart writes to its foreground Terminal; its observed startup transcript is
`logs/backend-final-restart-console.txt`, while the serve log retains earlier runs.
Stop each
foreground server with Ctrl+C in its own Terminal; for these task-owned identities,
after checking PID/port ownership, use `kill -TERM 53870` or `kill -TERM 58453`
separately. These IDs must be refreshed after any restart. Temporary preview/probes
are stopped; only the task-owned backend/dev services remain.

The retained user Chrome tab **895912960** is at http://127.0.0.1:5173/ in healthy
Backend mode, with overview camera, incidents enabled and CB305000 selected from
the inventory list, marked as the deliverable. Agent
tabs were closed; temporary QA instrumentation cleared by reload and viewport,
DevTools cache and reduced-motion settings restored. Final local screenshot:
`frontend/verification-artifacts/integration/final-development-backend-light.jpg`.
Screenshot names are not dimension evidence; corrected `*actual` captures and
dimension JSON record the actual fixture-tablet sizes after an earlier mislabeled
1285-pixel capture.

Offline commands (only with server stopped):

```sh
/usr/bin/python3 -I -S /Users/kerwynjean/.local/share/swale-local/backend.py integration test
/usr/bin/python3 -I -S /Users/kerwynjean/.local/share/swale-local/backend.py integration audit
```

One-time initialization command, already completed:

```sh
/usr/bin/python3 -I -S /Users/kerwynjean/.local/share/swale-local/backend.py integration ingest
```

The launcher refuses existing DB replacement/reingestion. Reconcile unexpected
paths rather than deleting. At the top of the sidebar, choose **Data mode →
Backend / local snapshot**; choose **Fixture / demo** to return explicitly to
synthetic examples. Backend errors do not perform that switch for you.

**Remaining review:** click a visible solid blue inventory marker and confirm its
full ID and inspector before complete browser acceptance. The conditional local
candidate and local reporting commit do not authorize a main merge. Any later
main merge requires a separate explicit instruction and fresh reconciliation.

**Main: UNCHANGED; merge into main NOT AUTHORIZED. Publication: NOT AUTHORIZED.**
No remote write, PR, deployment, public sharing, credentials or deferred execution.
Even candidate PASS needs a subsequent explicit owner instruction and fresh
reconciliation before a main merge/write. Passed checks cover only their measured
scope; the overall local verdict remains CONDITIONAL on direct basin-marker
picking evidence, not full product or scientific readiness.
