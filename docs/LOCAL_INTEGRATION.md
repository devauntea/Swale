# Final integration repair and publication — October 16, 2026

This is the current execution record. The owner's final-publication instruction
authorizes the bounded parser repair/tests, repository-owned restricted runtime,
normal main promotion/push, existing push-triggered automation and independent
remote verification. Older no-merge/no-push statements below are historical.
Manual hosting, credential activation, paid services, unrelated backend changes
and new features remain outside scope. Publication receipts are kept locally and
reported separately from automatic hosting/check outcomes.

Frozen reconciliation: original main **M=5fad6b4ebf17c58a1ca427a3ba742d1e843f9e7b**;
existing integration **I=26528936cb09ae810674fdcce71c52928c148970**;
reviewed backend **B=c65f03b569fc941264bb1b6ec80f8e0a079263d0**;
remote main **R=aa08a17d166cbf0f23281627a74289fe8f7efe43**.
Fresh fetch found no backend advance, so no redundant backend merge was made.
The candidate already preserves all four histories and the unpublished frontend
corrections. Unrelated main `.vscode/` and preparation notes are preserved.
Only sample hooks exist; origin has one fetch URL and one effective push URL,
both `https://github.com/devauntea/Swale.git`, with no mirror/follow-tags setting.
GitHub account `kjean230` has push access; main was unprotected, rulesets empty,
required check contexts empty and Actions workflows absent at reconciliation.
These are observations to recheck before publication, not permanent assumptions.

## Repaired collection-to-detail round trip

At **15:21:57Z**, the existing server reproduced the actual full collection ID
`flood_event:⟨BK-3rd-ave-bergen-st-2jg440_20260807T205455Z⟩` returning404
after normal client encoding. Commit **1e94a56** changes only
`backend/swale/api/params.py` and directly relevant tests. It reverses the installed
SurrealDB2.0.0 string-key wrapper/escaped closing delimiter, validates the prefix
and preserves path404/query422 errors. There is no frontend ID rewrite, extra
URL decode, eval, query interpolation, format migration or stored-record change.

The unchanged parser failed17 targeted regressions. The repaired selected offline
gate passes **165 tests**, including the exact ID, Unicode, colons, backslashes,
literal delimiters, percent sequences, simple IDs, shared callers and negatives.
Underlying delimiter keys must be represented by their canonical SDK full ID;
fabricated unwrapped aliases beginning with the delimiter are ambiguous and
unsupported. Actual uvicorn probes preserve literal `%3A`, `%2F`, `%253A` after
one URL-decoding pass. An actual slash is still rejected by the existing
single-segment route before this parser; current stored IDs are unaffected.
Changing partner route definitions was not included in the authorized repair.

At **15:30:49–15:30:52Z**, the repository-owned candidate runtime passed all
**23 bounded actual API requests** (inventory/details, metadata/sources,
stations/entrances, exposure/zones, sensors/DEP maps, flood detail, live board,
weather/history and negative cases). The previously failing ID returned matching
observed detail, **68 paired profile samples**, original event times and original
ingest **14:02:12Z**. No raw payloads were published. Actual frontend evidence
drill-down from UnionR32 through its cited sensor to a returned event now shows
matching observed detail/source fields instead of404. The UI does not add a new
profile chart; its transport retains the verified profile payload.

The initial fresh MTA board fetched **15:30:50Z**, five feed ages **3.3–12.3s**,
errors0,15 stations,119 displayed arrival records,2 unmatched/null delays,
59 negative and13 zero delays. There were3 applicable alerts and0 flood mentions;
this is not a real flood/closure demonstration. History changed4→5 polls.
NWS fetched **15:30:51Z**, uncached, errors0, observation **15:10Z**, forecast
issue **07:47:17Z**,0.23in accumulation over24hours,0 official alerts.
These measured values are session evidence, not constants for a future demo.
The current **October16** service date matches4 committed service calendars;
calendar exceptions are already applied in the snapshot, whose actual dates are
October16–23 inclusive. No acquisition or tracked-snapshot overwrite occurred.

