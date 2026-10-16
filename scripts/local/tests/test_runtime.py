"""Offline helper tests: temporary metadata only; no application/DB/network use."""
import contextlib
import errno
import importlib.util
import io
import json
import os
from pathlib import Path
import signal
import socket
import subprocess
import sys
import tempfile
import types
import unittest
from unittest import mock

SOURCE = Path(__file__).resolve().parents[1]


def load(name):
    spec = importlib.util.spec_from_file_location(name, SOURCE / (name + ".py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


runtime = load("runtime")
broker = load("broker")
setup = load("setup")


class FakeProcess:
    def __init__(self, waits=None):
        self.pid, self.returncode = 999999, None
        self.waits, self.events, self.on_wait = list(waits or []), [], None

    def poll(self):
        return self.returncode

    def wait(self, timeout=None):
        self.events.append(("wait", timeout))
        if self.on_wait:
            callback, self.on_wait = self.on_wait, None
            callback()
        result = self.waits.pop(0) if self.waits else 0
        if isinstance(result, BaseException):
            raise result
        self.returncode = result
        return result

    def terminate(self):
        self.events.append(("terminate",))

    def kill(self):
        self.events.append(("kill",))

    def send_signal(self, value):
        self.events.append(("signal", value))


class Fixture(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.base = Path(self.temporary.name).resolve()
        self.root = self.base / "checkout"
        for directory in ("backend/swale", "backend/.venv/bin", "backend/tests", "frontend"):
            (self.root / directory).mkdir(parents=True, exist_ok=True)
        for name in ("backend/swale/cli.py", "backend/uv.lock", "backend/.venv/bin/python", "backend/tests/test_params.py"):
            (self.root / name).touch()
        # This is a directory used only for validation metadata, never a database.
        self.database = self.base / "metadata-only.db"
        self.database.mkdir()
        self.private = self.base / "runtime"
        self.args = runtime.arguments(["serve-live", "--root", str(self.root), "--database", str(self.database), "--runtime-dir", str(self.private)])

    def test_checkout_default_is_repository_of_controller(self):
        args = runtime.arguments(["check", "--database", str(self.database), "--runtime-dir", str(self.private)])
        self.assertEqual(args.root, runtime.SCRIPT.parents[2])

    def test_validate_accepts_existing_absolute_metadata(self):
        root, database, directory, python = runtime.validate(self.args)
        self.assertEqual((root, database, directory), (self.root, self.database, self.private))
        self.assertEqual(python, self.root / "backend/.venv/bin/python")

    def test_relative_database_rejected(self):
        self.args.database = Path("relative.db")
        with self.assertRaisesRegex(SystemExit, "absolute"):
            runtime.validate(self.args)

    def test_missing_database_never_initialized(self):
        self.args.database = self.base / "missing.db"
        with self.assertRaises(SystemExit):
            runtime.validate(self.args)
        self.assertFalse(self.args.database.exists())

    def test_symlink_database_rejected(self):
        link = self.base / "linked.db"
        link.symlink_to(self.database)
        self.args.database = link
        with self.assertRaises(SystemExit):
            runtime.validate(self.args)

    def test_missing_backend_or_lock_rejected(self):
        (self.root / "backend/uv.lock").unlink()
        with self.assertRaisesRegex(SystemExit, "reviewed backend"):
            runtime.validate(self.args)

    def test_checkout_dotenv_names_rejected_without_open(self):
        for directory, name in (("backend", ".env"), ("frontend", ".env.production"), ("", ".env.local")):
            with self.subTest(directory=directory, name=name):
                original = Path.iterdir
                def names(path):
                    return iter([path / name]) if path == self.root / directory else original(path)
                with mock.patch.object(Path, "iterdir", names), mock.patch.object(Path, "read_text", side_effect=AssertionError("Credential content must never be opened")):
                    with self.assertRaisesRegex(SystemExit, "not read or changed"):
                        runtime.validate(self.args)

    def test_nonsecret_example_name_allowed(self):
        original = Path.iterdir
        with mock.patch.object(Path, "iterdir", lambda path: iter([path / ".env.example"]) if path == self.root / "backend" else original(path)):
            runtime.validate(self.args)

    def test_runtime_inside_checkout_rejected(self):
        self.args.runtime_dir = self.root / "private"
        with self.assertRaisesRegex(SystemExit, "outside the checkout"):
            runtime.validate(self.args)

    def test_world_readable_runtime_rejected(self):
        self.private.mkdir(mode=0o755)
        self.private.chmod(0o755)
        with self.assertRaisesRegex(SystemExit, "0700"):
            runtime.validate(self.args)

    def test_symlink_virtualenv_rejected(self):
        target = self.base / "other-venv"
        (self.root / "backend/.venv").rename(target)
        (self.root / "backend/.venv").symlink_to(target)
        with self.assertRaisesRegex(SystemExit, "do not copy"):
            runtime.validate(self.args)

    def test_test_allowlist_rejects_traversal(self):
        self.args.action = "test"
        self.args.test = ["../test_params.py"]
        with self.assertRaisesRegex(SystemExit, "test_NAME"):
            runtime.validate(self.args)

    def test_test_arguments_rejected_for_serve_actions(self):
        self.args.test = ["test_params.py"]
        with self.assertRaisesRegex(SystemExit, "only with the bounded test action"):
            runtime.validate(self.args)

    def test_backend_tests_clean_reexec_uses_memory_default(self):
        with mock.patch.object(runtime, "SCRIPT", self.root / "scripts/local/runtime.py"), mock.patch("os.execve", side_effect=RuntimeError("mocked-reexec")) as execute, mock.patch("os.closerange"):
            with self.assertRaisesRegex(RuntimeError, "mocked-reexec"):
                runtime.main(["test", "--root", str(self.root), "--database", str(self.database), "--runtime-dir", str(self.private)])
        self.assertEqual(execute.call_args.args[2]["SWALE_DB_URL"], "mem://")

    def test_clean_environment_excludes_inherited_settings(self):
        with mock.patch.dict(os.environ, {"UNRELATED_TEST_SECRET": "not-an-actual-secret", "HTTPS_PROXY": "unapproved.invalid", "PYTHONPATH": "/unapproved"}):
            env = runtime.clean_environment(self.root, self.database, self.private)
        self.assertNotIn("UNRELATED_TEST_SECRET", env)
        self.assertNotIn("HTTPS_PROXY", env)
        self.assertNotIn("PYTHONPATH", env)
        self.assertEqual(env["HOME"], str(self.private / "home"))
        self.assertEqual(env["SWALE_DB_URL"], "surrealkv://" + str(self.database))
        self.assertEqual(env["PROJ_NETWORK"], "OFF")

    def test_initial_call_reexecs_this_checkout_python_with_clean_env(self):
        with mock.patch.object(runtime, "SCRIPT", self.root / "scripts/local/runtime.py"), mock.patch("os.execve", side_effect=RuntimeError("mocked-reexec")) as execute, mock.patch("os.closerange") as close:
            with self.assertRaisesRegex(RuntimeError, "mocked-reexec"):
                runtime.main(["check", "--root", str(self.root), "--database", str(self.database), "--runtime-dir", str(self.private)])
        close.assert_called_once_with(3, 4096)
        program, command, env = execute.call_args.args
        self.assertEqual(program, str(self.root / "backend/.venv/bin/python"))
        self.assertEqual(command[1:3], ["-I", "-S"])
        self.assertIn("--_cleaned", command)
        self.assertEqual(env, runtime.clean_environment(self.root, self.database, self.private))

    def test_forged_clean_flag_rejects_environment_before_prepare(self):
        with mock.patch.object(runtime, "SCRIPT", self.root / "scripts/local/runtime.py"), mock.patch.dict(os.environ, {"UNEXPECTED": "nonsecret"}, clear=True), mock.patch.object(runtime, "prepare") as prepare:
            with self.assertRaisesRegex(SystemExit, "unexpected environment"):
                runtime.main(["check", "--root", str(self.root), "--database", str(self.database), "--runtime-dir", str(self.private), "--_cleaned"])
        prepare.assert_not_called()

    def test_main_rejects_helper_code_from_another_checkout(self):
        with mock.patch("os.execve") as execute:
            with self.assertRaisesRegex(SystemExit, "helper code must not come from another worktree"):
                runtime.main(["check", "--root", str(self.root), "--database", str(self.database), "--runtime-dir", str(self.private)])
        execute.assert_not_called()

    def test_backend_command_explicitly_inserts_target_checkout(self):
        command = runtime.backend_command(self.root, self.root / "backend/.venv/bin/python", self.args, self.private)
        self.assertIn(str(self.root / "backend"), command)
        self.assertEqual(command[-5:], ["serve", "--host", "127.0.0.1", "--port", "8000"])
        self.assertNotIn("Swale-integration", " ".join(command))

    def test_offline_test_command_keeps_bounded_reviewed_modules(self):
        self.args.action, self.args.test = "test", ["test_params.py"]
        command = runtime.backend_command(self.root, Path("python"), self.args, self.private)
        self.assertIn("tests/test_params.py", command)
        self.assertIn("tests/test_weather.py", command)
        self.assertIn("--confcutdir=" + str(self.root / "backend/tests"), command)
        self.assertNotIn("tests/test_sim.py", command)
        self.assertNotIn("tests/test_briefing.py", command)

    def test_profiles_keep_mode_specific_network_and_credentials(self):
        user = Path("/Users/nonsecret-test-user")
        live = runtime.profile_text(self.root, self.private, "live", user)
        offline = runtime.profile_text(self.root, self.private, "offline", user)
        network = runtime.profile_text(self.root, self.private, "broker", user)
        self.assertIn('(deny network*)', live)
        self.assertIn('localhost:8001', live)
        self.assertNotIn('*:443', live)
        self.assertNotIn('(allow network-', offline)
        self.assertIn('*:443', network)
        for text in (live, offline, network):
            self.assertIn(str(user / ".env"), text)
            self.assertIn(str(user / ".ssh"), text)
            self.assertIn(str(self.root / "backend/.env"), text)
            self.assertNotIn("@@", text)

    def test_prepare_never_follows_runtime_subdirectory_symlink(self):
        self.private.mkdir(mode=0o700)
        (self.private / "home").symlink_to(self.base)
        with self.assertRaisesRegex(SystemExit, "symlink"):
            runtime.prepare(self.private)

    def test_prepare_creates_and_preserves_known_nonsecret_marker(self):
        runtime.prepare(self.private)
        marker = self.private / "denied-marker.txt"
        self.assertEqual(marker.read_bytes(), b"SWALE NONSECRET CONTAINMENT MARKER\n")
        runtime.prepare(self.private)
        self.assertEqual(marker.stat().st_mode & 0o777, 0o600)

    def test_prepare_rejects_marker_symlink_without_reading(self):
        self.private.mkdir(mode=0o700)
        (self.private / "denied-marker.txt").symlink_to(self.base / "unknown-path")
        with mock.patch.object(Path, "read_bytes", side_effect=AssertionError("No unknown file read")):
            with self.assertRaisesRegex(SystemExit, "not read or changed"):
                runtime.prepare(self.private)

    def test_prepare_rejects_unexpected_marker_content_without_overwrite(self):
        self.private.mkdir(mode=0o700)
        marker = self.private / "denied-marker.txt"
        marker.write_bytes(b"UNEXPECTED NONSECRET TEST FILE")
        marker.chmod(0o600)
        with self.assertRaisesRegex(SystemExit, "unexpected nonsecret containment marker content"):
            runtime.prepare(self.private)
        self.assertEqual(marker.read_bytes(), b"UNEXPECTED NONSECRET TEST FILE")


class LifecycleTests(unittest.TestCase):
    setUp = Fixture.setUp
    def run_runtime(self, action="serve-live", cancel=None, backend=None, proxy=None, bind_error=False):
        self.args.action = action
        runtime.prepare(self.private)
        handlers, spawns, queries = {}, [], []
        listener = mock.Mock()
        listener.fileno.return_value = 42
        if bind_error:
            def bind(address):
                if bind_error is True or bind_error == address[1]:
                    raise OSError(errno.EADDRINUSE, "mock occupied port")
            listener.bind.side_effect = bind
        child, broker_child = backend or FakeProcess(), proxy or FakeProcess()
        def signal_handler(number, callback):
            handlers[number] = callback
        def stop():
            handlers[signal.SIGINT](signal.SIGINT, None)
        def resolve(host, port, **kwargs):
            queries.append(host)
            if cancel == "dns":
                stop()
            return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("1.1.1.1", port))]
        def popen(command, **kwargs):
            spawns.append((command, kwargs))
            is_broker = any(str(arg).endswith("broker.py") for arg in command)
            if is_broker and cancel == "after-broker":
                stop()
            if not is_broker and cancel == "while-child":
                child.on_wait = stop
            return broker_child if is_broker else child
        if cancel == "listener":
            listener.listen.side_effect = lambda *args: stop()
        error, value = None, None
        with mock.patch("signal.signal", side_effect=signal_handler), mock.patch("socket.getaddrinfo", side_effect=resolve), mock.patch("socket.socket", return_value=listener), mock.patch("subprocess.Popen", side_effect=popen), contextlib.redirect_stderr(io.StringIO()):
            try:
                value = runtime.manage(self.args, self.root, self.database, self.private, self.root / "backend/.venv/bin/python", runtime.clean_environment(self.root, self.database, self.private))
            except BaseException as failure:
                error = failure
        return types.SimpleNamespace(error=error, value=value, spawns=spawns, queries=queries, child=child, broker=broker_child, listener=listener)

    def test_normal_supervision_uses_only_approved_dns_and_target_code(self):
        result = self.run_runtime()
        self.assertIsNone(result.error)
        self.assertEqual(result.value, 0)
        self.assertEqual(result.queries, list(runtime.HOSTS))
        self.assertEqual(len(result.spawns), 2)
        self.assertIn(("terminate",), result.broker.events)
        self.assertFalse((self.private / "controller.json").exists())
        self.assertEqual(result.spawns[1][1]["cwd"], self.root / "backend")
        self.assertEqual(result.spawns[1][1]["env"]["HTTPS_PROXY"], "http://127.0.0.1:8001")

    def test_occupied_fixed_port_refuses_without_fallback(self):
        result = self.run_runtime(bind_error=True)
        self.assertEqual(result.error.errno, errno.EADDRINUSE)
        self.assertEqual(result.spawns, [])
        self.assertEqual(result.queries, [])
        result.listener.close.assert_called_once()

    def test_occupied_broker_port_refuses_without_fallback_or_backend(self):
        result = self.run_runtime(bind_error=8001)
        self.assertEqual(result.error.errno, errno.EADDRINUSE)
        self.assertEqual(result.spawns, [])
        self.assertEqual(result.listener.bind.call_args_list, [mock.call(("127.0.0.1", 8000)), mock.call(("127.0.0.1", 8001))])

    def test_cancel_after_broker_listener_prevents_any_process(self):
        result = self.run_runtime(action="probe-live", cancel="listener")
        self.assertEqual(result.error.code, 130)
        self.assertEqual(result.spawns, [])
        result.listener.close.assert_called_once()

    def test_cancel_during_dns_prevents_broker_and_backend(self):
        result = self.run_runtime(cancel="dns")
        self.assertEqual(result.error.code, 130)
        self.assertEqual(result.spawns, [])

    def test_cancel_after_broker_cleans_broker_and_prevents_backend(self):
        result = self.run_runtime(cancel="after-broker")
        self.assertEqual(result.error.code, 130)
        self.assertEqual(len(result.spawns), 1)
        self.assertIn(("terminate",), result.broker.events)

    def test_signal_is_forwarded_to_child(self):
        result = self.run_runtime(cancel="while-child", backend=FakeProcess([130]))
        self.assertIsNone(result.error)
        self.assertEqual(result.value, 130)
        self.assertIn(("signal", signal.SIGINT), result.child.events)

    def test_broker_exit_before_backend_prevents_spawn(self):
        child = FakeProcess()
        child.returncode = 12
        result = self.run_runtime(proxy=child)
        self.assertIn("before backend startup", result.error.code)
        self.assertEqual(len(result.spawns), 1)

    def test_broker_exit_stops_backend(self):
        proxy = FakeProcess()
        child = FakeProcess([subprocess.TimeoutExpired("mock", 0.5), 0])
        child.on_wait = lambda: setattr(proxy, "returncode", 12)
        result = self.run_runtime(proxy=proxy, backend=child)
        self.assertIn("stopping backend", result.error.code)
        self.assertIn(("terminate",), child.events)

    def test_child_timeout_kills_then_cleans_broker(self):
        child = FakeProcess([RuntimeError("mock wait failure"), subprocess.TimeoutExpired("mock", 15), 0])
        result = self.run_runtime(backend=child)
        self.assertIsInstance(result.error, RuntimeError)
        self.assertIn(("kill",), child.events)
        self.assertIn(("wait", 5), child.events)
        self.assertIn(("terminate",), result.broker.events)

    def test_child_cleanup_failure_still_cleans_broker(self):
        child = FakeProcess([RuntimeError("mock"), subprocess.TimeoutExpired("mock", 15), subprocess.TimeoutExpired("mock", 5)])
        result = self.run_runtime(backend=child)
        self.assertIsInstance(result.error, subprocess.TimeoutExpired)
        self.assertIn(("terminate",), result.broker.events)
        self.assertFalse((self.private / "controller.json").exists())

    def test_offline_has_no_dns_broker_or_proxy(self):
        result = self.run_runtime(action="serve-offline")
        self.assertIsNone(result.error)
        self.assertEqual(result.queries, [])
        self.assertEqual(len(result.spawns), 1)
        self.assertNotIn("HTTPS_PROXY", result.spawns[0][1]["env"])

    def test_existing_controller_state_refuses_without_process_start(self):
        runtime.prepare(self.private)
        (self.private / "controller.json").write_text("{}")
        with mock.patch("subprocess.Popen") as process:
            with self.assertRaisesRegex(SystemExit, "controller state already exists"):
                runtime.manage(self.args, self.root, self.database, self.private, Path("python"), {})
        process.assert_not_called()

    def test_writer_lock_symlink_refuses_before_any_process(self):
        (self.database.parent / ("." + self.database.name + ".swale-runtime.lock")).symlink_to(self.base / "unknown-path")
        result = self.run_runtime()
        self.assertIsInstance(result.error, OSError)
        self.assertEqual(result.spawns, [])
        self.assertEqual(result.queries, [])
        self.assertFalse((self.base / "unknown-path").exists())


class StopTests(unittest.TestCase):
    setUp = Fixture.setUp
    def write_state(self, **updates):
        runtime.prepare(self.private)
        state = {"controller": 999999, "root": str(self.root), "database": str(self.database), "script": str(runtime.SCRIPT), "action": "serve-live"}
        state.update(updates)
        (self.private / "controller.json").write_text(json.dumps(state))
        return state

    def test_stop_refuses_other_checkout(self):
        self.write_state(root="/different-checkout")
        with mock.patch("os.kill") as kill:
            with self.assertRaisesRegex(SystemExit, "no process signaled"):
                runtime.stop_owned(self.root, self.database, self.private)
        kill.assert_not_called()

    def test_stop_refuses_pid_reuse(self):
        self.write_state()
        with mock.patch("subprocess.run", return_value=types.SimpleNamespace(stdout="unrelated-process")), mock.patch("os.kill") as kill:
            with self.assertRaisesRegex(SystemExit, "no process signaled"):
                runtime.stop_owned(self.root, self.database, self.private)
        kill.assert_not_called()

    def test_stop_matching_owner_uses_sigint_only(self):
        self.write_state()
        command = " ".join(["python", "-I", "-S", str(runtime.SCRIPT), "serve-live", "--root", str(self.root), "--database", str(self.database), "--runtime-dir", str(self.private), "--_cleaned"])
        def shutdown(*args):
            (self.private / "controller.json").unlink()
        with mock.patch("subprocess.run", return_value=types.SimpleNamespace(stdout=command)), mock.patch("os.kill", side_effect=shutdown) as kill, contextlib.redirect_stdout(io.StringIO()):
            runtime.stop_owned(self.root, self.database, self.private)
        kill.assert_called_once_with(999999, signal.SIGINT)


class BrokerTests(unittest.TestCase):
    def test_exact_public_authorities_only(self):
        addresses = {name: ["1.1.1.1"] for name in runtime.HOSTS}
        self.assertEqual(broker.validate_addresses(addresses), addresses)
        with self.assertRaises(ValueError):
            broker.validate_addresses({"api.weather.gov.attacker.invalid": ["1.1.1.1"]})

    def test_private_empty_and_overlarge_address_lists_fail_closed(self):
        for ips in (["127.0.0.1"], [], ["1.1.1.1"] * 33, ["not-an-address"]):
            with self.subTest(ips=ips):
                with self.assertRaises(ValueError):
                    broker.validate_addresses({name: ips for name in runtime.HOSTS})

    def test_unknown_authority_denied_before_any_resolution(self):
        handler = broker.Handler.__new__(broker.Handler)
        handler.path, handler.headers = "api.weather.gov.attacker.invalid:443", {}
        handler.send_error = mock.Mock()
        with mock.patch.object(broker, "record"), mock.patch("socket.getaddrinfo") as resolve:
            handler.do_CONNECT()
        handler.send_error.assert_called_once_with(403)
        resolve.assert_not_called()


    def test_proxy_credentials_denied_before_resolution(self):
        handler = broker.Handler.__new__(broker.Handler)
        handler.path, handler.headers = "api.weather.gov:443", {"Proxy-Authorization": "nonsecret-test-header"}
        handler.send_error = mock.Mock()
        with mock.patch.object(broker, "record"), mock.patch("socket.getaddrinfo") as resolve:
            handler.do_CONNECT()
        handler.send_error.assert_called_once_with(403)
        resolve.assert_not_called()


class SetupTests(unittest.TestCase):
    setUp = Fixture.setUp

    def setup_arguments(self, *extra):
        (self.root / "backend/pyproject.toml").touch()
        uv = self.base / "uv"
        uv.touch()
        cache = self.base / "cache"
        cache.mkdir(exist_ok=True)
        return setup.arguments(["--root", str(self.root), "--uv", str(uv), "--python", str(self.root / "backend/.venv/bin/python"), "--cache", str(cache), "--runtime-dir", str(self.private), *extra])

    def test_setup_refuses_existing_environment_without_overwriting(self):
        args = self.setup_arguments()
        with mock.patch.object(setup, "SCRIPT", self.root / "scripts/local/setup.py"):
            with self.assertRaisesRegex(SystemExit, "existing virtualenv preserved"):
                setup.validate(args)
        self.assertTrue((self.root / "backend/.venv/bin/python").is_file())

    def test_setup_allows_static_check_and_readonly_existing_verification(self):
        for flag in ("--check", "--verify-existing"):
            args = self.setup_arguments(flag)
            with mock.patch.object(setup, "SCRIPT", self.root / "scripts/local/setup.py"):
                self.assertEqual(setup.validate(args), (self.root, self.private))

    def test_setup_source_must_be_same_checkout(self):
        args = self.setup_arguments("--check")
        with self.assertRaisesRegex(SystemExit, "same real checkout"):
            setup.validate(args)

    def test_setup_rejects_credential_names_without_read(self):
        args = self.setup_arguments("--check")
        original = Path.iterdir
        def names(path):
            return iter([path / ".env"]) if path == self.root / "backend" else original(path)
        with mock.patch.object(setup, "SCRIPT", self.root / "scripts/local/setup.py"), mock.patch.object(Path, "iterdir", names), mock.patch.object(Path, "read_text", side_effect=AssertionError("Credential content never read")):
            with self.assertRaisesRegex(SystemExit, "not read or changed"):
                setup.validate(args)

    def test_setup_command_has_locked_offline_config_and_interpreter_guards(self):
        args = self.setup_arguments("--verify-existing")
        command = setup.command(args, self.root)
        for flag in ("--no-config", "--no-python-downloads", "--locked", "--offline", "--check"):
            self.assertIn(flag, command)
        self.assertEqual(command[command.index("--project") + 1], str(self.root / "backend"))
        self.assertNotIn("--active", command)

    def test_setup_environment_has_no_inherited_settings_and_memory_database(self):
        args = self.setup_arguments("--check")
        with mock.patch.dict(os.environ, {"UNAPPROVED_TEST_SETTING": "nonsecret", "HTTPS_PROXY": "unapproved.invalid"}):
            env = setup.environment(args, self.private)
        self.assertNotIn("UNAPPROVED_TEST_SETTING", env)
        self.assertNotIn("HTTPS_PROXY", env)
        self.assertEqual(env["SWALE_DB_URL"], "mem://")
        self.assertEqual(env["UV_CACHE_DIR"], str(args.cache))

    def test_setup_reexec_uses_only_explicit_clean_environment(self):
        args = self.setup_arguments("--check")
        with mock.patch.object(setup, "SCRIPT", self.root / "scripts/local/setup.py"), mock.patch("os.execve", side_effect=RuntimeError("mocked-reexec")) as execute, mock.patch("os.closerange"):
            with self.assertRaisesRegex(RuntimeError, "mocked-reexec"):
                setup.main(["--root", str(self.root), "--uv", str(args.uv), "--python", str(args.python), "--cache", str(args.cache), "--runtime-dir", str(self.private), "--check"])
        self.assertEqual(execute.call_args.args[2], setup.environment(args, self.private))

if __name__ == "__main__":
    unittest.main(verbosity=2)
