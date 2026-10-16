# Final release local runtime — October 16, 2026

**Frozen executable runtime checkpoint (historical process identities):** `f42005de7cf4201306dc67cdbba85cde2ef5615c`, controller61307/API61311/broker61310, verified at2026-10-16T18:44:32Z. Health reports `f42005d`; `release-critical-readiness.json` records successful live/weather, inventory/report/full opaque event details, selected-context creation/retrieval, and the exact exhausted-model-allowance fallback. The persistent ledger SHA remains `5979aa1b80a37060a6260ba0412b72b0963fe3101617b6f0154aa4934cfbd79b`, model3/audio1 and$0.81696. These are later observations than the historical checkpoints below. Same-profile diagnostic-child containment and API negative paths were observed separately; they do not imply API-process instrumentation. Published application697f94e subsequently passed startup and critical checks under controller62589/API62592/broker62591. Source publication and the final documentation-tip runtime identities are recorded in FINAL_RELEASE.md and the private publication-receipt.json; verify current controller ownership before stopping any process.

The owner's final integrated-release instructions supersede historical frontend-only/no-merge/no-push boundaries for this task. They authorize scoped frontend/backend/agent implementation, non-destructive setup, tests, integration and repository publication. A separate explicit **$1 aggregate provider allowance** permits the bounded model/translation/audio verification. No new infrastructure, subscription, billing change, destructive data operation or unrelated operator feature is authorized.

Integration baseline: `ab463b2cfde94bd6b5b9612378a19534020e1db2`, combining current remote main and the completed station/entrance feature. Repository publication and final runtime identity are recorded in FINAL_RELEASE.md and the private publication-receipt.json; no public deployment was performed. See [FINAL_RELEASE.md](FINAL_RELEASE.md) for release identity and acceptance results. See [the launcher reference](../scripts/local/RELEASE_RUNTIME.md) for full boundary behavior and [visual semantics](FINAL_VISUAL_SEMANTICS.md) for palette and hazard interpretation.

## Initial runtime checkpoints (superseded by final checkpoint above)

| Item | Recorded path / status |
| --- | --- |
| Release source | `/Users/kerwynjean/Swale-final-release` |
| Original database | `/Users/kerwynjean/Swale-integration/backend/var/local-transit-c65f03b.db` — preserved SurrealDB directory |
| Release database copy | `/Users/kerwynjean/.local/share/swale-local/final-release-runtime/database.db` |
| Private controller state | `/Users/kerwynjean/.local/share/swale-local/final-release-runtime` — mode 0700 |
| Selected credential file | That private directory's `provider-credentials.conf` — mode 0600; only selected model/speech keys |
| Persistent reservations | That private directory's `provider-ledger.json` — preserved across restarts, never reset for this task |
| Static launcher preflight | **PASS**, observed by the root operator; no application/database/credential-content/DNS access |
| Initial release startup | **PASS** at 2026-10-16T18:07:04Z; historical controller 49428, API 49450, broker 49449 from release source; mergeHEAD `ab463b2` with uncommitted task changes |
| Latest observed runtime | Controller 50750 / API 50763; still the dirty source before the final guard fixes. Final-revision restart and critical-path recheck are **NOT_RUN / PENDING** |
| Endpoint readiness | **PASS** for 16 actual requests, all HTTP 200; live transit and weather returned empty error arrays |
| Real model / Spanish translation | **PASS** for two genuine model-backed English responses and a separate Spanish machine translation; exact records below |
| Provider audio / browser playback | Provider English audio generation and binary retrieval **PASS**; local English/Spanish UI playback lifecycle **PASS**. Human audibility/review is **NOT_RUN** |
| Native behavioral enforcement | **NOT_RUN**; source/native-profile and helper checks are separate from an actual behavioral probe |
| Browser | Production preview 4183 works through the original authorized Chrome surface. The final mode/theme matrix remains **PENDING** while the observed geometry-loader rerender cycle is repaired |

The original `.env` remains in its original location and unchanged. Its values are never copied into source or browser assets. The operator filters only approved server keys into the separate private 0600 file. The release checkout itself has no active dotenv file. No credential values are documented, printed, placed in process arguments, or committed.

