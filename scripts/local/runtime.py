"""Credential-free, macOS-only controller for the reviewed local application.

No application imports occur in this controller. No ingest or acquisition command
is exposed. The database must already exist and is never copied or replaced.
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import sys

SCRIPT = Path(__file__).resolve()
HOSTS = ("api-endpoint.mta.info", "api.weather.gov")
BASE_TESTS = (
    "test_core.py", "test_311_rules.py", "test_db.py", "test_ingest.py",
    "test_api.py", "test_contract.py", "test_transit.py", "test_weather.py",
)


def arguments(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("check", "serve-live", "serve-offline", "test", "probe-live", "probe-offline", "stop"))
    parser.add_argument("--root", type=Path, default=SCRIPT.parents[2])
    parser.add_argument("--database", type=Path, required=True)
    parser.add_argument("--runtime-dir", type=Path, required=True)
    parser.add_argument("--test", action="append", default=[], metavar="test_NAME.py")
    parser.add_argument("--_cleaned", action="store_true", help=argparse.SUPPRESS)
    return parser.parse_args(argv)


def validate(args):
    import re
    root = args.root.expanduser().absolute()
    if root != root.resolve() or not (root / "backend/swale/cli.py").is_file() or not (root / "backend/uv.lock").is_file():
        raise SystemExit("BLOCK: root must be a real Swale checkout with the reviewed backend and lockfile.")
    for directory in (root, root / "backend", root / "frontend"):
        if directory.exists():
            # Inspect names only. Never open a credential file, including dangling links.
            if any(p.name == ".env" or (p.name.startswith(".env.") and p.name != ".env.example") for p in directory.iterdir()):
                raise SystemExit("BLOCK: checkout-local dotenv path exists; not read or changed.")
    database = args.database.expanduser()
    if not database.is_absolute() or database != database.resolve() or not database.exists():
        raise SystemExit("BLOCK: --database must be an existing absolute nonsymlink path; no initialization is performed.")
    runtime = args.runtime_dir.expanduser()
    if not runtime.is_absolute() or runtime != runtime.resolve() or runtime == root or root in runtime.parents:
        raise SystemExit("BLOCK: --runtime-dir must be an absolute nonsymlink path outside the checkout.")
    if runtime.exists() and (runtime.stat().st_uid != os.getuid() or runtime.stat().st_mode & 0o077):
        raise SystemExit("BLOCK: existing runtime directory must be privately owned (mode 0700).")
    python = root / "backend/.venv/bin/python"
    if (root / "backend/.venv").is_symlink() or not python.is_file():
        raise SystemExit("BLOCK: prepare this checkout's own locked backend/.venv first; do not copy another virtualenv.")
    if args.test and args.action != "test":
        raise SystemExit("BLOCK: --test is valid only with the bounded test action.")
    if any(not re.fullmatch(r"test_[A-Za-z0-9_]+\.py", name) or not (root / "backend/tests" / name).is_file() for name in args.test):
        raise SystemExit("BLOCK: additional tests must name existing backend/tests/test_NAME.py files.")
    return root, database, runtime, python


def clean_environment(root, database, runtime):
    return {
        "PATH": "/usr/bin:/bin:/usr/sbin:/sbin",
        "HOME": str(runtime / "home"), "TMPDIR": str(runtime / "tmp"),
        "XDG_CONFIG_HOME": str(runtime / "home/config"),
        "XDG_CACHE_HOME": str(runtime / "home/cache"),
        "XDG_DATA_HOME": str(runtime / "home/data"),
        "PYTHONNOUSERSITE": "1", "PYTHONDONTWRITEBYTECODE": "1",
        "PYTEST_DISABLE_PLUGIN_AUTOLOAD": "1", "PROJ_NETWORK": "OFF",
        "AWS_EC2_METADATA_DISABLED": "true",
        "SWALE_DB_URL": "surrealkv://" + str(database), "SWALE_DEV_MAP": "0",
        "SWALE_CORS_ORIGINS": "http://127.0.0.1:5173,http://127.0.0.1:4173",
        "SWALE_LOCAL_MARKER": str(runtime / "denied-marker.txt"),
    }


def prepare(runtime):
    import stat
    os.umask(0o077)
    for directory in (runtime, runtime / "home", runtime / "tmp", runtime / "profiles", runtime / "logs", runtime / "home/config", runtime / "home/cache", runtime / "home/data"):
        if directory.is_symlink():
            raise SystemExit("BLOCK: runtime subdirectory is a symlink.")
        directory.mkdir(mode=0o700, parents=True, exist_ok=True)
        if directory.stat().st_uid != os.getuid() or directory.stat().st_mode & 0o077:
            raise SystemExit("BLOCK: runtime subdirectories must be privately owned (mode 0700).")
    marker = runtime / "denied-marker.txt"
    marker_bytes = b"SWALE NONSECRET CONTAINMENT MARKER\n"
    try:
        descriptor = os.open(marker, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    except FileExistsError:
        metadata = marker.lstat()
        if not stat.S_ISREG(metadata.st_mode) or metadata.st_uid != os.getuid() or metadata.st_mode & 0o077 or metadata.st_nlink != 1:
            raise SystemExit("BLOCK: unexpected containment marker ownership/type/mode; not read or changed.")
        # This designated task-owned nonsecret probe artifact is the only marker
        # read during setup; never follow a link or inspect any credential path.
        descriptor = os.open(marker, os.O_RDONLY | os.O_NOFOLLOW)
        with os.fdopen(descriptor, "rb") as marker_file:
            if marker_file.read(len(marker_bytes) + 1) != marker_bytes:
                raise SystemExit("BLOCK: unexpected nonsecret containment marker content; not changed.")
    else:
        with os.fdopen(descriptor, "wb") as marker_file:
            marker_file.write(marker_bytes)


def profile_text(root, runtime, mode, user_home):
    import re
    quote = json.dumps
    home = str(user_home)
    # Native file restrictions complement the empty environment and dotenv guard.
    dotenv_pattern = "^" + re.escape(home) + r"/(.*/)?\.env(\..*)?$"
    rules = [f'(deny file* (regex {quote(dotenv_pattern)}))']
    for path in (root / ".env", root / "backend/.env", root / "frontend/.env", user_home / ".env", runtime / "denied-marker.txt"):
        rules.append(f"(deny file* (literal {quote(str(path))}))")
    for path in (".aws", ".azure", ".config", ".ssh", "Library/Keychains"):
        rules.append(f"(deny file-read* (subpath {quote(str(user_home / path))}))")
    for path in (".netrc", ".npmrc", ".gitconfig"):
        rules.append(f"(deny file-read* (literal {quote(str(user_home / path))}))")
    resolver = '(deny mach-lookup (global-name "com.apple.securityd"))'
    if mode != "broker":
        resolver = '(deny mach-lookup (global-name "com.apple.mDNSResponder") (global-name "com.apple.SystemConfiguration.DNSConfiguration") (global-name "com.apple.networkd") (global-name "com.apple.securityd"))'
    network = []
    if mode in ("live", "serve-offline"):
        network += ['(allow network-bind (local tcp "localhost:8000"))', '(allow network-inbound (local tcp "localhost:8000"))']
    if mode == "live":
        network += ['(allow network-outbound (remote tcp "localhost:8001"))']
    elif mode == "broker":
        network += ['(allow network-bind (local tcp "localhost:8001"))', '(allow network-inbound (local tcp "localhost:8001"))', '(allow network-outbound (remote tcp "*:443"))']
    return (SCRIPT.parent / "profiles/base.sb.in").read_text().replace("@@CREDENTIAL_RULES@@", "\n".join(rules)).replace("@@RESOLVER_RULES@@", resolver).replace("@@NETWORK_RULES@@", "\n".join(network))


def write_profiles(root, runtime):
    import pwd
    user_home = Path(pwd.getpwuid(os.getuid()).pw_dir)
    for mode in ("live", "serve-offline", "offline", "broker"):
        target = runtime / "profiles" / (mode + ".sb")
        if target.is_symlink():
            raise SystemExit("BLOCK: profile path is a symlink.")
        target.write_text(profile_text(root, runtime, mode, user_home))


def finish(process, timeout):
    import subprocess
    if process is None or process.poll() is not None:
        return
    process.terminate()
    try:
        process.wait(timeout=timeout)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=5)


def reserve_port(port):
    import socket
    listener = socket.socket()
    try:
        listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        listener.bind(("127.0.0.1", port))
        listener.listen(16)
        return listener
    except BaseException:
        listener.close()
        raise


def backend_command(root, python, args, runtime):
    bootstrap = "import sys; sys.path.insert(0, sys.argv.pop(1)); import swale; print('Swale backend module=' + str(swale.__file__), flush=True); from swale.cli import main; raise SystemExit(main(sys.argv[1:]))"
    if args.action == "test":
        bootstrap = "import sys; sys.path.insert(0, sys.argv.pop(1)); import pytest; raise SystemExit(pytest.main(sys.argv[1:]))"
        tests = ["tests/" + name for name in dict.fromkeys((*BASE_TESTS, *args.test))]
        return [str(python), "-I", "-s", "-c", bootstrap, str(root / "backend"), *tests, "-q", "--confcutdir=" + str(root / "backend/tests"), "-o", "cache_dir=" + str(runtime / "pytest-cache"), "--basetemp=" + str(runtime / "pytest-temp")]
    if args.action.startswith("probe-"):
        return [str(python), "-I", "-s", str(SCRIPT.parent / "containment_probe.py"), args.action]
    return [str(python), "-I", "-s", "-c", bootstrap, str(root / "backend"), "serve", "--host", "127.0.0.1", "--port", "8000"]


def manage(args, root, database, runtime, python, env):
    import ipaddress
    import signal
    import socket
    import subprocess
    state_path = runtime / "controller.json"
    if os.path.lexists(state_path):
        raise SystemExit("BLOCK: controller state already exists; inspect/stop its exact owner before restarting.")
    stopping, proxy, child, listener = False, None, None, None
    writer_lock = None
    state = {"controller": os.getpid(), "root": str(root), "database": str(database), "script": str(SCRIPT), "action": args.action}
    with state_path.open("x") as output:
        json.dump(state, output)

    def stop(signum, frame):
        nonlocal stopping
        stopping = True
        if child is not None and child.poll() is None:
            child.send_signal(signal.SIGINT)

    def ensure_running():
        if stopping:
            raise SystemExit(130)

    signal.signal(signal.SIGINT, stop)
    signal.signal(signal.SIGTERM, stop)
    live = args.action in ("serve-live", "probe-live")
    profile = "live" if live else ("serve-offline" if args.action == "serve-offline" else "offline")
    try:
        if args.action.startswith("serve-"):
            import fcntl
            import stat
            lock_path = database.parent / ("." + database.name + ".swale-runtime.lock")
            descriptor = os.open(lock_path, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
            writer_lock = os.fdopen(descriptor, "a")
            metadata = os.fstat(descriptor)
            if not stat.S_ISREG(metadata.st_mode) or metadata.st_uid != os.getuid() or metadata.st_mode & 0o077 or metadata.st_nlink != 1:
                raise SystemExit("BLOCK: unsafe database runtime-lock metadata; database not opened.")
            fcntl.flock(writer_lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            probe = reserve_port(8000)
            probe.close()
        if live:
            addresses = {host: sorted({a[4][0] for a in socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM) if ipaddress.ip_address(a[4][0]).is_global}) for host in HOSTS}
            if not all(addresses.values()):
                raise SystemExit("BLOCK: approved public source resolution failed.")
            ensure_running()
            listener = reserve_port(8001)
            ensure_running()
            proxy = subprocess.Popen(["/usr/bin/sandbox-exec", "-f", str(runtime / "profiles/broker.sb"), str(python), "-I", "-S", str(SCRIPT.parent / "broker.py"), str(listener.fileno()), str(os.getpid()), json.dumps(addresses), str(runtime / "logs/egress.jsonl")], env=env, pass_fds=(listener.fileno(),))
            listener.close()
            listener = None
            env = {**env, "HTTPS_PROXY": "http://127.0.0.1:8001", "HTTP_PROXY": "http://127.0.0.1:8001", "NO_PROXY": "127.0.0.1,localhost"}
        ensure_running()
        if proxy is not None and proxy.poll() is not None:
            raise SystemExit("BLOCK: approved-source broker exited before backend startup.")
        child = subprocess.Popen(["/usr/bin/sandbox-exec", "-f", str(runtime / "profiles" / (profile + ".sb")), *backend_command(root, python, args, runtime)], cwd=root / "backend", env=env, close_fds=True)
        state = {"controller": os.getpid(), "backend": child.pid, "broker": proxy.pid if proxy else None, "root": str(root), "database": str(database), "script": str(SCRIPT), "action": args.action}
        with state_path.open("w") as output:
            json.dump(state, output)
        print(json.dumps(state), file=sys.stderr, flush=True)
        while True:
            ensure_running()
            try:
                return child.wait(timeout=0.5)
            except subprocess.TimeoutExpired:
                if proxy is not None and proxy.poll() is not None:
                    raise SystemExit("BLOCK: approved-source broker exited; stopping backend.")
    finally:
        try:
            finish(child, 15)
        finally:
            try:
                finish(proxy, 10)
            finally:
                if listener is not None:
                    listener.close()
                if writer_lock is not None:
                    writer_lock.close()
                # Only remove state owned by this controller, never an unexpected file.
                if state_path.is_file() and not state_path.is_symlink():
                    state = json.loads(state_path.read_text())
                    if state.get("controller") == os.getpid():
                        state_path.unlink()


def stop_owned(root, database, runtime):
    import signal
    import subprocess
    import time
    state_path = runtime / "controller.json"
    if state_path.is_symlink() or not state_path.is_file():
        raise SystemExit("BLOCK: no nonsymlink managed controller state; no process signaled.")
    state = json.loads(state_path.read_text())
    pid = state.get("controller")
    if state.get("root") != str(root) or state.get("database") != str(database) or state.get("script") != str(SCRIPT) or type(pid) is not int or pid <= 1:
        raise SystemExit("BLOCK: state does not identify this checkout/database/controller; no process signaled.")
    command = subprocess.run(["/bin/ps", "-p", str(pid), "-o", "command="], capture_output=True, text=True, check=False).stdout.strip()
    import shlex
    words = shlex.split(command)
    expected = [str(SCRIPT), state.get("action"), "--root", str(root), "--database", str(database), "--runtime-dir", str(runtime), "--_cleaned"]
    if len(words) < len(expected) or words[-len(expected):] != expected:
        raise SystemExit("BLOCK: process command no longer matches controller state; no process signaled.")
    os.kill(pid, signal.SIGINT)
    deadline = time.monotonic() + 38
    while state_path.exists() and time.monotonic() < deadline:
        time.sleep(0.2)
    if state_path.exists():
        raise SystemExit("BLOCK: managed shutdown did not finish within 38 seconds; inspect identities.")
    print("Managed controller shutdown completed.")


def main(argv=None):
    args = arguments(argv)
    root, database, runtime, python = validate(args)
    if root != SCRIPT.parents[2]:
        raise SystemExit("BLOCK: launch runtime.py from the same checkout as --root; helper code must not come from another worktree.")
    env = clean_environment(root, database, runtime)
    if args.action == "test":
        # Reviewed tests use their own memory fixtures; never expose the retained
        # snapshot database as an accidental default for a future test import.
        env["SWALE_DB_URL"] = "mem://"
    if not args._cleaned:
        # Close inherited descriptors and erase inherited credentials/proxies before
        # runtime management or any application import. Use this checkout's Python.
        os.closerange(3, 4096)
        command = [str(python), "-I", "-S", str(SCRIPT), args.action, "--root", str(root), "--database", str(database), "--runtime-dir", str(runtime), "--_cleaned"]
        for name in args.test:
            command += ["--test", name]
        os.execve(str(python), command, env)
    if any(os.environ.get(k) != v for k, v in env.items()) or set(os.environ) - set(env) - {"LC_CTYPE", "__CF_USER_TEXT_ENCODING"}:
        raise SystemExit("BLOCK: unexpected environment after clean re-exec.")
    if sys.platform != "darwin" or not Path("/usr/bin/sandbox-exec").is_file():
        raise SystemExit("BLOCK: this restricted runtime requires macOS sandbox-exec; no unrestricted fallback.")
    if args.action == "stop":
        stop_owned(root, database, runtime)
        return 0
    prepare(runtime)
    write_profiles(root, runtime)
    if args.action == "check":
        print(json.dumps({"root": str(root), "python": str(python), "database": str(database), "runtime_dir": str(runtime), "environment_names": sorted(env), "status": "static preflight only; no application or database opened"}))
        return 0
    return manage(args, root, database, runtime, python, env)


if __name__ == "__main__":
    raise SystemExit(main())