## Reproducible restricted tooling

`scripts/local/` now owns the controller, broker, profile template, containment
probe, locked offline setup helper and focused tests. No private runtime directory
was copied wholesale. Source resolves its own checkout, rejects a different root,
uses that checkout's Python/backend module, an explicit absolute existing DB and
a private external runtime directory. It rejects checkout dotenv paths by name
without reading them. Vite also disables dotenv loading (`envDir:false`,
commit **70da447**). Application credentials remain untouched and unread.

**53 focused helper tests passed.** All four native profiles compiled. Actual
offline enforcement denies reserved TCP/UDP, a known nonsecret marker read and
exec-child TCP withEPERM. Actual live probe returned unknown CONNECT403 before
resolution and official MTA/NWS GET200 at **15:29:27Z**,19351/3917 bytes,
no redirects. Host enforcement is software in the broker; the native rule is
coarse outboundTCP443 and does not inspect encrypted methods/paths. Normal TLS
and source-reviewed GET behavior remain necessary.

The identified old controller80635/backend80638/broker80637 was stopped with
SIGINT; fresh process/listener/DB-handle checks showed shutdown before reusing
the retained DB. Candidate controller99122/backend99125/broker99124 then started
from repository sources. It uses the same absolute database:
`/Users/kerwynjean/Swale-integration/backend/var/local-transit-c65f03b.db`.
No DB was copied, replaced or reingested and original provenance was not rewritten.
Startup effects were reviewed: schema definitions, design-storm metadata seeding,
and marking previously queued/running jobs failed; no new simulation/AI execution.

Two real helper verification failures remain in local evidence: the first probe
lacked its nonsecret marker, and pytest parent discovery hit denied
`.env.example` metadata. Exclusive marker creation and explicit `--confcutdir`
fixed these without weakening credential restrictions. Candidate setup
`--verify-existing` checked96 installed packages against the unchanged lock
(98 resolved), with no environment change. The exact main setup command follows.

```sh
/usr/bin/python3 -I -S /Users/kerwynjean/Swale/scripts/local/setup.py \
  --root /Users/kerwynjean/Swale \
  --uv /Users/kerwynjean/.local/share/swale-local/uv-aarch64-apple-darwin/uv \
  --python /Users/kerwynjean/.local/share/swale-local/python/cpython-3.12.15-macos-aarch64-none/bin/python3.12 \
  --cache /Users/kerwynjean/.local/share/swale-local/uv-cache \
  --runtime-dir /Users/kerwynjean/.local/share/swale-local/repository-main-setup
```

This creates main's own `.venv` using only existing reviewed cached locked inputs
under native network denial, never a copied integration environment. It refuses
replacing an existing virtualenv; use `--verify-existing` for a read-only check.
See [runtime tooling](../scripts/local/README.md) and [README](../README.md) for
main-backed serve/stop commands. The eight baseline/transit/weather modules plus
parser tests run using `mem://`, never the retained DB:

```sh
/usr/bin/python3 -I -S /Users/kerwynjean/Swale/scripts/local/runtime.py test \
  --root /Users/kerwynjean/Swale \
  --database /Users/kerwynjean/Swale-integration/backend/var/local-transit-c65f03b.db \
  --runtime-dir /Users/kerwynjean/.local/share/swale-local/main-offline-tests \
  --test test_params.py
/usr/bin/python3 -I -S /Users/kerwynjean/Swale/scripts/local/tests/test_runtime.py
```

Fresh frontend checks pass165 tests, TypeScript/build/lint/format and npm registry
audit0 vulnerabilities, with unchanged dependency manifests. Built-in uv0.13.1
audit separately checked97 backend packages:0 vulnerabilities/0 adverse statuses,
exit0, unchanged public lock/pyproject and a write-denied checkout. Experimental
audit/schema warnings and the first DNS-failed attempt are retained. Its successful
retry used clean tooling-only OSV network access and credential denials; it did not
change application networking, install tools or activate credentials. These are
point-in-time known-vulnerability results, not universal security certification.
Full source/history scans cover all newly reachable objects, including deleted
blobs and decompressed public snapshots, before publication. Scanning patterns
is not an exhaustive secret guarantee. No private runtime artifacts are staged.
Known imported EOF whitespace at exposure.py:263/data-sources.md:290 is preserved.

