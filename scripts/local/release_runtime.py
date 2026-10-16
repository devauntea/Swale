"""Bounded, task-owned release runtime. No ingestion, copying, or deployment.

Explicit provider opt-in is --provider-budget-usd (0 by default, at most 1).
Only the selected server receives allowlisted credentials, never the broker.
The persistent provider-ledger.json is preserved across stop/start and failures.
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import math
import os
from pathlib import Path
import sys

SCRIPT = Path(__file__).resolve()
PUBLIC_HOSTS = ("api-endpoint.mta.info", "api.weather.gov")
PROVIDER_HOSTS = ("bedrock-mantle.us-east-1.api.aws", "api.elevenlabs.io")
CREDENTIAL_KEYS = frozenset(("AWS_REGION", "AWS_BEARER_TOKEN_BEDROCK", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_SESSION_TOKEN", "ELEVENLABS_API_KEY", "ELEVENLABS_VOICE_ID"))
PROVIDER_CONTROL_KEYS = frozenset(("SWALE_CONTEXT_MODEL_ENABLED", "SWALE_CONTEXT_AUDIO_ENABLED", "SWALE_CONTEXT_MAX_MODEL_CALLS", "SWALE_CONTEXT_MAX_AUDIO_CALLS", "SWALE_CONTEXT_BUDGET_USD", "SWALE_CONTEXT_LEDGER_PATH"))
LOCAL_ORIGINS = tuple("http://127.0.0.1:" + str(port) for port in (5173, 4173, 5183, 4183))


def load_helper(name):
    spec = importlib.util.spec_from_file_location("swale_release_" + name, SCRIPT.parent / (name + ".py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def arguments(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("check", "serve", "stop"))
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--database", type=Path, required=True)
    parser.add_argument("--runtime-dir", type=Path, required=True)
    parser.add_argument("--credentials", type=Path)
    parser.add_argument("--provider-budget-usd", type=float, default=0)
    parser.add_argument("--_cleaned", action="store_true", help=argparse.SUPPRESS)
    args = parser.parse_args(argv)
    args.test = []  # shared metadata validation, no test execution path
    if not math.isfinite(args.provider_budget_usd) or not 0 <= args.provider_budget_usd <= 1:
        parser.error("provider budget must be finite, between 0 and 1 USD inclusive")
    if args.provider_budget_usd == 0 and args.credentials is not None:
        parser.error("credentials require explicit positive provider budget; none were read")
    return args


def credential_metadata(path):
    import stat
    if not path.is_absolute() or path.resolve() != path:
        raise SystemExit("BLOCK: credentials must be an absolute nonsymlink path.")
    metadata = path.lstat()
    if not stat.S_ISREG(metadata.st_mode) or metadata.st_uid != os.getuid() or metadata.st_mode & 0o077 or metadata.st_nlink != 1 or metadata.st_size > 65536:
        raise SystemExit("BLOCK: credentials must be a privately owned regular file, mode0600, bounded size and one link.")


def read_credentials(path):
    """Small assignment parser, not shell evaluation; never print values."""
    credential_metadata(path)
    with os.fdopen(os.open(path, os.O_RDONLY | os.O_NOFOLLOW), "r") as source:
        text = source.read(65537)
    if len(text) > 65536:
        raise SystemExit("BLOCK: credential file exceeds bounded size.")
    selected = {}
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        if key not in CREDENTIAL_KEYS:
            continue
        if key in selected:
            raise SystemExit("BLOCK: duplicate allowlisted credential assignment.")
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in ("'", '"'):
            value = value[1:-1]
        else:
            value = value.split(" #", 1)[0].rstrip()
        if any(ord(character) < 32 or ord(character) == 127 for character in value):
            raise SystemExit("BLOCK: control characters in allowlisted credential assignment.")
        if value:
            selected[key] = value
    if selected.get("AWS_REGION", "us-east-1") != "us-east-1":
        raise SystemExit("BLOCK: only the approved us-east-1 model endpoint is enabled.")
    if bool(selected.get("AWS_ACCESS_KEY_ID")) != bool(selected.get("AWS_SECRET_ACCESS_KEY")):
        raise SystemExit("BLOCK: incomplete AWS credential pair.")
    return selected


def provider_environment(args, runtime):
    if args.provider_budget_usd <= 0:
        return {}
    credentials = read_credentials(args.credentials) if args.credentials else {}
    return {**credentials, "AWS_REGION": "us-east-1", "SWALE_ALERT_MONITOR": "0",
            "SWALE_CONTEXT_MODEL_ENABLED": "1", "SWALE_CONTEXT_AUDIO_ENABLED": "1",
            "SWALE_CONTEXT_MAX_MODEL_CALLS": "3", "SWALE_CONTEXT_MAX_AUDIO_CALLS": "1",
            "SWALE_CONTEXT_BUDGET_USD": str(args.provider_budget_usd),
            "SWALE_CONTEXT_LEDGER_PATH": str(runtime / "provider-ledger.json")}


GET_KEYS = {
    "health": (), "layers": (), "sources": (),
    "catch-basins": ("bbox", "limit", "cursor"),
    "incidents": ("bbox", "limit", "cursor", "since", "until", "category", "verification", "basin"),
    "subway/stations": ("bbox",), "subway/entrances": ("bbox",),
    "subway/live": ("area_id",), "subway/history": ("area_id", "hours"),
    "subway/flood-exposure": ("area_id", "live"),
    "danger-zones": ("area_id", "weather"), "weather/now": ("area_id", "hours"),
    "sensors": ("bbox", "since", "limit", "cursor"), "flood-maps": ("bbox", "scenario"),
    "flood-observations": ("bbox", "since", "until", "include_tidal", "limit", "cursor", "min_depth_in"),
}


def approved_request(method, path, query=b""):
    """Mirror the reviewed frontend boundary; unknown keys/routes fail closed."""
    import re
    from datetime import datetime
    from urllib.parse import parse_qsl, unquote
    try:
        if isinstance(path, bytes):
            path = path.decode("ascii")
        if isinstance(query, bytes):
            query = query.decode("ascii")
        if not path.startswith("/api/v1/") or any(character in path for character in ("?", "#", "\\")) or re.search(r"%(?![0-9A-Fa-f]{2})", path + query):
            return False
        decoded = unquote(path, errors="strict")
        if any(ord(character) < 32 or ord(character) == 127 for character in decoded):
            return False
        route = decoded[len("/api/v1/"):]
        if method == "POST":
            return not query and re.fullmatch(r"context/(?:agent|briefings|briefings/[a-f0-9]{32}/(?:translations|audio))", route) is not None
        if method != "GET":
            return False
        if re.fullmatch(r"context/(?:capabilities|briefings/[a-f0-9]{32}(?:/audio)?)", route):
            return not query
        allowed = GET_KEYS.get(route)
        if allowed is None and re.fullmatch(r"(?:catch-basins|incidents|flood-observations)/[^/\\]+", route):
            allowed = ()
        if allowed is None:
            return False
        seen = set()
        for key, value in (parse_qsl(query, keep_blank_values=True, strict_parsing=True, errors="strict", max_num_fields=20) if query else []):
            if key not in allowed or key in seen or not value or len(value) > 2048:
                return False
            seen.add(key)
            if key == "area_id" and value != "BK0601": return False
            if key == "live" and value != "false": return False
            if key == "weather" and value not in ("true", "false"): return False
            if key == "scenario" and value != "dep_moderate_current": return False
            if key == "include_tidal" and value != "false": return False
            if key in ("hours", "limit"):
                bound = (24 if route == "weather/now" else 72) if key == "hours" else 5000
                if not re.fullmatch(r"[0-9]+", value) or not 1 <= int(value) <= bound: return False
                if route == "weather/now" and value != "24": return False
            if key in ("since", "until"):
                if not re.search(r"(?:Z|[+-][0-9]{2}:[0-9]{2})$", value): return False
                datetime.fromisoformat(value.replace("Z", "+00:00"))
            if key == "min_depth_in" and (not math.isfinite(float(value)) or float(value) < 0): return False
            if key == "bbox":
                numbers = [float(part) for part in value.split(",")]
                if len(numbers) != 4 or not all(math.isfinite(number) for number in numbers): return False
                west, south, east, north = numbers
                if not -180 <= west < east <= 180 or not -90 <= south < north <= 90: return False
        return True
    except (ValueError, UnicodeError, TypeError, OverflowError):
        return False


class RouteGuard:
    """Outer ASGI guard also bounds contextual bodies before application execution."""
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        import asyncio
        if scope["type"] == "lifespan":
            return await self.app(scope, receive, send)
        if scope["type"] != "http":
            return
        async def reject(status):
            body = json.dumps({"title": "Unavailable in bounded release runtime", "status": status}).encode()
            await send({"type": "http.response.start", "status": status, "headers": [(b"content-type", b"application/problem+json")]})
            await send({"type": "http.response.body", "body": body})
        method = scope.get("method", "")
        if not approved_request(method, scope.get("raw_path", scope.get("path", "")), scope.get("query_string", b"")):
            return await reject(404 if method == "GET" else 405)
        if method != "POST":
            return await self.app(scope, receive, send)
        headers = scope.get("headers", [])
        content_types = [value.decode("latin-1").split(";", 1)[0].strip().lower() for key, value in headers if key.lower() == b"content-type"]
        if content_types != ["application/json"]:
            return await reject(415)
        origins = [value.decode("latin-1") for key, value in headers if key.lower() == b"origin"]
        if origins and (len(origins) != 1 or origins[0] not in LOCAL_ORIGINS):
            return await reject(403)
        chunks, size = [], 0
        try:
            async def read_body():
                nonlocal size
                while True:
                    message = await receive()
                    if message["type"] == "http.disconnect": return False
                    part = message.get("body", b"")
                    size += len(part)
                    if size > 131072: return False
                    chunks.append(part)
                    if not message.get("more_body", False): return True
            complete = await asyncio.wait_for(read_body(), timeout=10)
        except TimeoutError:
            return await reject(408)
        if not complete:
            return await reject(413 if size > 131072 else 400)
        pending = True
        async def body_receive():
            nonlocal pending
            if pending:
                pending = False
                return {"type": "http.request", "body": b"".join(chunks), "more_body": False}
            return await receive()
        return await self.app(scope, body_receive, send)


def run_api(root, database):
    # Explicit Settings prevents dotenv autoload. No inherited providers/tracing/
    # alert monitor exist; only controller-validated server credentials may exist.
    if root != SCRIPT.parents[2] or not database.is_absolute() or database.resolve() != database or not database.exists():
        raise SystemExit("BLOCK: internal API source/database identity mismatch.")
    if os.environ.get("SWALE_RELEASE_CHILD_ROLE") != "api" or os.environ.get("SWALE_ALERT_MONITOR") != "0" or os.environ.get("HTTPS_PROXY") != "http://127.0.0.1:8001":
        raise SystemExit("BLOCK: API must be launched by the clean native controller.")
    helper = load_helper("runtime")
    runtime = Path(os.environ.get("HOME", "")).parent
    base = helper.clean_environment(root, database, runtime)
    extra = {"SWALE_RELEASE_CHILD_ROLE", "SWALE_ALERT_MONITOR", "HTTPS_PROXY", "HTTP_PROXY", "NO_PROXY", "LC_CTYPE", "__CF_USER_TEXT_ENCODING"}
    if set(os.environ) - set(base) - CREDENTIAL_KEYS - PROVIDER_CONTROL_KEYS - extra:
        raise SystemExit("BLOCK: unexpected API environment; providers/tracing not activated.")
    sys.path.insert(0, str(root / "backend"))
    from swale.api.app import create_app
    from swale.config import Settings
    import uvicorn
    settings = Settings(db_url="surrealkv://" + str(database), cors_origins=LOCAL_ORIGINS, dev_map=False)
    uvicorn.run(RouteGuard(create_app(settings)), host="127.0.0.1", port=8000, access_log=False, log_level="warning", lifespan="on")


def broker_child(argv):
    broker = load_helper("broker")
    enabled = argv.pop() == "providers"
    broker.ALLOWED = frozenset(host + ":443" for host in (*PUBLIC_HOSTS, *(PROVIDER_HOSTS if enabled else ())))
    sys.argv = [str(SCRIPT), *argv]
    return broker.main()


def controller_command(args, python, root, database, runtime):
    command = [str(python), "-I", "-S", str(SCRIPT), args.action, "--root", str(root), "--database", str(database), "--runtime-dir", str(runtime), "--provider-budget-usd", str(args.provider_budget_usd)]
    if args.credentials:
        command += ["--credentials", str(args.credentials)]
    return [*command, "--_cleaned"]


def private_json(path):
    import stat
    metadata = path.lstat()
    if not stat.S_ISREG(metadata.st_mode) or metadata.st_uid != os.getuid() or metadata.st_mode & 0o077 or metadata.st_nlink != 1:
        raise SystemExit("BLOCK: unsafe controller state metadata.")
    with os.fdopen(os.open(path, os.O_RDONLY | os.O_NOFOLLOW), "r") as source:
        return json.loads(source.read(16384))


def stop_owned(root, database, runtime):
    import shlex
    import signal
    import subprocess
    import time
    path = runtime / "controller.json"
    state = private_json(path)
    pid = state.get("controller")
    if state.get("root") != str(root) or state.get("database") != str(database) or state.get("script") != str(SCRIPT) or type(pid) is not int or pid <= 1:
        raise SystemExit("BLOCK: controller identity mismatch; nothing signaled.")
    command = subprocess.run(["/bin/ps", "-p", str(pid), "-o", "command="], capture_output=True, text=True, check=False).stdout.strip()
    if shlex.split(command) != state.get("command"):
        raise SystemExit("BLOCK: process command differs from recorded ownership; nothing signaled.")
    os.kill(pid, signal.SIGINT)
    deadline = time.monotonic() + 38
    while path.exists() and time.monotonic() < deadline:
        time.sleep(.2)
    if path.exists():
        raise SystemExit("BLOCK: bounded shutdown incomplete; inspect task-owned processes.")
    print("Release runtime stopped; database and persistent provider reservations preserved.")


def manage(args, root, database, runtime, python, clean, helper):
    import fcntl
    import ipaddress
    import signal
    import socket
    import stat
    import subprocess
    state_path = runtime / "controller.json"
    if os.path.lexists(state_path):
        raise SystemExit("BLOCK: controller state exists; inspect/stop exact owner first.")
    provider = provider_environment(args, runtime)
    state = {"controller": os.getpid(), "root": str(root), "database": str(database), "script": str(SCRIPT), "action": "serve", "command": controller_command(args, python, root, database, runtime), "provider_budget_usd": args.provider_budget_usd}
    with os.fdopen(os.open(state_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600), "w") as output:
        json.dump(state, output)
    stopping, proxy, child, listener, writer_lock = False, None, None, None, None
    def stop(signum, frame):
        nonlocal stopping
        stopping = True
        if child is not None and child.poll() is None:
            child.send_signal(signal.SIGINT)
    def ensure_running():
        if stopping: raise SystemExit(130)
    signal.signal(signal.SIGINT, stop)
    signal.signal(signal.SIGTERM, stop)
    try:
        descriptor = os.open(database.parent / ("." + database.name + ".swale-runtime.lock"), os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
        writer_lock = os.fdopen(descriptor, "a")
        metadata = os.fstat(descriptor)
        if not stat.S_ISREG(metadata.st_mode) or metadata.st_uid != os.getuid() or metadata.st_mode & 0o077 or metadata.st_nlink != 1:
            raise SystemExit("BLOCK: unsafe database lock; database not opened.")
        fcntl.flock(writer_lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        probe = helper.reserve_port(8000)
        probe.close()
        hosts = (*PUBLIC_HOSTS, *(PROVIDER_HOSTS if args.provider_budget_usd > 0 else ()))
        addresses = {host: sorted({entry[4][0] for entry in socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM) if ipaddress.ip_address(entry[4][0]).is_global}) for host in hosts}
        broker = load_helper("broker")
        broker.ALLOWED = frozenset(host + ":443" for host in hosts)
        broker.validate_addresses(addresses)
        ensure_running()
        listener = helper.reserve_port(8001)
        ensure_running()
        proxy = subprocess.Popen(["/usr/bin/sandbox-exec", "-f", str(runtime / "profiles/release-broker.sb"), str(python), "-I", "-S", str(SCRIPT), "--_broker", str(listener.fileno()), str(os.getpid()), json.dumps(addresses), str(runtime / "logs/egress.jsonl"), "providers" if args.provider_budget_usd > 0 else "public"], env=clean, pass_fds=(listener.fileno(),))
        listener.close()
        listener = None
        ensure_running()
        if proxy.poll() is not None:
            raise SystemExit("BLOCK: broker exited before backend startup.")
        server_env = {**clean, **provider, "SWALE_RELEASE_CHILD_ROLE": "api", "SWALE_ALERT_MONITOR": "0", "HTTPS_PROXY": "http://127.0.0.1:8001", "HTTP_PROXY": "http://127.0.0.1:8001", "NO_PROXY": "127.0.0.1,localhost"}
        child = subprocess.Popen(["/usr/bin/sandbox-exec", "-f", str(runtime / "profiles/release-api.sb"), str(python), "-I", "-s", str(SCRIPT), "--_api", str(root), str(database)], cwd=root / "backend", env=server_env, close_fds=True)
        state.update(backend=child.pid, broker=proxy.pid)
        with state_path.open("w") as output: json.dump(state, output)
        print(json.dumps({key: value for key, value in state.items() if key != "command"}), flush=True)
        while True:
            ensure_running()
            try: return child.wait(timeout=.5)
            except subprocess.TimeoutExpired:
                if proxy.poll() is not None:
                    raise SystemExit("BLOCK: broker exited; stopping backend.")
    finally:
        try: helper.finish(child, 15)
        finally:
            try: helper.finish(proxy, 10)
            finally:
                if listener is not None: listener.close()
                if writer_lock is not None: writer_lock.close()
                if state_path.exists() and private_json(state_path).get("controller") == os.getpid(): state_path.unlink()


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    if argv and argv[0] == "--_broker": return broker_child(argv[1:])
    if argv and argv[0] == "--_api":
        if len(argv) != 3: raise SystemExit("BLOCK: invalid internal API arguments.")
        return run_api(Path(argv[1]), Path(argv[2]))
    args = arguments(argv)
    helper = load_helper("runtime")
    root, database, runtime, python = helper.validate(args)
    if root != SCRIPT.parents[2]:
        raise SystemExit("BLOCK: launcher and source checkout differ.")
    if args.credentials:
        credential_metadata(args.credentials)
    clean = helper.clean_environment(root, database, runtime)
    if not args._cleaned:
        os.closerange(3, 4096)
        os.execve(str(python), controller_command(args, python, root, database, runtime), clean)
    if any(os.environ.get(key) != value for key, value in clean.items()) or set(os.environ) - set(clean) - {"LC_CTYPE", "__CF_USER_TEXT_ENCODING"}:
        raise SystemExit("BLOCK: unexpected inherited environment after clean re-exec.")
    if sys.platform != "darwin" or not Path("/usr/bin/sandbox-exec").is_file():
        raise SystemExit("BLOCK: native macOS sandbox-exec required; no unrestricted fallback.")
    if args.action == "stop": return stop_owned(root, database, runtime)
    helper.prepare(runtime)
    import pwd
    user_home = Path(pwd.getpwuid(os.getuid()).pw_dir)
    for name, mode in (("release-api", "live"), ("release-broker", "broker")):
        text = helper.profile_text(root, runtime, mode, user_home)
        if args.credentials:
            text += "\n(deny file* (literal " + json.dumps(str(args.credentials)) + "))\n"
        if mode == "broker":
            text += "\n(deny file* (literal " + json.dumps(str(runtime / "provider-ledger.json")) + "))\n"
        target = runtime / "profiles" / (name + ".sb")
        if target.is_symlink(): raise SystemExit("BLOCK: profile path is a symlink.")
        descriptor = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_NOFOLLOW, 0o600)
        import stat
        metadata = os.fstat(descriptor)
        if not stat.S_ISREG(metadata.st_mode) or metadata.st_uid != os.getuid() or metadata.st_mode & 0o077 or metadata.st_nlink != 1:
            os.close(descriptor)
            raise SystemExit("BLOCK: unsafe existing profile metadata; not changed.")
        with os.fdopen(descriptor, "w") as output:
            output.write(text)
            output.truncate()
    if args.action == "check":
        print(json.dumps({"status": "static preflight only; no application, database, credential content or network opened", "root": str(root), "database": str(database), "runtime_dir": str(runtime), "provider_budget_usd": args.provider_budget_usd, "provider_attempt_caps": {"model": 3, "audio": 1}, "persistent_ledger": str(runtime / "provider-ledger.json"), "broker_hosts": [*PUBLIC_HOSTS, *(PROVIDER_HOSTS if args.provider_budget_usd else ())]}))
        return 0
    return manage(args, root, database, runtime, python, clean, helper)


if __name__ == "__main__":
    raise SystemExit(main())
