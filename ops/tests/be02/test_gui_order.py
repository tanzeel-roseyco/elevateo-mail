"""Behavioral orchestration regressions; execute only in Soren's disposable Python Docker job."""
from __future__ import annotations

from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import Mock, patch
from run import acceptance_before_http, finalize


class GuiOrderTest(unittest.TestCase):
    # AIDEV-NOTE: Model the empty-Auth seed contract and origin boundary, not a command-call snapshot.
    def exercise(self, failure: str | None = None) -> tuple[Mock, Mock, list[str]]:
        events: list[str] = []
        with TemporaryDirectory() as directory:
            env = Path(directory) / "private.env"
            env.write_bytes(b"ORIGIN=http://api:3000\n")
            task = Mock(compose_files=[Path("base.yaml")], env_file=env)
            acceptance = Mock()

            def seed() -> None:
                events.append("seed-empty-auth")
                if failure == "seed":
                    raise RuntimeError("fresh_auth_fixture_required")
                task.compose_files.append(Path("gui.yaml"))
                env.write_bytes(b"ORIGIN=http://web:4173\n")
                events.append("browser")
                if failure == "browser":
                    raise RuntimeError("browser failed")

            def compose(stage: str, command: list[str], timeout: int = 30) -> None:
                self.assertEqual(task.compose_files, [Path("base.yaml")])
                self.assertEqual(env.read_bytes(), b"ORIGIN=http://api:3000\n")
                events.append(stage)
                if failure == "restore" and stage == "base-restore-validate":
                    raise RuntimeError("invalid restored configuration")

            acceptance.run.side_effect = seed
            task.compose.side_effect = compose
            task.wait_http.side_effect = lambda: events.append("base-ready")
            if failure:
                with self.assertRaises(RuntimeError):
                    acceptance_before_http(task, acceptance)
            else:
                acceptance_before_http(task, acceptance)
                # Authenticated fixtures may create a user only after the empty seed and restored readiness.
                self.assertEqual(events[-1], "base-ready")
                events.append("http-creates-user")
            return task, acceptance, events

    def test_seed_browser_then_restored_http_boundary(self) -> None:
        task, _, events = self.exercise()
        self.assertLess(events.index("browser"), events.index("base-restore-validate"))
        self.assertLess(events.index("base-ready"), events.index("http-creates-user"))
        task.runtime_credentials.assert_called_once_with()

    def test_seed_failure_never_starts_http_or_restoration(self) -> None:
        task, _, events = self.exercise("seed")
        task.compose.assert_not_called()
        self.assertNotIn("http-creates-user", events)

    def test_browser_failure_never_starts_http(self) -> None:
        task, _, events = self.exercise("browser")
        task.wait_http.assert_not_called()
        self.assertNotIn("http-creates-user", events)

    def test_restoration_failure_never_refreshes_or_starts_http(self) -> None:
        task, _, events = self.exercise("restore")
        task.runtime_credentials.assert_not_called()
        task.wait_http.assert_not_called()
        self.assertNotIn("http-creates-user", events)

    def test_failed_seed_or_restore_still_has_one_cleanup_owner(self) -> None:
        for reason in ("fresh_auth_fixture_required", "invalid restored configuration"):
            with self.subTest(reason=reason), TemporaryDirectory() as directory:
                env = Path(directory) / "private.env"
                env.write_bytes(b"SECRET=disposable\n")
                task = Mock(env_file=env, root=Path(directory))
                task.redact.side_effect = lambda text: text
                with patch("run.cleanup", return_value=True) as dispose, patch("run.source_hashes", return_value={}):
                    status, failure, clean = finalize(task, True, True, {}, "FAILED", reason)
                dispose.assert_called_once_with(task)
                self.assertEqual(status, "FAILED")
                self.assertEqual(failure, reason)
                self.assertTrue(clean)
                self.assertFalse(env.exists())


if __name__ == "__main__":
    unittest.main()