Fresh native transit compositor evidence: Zoom56 draws/650ms=**86.15DrawFrame/s**;
Overview78/1200ms=**65.00/s**, max gap44.09ms (one over33.333ms).
Both representative windows exceed30. Theme work overlaps the overview window;
the gap is retained. These are compositor events, not render callbacks, GPU
completion or certified physical-display presentation. Native INP60ms/CLS0;
theme next-paint60.309ms, assistant56.604ms. Canonical initial application assets
including document/worker: **814189 transferred bytes**, below20MB. Basemap
HAR2436042B and API353291B/15 requests are separate samples. HAR worker303B versus
ResourceTiming144914B discrepancy remains recorded. See fresh
[frontend evidence](../frontend/VERIFICATION.md) for methods and limitations.

Local sanitized evidence is under `~/.local/share/swale-local/logs/` and ignored
frontend `verification-artifacts/integration/publication-*`. It includes actual
parser before/after, encoding probes, API, helper/setup, audit and native trace/HAR
results; private logs/HAR/database files are not part of source publication.
First explicit task clock check was15:27:13Z; actual parser observation15:21:57Z
preceded it. Earlier cumulative active duration remains unmeasured; the original
approximately8hour target/6:45 feature freeze was not restarted. This task adds no
product feature. Main promotion/publication receipts and final runtime identities
will be recorded after their actual gates, without recursive documentation pushes.

Candidate browser follow-up additionally passed: normal wave and umbrella
transforms changed during their computed0.65s opening, reduced-motion children
used animation none/0s, keyboard composer/Escape returned launcher focus, and the
scripted blockage response retained its DEMO/uncertainty caveat. Explicit dark
preference survived reload while BASEMAP LOADING, before map readiness. Actual
responsive CSS sizes698×931 and354×767 had equal client/scroll widths (no horizontal
overflow); mobile light/dark assistant and Planning drawer/Escape focus were
observed, and viewport/media overrides were restored. Genuine settled station
pointer(432,454) opened CarrollF21 with its five entrances; entranceF21_33 fit/focus
showed its matching relationship. Genuine basin pointer(621,507) opened
catch_basin:CB305011. Layer toggle retained selection and source-panel Escape
returned focus. One map canvas remained across these interactions. Fresh scenario
next-paint latency was not measured; the earlier trace contains no scenario click.

---

# Historical transit integration checkpoint — October 16, 2026

**CONDITIONAL — local transit candidate with a partner detail defect and explicit
data/performance limits.** Fresh automated checks, observed browser interactions,
production preview and reduced-motion child checks passed within the recorded
scope. Verified frontend code checkpoint:
`a769d6891795fde9f7c80edd540e8541f0bb3431`. The subsequent documentation-only
closeout is the integration branch HEAD; its exact SHA and final audit are recorded
in ignored `frontend/verification-artifacts/transit/final-candidate.json` and the
owner-facing completion report.
The new owner-authorized
subway/exposure/danger-zone slice supersedes the earlier basin-only closeout;
the earlier direct basin-marker acceptance gap is now resolved by a genuine pick.
First new-task clock sample: **2026-10-16T13:47:58Z**. Prior cumulative active time
is unmeasured; this is not a budget reset. No full-product readiness claim is made.

The code commit time is **14:33:39Z**; final documentation review was at
**14:37Z**. These wall-clock samples do not reconstruct prior active work.

## Transit authority, inputs and ownership

The owner's subsequent October 16 transit instruction authorizes this local
integration, selected offline tests/setup, committed snapshots, the specified
unauthenticated official MTA/NWS reads and loopback preview. It overrides older
backend/transit prohibitions only within that scope. Partner-owned backend source
remains unchanged; other services, real AI, credentials and deployment remain out
of scope. Main merge, push and publication are **NOT AUTHORIZED**.

