"""Offline release-launcher boundary tests; no app imports, network or real DB."""
from __future__ import annotations

import asyncio
import contextlib
import importlib.util
import io
import os
from pathlib import Path
import tempfile
import unittest
from unittest import mock

SOURCE = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("release_runtime", SOURCE / "release_runtime.py")
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)


class BoundaryTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.base = Path(self.temporary.name).resolve()
        self.credential = self.base / "selected-credentials.conf"
        self.runtime = self.base / "runtime"
        self.runtime.mkdir(mode=0o700)
        self.argv = ["check", "--root", str(self.base / "checkout"), "--database", str(self.base / "existing.db"), "--runtime-dir", str(self.runtime)]

    def write_credential(self, text):
        self.credential.write_text(text)
        self.credential.chmod(0o600)

    def test_provider_default_zero_and_credentials_not_read(self):
        args = release.arguments(self.argv)
        with mock.patch.object(release, "read_credentials", side_effect=AssertionError("must not read")):
            self.assertEqual(release.provider_environment(args, self.runtime), {})
        with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
            release.arguments([*self.argv, "--credentials", str(self.credential)])

    def test_nonfinite_negative_or_excess_budget_rejected(self):
        for amount in ("nan", "inf", "-1", "1.01"):
            with self.subTest(amount=amount), contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
                release.arguments([*self.argv, "--provider-budget-usd", amount])

    def test_only_allowlisted_assignments_reach_server_environment(self):
        self.write_credential("AWS_BEARER_TOKEN_BEDROCK=test-only-not-a-secret\nELEVENLABS_API_KEY=test-only\nARIZE_API_KEY=must-not-activate\nDAYTONA_API_KEY=must-not-activate\nSWALE_ALERT_MONITOR=1\nAWS_REGION=us-east-1\n")
        args = release.arguments([*self.argv, "--provider-budget-usd", "1", "--credentials", str(self.credential)])
        env = release.provider_environment(args, self.runtime)
        self.assertNotIn("ARIZE_API_KEY", env)
        self.assertNotIn("DAYTONA_API_KEY", env)
        self.assertEqual(env["SWALE_ALERT_MONITOR"], "0")
        self.assertEqual(env["SWALE_CONTEXT_MAX_MODEL_CALLS"], "3")
        self.assertEqual(env["SWALE_CONTEXT_MAX_AUDIO_CALLS"], "1")
        self.assertEqual(env["SWALE_CONTEXT_LEDGER_PATH"], str(self.runtime / "provider-ledger.json"))

    def test_credential_symlinks_permissions_and_region_fail_closed(self):
        self.write_credential("AWS_REGION=us-west-2\n")
        with self.assertRaisesRegex(SystemExit, "us-east-1"): release.read_credentials(self.credential)
        self.credential.chmod(0o644)
        with self.assertRaisesRegex(SystemExit, "privately"): release.read_credentials(self.credential)
        link = self.base / "linked.conf"
        link.symlink_to(self.credential)
        with self.assertRaisesRegex(SystemExit, "nonsymlink"): release.read_credentials(link)

    def test_duplicate_and_incomplete_auth_refused_without_values_in_error(self):
        for text in ("AWS_REGION=us-east-1\nAWS_REGION=us-east-1\n", "AWS_ACCESS_KEY_ID=test-only\n"):
            self.write_credential(text)
            with self.assertRaises(SystemExit) as raised: release.read_credentials(self.credential)
            self.assertNotIn("test-only", str(raised.exception))

    def test_controller_command_contains_no_credential_values(self):
        args = release.arguments([*self.argv, "--provider-budget-usd", "1", "--credentials", str(self.credential)])
        with mock.patch.object(release, "read_credentials", side_effect=AssertionError("must not read")):
            command = release.controller_command(args, Path("/reviewed/python"), self.base / "checkout", self.base / "existing.db", self.runtime)
        self.assertIn(str(self.credential), command)
        self.assertIn("--_cleaned", command)
        self.assertNotIn("AWS_BEARER_TOKEN_BEDROCK", " ".join(command))

    def test_approved_data_and_context_requests(self):
        for method, path, query in (
            ("GET", "/api/v1/health", ""),
            ("GET", "/api/v1/incidents", "bbox=-74.1%2C40.6%2C-73.9%2C40.8&limit=500"),
            ("GET", "/api/v1/flood-observations/record%3Aopaque%3A%CE%B1%2525", ""),
            ("GET", "/api/v1/subway/live", "area_id=BK0601"),
            ("GET", "/api/v1/context/capabilities", ""),
            ("POST", "/api/v1/context/agent", ""),
            ("POST", "/api/v1/context/briefings/" + "a" * 32 + "/audio", ""),
        ):
            with self.subTest(path=path): self.assertTrue(release.approved_request(method, path, query))

    def test_unrelated_actions_unknown_queries_and_encoded_routes_fail_closed(self):
        for method, path, query in (
            ("POST", "/api/v1/inspections", ""), ("POST", "/api/v1/inspections/voice", ""),
            ("POST", "/api/v1/simulation-runs", ""), ("POST", "/api/v1/alert-packs", ""),
            ("POST", "/api/v1/briefings", ""), ("GET", "/api/v1/briefings/evals", "judge=true"),
            ("GET", "/api/v1/health", "cloud=true"), ("GET", "/api/v1/subway/live", "area_id=other"),
            ("GET", "/api/v1/subway/live", "area_id=BK0601&area_id=BK0601"),
            ("POST", "/api/v1/context/agent", "prompt=ignored"),
            ("GET", "/api/v1/incidents/opaque%2Fslash", ""),
            ("GET", "/api/v1/health%00", ""), ("GET", "/api/v1/%ZZ", ""),
            ("GET", "https://unapproved.example/api/v1/health", ""),
        ):
            with self.subTest(path=path, query=query): self.assertFalse(release.approved_request(method, path, query))

    def test_profiles_retain_native_denials_and_broker_port_boundary(self):
        helper = release.load_helper("runtime")
        api = helper.profile_text(self.base, self.runtime, "live", self.base / "user")
        broker = helper.profile_text(self.base, self.runtime, "broker", self.base / "user")
        self.assertIn("(deny network*)", api)
        self.assertIn('(remote tcp "localhost:8001")', api)
        self.assertNotIn('(remote tcp "*:443")', api)
        self.assertIn('(remote tcp "*:443")', broker)
        self.assertIn("securityd", api)
        self.assertIn(".aws", api)

    def test_reused_broker_still_requires_exact_explicit_authorities(self):
        broker = release.load_helper("broker")
        broker.ALLOWED = frozenset(host + ":443" for host in (*release.PUBLIC_HOSTS, *release.PROVIDER_HOSTS))
        addresses = {host: ["1.1.1.1"] for host in (*release.PUBLIC_HOSTS, *release.PROVIDER_HOSTS)}
        self.assertEqual(broker.validate_addresses(addresses), addresses)
        for invalid in ({**addresses, "unapproved.example": ["1.1.1.1"]}, {**addresses, release.PROVIDER_HOSTS[0]: ["127.0.0.1"]}):
            with self.assertRaises(ValueError): broker.validate_addresses(invalid)

    def test_clean_environment_strips_credentials_tracing_and_monitors(self):
        helper = release.load_helper("runtime")
        with mock.patch.dict(os.environ, {"DAYTONA_API_KEY": "test-only", "ARIZE_API_KEY": "test-only", "AWS_PROFILE": "unapproved", "SWALE_ALERT_MONITOR": "1"}):
            env = helper.clean_environment(self.base, self.base / "existing.db", self.runtime)
        self.assertNotIn("DAYTONA_API_KEY", env)
        self.assertNotIn("ARIZE_API_KEY", env)
        self.assertNotIn("AWS_PROFILE", env)
        self.assertNotIn("SWALE_ALERT_MONITOR", env)

    def test_stop_refuses_mismatched_process_without_signaling(self):
        state = self.runtime / "controller.json"
        state.write_text(__import__("json").dumps({"controller": 999999, "root": str(self.base), "database": str(self.base / "existing.db"), "script": str(release.SCRIPT), "command": ["different"]}))
        state.chmod(0o600)
        with mock.patch("subprocess.run", return_value=mock.Mock(stdout="unrelated process")), mock.patch("os.kill") as kill:
            with self.assertRaisesRegex(SystemExit, "differs"): release.stop_owned(self.base, self.base / "existing.db", self.runtime)
        kill.assert_not_called()

    def test_occupied_port_refuses_without_fallback_or_erasing_spend_ledger(self):
        ledger = self.runtime / "provider-ledger.json"
        ledger.write_text('{"version":1,"reserved_microusd":200000,"calls":{"model":1,"audio":0}}')
        ledger.chmod(0o600)
        before = ledger.read_bytes()
        args = release.arguments([*self.argv])
        args.action = "serve"
        helper = release.load_helper("runtime")
        with mock.patch.object(helper, "reserve_port", side_effect=OSError("occupied fixed port")), mock.patch("signal.signal"), mock.patch("subprocess.Popen") as launch, mock.patch("socket.getaddrinfo") as resolve:
            with self.assertRaisesRegex(OSError, "occupied"):
                release.manage(args, self.base / "checkout", self.base / "existing.db", self.runtime, Path("/reviewed/python"), {}, helper)
        launch.assert_not_called()
        resolve.assert_not_called()
        self.assertFalse((self.runtime / "controller.json").exists())
        self.assertEqual(ledger.read_bytes(), before)

    def test_stop_during_broker_port_reservation_starts_no_process(self):
        import signal
        args = release.arguments(self.argv)
        args.action = "serve"
        helper = release.load_helper("runtime")
        handlers = {}
        listeners = []
        def reserve(port):
            listener = mock.Mock()
            listeners.append(listener)
            if port == 8001:
                handlers[signal.SIGINT](signal.SIGINT, None)
            return listener
        with mock.patch("signal.signal", side_effect=lambda sig, handler: handlers.update({sig: handler})), mock.patch.object(helper, "reserve_port", side_effect=reserve), mock.patch("socket.getaddrinfo", return_value=[(2, 1, 6, "", ("1.1.1.1", 443))]), mock.patch("subprocess.Popen") as launch:
            with self.assertRaises(SystemExit) as stopped:
                release.manage(args, self.base / "checkout", self.base / "existing.db", self.runtime, Path("/reviewed/python"), {}, helper)
        self.assertEqual(stopped.exception.code, 130)
        launch.assert_not_called()
        self.assertEqual(len(listeners), 2)
        for listener in listeners:
            listener.close.assert_called_once()
        self.assertFalse((self.runtime / "controller.json").exists())


