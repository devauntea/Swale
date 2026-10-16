# Restricted localhost runtime

These nonsecret sources replace the formerly private, checkout-specific launch
helpers. They run only the existing reviewed API and MTA/NWS transit/weather slice.
No ingestion, snapshot acquisition, simulation, briefing, cloud, or credential
activation command is exposed.

The tested platform is macOS with `/usr/bin/sandbox-exec` and Python 3.12 in the
target checkout's own locked `backend/.venv`. There is no unrestricted fallback.
Build that environment from `backend/uv.lock`; do not copy another checkout's
virtualenv. The source-owned setup helper uses explicit reviewed tooling/cache
paths, strips inherited environment, and denies all network during locked setup:

```sh
/usr/bin/python3 -I -S /absolute/Swale/scripts/local/setup.py \
  --root /absolute/Swale \
  --uv /absolute/reviewed/uv \
  --python /absolute/existing-python3.12 \
  --cache /absolute/reviewed-uv-cache \
  --runtime-dir /absolute/private-swale-setup
```

It invokes `uv --no-config --no-python-downloads sync --locked --offline` with
that checkout's backend project and verifies the public lockfile hash is unchanged.
Missing cached dependencies cause failure, with no online fallback. Existing
`.venv` paths are preserved: `--verify-existing` runs only `uv sync --check`;
`--check` prints a static setup preflight without running uv. Neither command
copies a virtualenv or imports the application. Do not run library signing repairs.

Reuse the existing absolute database only after its old managed writer
has stopped. This controller never initializes, copies, replaces, or reingests it.

Use absolute paths and run the helper belonging to the same checkout as `--root`:

```sh
/usr/bin/python3 -I -S /absolute/Swale/scripts/local/runtime.py check \
  --root /absolute/Swale \
  --database /absolute/existing-local-transit.db \
  --runtime-dir /absolute/private-swale-runtime
```

`check` validates metadata and generates private profiles without importing the
application or opening the database. The runtime directory must be outside the
checkout, owned by the current user, and mode 0700 if already present. New runtime
directories are created privately. Neither checkout credential files nor inherited
application settings are loaded. A checkout `.env` or `.env.*` path (except the
nonsecret `.env.example` name) blocks launch without opening it.

Replace `check` with:

- `serve-live`: API at `127.0.0.1:8000`, managed broker at `127.0.0.1:8001`.
- `serve-offline`: API with all new outbound networking denied.
- `probe-offline`: reserved-address TCP/UDP, nonsecret marker, and inherited-child
  enforcement checks; no application/database import or public-source request.
- `probe-live`: those checks, unknown-authority denial, and two explicit approved
  MTA/NWS GETs. Run with the existing broker stopped; it owns fixed port 8001.
- `test`: the eight reviewed offline baseline/transit/weather modules. Optional
  `--test test_NAME.py` adds an existing file inside `backend/tests/`. The clean
  test environment uses `mem://`, never the retained snapshot as its default.
- `stop`: signals only the controller whose checkout/database/script and current
  process command match the private controller state. It waits for bounded cleanup.

Use exactly the same `--root`, `--database`, and `--runtime-dir` values for `stop`.
Foreground Ctrl+C also stops the managed backend and broker. Existing state,
occupied ports, failed ownership checks, and unsafe paths cause refusal; there is
no alternate port, unrelated process kill, or automatic stale-state removal.
Confirm process identity before manually removing stale state after a crash.

The controller strips inherited environment and descriptors on every launch,
uses an isolated HOME/TMP/XDG tree, and selects the requested checkout's Python
and backend module explicitly. A cooperative per-database advisory lock prevents
two instances of this controller from writing the same retained database. Other
database users must still be stopped and checked explicitly.

Only the broker admits exact CONNECT authorities `api-endpoint.mta.info:443` and
`api.weather.gov:443`. It receives public numeric addresses resolved once by the
clean controller, limits tunnels/requests, follows the controller's lifetime, and
logs only authority/result/time. Native outbound TCP 443 permission is coarse:
the exact-host guard is software, and encrypted methods/paths are not inspected.
The existing source-reviewed GET/no-redirect behavior and normal TLS verification
remain necessary. No live collector starts independently of visible frontend
requests. Stop a probe before starting a service.

Private generated state is `controller.json`; native profiles are in `profiles/`;
sanitized broker events are in `logs/egress.jsonl` under the explicit runtime
directory. Backend/controller stdout goes to the invoking terminal or the
operator's deliberate task-owned log redirection. Do not commit runtime output.

Run the focused helper tests without network, application imports, or real DBs:

```sh
/usr/bin/python3 -I -S scripts/local/tests/test_runtime.py
```

Mocked tests establish helper decisions/lifecycle behavior; native enforcement,
actual service startup, public-source retrieval, and browser acceptance require
separate observed runtime checks. See the repository's current integration and
verification records for those results and the exact tested local paths.