| Input | Verified value |
| --- | --- |
| I: previous integration candidate | `41a7a1e2c2d5ee383c88d4fe97ff60058d92a7aa` |
| B: new reviewed backend | `c65f03b569fc941264bb1b6ec80f8e0a079263d0` |
| Actual backend branch | `claude/m1-data-foundation` (digit `1`) |
| Detached review checkout | `/Users/kerwynjean/Swale-backend-review-c65f03b` |
| Local merge into integration | `2b8d8d3f313b847e798139ca7362e4de673ae0a2` |
| Verified transit code commit | `a769d6891795fde9f7c80edd540e8541f0bb3431` |
| Documentation closeout / final candidate | Integration branch HEAD; exact SHA in `frontend/verification-artifacts/transit/final-candidate.json` |
| Integration checkout/branch | `/Users/kerwynjean/Swale-integration`, `integration/frontend-backend-v1` |
| Actual handoff reviewed in B | `docs/HANDOFF_CHATGPT.md`, “Swale: frontend ↔ backend integration hand-off” |

B adds five transit lines to its earlier handoff. The owner's reproduced expanded
transit prompt is not identical to that file; actual contracts/source are the
implementation evidence. Additional actual API behavior includes monitoring
history, `no_service` and rain `unknown`; these require honest UI treatment rather
than assuming richer payloads. Root verified the merge's backend tree exactly B
and unchanged frontend before implementation. Imported partner whitespace at
`backend/swale/transit/exposure.py:263` and `docs/data-sources.md:290` is preserved;
it prevents an unqualified whole-tree `git diff --check` pass for the imported
delta. No independent backend correction was made.

## Fresh backend gate and snapshot provenance

**125 backend tests passed in 7.48 seconds across eight reviewed modules:** the
six original offline modules plus `test_transit.py` and MockTransport-only
`test_weather.py`. Tests use in-memory databases/local synthetic ZIP/protobuf and
recorded data; no full-suite, live-test, simulation, ranking or briefing execution.
The new locked dependency is `gtfs-realtime-bindings==3.0.0`, a source-reviewed
11,875-byte pure wheel from the locked official registry. uv 0.13.1/Python 3.12.15
were reused. Review has a newly built virtualenv; integration synced its own
environment from the same lock with cache-only downloads, without copying a venv.

Clean helpers remove inherited credentials/proxies/config before imports, use
isolated HOME/TMP, reject checkout `backend/.env` without reading it and create no
dotenv files. Offline profiles deny all network access; TCP/UDP/marker and
exec-child probes returned EPERM. The installer is a separate authorized locked
dependency operation: attempted OS public-IP rules did not compile on this Mac.
Actual setup used reviewed locked PyPI inputs and credential/file protections;
an OS registry-host allowlist is **not** claimed. Real credential files were not
read, copied, changed or validated.

The new integration DB is
`backend/var/local-transit-c65f03b.db`; earlier databases are preserved. Its offline
pre-server audit recorded:

| Records | Count |
| --- | ---: |
| Area / catch basins / incidents | 1 / 2,093 / 7,472 |
| Sensors / flood events / basin links | 17 / 83 / 5,594 |
| Sources / original ingest runs / DEP polygons | 8 / 5 / 1,802 |
| Subway stations / entrances / initial transit polls | 15 / 73 / 0 |

All original transform rejects are zero; 726 basins outside the area polygon are
retained. Original sources ingested **14:02:12Z**; DEP/transit loaded **14:02:15Z**.
All five original ingest runs store actual `code_version=2b8d8d3`. Original fetched
times remain **05:30Z** for the initial bundle, **09:21:38Z** DEP and **10:06:56Z**
transit; replay time is not source freshness. Transit source loading has no
separate ingest-run record. The committed schedule was extracted **10:06:58Z**,
uses `America/New_York`, and actually covers service dates **October 16–23**
inclusive (eight days), including the checked current date. No live static/schedule
refresh or `transit-data` command was needed; that command would overwrite tracked
snapshot files. Schedule-validity dates are not exposed by the live API.