## Locked setup

The release has its own locked environment, installed offline from reviewed caches; no virtualenv was copied from another worktree. Its metadata identifies Python 3.12.15 and uv 0.13.1. The reproducible setup uses the existing nonsecret reviewed tooling paths:

```sh
/usr/bin/python3 -I -S /Users/kerwynjean/Swale-final-release/scripts/local/setup.py \
  --root /Users/kerwynjean/Swale-final-release \
  --uv /Users/kerwynjean/.local/share/swale-local/uv-aarch64-apple-darwin/uv \
  --python /Users/kerwynjean/.local/share/swale-local/python/cpython-3.12.15-macos-aarch64-none/bin/python3.12 \
  --cache /Users/kerwynjean/.local/share/swale-local/uv-cache \
  --runtime-dir /Users/kerwynjean/.local/share/swale-local/final-release-setup \
  --verify-existing
```

For a new clean checkout only, omit `--verify-existing`; existing environments are never overwritten. The helper invokes locked/offline synchronization inside the native network-denied profile and checks the public lockfile hash. It imports no application and defaults tests to in-memory data.

Two existing SWMM wheel libraries in this **new release environment only** required the documented macOS ad-hoc signature repair: `swmm/toolkit/libomp.dylib` and `libswmm-output.dylib`. Receipt `/tmp/swale-release-swmm-repair.json` records link count 1, before/after SHA-256, successful repair, and `codesign` verification reporting both valid on disk and satisfying their Designated Requirements. This follows `backend/scripts/fix_swmm_macos.sh` / the backend simulation setup note. Main's environment, system libraries and other worktrees were not repaired. Signature validity does not establish hydraulic calibration or a completed runtime/provider smoke test.

Frontend commands from the release checkout:

```sh
cd /Users/kerwynjean/Swale-final-release/frontend
npm run typecheck
npm test
npm run lint
npm run format:check
npm run build
npm run preview -- --port 4183
```

Production QA uses `http://127.0.0.1:4183/`. The existing guarded Vite preview proxy connects `/api/` to loopback 8000; actual selected-context requests and playback controls were observed through this production preview. Published-revision startup, critical-path verification and all eight mode/theme combinations passed; see the current release record and publication-receipt.json.

## Database transition and ownership

Before a database copy, the operator verifies the existing main controller's current PID, command, source root, database and child identities. The recorded pre-transition controller was 5374 with broker 5376/backend 5377; **these are historical evidence, not reusable stop targets**. Stop only that verified owner with SIGINT, wait for bounded cleanup, and confirm both 8000/8001 listeners and the original embedded-DB writer are gone. There is no blanket process kill or database access while it is written.

After ownership-checked shutdown of old controller 5374, the operator copied the entire stopped SurrealDB directory into the new release `database.db`: **53,868,086 bytes across 2 files**. Original/copy file hashes match in `/Users/kerwynjean/.local/share/swale-local/final-release-runtime/database-copy-receipt.json`. This is a consistent stopped-writer copy, not an export from an actively written embedded database. The original remains intact for recovery; only the release copy is opened by the task-owned API, with current process identity recorded in controller.json and publication-receipt.json.

Application startup performs its existing schema setup and records interrupted simulation jobs failed in the **copy**. Ordinary supported transit/weather requests retain their existing local snapshot writes there. The controller does not ingest, initialize or replace data, and no alert monitor, inspection, simulation, evaluation, sweep or crew-briefing mutation is exposed through its HTTP guard.

## Check, start and stop

After the selected database path exists, static preflight is:

```sh
/usr/bin/python3 -I -S /Users/kerwynjean/Swale-final-release/scripts/local/release_runtime.py check \
  --root /Users/kerwynjean/Swale-final-release \
  --database /Users/kerwynjean/.local/share/swale-local/final-release-runtime/database.db \
  --runtime-dir /Users/kerwynjean/.local/share/swale-local/final-release-runtime \
  --provider-budget-usd 1 \
  --credentials /Users/kerwynjean/.local/share/swale-local/final-release-runtime/provider-credentials.conf
```

