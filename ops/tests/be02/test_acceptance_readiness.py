"""Readiness failures and diagnostic privacy at the Docker orchestration boundary."""
from __future__ import annotations

import unittest
from unittest.mock import Mock

from acceptance_runtime import Acceptance, UNITS


class AcceptanceReadinessTest(unittest.TestCase):
    # AIDEV-NOTE: The real socket tests prove HTTP semantics; these checks protect their orchestration boundary.
    def test_app_and_grid_use_bounded_gate_with_fixed_diagnostics(self) -> None:
        for grid in (False, True):
            with self.subTest(grid=grid):
                acceptance = object.__new__(Acceptance)
                acceptance.task = Mock()
                acceptance.readiness("owned-browser", grid=grid)
                call = acceptance.task.docker.call_args
                self.assertEqual(call.args[0], "acceptance-readiness")
                self.assertEqual(call.args[1], ["container", "exec", "owned-browser", "node",
                    "dist/proxy/readiness-cli.js", "grid" if grid else "app"])
                self.assertEqual(call.args[2], 90)
                self.assertEqual(call.kwargs, {"quiet": True, "diagnostic_stderr": True})
                self.assertIn("proxy/readiness.spec", UNITS)

    def test_gate_failure_propagates_and_cannot_fall_back_to_status_only(self) -> None:
        acceptance = object.__new__(Acceptance)
        acceptance.task = Mock()
        acceptance.task.docker.side_effect = RuntimeError("gate failed")
        with self.assertRaisesRegex(RuntimeError, "gate failed"):
            acceptance.readiness("owned-browser")
        self.assertEqual(acceptance.task.docker.call_count, 1)


if __name__ == "__main__":
    unittest.main()