## Managed live boundary and current local launch

Exact tested command:

```sh
/usr/bin/python3 -I -S /Users/kerwynjean/.local/share/swale-local/transit-runtime.py integration serve-live
```

Development frontend, in a separate terminal:

```sh
cd /Users/kerwynjean/Swale-integration/frontend
npm run dev
```

Open **http://127.0.0.1:5173/**. Select **Backend / snapshot + transit**, then
**Subway monitoring**. The retained tab is paused: use **Resume transit updates**
to resume its visible 60-second monitoring. `npm run dev` starts only Vite.
Do not start duplicate services on occupied ports. Current task-owned stop commands,
after confirming the same PID/command identities, are:

```sh
kill -INT 80635  # managed controller stops backend 80638 and broker 80637
kill -INT 53870  # Vite development frontend
```

The earlier `backend.py integration serve` command below belongs to the historical
offline snapshot candidate; it does not enable this transit runtime.

The clean controller launches the backend with direct networking denied except
its loopback broker **127.0.0.1:8001**, and listens at **127.0.0.1:8000**. The trusted
broker accepts only exact CONNECT authorities **api-endpoint.mta.info:443** and
**api.weather.gov:443**, using public numeric addresses resolved once by the clean
controller. Its native profile permits coarse outbound TCP 443; the exact-host
guard is software, **not an OS per-host/IP allowlist**. TLS remains end-to-end with
normal certificate verification; encrypted HTTP paths/methods cannot be inspected
by this broker. Intended GET paths/default no-follow behavior were source-reviewed.

Reviewed external requests are **GET** only: MTA
`/Dataservice/mtagtfsfeeds/nyct%2Fgtfs`, `nyct%2Fgtfs-ace`, `nyct%2Fgtfs-bdfm`,
`nyct%2Fgtfs-g`, `nyct%2Fgtfs-nqrw` and `camsys%2Fsubway-alerts.json` under that
same prefix. NWS uses `/points/{area-centroid}`, its returned same-host
`/gridpoints/OKX/34,40` and `/gridpoints/OKX/34,40/forecast/hourly`,
`/stations/KJRB/observations/latest` (KNYC fallback), and
`/alerts/active?point=…`. Each reviewed HTTPX request has a 20-second timeout and
does not follow redirects. The backend caches successful MTA feed/alert retrievals for 30
seconds; the single frontend board owner polls no faster than 60 seconds and backs
off 120–600 seconds after failure. Weather uses its own 600-second boundary/cache.
Manual refresh observes those same boundaries. Exposure requests use `live=false`;
weather-aware zones follow the weather owner rather than creating a second poller.
The browser's 30-second transit timeout/cancellation does not guarantee cancellation
of already-running sequential upstream backend GETs. Backend cache misses have no
single-flight guarantee; these remain partner runtime limitations.

No data.ny.gov/static GTFS/DEP/FloodNet live acquisition was needed. Committed
inventories/schedule/context were reused. Source-reviewed acquisition destinations
are data.ny.gov `/resource/39hk-dx4f.json` and `/resource/i9wp-a4ja.json`, and
rrgtfsfeeds.s3.amazonaws.com `/gtfs_supplemented.zip`; they are **not enabled in
the live broker**. The acquisition CLI overwrites tracked backend snapshots and
has no output-directory switch. If the schedule expires, comparisons become
unavailable; a partner-supported refresh/export path must preserve backend-tree
ownership before new acquisition. No unrelated historical or citywide ingest ran.

Final positive probe: direct backend TCP/UDP/marker and exec-child TCP returned
EPERM; an unknown CONNECT target returned **403 before resolution**. The approved
MTA GTFS-G and NWS points requests returned **200**, **19,119 B / 3,917 B**, no
redirect, provider dates **14:26:23Z** for both. Initial **14:01Z** successful gate
remains preserved. Probe assertions now require actual200/no redirect after printing
evidence. Controller changes add startup cancellation, bounded independent cleanup
and broker-exit supervision. **20 offline mocked helper tests passed**, including
an occupied fixed8001 port refusing startup with no fallback. The first restart
hit EADDRINUSE with no listener; SO_REUSEADDR before the same fixed bind corrected
the TIME_WAIT case. Failed attempts are preserved, alongside earlier profile/
clean-system-Python failures; no unsupported IP restriction is claimed.

