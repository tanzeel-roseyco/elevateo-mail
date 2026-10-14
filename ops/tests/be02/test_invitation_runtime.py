"""Invitation ordering and cleanup regressions: Soren's Docker job only; authored NOT_RUN."""
from __future__ import annotations

import os
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import Mock, patch
from acceptance_runtime import Acceptance
from acceptance_cleanup import private_files


class InvitationRuntimeTest(unittest.TestCase):
    def exercise(self, seed: bool = True, code: str = "0", output: bool = True) -> list[str]:
        events: list[str] = []
        with TemporaryDirectory() as directory:
            private = Path(directory)
            if seed:
                for name in ("seed.json", "acceptance-credentials.json"):
                    (private / name).write_text('{}')
                    (private / name).chmod(0o600)
            acceptance = object.__new__(Acceptance)
            acceptance.private = private
            task = Mock(acceptance_uid=os.geteuid(), acceptance_gid=os.getegid())
            acceptance.task = task

            def start(service: str) -> str:
                self.assertEqual(service, "acceptance-invitation")
                events.append("issue")
                if output:
                    (private / "acceptance-invitation.json").write_text('{}')
                    (private / "acceptance-invitation.json").chmod(0o600)
                return "invitation-container"

            task.docker.side_effect = lambda stage, *_args: events.append(stage) or code
            task.inspect.return_value = [{}]
            with patch("acceptance_runtime.validate_container"), patch.object(acceptance, "start", side_effect=start):
                if not seed or code != "0" or not output:
                    with self.assertRaises((RuntimeError, FileNotFoundError)):
                        acceptance.invitation()
                else:
                    acceptance.invitation()
            return events

    def test_ready_seed_then_successful_publication_and_container_removal(self) -> None:
        self.assertEqual(self.exercise(), ["issue", "acceptance-invitation-wait", "acceptance-invitation-remove"])

    def test_missing_seed_cannot_issue_invitation(self) -> None:
        self.assertEqual(self.exercise(seed=False), [])

    def test_failed_fixture_and_missing_output_still_remove_container(self) -> None:
        self.assertEqual(self.exercise(code="1")[-1], "acceptance-invitation-remove")
        self.assertEqual(self.exercise(output=False)[-1], "acceptance-invitation-remove")

    def test_private_cleanup_removes_owned_invitation_and_interrupted_temporary(self) -> None:
        with TemporaryDirectory() as directory:
            evidence = Path(directory)
            private = evidence / "acceptance-private"
            private.mkdir(mode=0o700)
            for name in ("seed.json", "acceptance-credentials.json", "acceptance-invitation.json", "acceptance-invitation.tmp"):
                (private / name).write_text('{}')
                (private / name).chmod(0o600)
            task = Mock(evidence=evidence, acceptance_private=private,
                        acceptance_uid=os.geteuid(), acceptance_gid=os.getegid())
            task.project_containers.return_value = []
            task.docker.return_value = ""
            removed: list[str] = []
            private_files(task, removed)
            self.assertFalse(private.exists())
            self.assertEqual(len(removed), 5)

    def test_cleanup_handles_exact_interrupted_publication_hardlinks(self) -> None:
        with TemporaryDirectory() as directory:
            evidence = Path(directory)
            private = evidence / "acceptance-private"
            private.mkdir(mode=0o700)
            temporary = private / "acceptance-invitation.tmp"
            temporary.write_text('{}')
            temporary.chmod(0o600)
            os.link(temporary, private / "acceptance-invitation.json")
            task = Mock(evidence=evidence, acceptance_private=private,
                        acceptance_uid=os.geteuid(), acceptance_gid=os.getegid())
            task.project_containers.return_value = []
            task.docker.return_value = ""
            private_files(task, [])
            self.assertFalse(private.exists())

    def test_cleanup_rejects_hardlinks_outside_owned_pair(self) -> None:
        with TemporaryDirectory() as directory:
            evidence = Path(directory)
            private = evidence / "acceptance-private"
            private.mkdir(mode=0o700)
            path = private / "acceptance-invitation.json"
            path.write_text('{}')
            path.chmod(0o600)
            os.link(path, evidence / "outside.json")
            task = Mock(evidence=evidence, acceptance_private=private,
                        acceptance_uid=os.geteuid(), acceptance_gid=os.getegid())
            task.project_containers.return_value = []
            task.docker.return_value = ""
            with self.assertRaises(RuntimeError):
                private_files(task, [])
            self.assertTrue(path.exists())

    def test_cleanup_with_consumers_preserves_private_bytes(self) -> None:
        with TemporaryDirectory() as directory:
            evidence = Path(directory)
            private = evidence / "acceptance-private"
            private.mkdir(mode=0o700)
            path = private / "acceptance-invitation.json"
            path.write_text('{}')
            path.chmod(0o600)
            task = Mock(evidence=evidence, acceptance_private=private,
                        acceptance_uid=os.geteuid(), acceptance_gid=os.getegid())
            task.project_containers.return_value = ["browser"]
            with self.assertRaises(RuntimeError):
                private_files(task, [])
            self.assertTrue(path.exists())


if __name__ == "__main__":
    unittest.main()
