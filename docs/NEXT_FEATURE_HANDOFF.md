# Current subway infrastructure feature handoff — October 16, 2026

The next feature is implemented on the isolated local branch
`feat/subway-infrastructure-3d` in `/Users/kerwynjean/Swale-subway-3d`.
Read [SUBWAY_INFRASTRUCTURE.md](SUBWAY_INFRASTRUCTURE.md) first for the current
CONDITIONAL verdict, source/model limitations, I1–I14 evidence and live preview5183.
Implementation milestone `6b6265e`; published main remains `4db8f26`.
This candidate has not been merged, pushed or deployed. Main/backend and the
existing database arrangement remain unchanged; do not repeat acquisition/setup.

The older publication handoff below is preserved as historical baseline evidence.
Its instruction to choose a next feature was superseded by the owner's subway
infrastructure request. No authorization for a future merge/push is implied.

---

# Next feature handoff — October 16, 2026

Read this file before the latest execution report. This milestone repairs and
publishes the existing integration; it does not choose or begin another feature.
The exact final publication SHA/check receipts are recorded locally and in the
operator's final report rather than in a self-referencing documentation commit.

Latest implementation-operator result: **main-backed localhost verified** at
tested baseline **302ea7757106b2a7a60a3e8c21b8fc82d598135a**. Main's own locked
backend environment,165 backend/165 frontend tests, actual23-request API sequence
and visible live-board cycles pass. Current runtime tooling is **466a9cb**.
The publication closeout changes documentation only; its implementation tree is
checked against that baseline before the normal push. Read the final receipt to
confirm the resulting published SHA and separate automatic deployment outcomes.

## Verify the fresh baseline first

Use `/Users/kerwynjean/Swale` on `main`. Inspect status, worktrees and active service
identities, then fetch main and compare actual refs:

```sh
cd /Users/kerwynjean/Swale
git status --short --branch
git fetch origin refs/heads/main:refs/remotes/origin/main
git rev-parse main origin/main
git log -5 --oneline
```

Do not discard unrelated `.vscode/` or preparation notes. Main and refreshed remote
main must match before a new task starts; preserve/review concurrent work normally.
After the user selects the feature and bounds its authority, create a fresh,
collision-safe `feat/<approved-feature>` branch from synchronized main. Do not
continue feature work on the integration branch or repeat completed merge prep.

## Source history and implementation

- Original main: `5fad6b4ebf17c58a1ca427a3ba742d1e843f9e7b`; unpublished frontend
  corrections `9ad3aa1`, `6f33d40`, `5fad6b4` are preserved ancestors.
- Existing connected candidate: `26528936cb09ae810674fdcce71c52928c148970`;
  tested transit implementation `a769d6891795fde9f7c80edd540e8541f0bb3431`.
- Reviewed backend: `c65f03b569fc941264bb1b6ec80f8e0a079263d0`, already imported
  through `2b8d8d3`; fetch/review any later partner delta separately.
- Parser repair: `1e94a56`; frontend evidence regressions and disabled Vite dotenv
  loading: `70da447`. Later preparation commits add repository-owned runtime/setup,
  focused tests, documentation and clarified regression names. Read the current
Git log for their exact IDs instead of treating this file's parent as final HEAD.
- Remote main before publication: `aa08a17d166cbf0f23281627a74289fe8f7efe43`.
  A uniquely named local pre-publication backup preserves original main; keep it
  and `integration/frontend-backend-v1`. Never force-push or rewrite this history.

React state owns one MapLibre/deck.gl map; backend transport has exact GET route
and query allowlists, runtime validation, bounded paging, cancellation/generation
checks and full opaque IDs. Fixture mode remains distinct from Backend snapshot
and transit. Errors never silently substitute fixtures. The backend controls
scientific logic and evidence; no frontend recalculation or production AI is added.

The bounded independent backend delta is the shared string-key parser plus its
regressions. It reverses SDK printed delimiters, preserving Unicode, punctuation,
colons, backslashes and literal percent sequences. Path404/query422 semantics
remain. Actual collection-to-detail/profile and frontend evidence drill-down pass.
Single-segment HTTP routes still reject actual slashes in keys; current stored
IDs are unaffected. Fabricated delimiter-prefixed raw aliases are unsupported;
use canonical IDs returned by the collection, encoded once.

## Verified setup, run and test workflow

Use [README](../README.md), [current runbook](LOCAL_INTEGRATION.md) and
[repository runtime tooling](../scripts/local/README.md). Main's own backend venv
is created from the unchanged lock using reviewed cached inputs under clean,
network-denied setup. It must never be a copied integration venv. Frontend uses
its locked installed packages. No `.env` is created, read or activated.

Backend command (separate terminal):

