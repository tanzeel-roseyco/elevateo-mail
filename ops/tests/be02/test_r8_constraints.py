"""Source guards and synthetic orchestration only; execute under Soren's Docker lease."""
import ast
import copy
import hashlib
import json
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import Mock

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
        for name, digest in {
            "ops/compose.acceptance-test.yaml": "8429ed3679c6efa28341ce90727ce9b8fd752245ef2a220f2b27e53475c9f5d9",
            "ops/acceptance/browsers.Dockerfile": "dbc9d8aa333f2482f2ad3ef01b5f9c92a22d35ea0b797630e389db71d4a14f5b",
        }.items():
            self.assertEqual(hashlib.sha256((ROOT / name).read_bytes()).hexdigest(), digest)

    def phase(self, diagnostic, acceptance=None, acceptance_gate=None):
        # AIDEV-NOTE: Execute the actual phase block, without main's filesystem, secrets or Docker startup.
        tree = ast.parse((ROOT / "ops/tests/be02/run.py").read_text())
        main = next(node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == "main")
        body = next(node.body for node in main.body if isinstance(node, ast.Try))
        start = next(i for i, node in enumerate(body) if isinstance(node, ast.If)
                     and ast.unparse(node.test) == "args.acceptance_diagnostic")
        end = next(i for i in range(start, len(body)) if isinstance(body[i], ast.If)
                   and ast.unparse(body[i].test).startswith("source_hashes("))
        task, output = Mock(), Mock()
        module = ast.Module(body=body[start:end], type_ignores=[])
        exec(compile(module, "run.py-phase", "exec"), {
            "args": SimpleNamespace(acceptance_diagnostic=diagnostic, acceptance_dispatch_id="synthetic", adv808_auth_policy=False),
            "task": task, "print": output, "acceptance": acceptance,
            "acceptance_before_http": acceptance_gate,
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

    def test_full_run_executes_and_announces_http_without_skip_receipt(self):
        task, output = self.phase(False)
        task.write.assert_not_called()
        self.assertEqual([call.args[0] for call in task.compose.call_args_list],
                         ["ruby-suites", "api-start", "http-acceptance", "worker-start", "worker-drain", "adv806-mailpit-entry"])
        self.assertIn("Running real Auth/Mailpit/API HTTP acceptance",
                      [call.args[0] for call in output.call_args_list])


if __name__ == "__main__":
    unittest.main()
