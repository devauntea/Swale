"""Create this checkout's locked Python environment using only reviewed cached inputs.

No application import, database access, credential loading, or network fallback.
An existing virtualenv is only inspected with --verify-existing, never replaced.
"""
import argparse
import importlib.util
import os
from pathlib import Path
import sys

SCRIPT = Path(__file__).resolve()


def arguments(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=SCRIPT.parents[2])
    parser.add_argument("--uv", type=Path, required=True)
    parser.add_argument("--python", type=Path, required=True)
    parser.add_argument("--cache", type=Path, required=True)
    parser.add_argument("--runtime-dir", type=Path, required=True)
    parser.add_argument("--check", action="store_true", help="static preflight only")
    parser.add_argument("--verify-existing", action="store_true", help="uv sync --check only; do not modify the existing environment")
    parser.add_argument("--_cleaned", action="store_true", help=argparse.SUPPRESS)
    return parser.parse_args(argv)


def validate(args):
    root = args.root.absolute()
    if root != root.resolve() or root != SCRIPT.parents[2] or not (root / "backend/uv.lock").is_file() or not (root / "backend/pyproject.toml").is_file():
        raise SystemExit("BLOCK: setup source and target must be the same real checkout with its reviewed backend lock.")
    for directory in (root, root / "backend", root / "frontend"):
        if directory.exists() and any(path.name == ".env" or (path.name.startswith(".env.") and path.name != ".env.example") for path in directory.iterdir()):
            raise SystemExit("BLOCK: checkout-local dotenv path exists; not read or changed.")
    for path, directory in ((args.uv, False), (args.python, False), (args.cache, True)):
        if not path.is_absolute() or not (path.is_dir() if directory else path.is_file()):
            raise SystemExit("BLOCK: supply existing absolute reviewed uv/Python/cache paths.")
    private = args.runtime_dir
    if not private.is_absolute() or private != private.resolve() or private == root or root in private.parents:
        raise SystemExit("BLOCK: private runtime directory must be absolute, nonsymlink, and outside the checkout.")
    if private.exists() and (private.stat().st_uid != os.getuid() or private.stat().st_mode & 0o077):
        raise SystemExit("BLOCK: existing runtime directory must be privately owned (mode 0700).")
    environment = root / "backend/.venv"
    if environment.is_symlink():
        raise SystemExit("BLOCK: virtualenv path is a symlink; not followed or changed.")
    if args.verify_existing:
        if not (environment / "bin/python").is_file():
            raise SystemExit("BLOCK: no existing virtualenv to verify.")
    elif os.path.lexists(environment) and not args.check:
        raise SystemExit("BLOCK: existing virtualenv preserved; use --verify-existing for read-only synchronization verification.")
    return root, private


def environment(args, private):
    return {
        "PATH": "/usr/bin:/bin:/usr/sbin:/sbin", "HOME": str(private / "home"),
        "TMPDIR": str(private / "tmp"),
        "XDG_CONFIG_HOME": str(private / "home/config"),
        "XDG_CACHE_HOME": str(private / "home/cache"),
        "XDG_DATA_HOME": str(private / "home/data"),
        "PYTHONNOUSERSITE": "1", "PYTHONDONTWRITEBYTECODE": "1",
        "PYTEST_DISABLE_PLUGIN_AUTOLOAD": "1", "PROJ_NETWORK": "OFF",
        "AWS_EC2_METADATA_DISABLED": "true", "SWALE_DB_URL": "mem://",
        "UV_CACHE_DIR": str(args.cache), "UV_PYTHON_DOWNLOADS": "never",
        "UV_DEFAULT_INDEX": "https://pypi.org/simple",
    }


def command(args, root):
    result = [str(args.uv), "--no-config", "--no-python-downloads", "sync", "--locked", "--offline", "--python", str(args.python), "--cache-dir", str(args.cache), "--project", str(root / "backend")]
    if args.verify_existing:
        result.append("--check")
    return result


def main(argv=None):
    args = arguments(argv)
    root, private = validate(args)
    env = environment(args, private)
    if not args._cleaned:
        os.closerange(3, 4096)
        argv = [str(args.python), "-I", "-S", str(SCRIPT), "--root", str(root), "--uv", str(args.uv), "--python", str(args.python), "--cache", str(args.cache), "--runtime-dir", str(private), "--_cleaned"]
        if args.check:
            argv.append("--check")
        if args.verify_existing:
            argv.append("--verify-existing")
        os.execve(str(args.python), argv, env)
    if any(os.environ.get(key) != value for key, value in env.items()) or set(os.environ) - set(env) - {"LC_CTYPE", "__CF_USER_TEXT_ENCODING"}:
        raise SystemExit("BLOCK: unexpected environment after clean setup re-exec.")
    if sys.platform != "darwin" or not Path("/usr/bin/sandbox-exec").is_file():
        raise SystemExit("BLOCK: macOS native containment required; no unrestricted setup fallback.")
    # Import only the sibling repository helper after the clean re-exec.
    spec = importlib.util.spec_from_file_location("swale_local_runtime", SCRIPT.parent / "runtime.py")
    runtime = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(runtime)
    runtime.prepare(private)
    runtime.write_profiles(root, private)
    import json
    invocation = command(args, root)
    if args.check:
        print(json.dumps({"status": "static preflight only", "command": invocation, "root": str(root), "environment_names": sorted(env)}))
        return 0
    import hashlib
    import subprocess
    # Hash only the public lockfile, never credential or local runtime config.
    lock = root / "backend/uv.lock"
    before = hashlib.sha256(lock.read_bytes()).hexdigest()
    result = subprocess.run(["/usr/bin/sandbox-exec", "-f", str(private / "profiles/offline.sb"), *invocation], cwd=root / "backend", env=env, close_fds=True, check=False)
    if hashlib.sha256(lock.read_bytes()).hexdigest() != before:
        raise SystemExit("BLOCK: lockfile unexpectedly changed; preserve evidence and inspect.")
    return result.returncode


if __name__ == "__main__":
    raise SystemExit(main())