```sh
/usr/bin/python3 -I -S /Users/kerwynjean/Swale/scripts/local/runtime.py serve-live \
  --root /Users/kerwynjean/Swale \
  --database /Users/kerwynjean/Swale-integration/backend/var/local-transit-c65f03b.db \
  --runtime-dir /Users/kerwynjean/.local/share/swale-local/main-runtime
```

Frontend:

```sh
cd /Users/kerwynjean/Swale/frontend
npm run dev
```

Open http://127.0.0.1:5173/, Backend / snapshot + transit → Subway monitoring.
There is one visible live-board owner; Pause/Resume is accessible. The API and
managed broker listen on loopback8000/8001. `npm run dev` starts only Vite.
Ctrl+C stops foreground services; the verified `runtime.py stop` command uses the
same root/database/runtime-dir and checks the live controller identity.

Frontend checks are `npm test`, `npm run typecheck`, `npm run build`,
`npm run lint`, `npm run format:check`. Run helper tests with
`/usr/bin/python3 -I -S scripts/local/tests/test_runtime.py`. The runbook's
`runtime.py test --test test_params.py` selects only the reviewed offline
baseline/transit/weather/parser modules, using `mem://` under native network
and credential denial. Do not collect simulation/briefing/cloud suites merely
because they exist. Native enforcement and actual service checks are separate
from mocked helper tests.

Latest fresh candidate results:165 frontend tests,165 selected backend tests,
53 helper tests; TypeScript/build/lint/format pass. Frontend npm audit reports0
known vulnerabilities. Built-in uv audit reports97 packages,0 vulnerabilities
and0 adverse statuses; experimental audit/schema warnings and first DNS failure
are retained. Registry audit used a separate clean tooling environment, not the
application runtime. Both audits are point-in-time evidence, not a security
certification. All23 bounded actual local API requests pass, including the formerly
failing event with68 paired profile samples. See the current verification record
for final main-backed observations and publication state.

Fresh production transit compositor windows measure86.15 and65.00 DrawFrame/s,
max gap44.09ms retained; canonical app transfer814189B. Basemap/API samples are
separate and the HAR worker accounting discrepancy is retained. These do not
certify GPU completion or exact physical-display cadence. Historical failed
attempts and Liberty warnings remain in the records.

## Data, runtime and authority

The retained DB stays at the explicit task-owned integration-path location above;
application/helper code must come entirely from main. It is not a source import
from the other worktree. Stop/check the actual managed writer before any DB access
change; never copy a live embedded DB, replace history, reingest merely to change
a code label, or rewrite original source/fetch/ingest timestamps.

Only MTA/NWS live GET behavior is approved. Exact CONNECT hosts are enforced in
broker software; the native TCP443 rule is coarse and encrypted paths/methods
are not inspected. TLS verification remains enabled. Backend imports/startup do
not activate cloud clients in the clean environment. Stock loopback routers are
broader than the frontend allowlist; CORS/client validation is not backend auth.
No public bind/tunnel, credential file, new paid service or manual deployment.

The October16 final instruction grants this bounded repair, verified local main
promotion, normal publication and existing push-triggered automation. It does not
grant unrelated backend/scientific/schema changes, manual infrastructure/billing,
credential activation or new product features. The historical contract remains
PROPOSED — NOT YET AGREED WITH BACKEND TEAM. A new feature needs its own scope;
read the latest owner instruction above historical AGENTS/plan restrictions.

Known follow-ups: safe schedule refresh/export and exposed validity metadata
(current snapshot October16–23), backend single-flight/cancellation and retention,
production authentication/hosting, distinct station flood-event history, precise
vehicle positions/destinations and underground geometry. None is fabricated here.
Monitoring samples are not flood events; no_service is not official closure;
inferred exposure and derived buffers do not establish current flooding or safety.
Simulations, inspection entry, basin ranking, AI/audio remain unconnected.

## Next action

First confirm the final report's publication/main-backed verdict against fresh
refs and the actual services. If complete, obtain the user's next feature choice
and acceptance criteria, then implement it on the fresh feature branch. A new local
Codex session in execution mode is appropriate after scope is clear. Recommended
model: GPT-6.1 Sol with high reasoning for a substantial feature, subject to the
account's actual availability; this is an operator recommendation, not a required
platform change. Official [model documentation](https://developers.openai.com/api/docs/models/gpt-6.1-sol)
supports complex coding and high reasoning. Use a short planning pass if the
feature requires an unresolved product or ownership decision.

Do not request this milestone's merge/push permission again. Do not infer a hosted
application from a source push; read actual checks/deployment statuses for the
published SHA. Keep final receipts in sanitized local evidence to avoid recursive
documentation-only pushes. Earlier active-work duration is unmeasured; do not
restart the original approximate8hour/6:45freeze budget or invent elapsed history.
