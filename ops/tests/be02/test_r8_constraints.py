"""Source guards and synthetic orchestration only; execute under Soren's Docker lease."""
import ast
import copy
import hashlib
import json
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import Mock
from attachment_runtime import SERVICES

ROOT = Path(__file__).resolve().parents[3]


class R8ConstraintsTest(unittest.TestCase):
    def test_only_proven_chroot_condition_changed(self):
        raw = (ROOT / "ops/acceptance/seccomp.json").read_bytes()
        self.assertEqual(hashlib.sha256(raw).hexdigest(),
                         "f922c7c9bfc1ece0b72b244e56dc85756ded002c837fb46054cfd8b275c74b6b")
        profile = json.loads(raw)
        rule = profile["syscalls"][18]
        self.assertEqual(rule, {"names": ["chroot"], "action": "SCMP_ACT_ALLOW",
                               "args": [], "comment": "", "includes": {}, "excludes": {}})
        # AIDEV-NOTE: Reconstruct exact baseline bytes to reject any other permission or profile delta.
        restored = copy.deepcopy(profile)
        restored["syscalls"][18]["includes"] = {"caps": ["CAP_SYS_CHROOT"]}
        baseline = (json.dumps(restored, indent="\t") + "\n").encode()
        self.assertEqual(hashlib.sha256(baseline).hexdigest(),
                         "cc3e61cabda6bbc1e53e54d27ba4d55a9d3be829b6dd1a596f4a7b31b1cc7849")
        # AIDEV-NOTE: Compose includes reviewed GUI-first ordering and a private invitation fixture; limits stay pinned.
        for name, digest in {
            "ops/compose.acceptance-test.yaml": "00992a043f228047636f2d99d61a0600a215fe4ad64c99bb414135aee0aa0b7f",
            "ops/acceptance/browsers.Dockerfile": "dbc9d8aa333f2482f2ad3ef01b5f9c92a22d35ea0b797630e389db71d4a14f5b",
        }.items():
            self.assertEqual(hashlib.sha256((ROOT / name).read_bytes()).hexdigest(), digest)

    def phase(self, diagnostic, acceptance=None, acceptance_gate=None, attachments=False, attachment_probe=None,
              mox=False, mox_probe=None, android=None):
        # AIDEV-NOTE: Execute actual phase branches with opt-in gates, without secrets or Docker startup.
        tree = ast.parse((ROOT / "ops/tests/be02/run.py").read_text())
        main = next(node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == "main")
        body = next(node.body for node in main.body if isinstance(node, ast.Try))
        start = next(i for i, node in enumerate(body) if isinstance(node, ast.If)
                     and ast.unparse(node.test) == "args.acceptance_diagnostic or args.android_fixture")
        end = next(i for i in range(start, len(body)) if isinstance(body[i], ast.If)
                   and ast.unparse(body[i].test).startswith("source_hashes("))
        task, output = Mock(), Mock()
        module = ast.Module(body=body[start:end], type_ignores=[])
        exec(compile(module, "run.py-phase", "exec"), {
            "args": SimpleNamespace(acceptance_diagnostic=diagnostic, acceptance_dispatch_id="synthetic",
                                    adv808_auth_policy=False, adv815_expiry=False, attachments=attachments, mox=mox,
                                    android_fixture=android is not None),
            "task": task, "print": output, "acceptance": acceptance, "android": android,
            "acceptance_before_http": acceptance_gate,
            "attachment_runtime": SimpleNamespace(run=attachment_probe, SERVICES=SERVICES),
            "mox_runtime": SimpleNamespace(run=mox_probe),
        })
        return task, output

    def test_actual_phase_blocks_http_until_acceptance_restoration_succeeds(self):
        events = []
        def completed(task, acceptance):
            events.append("restored")
            task.compose.side_effect = lambda stage, *args: events.append(stage)
        self.phase(False, Mock(), completed)
        self.assertLess(events.index("restored"), events.index("http-acceptance"))
        for reason in ("fresh_auth_fixture_required", "invalid restored configuration"):
            with self.subTest(reason=reason):
                reached = []
                def failed(task, acceptance):
                    task.compose.side_effect = lambda stage, *args: reached.append(stage)
                    raise RuntimeError(reason)
                with self.assertRaisesRegex(RuntimeError, reason):
                    self.phase(False, Mock(), failed)
                self.assertNotIn("http-acceptance", reached)
                self.assertNotIn("worker-drain", reached)

    def test_diagnostic_reports_every_skip_without_announcing_http(self):
        task, output = self.phase(True)
        task.write.assert_called_once_with("diagnostic-scope.json", {
            "mode": "DIAGNOSTIC", "unexecuted_gates": ["Minitest", "Steep", "RuboCop", "http-acceptance", "worker-drain"],
            "authority": "synthetic", "full_acceptance": "NOT_RUN",
        })
        self.assertEqual([call.args[0] for call in task.compose.call_args_list], ["api-start", "worker-start"])
        task.wait_http.assert_called_once_with()
        output.assert_not_called()

    def test_android_fixture_reports_skips_without_running_standard_gates(self):
        android = Mock()
        task, output = self.phase(False, android=android)
        android.run.assert_called_once_with()
        task.compose.assert_not_called()
        task.wait_http.assert_not_called()
        task.write.assert_called_once_with("diagnostic-scope.json", {
            "mode": "ANDROID_FIXTURE", "unexecuted_gates": ["Minitest", "Steep", "RuboCop", "http-acceptance", "worker-drain"],
            "authority": "synthetic", "full_acceptance": "NOT_RUN",
        })
        output.assert_not_called()

    def test_android_fixture_failure_cannot_fall_through_to_standard_gates(self):
        android = Mock()
        android.run.side_effect = RuntimeError("CONNECT readiness failed")
        with self.assertRaisesRegex(RuntimeError, "CONNECT readiness failed"):
            self.phase(False, android=android)
        android.run.assert_called_once_with()

    def test_full_run_executes_and_announces_http_without_skip_receipt(self):
        task, output = self.phase(False)
        task.write.assert_not_called()
        self.assertEqual([call.args[0] for call in task.compose.call_args_list],
                         ["ruby-suites", "api-start", "http-acceptance", "worker-start", "worker-drain", "adv806-mailpit-entry"])
        self.assertIn("Running real Auth/Mailpit/API HTTP acceptance",
                      [call.args[0] for call in output.call_args_list])

    def test_attachment_gate_follows_readiness_and_precedes_http(self):
        def probe(task):
            task.wait_http.assert_called_once_with()
            self.assertEqual([call.args[0] for call in task.compose.call_args_list],
                             ["ruby-suites", "api-start"])
        attachment_probe = Mock(side_effect=probe)
        task, _ = self.phase(False, attachments=True, attachment_probe=attachment_probe)
        attachment_probe.assert_called_once_with(task)
        self.assertIn("http-acceptance", [call.args[0] for call in task.compose.call_args_list])

    def test_attachment_failure_stops_http_and_worker(self):
        captured = []
        def failed(task):
            captured.append(task)
            raise RuntimeError("attachment fixture failed")
        with self.assertRaisesRegex(RuntimeError, "attachment fixture failed"):
            self.phase(False, attachments=True, attachment_probe=failed)
        self.assertEqual(len(captured), 1)
        self.assertEqual([call.args[0] for call in captured[0].compose.call_args_list],
                         ["ruby-suites", "api-start"])

    def test_default_run_does_not_start_attachment_services(self):
        probe = Mock()
        self.phase(False, attachment_probe=probe)
        probe.assert_not_called()

    def test_mox_gate_requires_ruby_success_and_precedes_http(self) -> None:
        def probe(task: Mock, *, attachments: bool) -> None:
            self.assertFalse(attachments)
            self.assertEqual([call.args[0] for call in task.compose.call_args_list], ["ruby-suites"])
        checked = Mock(side_effect=probe)
        task, _ = self.phase(False, mox=True, mox_probe=checked)
        checked.assert_called_once_with(task, attachments=False)
        self.assertIn("http-acceptance", [call.args[0] for call in task.compose.call_args_list])

    def test_mox_failure_stops_http_and_worker(self) -> None:
        captured = []
        def failed(task: Mock, *, attachments: bool) -> None:
            self.assertFalse(attachments)
            captured.append(task)
            raise RuntimeError("Mox fixture failed")
        with self.assertRaisesRegex(RuntimeError, "Mox fixture failed"):
            self.phase(False, mox=True, mox_probe=failed)
        self.assertEqual([call.args[0] for call in captured[0].compose.call_args_list], ["ruby-suites"])

    def test_combined_lane_starts_services_and_http_readiness_before_mox(self) -> None:
        def probe(task: Mock, *, attachments: bool) -> None:
            self.assertTrue(attachments)
            self.assertEqual([call.args[0] for call in task.compose.call_args_list],
                             ["ruby-suites", "attachment-api-start", "attachment-services"])
            task.runtime_credentials.assert_called_once_with()
            task.wait_http.assert_called_once_with()
            self.assertEqual(task.compose.call_args.args[1], ["up", "-d", "--no-deps", *sorted(SERVICES)])
        mox_probe, attachment_probe = Mock(side_effect=probe), Mock()
        task, _ = self.phase(False, attachments=True, mox=True, mox_probe=mox_probe, attachment_probe=attachment_probe)
        mox_probe.assert_called_once_with(task, attachments=True)
        attachment_probe.assert_called_once_with(task)
        self.assertEqual(task.wait_http.call_count, 2)

    def test_combined_lane_failure_cannot_run_later_http_or_worker(self) -> None:
        captured = []
        attachment_probe = Mock()
        def failed(task: Mock, *, attachments: bool) -> None:
            self.assertTrue(attachments)
            captured.append(task)
            raise RuntimeError("combined attachment fixture failed")
        with self.assertRaisesRegex(RuntimeError, "combined attachment fixture failed"):
            self.phase(False, attachments=True, mox=True, mox_probe=failed, attachment_probe=attachment_probe)
        attachment_probe.assert_not_called()
        self.assertEqual([call.args[0] for call in captured[0].compose.call_args_list],
                         ["ruby-suites", "attachment-api-start", "attachment-services"])

    def test_default_run_does_not_start_mox(self):
        probe = Mock()
        self.phase(False, mox_probe=probe)
        probe.assert_not_called()


if __name__ == "__main__":
    unittest.main()