Actual stop of controller **73244** cleaned its backend/broker and both listener
ports. Restart using the revised helper: controller **80635**, broker **80637**,
backend **80638**; Vite dev **53870** at **http://127.0.0.1:5173/**. Browser recovered
at **14:27:07Z**. Temporary production preview **81428** on loopback4173 passed
and was stopped with SIGINT (expected exit130); no4173 listener remains. Retained
services are dev53870 plus controller80635/broker80637/backend80638. The user dev
tab is marked Deliverable and left **Paused**, with a visible Resume control and
no unattended frontend polling. Final viewport is863×896; media preferences are
reset and QA instrumentation absent.
The broker follows its controller's lifetime, has bounded tunnels/rate and logs
authority/results only; there is no independent background collector. Backend has
no automatic transit polling at startup; approved live GETs can persist monitoring
rows in the new local DB. Logs: `transit-live-containment-final2.json`,
`transit-helper-reuseaddr-tests-final.txt`, `transit-server-final.txt` and
`transit-runtime-peer-review.md` under the task evidence root.

`/subway/live` can write one `transit_poll` per minute/area; no retention/deletion
mechanism exists. `/subway/history?hours=6` limits retrieval, not storage retention.
Weather/feed caches are process-local. Stock backend routes beyond this frontend
remain mounted on loopback; frontend guards and CORS are not backend authorization.

## Actual API evidence and feature matrix

A clean, bounded localhost client exercised only approved GET shapes, without raw
payload logs or opening the DB while serving. Combined runs made **23 requests:
22 expected outcomes and one reproduced partner detail-ID defect**. The earlier
successful seven-route slice is not a substitute for this fresh transit evidence.

| Capability | Actual evidence / limit | Frontend acceptance |
| --- | --- | --- |
| Existing inventory/incidents and health | Approved collection/detail shapes returned expected results | Genuine basin pick changed CB305000 → CB305002 with matching full-ID inspector; historical gap resolved |
| Subway inventory | 15 station points; 64 viewport entrances from 73 stored | Carroll F21 list and genuine map pick; five-entrance fit/list/inspection passed; F22 Viaduct source verified |
| Arrivals/directions/delays | Initial board at 14:05:52Z; five feed ages 4.1–11.1 s, errors 0; 117 displayed arrival records, five unmatched/null delays; negative/zero values retained | Actual live display, pause/resume and disconnect/recovery observed; missing/null cases covered in automated candidate suite |
| Alerts/status | 13 normal / 2 alert stations in initial sample, two applicable alerts (one station-specific), zero flood mentions | Qualified UI/source labels; actual flood/closure claim not demonstrated |
| Train positions/destinations | 22 stop-associated vehicle rows; no coordinates or destination/headsign | No precise train-position/destination claim |
| Monitoring history | Actual poll count 0 → 1 at 14:05:52Z | Repeated polls are not distinct flood events; long-term station flood history unavailable |
| Station exposure | 15 inferred records, 1 high / 3 medium / 11 low, method `station-exposure-v1`, no simulation run | Union R32 inferred exposure89 → canonical sensor factor → five historical sensor events observed; not five station flood events |
| Danger zones | 201: 196 DEP predicted polygons + five derived historical sensor circles; 75 high / 126 moderate | Genuine derived-circle pick passed in final production; caveat opens automatically, raw Backend classification is qualified and entrance count0 is shown without carrying prior station context |
| Weather | Initial request at 14:05:54Z, errors 0; observation 13:40Z, forecast issue 07:47:17Z, 24-hour accumulation 0.24 in, derived peak 0.017 in/hr, no official alerts | Observed/forecast/inferred distinctions retained; initial zones reused cached weather |
| Supporting flood evidence | 17 sensors, 83 stored events; 196 current DEP maps and 33 filtered non-tidal observations | Full opaque event profile404 shown visibly while retaining collection evidence |
| Underground information | Station structure/points only; no interior geometry, depth or real train coordinates | Do not invent underground detail |