class GuardTests(unittest.IsolatedAsyncioTestCase):
    async def test_denied_action_never_reaches_app(self):
        app = mock.AsyncMock()
        send = mock.AsyncMock()
        await release.RouteGuard(app)({"type": "http", "method": "POST", "raw_path": b"/api/v1/inspections", "query_string": b""}, mock.AsyncMock(), send)
        app.assert_not_called()
        self.assertEqual(send.call_args_list[0].args[0]["status"], 405)

    async def test_oversized_context_body_never_reaches_app(self):
        app = mock.AsyncMock()
        send = mock.AsyncMock()
        receive = mock.AsyncMock(return_value={"type": "http.request", "body": b"x" * 131073, "more_body": False})
        await release.RouteGuard(app)({"type": "http", "method": "POST", "raw_path": b"/api/v1/context/agent", "query_string": b"", "headers": [(b"content-type", b"application/json")]}, receive, send)
        app.assert_not_called()
        self.assertEqual(send.call_args_list[0].args[0]["status"], 413)

    async def test_bounded_body_and_lifespan_forward_intact(self):
        observed = []
        async def app(scope, receive, send):
            observed.append(await receive())
        receive = mock.AsyncMock(return_value={"type": "http.request", "body": b'{"prompt":"test"}', "more_body": False})
        await release.RouteGuard(app)({"type": "http", "method": "POST", "raw_path": b"/api/v1/context/agent", "query_string": b"", "headers": [(b"content-type", b"application/json; charset=utf-8"), (b"origin", b"http://127.0.0.1:4183")]}, receive, mock.AsyncMock())
        self.assertEqual(observed[0]["body"], b'{"prompt":"test"}')
        observed.clear()
        receive = mock.AsyncMock(return_value={"type": "lifespan.startup"})
        await release.RouteGuard(app)({"type": "lifespan"}, receive, mock.AsyncMock())
        self.assertEqual(observed[0]["type"], "lifespan.startup")

    async def test_cross_origin_simple_or_unapproved_origin_requests_cannot_spend(self):
        for headers, expected in (([], 415), ([(b"content-type", b"text/plain")], 415), ([(b"content-type", b"application/json"), (b"origin", b"https://unapproved.example")], 403)):
            app, send, receive = mock.AsyncMock(), mock.AsyncMock(), mock.AsyncMock()
            await release.RouteGuard(app)({"type": "http", "method": "POST", "raw_path": b"/api/v1/context/agent", "query_string": b"", "headers": headers}, receive, send)
            app.assert_not_called()
            receive.assert_not_called()
            self.assertEqual(send.call_args_list[0].args[0]["status"], expected)


if __name__ == "__main__":
    unittest.main()