Use the same command with action `serve` to start the release. The positive allowance is this task's explicit opt-in; the default is zero. The server caps model attempts at 3 and speech attempts at 1, persists reservations before requests, counts failed/ambiguous attempts, and does not retry them blindly. Reuse the same runtime directory/ledger on every restart. Its conservative reservation accounting is not measured provider billing. The backend exposes remaining budget/calls through contextual capabilities.

The current selected file contains only `AWS_BEARER_TOKEN_BEDROCK`, `ELEVENLABS_API_KEY`, and `ELEVENLABS_VOICE_ID`. The parser's complete allowlist also supports `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and `AWS_SESSION_TOKEN`; no other credential/environment assignment reaches the API. The launcher itself sets the fixed region, explicit contextual provider switches/caps/budget/ledger path, and alert-monitor-off control. It strips inherited tracing, evaluation, Daytona, profiles and proxy configuration. Credentials reach only the API child, never the broker.

The API listens only at 127.0.0.1:8000. Native profile rules permit it to connect only to the managed broker at 127.0.0.1:8001; a fresh diagnostic child using the identical generated API profile denied credential-file reading and direct API8000 access, and allowed broker8001 access. This is observed profile behavior, not instrumentation inside the actual API process. The broker software admits exact public MTA/NWS authorities and, only with positive allowance, the fixed Bedrock Mantle and ElevenLabs authorities. DNS answers are resolved once and checked as public numeric destinations. Native broker permission remains coarse outbound TCP 443; exact authorities are software-enforced and encrypted methods/paths are not inspected. TLS certificate verification stays enabled.

The outer API guard permits the reviewed data GETs and contextual agent/briefing/translation/audio routes. Unknown routes/queries, duplicate keys and unrelated writes fail closed. Contextual POSTs require JSON, a supplied Origin from the approved loopback frontend origins, a body no larger than 128 KiB, and completion within 10 seconds. Explicit `Settings` avoids application dotenv loading; access logs are disabled. This bounded localhost arrangement is not public production authentication.

Stop the exact owned release controller:

```sh
/usr/bin/python3 -I -S /Users/kerwynjean/Swale-final-release/scripts/local/release_runtime.py stop \
  --root /Users/kerwynjean/Swale-final-release \
  --database /Users/kerwynjean/.local/share/swale-local/final-release-runtime/database.db \
  --runtime-dir /Users/kerwynjean/.local/share/swale-local/final-release-runtime
```

The stop path compares private state and the live process command before SIGINT. It preserves the database, logs and reservation ledger. Foreground Ctrl+C also performs bounded child/broker cleanup. Occupied ports or mismatched state cause refusal, with no host/port substitution.

## Recovery and evidence

The old main restricted launcher refuses its pre-existing checkout `.env`; do not document a blind restart that would bypass that guard. To restore the historical credential-free arrangement, first stop/check this release controller, then create a clean detached worktree at `4db8f26b3298ff917987953b9ca1432e4efed106`, prepare its own locked environment with the existing setup helper, and use that clean checkout's restricted controller against the preserved original database. Do not reset source worktrees or remove the original configuration. Alternatively, retain the release candidate and its copied database while resolving a specific startup defect; preserving the provider ledger prevents allowance replenishment.

Offline source verification at this checkpoint: **18 release-launcher boundary/lifecycle tests PASS**, **53 unchanged runtime/broker/setup tests PASS**. The new tests use temporary metadata and no application, real database, provider or network. They cover zero-budget behavior, credential filtering/metadata, finite budget caps, denied mutations/queries, bounded JSON bodies, cross-origin simple-request rejection, preserved spend ledger during port refusal, and exact process ownership. Static/helper passes do not establish native enforcement, whole-backend readiness, model success, translated fidelity or audible delivery. Actual runtime and browser evidence is recorded separately.

Initial actual API observations at 18:07:04Z: health **PASS**, status ok / DB ok / build `ab463b2`; Bedrock/ElevenLabs configured true, Arize/Daytona false. Initial contextual capabilities showed allowance $1 / reserved $0 / model cap 3 / speech cap 1. A provider-disabled selected F21 `model_entrance` template request passed with 1,107 transcript characters. These are retained initial observations; subsequent real provider results supersede their earlier NOT_RUN status below.

