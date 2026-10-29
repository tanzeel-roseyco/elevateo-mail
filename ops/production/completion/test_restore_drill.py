"""The restore fixture must not mutate its source before cold-restart readiness."""
from pathlib import Path
import unittest
from unittest.mock import Mock, call, patch

import restore_drill


class RestoreDrillReadinessTest(unittest.TestCase):
    def test_snapshot_finishes_before_bounded_database_readiness(self) -> None:
        sequence = Mock()
        with patch("restore_drill.snapshot", sequence.snapshot), patch("restore_drill.run", sequence.run), \
                patch("restore_drill.compose", return_value=["docker", "compose"]):
            restore_drill.snapshot_ready(Path("fixture"))
        self.assertEqual(sequence.mock_calls, [call.snapshot(Path("fixture")),
            call.run(["docker", "compose", "up", "-d", "--no-deps", "--wait", "--wait-timeout", "120", "db"], timeout=150)])

    def test_failed_snapshot_does_not_continue_to_readiness(self) -> None:
        with patch("restore_drill.snapshot", side_effect=RuntimeError("snapshot")), patch("restore_drill.run") as run:
            with self.assertRaises(RuntimeError):
                restore_drill.snapshot_ready(Path("fixture"))
            run.assert_not_called()

    def test_unhealthy_restart_aborts_before_source_mutation(self) -> None:
        with patch("restore_drill.snapshot"), patch("restore_drill.compose", return_value=["docker", "compose"]), \
                patch("restore_drill.run", side_effect=RuntimeError("unhealthy")), patch("restore_drill.sql") as sql:
            with self.assertRaises(RuntimeError):
                restore_drill.snapshot_ready(Path("fixture"))
            sql.assert_not_called()


if __name__ == "__main__":
    unittest.main()
