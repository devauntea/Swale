# Bounded integrated release runtime

`release_runtime.py` is the task-owned macOS launcher for the integrated selected-context assistant. The older credential-free `runtime.py` and its broker remain unchanged. It requires the release checkout's own locked `backend/.venv`, an existing database, and `/usr/bin/sandbox-exec`; there is no unrestricted or alternate-port fallback.

Use a stopped-writer, consistent disposable database copy. The launcher does not initialize, copy, reset, reingest, or replace a database. Preserve the original database and recorded old runtime command for rollback. Application startup applies its ordinary schema and marks interrupted simulation jobs failed in the **copy**; normal transit/weather requests may persist their existing snapshots there. No collector, alert monitor, simulation, evaluation, inspection, or crew-briefing job is enabled by this launcher.

All paths below must be absolute. `--runtime-dir` must be outside the checkout and privately owned (0700). A credential file, if explicitly selected, must be nonsymlink, owned by the operator, regular, mode 0600, at most 64 KiB, with one link. Do not change or print the original credential file merely to launch the application. Select only necessary approved keys into a separate private file when needed. Supported names are `AWS_REGION`, `AWS_BEARER_TOKEN_BEDROCK`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`, `ELEVENLABS_API_KEY`, and `ELEVENLABS_VOICE_ID`. Unrelated assignments are ignored; region is restricted to `us-east-1`. No shell evaluation or application dotenv loading occurs.

Static preflight does not open the application, database, credential contents, or network:

```sh
/usr/bin/python3 -I -S /absolute/Swale/scripts/local/release_runtime.py check \
  --root /absolute/Swale \
  --database /absolute/existing-release-copy.db \
  --runtime-dir /absolute/private-release-runtime
```

Replace `check` with `serve` for the default provider-disabled runtime. Positive provider allowance requires an applicable owner authorization and explicit arguments on that invocation:

```sh
/usr/bin/python3 -I -S /absolute/Swale/scripts/local/release_runtime.py serve \
  --root /absolute/Swale \
  --database /absolute/existing-release-copy.db \
  --runtime-dir /absolute/private-release-runtime \
  --provider-budget-usd 1 \
  --credentials /absolute/private-selected-provider.conf
```

The default allowance is zero; values outside 0–1 USD or nonfinite values are rejected. The server reserves conservative amounts before provider calls, with at most three model attempts and one speech attempt. Its `provider-ledger.json` persists allowance usage across restarts. Failed or ambiguous attempts consume reservations. The ledger is not an invoice or proof of actual provider billing. **Reuse the same runtime directory and never delete/reset its ledger to replenish this task's allowance.** The launcher does not remove it during normal stop, startup failure, or cleanup. Contextual capabilities report remaining attempts and reservations.

The controller strips inherited environment and descriptors, uses a private HOME/TMP/XDG tree, and launches one API child on `127.0.0.1:8000` and one managed CONNECT broker on `127.0.0.1:8001`. Only the API receives allowlisted provider credentials. No credentials appear in process arguments or logs. The broker admits only `api-endpoint.mta.info:443` and `api.weather.gov:443`; positive explicit provider allowance also admits `bedrock-mantle.us-east-1.api.aws:443` and `api.elevenlabs.io:443`. Public numeric destinations are resolved once and validated. As in the existing controller, native broker permission is coarse TCP 443: exact authorities are enforced in software, and end-to-end TLS methods/paths are not inspected. The API itself can connect only to the loopback broker. Credential-file access, native keychains, default cloud configuration and direct external networking remain denied.

The outer API guard mirrors the reviewed frontend route/query allowlist: inventory, reports, supported transit/weather/evidence GETs, contextual reads, and explicit contextual agent/briefing/translation/audio POSTs. Unknown routes, query keys, duplicate keys and unrelated mutations fail closed. Contextual request bodies require application/json, a supplied approved loopback Origin, and are bounded to 128 KiB with a 10-second body timeout. `/dev/map`, arbitrary simulation, admin/evaluation, alert-pack, inspection and legacy crew-briefing writes are unavailable. This is a bounded local runtime, not production authentication or a deployment.

Run frontend development or production preview separately from the same release checkout. Its approved `/api/` proxy targets8000 in both modes. The launcher permits the existing loopback origins 5173/4173/5183/4183 and never starts Node or changes browser hosts/ports. Source mode and endpoint errors remain explicit; a health response does not establish whole-product readiness.

Stop only the owned controller, preserving the database and provider ledger:

```sh
/usr/bin/python3 -I -S /absolute/Swale/scripts/local/release_runtime.py stop \
  --root /absolute/Swale \
  --database /absolute/existing-release-copy.db \
  --runtime-dir /absolute/private-release-runtime
```

The controller requires matching root/database/script, private PID metadata and the exact recorded live command before signaling. Foreground Ctrl+C also performs bounded child/broker cleanup. Occupied fixed ports, unknown state or mismatched ownership cause refusal. There is no blanket process kill, stale-state deletion, force restart or alternate port. For rollback, first stop this controller and confirm its listeners/writer are gone, then use the recorded original launcher against the preserved original database.

Offline tests import no application and use no real database or external network:

```sh
/usr/bin/python3 -I -S scripts/local/tests/test_release_runtime.py
/usr/bin/python3 -I -S scripts/local/tests/test_runtime.py
```

The initial local source verification passed 18 release-launcher tests and 53 unchanged helper tests. These establish boundary decisions and cleanup logic, not actual native sandbox enforcement, provider success, audible playback, or browser acceptance. Those require separately recorded observations against the final release revision.