## Observed integrated endpoints, model, translation and audio

The sanitized private `endpoint-readiness.json` records 16 actual successful requests: health, layer catalog, sources, basin inventory, incidents, stations, entrances, station exposure, danger zones, sensors, flood maps, flood observations, subway history, live transit, weather, and contextual capabilities. Every response was HTTP 200. Live transit fetched at 18:10:09Z and weather at 18:10:10Z each returned `errors: []`. The collection samples retain unique IDs and source knowledge types. This is a bounded observed endpoint sequence, not a claim about every legacy/operator endpoint, future upstream availability, or final-revision execution.

Genuine Bedrock model responses are preserved in `frontend/verification-artifacts/final-release/context-response-bodies-final.json`:

| Observed response | Evidence |
| --- | --- |
| Agent request | HTTP 200, `source: model`, ID `37916f05bf734cb1904bffb72c871054`, 18:13:12Z, model `anthropic.claude-opus-5-5`; validated actions selected `subway_station:F21`, entered station exploration and chose Normal view |
| Selected F21 entrance briefing | HTTP 201, `source: model`, ID `f3835c82149343c88bd964c46ebbe91e`, 18:15:12Z, same real model ; 1,356-character English transcript |
| Spanish translation | HTTP 201, `source: machine_translation`, ID `29f9f8e112e8480a89f50895a7eace23`, 18:19:14Z ; 2,122-character Spanish transcript for the selected F21 entrance's retained 600-second hypothetical snapshot |

The Spanish result preserves its original English transcript, canonical subject/snapshot, machine-translation label and full localized caveat. English and Spanish are the observed languages in this verification. Chinese, Arabic, Russian and French remain configured capabilities without live verification here; translation is not human reviewed. Source/token/qualifier checks and a successful response do not establish complete semantic fidelity or native-language quality. No human language-review claim is made.

The separate private `provider-audio-receipt.json` records generated English `audio/mpeg` for briefing `9523bd6263494aeca0840467cf22dabc`: **1,356 complete transcript characters**, **1,565,300 bytes**, SHA-256 `ed8c579b884ab12ce7d66a461d87cc6fd25bc272a5cf0ff5444866977a72763c`, audio ready true. This provider-generated artifact is private local evidence, not a committed audio asset. Generation/binary retrieval is distinct from audible-output verification.

Actual UI interactions on the production preview exercised English provider-MPEG playback and Spanish browser-local Mónica playback, playing/paused/resumed/stopped/replayed states, and explicit user Play intent. Evidence includes `spanish-result-state.txt`, `spanish-audio-playing-state.txt`, and `english-audio-play-result.txt` under the same ignored verification directory. The captured accessibility state shows `Audio: playing`, with Pause/Stop controls; browser voices distinguish local-device and remote-provider entries. These are actual UI/playback-state observations, not merely synthesis callbacks. **Human audibility and auditory transcript agreement remain NOT_RUN**; the provider receipt explicitly records `human_auditory_review: false`. No backend Spanish speech-provider success or unreviewed-language playback is inferred from local Spanish playback.

After three model attempts and one provider-audio attempt, the operator reports conservative persistent reservations of **$0.81696** against the explicit $1 allowance. Both provider attempt caps are consumed; the unreserved balance does not authorize additional attempts. Failed/ambiguous calls are not retried and the ledger is never reset to replenish allowance. Contextual records and audio remain process-local: restarting the server loses those caches while preserving reservations. Existing cached binary evidence remains separate from a new post-restart provider call.

The initial controller50750/API50763 checkpoint predated the final guard and geometry-loader fixes. Those fixes are now included in executable f42005d and published application697f94e; startup, critical paths and the full eight-case browser matrix passed. Final documentation-tip runtime identity and unchanged provider ledger are recorded in publication-receipt.json. [FINAL_RELEASE.md](FINAL_RELEASE.md) records the completed acceptance and publication evidence, with human review and scientific limits kept explicit.