The API's default normal status does not prove healthy feeds or no disruption;
show source times/errors and stale/unknown distinctions. `no_service` can mean no
scheduled/predicted arrivals, not an official closure. Route-wide flood-word
alerts do not prove an individual station flooded or shut down. Exposure is an
unvalidated inference; nearby complaints/DEP polygons/sensor circles do not prove
causation, current flood extent or a safe route. The rain `watch`/`warning` level
is Swale's rule, distinct from an official NWS alert. Safety/closure/maintenance
instructions remain outside scope.

**Partner defect:** a flood-observation collection's full opaque ID, including its
Surreal printed delimiters, returned **404** when fully URL-encoded for its detail
route. The shared key parser retains the printed delimiters as literal key text.
The frontend preserves the opaque event ID and visibly reports unavailable detail
while retaining the original collection evidence. It does not rewrite the key or
independently correct partner source. Actual source/feed results are preserved in
`logs/transit-api-actual.json` and `logs/transit-api-live.json`; browser evidence
includes `frontend/verification-artifacts/transit/evidence-profile-404.*`.

## Fresh frontend and browser evidence

At **14:27Z**, **163 tests across 14 files**, strict typecheck, production build,
lint and format all passed. The official npm metadata audit found **zero
vulnerabilities** with unchanged package/lock hashes; it ran without inherited npm
credentials, installation or fix. Earlier125-frontend-test results below remain
historical. Fresh 163 frontend tests and fresh 125 backend tests are distinct gates.
Static palette audit passed: 43 owned non-test files, yellow only in mascot,
16 text pairs/theme at least 4.5 (light minimum 4.8962; dark 5.3408). This is not
formal rendered WCAG certification (`logs/transit-final-style-audit.json`).

Observed in actual Chrome: one map canvas across modes; Carroll station and basin
pointer selection/full IDs; entrance fit/inspection; derived zone picking; layer
toggles/3D/overview; camera preservation; Sources Escape and focus return; live
pause/resume. Stopping all three managed processes produced visible stale/error
HTTP502 without a fixture fallback; the restarted backend recovered in browser.
Both themes and dark preference before map-ready after reload passed. Actual CSS
viewports **1309×909,758×1011,354×767** had no horizontal overflow; narrow Plan
controls/Escape/focus were observed. Assistant repeat greeting/composer/scripted
complaints, keyboard Enter/Escape, focus return and retained history passed without
obvious clipping. Production wave child uses `swale-wave`/0.65s; its computed
transform changed across180ms. Emulated reduced motion matched true and the same
child had animation none, duration0s and transform none. Enter/Escape/focus return
passed; normal media was restored. This resolves the earlier inconclusive root-only
motion check (`transit/mascot-motion.json`).
The normal umbrella child also showed changing transforms over180ms with
`swale-umbrella`/0.65s. Backend-mode assistant content remained labelled fixture
history only, with backend actions unavailable (`mascot-umbrella-motion.json`).
The prior direct basin-marker gap is closed by `transit/basin-pointer.*`; the
older unconfirmed clicks below remain historical, not a current manual prerequisite.

