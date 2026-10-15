"""Exercise reversal ordering and refusal without a database or Docker mutation."""
from __future__ import annotations

import base64
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parent
VERSIONS = (20261013000008, 20261013000009, 20261013000010, 20261013000016,
            20261015000011, 20261015000014, 20261015000015, 20261015000017,
            20261015000018, 20261015000019)


class FullRunnerTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.migrations = self.root / "apps/server/db/migrate"
        self.migrations.mkdir(parents=True)
        self.packet = self.root / "ops/ops820"
        self.packet.mkdir(parents=True)
        for version in (20261013000007, *VERSIONS):
            (self.migrations / f"{version}_fixture.rb").touch()
        for name in ("data_fingerprint.sql", "gateway-down-smoke.sql", "post_restore.sql"):
            (self.packet / name).touch()
        for name in ("runtime_env.py", "gateway_runtime_env.py", "full-runner.sh"):
            shutil.copyfile(ROOT / name, self.packet / name)
        (self.packet / "full-runner.sh").chmod(0o700)
        for name in ("health-probe.sh", "worker-probe.sh"):
            probe = self.packet / name
            probe.write_text('#!/usr/bin/env bash\nexit 0\n', encoding="ascii")
            probe.chmod(0o700)
        self.private = self.root / "private.env"
        self.private.write_text("AUTH_PORT=18310\n" + "".join(f"{key}=synthetic-test-only\n" for key in (
            "MIGRATOR_DB_PASSWORD", "API_DB_PASSWORD", "WORKER_DB_PASSWORD",
            "SECRET_KEY_BASE", "ELEVATEO_SESSION_KEY_BASE64")), encoding="ascii")
        self.log = self.root / "calls.jsonl"
        self.scratch = self.root / "scratch"
        self.scratch.mkdir()
        self.env = dict(os.environ, PATH=f"{self.root}:{os.environ['PATH']}",
                        OPS820_SERVER_IMAGE="sha256:" + "a" * 64, CALLS=str(self.log),
                        TMPDIR=str(self.scratch), FAILURE="")
        fake = self.root / "docker"
        # AIDEV-NOTE: Record argv, not secret env contents; command failures must halt the real shell runner.
        fake.write_text('''#!/usr/bin/env python3
import json, os, pathlib, sys
args = sys.argv[1:]
log = pathlib.Path(os.environ["CALLS"])
previous = log.read_text().splitlines() if log.exists() else []
with log.open("a") as stream:
    stream.write(json.dumps(args) + "\\n")
failure = os.environ["FAILURE"]
if "db:migrate:down" in args and failure == "down":
    raise SystemExit(17)
if "db:migrate:down" in args and "VERSION=20261015000015" in args:
    if failure == "boundary-allowed":
        raise SystemExit(0)
    if failure != "boundary-error":
        print("ActiveRecord::IrreversibleMigration: preserve attachment metadata and quarantine objects", file=sys.stderr)
    raise SystemExit(1)
if "pg_dump" in args:
    key = next((value for value in args if value.startswith("--restrict-key=")), "")
    if not key:
        raise SystemExit(18)
    print("schema " + key)
    if failure == "drift" and any("pg_dump" in json.loads(line) for line in previous):
        print("changed permission")
if "images" in args:
    print("sha256:" + "b" * 64)
''', encoding="ascii")
        fake.chmod(0o700)

    def run_script(self, mode: str = "restored") -> tuple[subprocess.CompletedProcess[str], list[list[str]]]:
        project = "ops820-source-123-456" if mode == "pre-attachment" else "ops402-restore-123-456"
        result = subprocess.run(["bash", str(ROOT / "full-runner.sh"), project,
                                 str(self.private), str(self.root), mode], env=self.env,
                                capture_output=True, text=True, check=False, timeout=15)
        calls = [json.loads(line) for line in self.log.read_text().splitlines()] if self.log.exists() else []
        self.assertEqual(list(self.scratch.iterdir()), [], "private scratch must be removed even on failure")
        return result, calls

    def test_restored_tail_preserves_attachment_boundary_and_restores_in_order(self) -> None:
        result, calls = self.run_script()
        self.assertEqual(result.returncode, 0, result.stderr)
        down = [call[-1] for call in calls if "db:migrate:down" in call]
        up = [call[-1] for call in calls if "db:migrate:up" in call]
        tail = [version for version in VERSIONS if version >= 20261015000017]
        self.assertEqual(down, [f"VERSION={version}" for version in reversed(tail)] + ["VERSION=20261015000015"])
        self.assertEqual(up, [f"VERSION={version}" for version in tail])
        dumps = [call for call in calls if "pg_dump" in call]
        self.assertEqual(len(dumps), 2)
        keys = [next(arg for arg in call if arg.startswith("--restrict-key=")) for call in dumps]
        self.assertEqual(keys[0], keys[1])
        self.assertRegex(keys[0], r"^--restrict-key=[a-f0-9]{64}$")
        self.assertFalse(any("pull" in call for call in calls))
        self.assertIn("PASS disposable migrations", result.stdout)

    def test_legacy_tail_reverses_before_attachments_exist(self) -> None:
        result, calls = self.run_script("pre-attachment")
        self.assertEqual(result.returncode, 0, result.stderr)
        tail = [version for version in VERSIONS if version <= 20261015000014]
        self.assertEqual([call[-1] for call in calls if "db:migrate:down" in call],
                         [f"VERSION={version}" for version in reversed(tail)])
        self.assertEqual([call[-1] for call in calls if "db:migrate:up" in call],
                         [f"VERSION={version}" for version in tail])
        self.assertFalse(any("/workspace/ops/ops820/config-check.rb" in call for call in calls))
        self.assertIn("stage=pre-attachment", result.stdout)

    def test_boundary_success_or_unrelated_failure_cannot_pass(self) -> None:
        for failure in ("boundary-allowed", "boundary-error"):
            with self.subTest(failure=failure):
                self.log.unlink(missing_ok=True)
                self.env["FAILURE"] = failure
                result, calls = self.run_script()
                self.assertEqual(result.returncode, 1)
                self.assertFalse(any("db:migrate:up" in call for call in calls))
                self.assertNotIn("PASS disposable", result.stdout)

    def test_unknown_mode_refuses_before_docker(self) -> None:
        result, calls = self.run_script("live")
        self.assertEqual(result.returncode, 66)
        self.assertEqual(calls, [])

    def test_missing_required_duplicate_and_invalid_names_refuse_before_docker(self) -> None:
        for name in ("missing", "duplicate", "invalid"):
            with self.subTest(name=name):
                required = self.migrations / "20261015000018_fixture.rb"
                additional = self.migrations / ("20261015000018_duplicate.rb" if name == "duplicate" else "bad.rb")
                if name == "missing":
                    required.unlink()
                else:
                    additional.touch()
                try:
                    result, calls = self.run_script()
                    self.assertEqual(result.returncode, 66)
                    self.assertEqual(calls, [])
                finally:
                    required.touch()
                    additional.unlink(missing_ok=True)

    def test_failed_down_stops_before_further_reversal_or_up(self) -> None:
        self.env["FAILURE"] = "down"
        result, calls = self.run_script()
        self.assertEqual(result.returncode, 17)
        self.assertEqual(sum("db:migrate:down" in call for call in calls), 1)
        self.assertFalse(any("db:migrate:up" in call for call in calls))
        self.assertNotIn("PASS disposable", result.stdout)

    def test_schema_drift_is_not_hidden_by_repeatable_dump_key(self) -> None:
        self.env["FAILURE"] = "drift"
        result, calls = self.run_script()
        self.assertEqual(result.returncode, 1)
        self.assertIn("restored app schema/data changed", result.stderr)
        self.assertFalse(any("/workspace/ops/ops820/config-check.rb" in call for call in calls))
        self.assertNotIn("PASS disposable", result.stdout)

    def test_source_requires_legacy_proof_before_migrating_latest(self) -> None:
        for failure in ("", "down"):
            with self.subTest(failure=failure):
                self.log.unlink(missing_ok=True)
                self.env["FAILURE"] = failure
                with self.private.open("a", encoding="ascii") as stream:
                    if not failure:
                        stream.write("STACK_ID=elevateo-mail-test\nOPS820_TASK_OWNED=1\n"
                                     + "ATTACHMENT_GATEWAY_DB_PASSWORD=" + "b" * 64 + "\n"
                                     + "ATTACHMENT_GATEWAY_HMAC_KEY_BASE64="
                                     + base64.b64encode(b"c" * 32).decode("ascii") + "\n"
                                     + "SERVICE_ROLE_KEY=" + "d" * 32 + "\n")
                result = subprocess.run(["bash", str(ROOT / "source-runner.sh"), "ops820-source-123-456",
                                         str(self.private), str(self.root)], env=self.env,
                                        capture_output=True, text=True, check=False, timeout=15)
                calls = [json.loads(line) for line in self.log.read_text().splitlines()]
                migrations = [call for call in calls if "db:migrate" in call]
                self.assertEqual(migrations[0][-1], "VERSION=20261015000014")
                self.assertEqual(list(self.scratch.iterdir()), [])
                if failure:
                    self.assertEqual(result.returncode, 17)
                    self.assertEqual(len(migrations), 1)
                    self.assertNotIn("PASS disposable source", result.stdout)
                else:
                    self.assertEqual(result.returncode, 0, result.stderr)
                    self.assertEqual(len(migrations), 2)
                    self.assertEqual(migrations[-1][-1], "db:migrate")
                    last_up = max(index for index, call in enumerate(calls) if "db:migrate:up" in call)
                    self.assertGreater(calls.index(migrations[-1]), last_up)
                    self.assertIn("PASS disposable source", result.stdout)


if __name__ == "__main__":
    unittest.main()
