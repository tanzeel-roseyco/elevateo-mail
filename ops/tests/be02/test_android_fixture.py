"""Bounded fixture and seed failure regression tests; run inside fleet Docker only."""
from __future__ import annotations
import argparse
import os
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import Mock, patch
from acceptance_fixture import seed_application
from android_fixture import hold_fixture, probe_connection, validate_arguments


class AndroidFixtureTests(unittest.TestCase):
    def args(self) -> argparse.Namespace:
        return argparse.Namespace(android_fixture=True, android_certs=Path("/private/certs"),
            android_ca_sha256="a" * 64, android_ttl=30, acceptance_dispatch_id="android-test",
            acceptance=False, acceptance_diagnostic=False, acceptance_case=None, acceptance_observer=False,
            mox=False, attachments=False, adv808_auth_policy=False, adv815_expiry=False)

    def test_valid_mode_and_invalid_combinations(self) -> None:
        validate_arguments(self.args())
        for key, value in {"acceptance": True, "acceptance_diagnostic": True, "mox": True,
                           "attachments": True, "android_ttl": 901, "android_ca_sha256": "",
                           "android_certs": Path("relative"), "acceptance_dispatch_id": "bad\nidentity"}.items():
            with self.subTest(key=key), self.assertRaises(RuntimeError):
                args = self.args()
                setattr(args, key, value)
                validate_arguments(args)

    def test_ttl_expires_without_external_liveness_and_stop_is_distinct(self) -> None:
        for stop in (False, True):
            with self.subTest(stop=stop), TemporaryDirectory() as directory:
                task = Mock(evidence=Path(directory), deadline=1000)
                if stop:
                    (task.evidence / "android-stop").touch()
                clock = [0.0]
                def sleep(seconds: float) -> None:
                    clock[0] += seconds
                with patch("android_fixture.time.monotonic", side_effect=lambda: clock[0]), patch("android_fixture.time.sleep", side_effect=sleep):
                    hold_fixture(task, 30)
                final = task.write.call_args.args[1]
                self.assertEqual(final["reason"], "requested_stop" if stop else "ttl_expired")
                self.assertEqual(final["app_acceptance"], "NOT_RUN")
                self.assertLessEqual(clock[0], 30)

    def test_short_remaining_budget_never_publishes_ready(self) -> None:
        task = Mock(deadline=10)
        with patch("android_fixture.time.monotonic", return_value=0), self.assertRaises(RuntimeError):
            hold_fixture(task, 30)
        task.write.assert_not_called()

    def test_published_probe_checks_running_service_before_and_after(self) -> None:
        task = Mock()
        task.inspect.return_value = [{"State": {"Running": True}}]
        task.docker.return_value = "0\n"
        with patch("android_fixture.start_service", return_value="probe-id") as start, patch(
                "android_fixture.validate_container") as validate:
            probe_connection(task, "connector-id")
        start.assert_called_once_with(task, "android-probe")
        self.assertEqual(validate.call_count, 3)
        self.assertEqual(task.inspect.call_args.args, ("container", ["connector-id"]))
        wait = task.docker.call_args_list[0]
        self.assertEqual(wait.args[1], ["container", "wait", "probe-id"])
        self.assertFalse(wait.kwargs.get("quiet", False))
        task.write.assert_not_called()

    def test_probe_failure_or_stopped_connector_never_reaches_ready(self) -> None:
        for failure in ("exit", "stopped-before", "stopped-after"):
            with self.subTest(failure=failure):
                task = Mock()
                task.inspect.side_effect = [[{"State": {"Running": failure != "stopped-before"}}],
                                            [{"State": {"Running": False}}],
                                            [{"State": {"Running": failure != "stopped-after"}}]]
                task.docker.return_value = "1" if failure == "exit" else "0"
                with patch("android_fixture.start_service", return_value="probe-id") as start, patch(
                        "android_fixture.validate_container"), self.assertRaises(RuntimeError):
                    probe_connection(task, "connector-id")
                task.write.assert_not_called()
                if failure == "stopped-before":
                    start.assert_not_called()

    def exercise_seed(self, failure: str | None) -> Mock:
        with TemporaryDirectory() as directory:
            private = Path(directory)
            for name in ("seed.json", "acceptance-credentials.json"):
                (private / name).write_bytes(b"{}")
                (private / name).chmod(0o600)
            task = Mock(project="seed-test", acceptance_uid=os.geteuid(), acceptance_gid=os.getegid())
            task.inspect.return_value = [{"Internal": failure != "network", "Labels": {"elevateo.be02.project": "seed-test"}}]
            task.docker.return_value = "1" if failure == "exit" else "0"
            if failure == "file":
                (private / "seed.json").chmod(0o644)
            with patch("acceptance_fixture.start_service", return_value="seed") as start, patch("acceptance_fixture.validate_container"):
                if failure:
                    with self.assertRaises(RuntimeError):
                        seed_application(task, private)
                else:
                    seed_application(task, private)
                if failure == "network":
                    start.assert_not_called()
            self.assertEqual(task.compose.call_args_list[0].args[1][0], "stop")
            self.assertFalse(any("api" in c.args[1] and "up" in c.args[1] for c in task.compose.call_args_list))
            return task

    def test_seed_success_and_failure_do_not_start_consumers(self) -> None:
        self.exercise_seed(None).write.assert_called_once()
        for failure in ("network", "exit", "file"):
            with self.subTest(failure=failure):
                self.exercise_seed(failure).write.assert_not_called()


if __name__ == "__main__":
    unittest.main()