Development-only performance sample: **36 active camera transitions**, **32,529.7ms
active**, **3,919 MapLibre render events**, weighted **120.47 events/s**, minimum
window **116.46/s**, over about49.9s wall time. These are render-event rates, not
GPU/compositor or physical-display FPS proof. Warm-cache development ResourceTiming:
app **106,975B transferred /20,350,603B decoded**; API **1,408,546B /89 requests**
across the stress session. Main document was excluded; basemap transfer is
**unavailable across origin**, not zero. These do not establish cold production
initial bytes or a combined initial-load total. Single-sample DOM-mutation
latencies: theme **67.1ms**, assistant **29.9ms**, reduced-motion scenario **12.8ms**,
reduced-motion assistant **21.8ms**; these are not paint/GPU completion times.
Evidence: `transit/performance*.json`, `interaction-latency-*.json` under ignored
frontend verification artifacts. QA instrumentation was removed and a bare-URL
reload confirmed its dataset absent. Production fresh-origin first visit was light
Fixture mode; map-ready showed one canvas, and Backend Subway displayed Union R32
LIVE (`transit/production-transit.*`). Six bounded dev/preview proxy checks for
health, viewport stations and full-ID CB305002 all returned200. Captured dev/
production console messages were Grammarly extension messages, with no captured
app-owned errors; this is not a universal clean-console claim. The three historical
Liberty warnings remain and are not promoted to a fresh resource pass.

Actual loopback downloads of **all 13 production files**, including index/worker/
optional chunks, returned200 and **2,992,842 response-body bytes**, no content
encoding. This conservative complete-production-file body bound is **below 20MB**;
it is not a cold-browser HAR. HTTP/TLS headers, API and basemap bytes are excluded.
Evidence: `transit/production-app-transfer.json`, `proxy-actual-final.json`.

## Conditional limits and next partner review

- The verified code checkpoint is `a769d6891795fde9f7c80edd540e8541f0bb3431`.
  The precommit repository/security/scope audit passed. The final documentation
  HEAD and frozen audit are recorded in the local ignored final-candidate artifact;
  imported EOF findings remain preserved.
- Partner detail404 remains unresolved; precise train positions/destinations,
  interiors/depth and distinct long-term station flood-event history are unavailable.
  Current live sampling contained no flood alert; do not turn mocked states into
  actual event claims. This is a bounded local conditional candidate, not full
  product readiness or authorization to merge/publish.

The next partner review is the opaque-key handling in
`backend/swale/api/params.py` used by `GET /flood-observations/{id}`. It must accept
the full IDs the collection returns and restore detail/profile retrieval. A richer
station history requires distinct source event IDs, station applicability and
event times; the current monitoring table cannot supply it. Precise vehicle
coordinates, destination/headsign and alert end/cause/effect selectors remain
unsupported contract fields. Review a subsequent partner commit separately before
importing any correction. The proposed team integration contract remains
**PROPOSED — NOT YET AGREED WITH BACKEND TEAM**. Any main merge still requires a
subsequent explicit owner instruction and fresh reconciliation.

## Three-minute local transit route

Runbook only; no complete three-minute video was captured.

1. **0:00–0:40:** Start in light Fixture mode, identify DEMO/scenario labels, then
   enter Backend Subway and inspect live source/feed times and limitations.
2. **0:40–1:15:** Pick Carroll F21 on the map, inspect its five entrances and fit
   the entrance view; distinguish inventory structure from underground detail.
3. **1:15–2:00:** Select Union R32 exposure, open a sensor factor and historical
   event evidence. Explain the inferred score and visible partner detail404 while
   preserving the original evidence; do not count sensor events as station floods.
4. **2:00–2:35:** Pick a danger zone, read its DEP/derived evidence and caveat,
   inspect observed versus forecast weather and pause/resume monitoring.
5. **2:35–3:00:** Toggle theme, open Sources and Escape back, then return to Fixture
   for the DEMO assistant. Keep the map/camera/selection behavior visible.

Task evidence root: `/Users/kerwynjean/.local/share/swale-local/`.
Source review: `logs/transit-backend-source-review.md`; offline tests/setup:
`logs/transit-review-*`; integration DB/probes: `logs/transit-integration-*`;
live boundary: `logs/transit-live-containment.json`, `transit-egress.jsonl` and
`transit-server*.txt`. New frontend logs: `logs/transit-frontend-*-final.txt`,
`transit-npm-audit.json`; peer/helper/repository evidence: `transit-runtime-peer-review.md`,
`transit-helper-reuseaddr-tests-final.txt`, `transit-final-repository-audit.json`.
This conditional checkpoint does not authorize main merge, push or publication.

---

# Historical first integration checkpoint — October 16, 2026

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
