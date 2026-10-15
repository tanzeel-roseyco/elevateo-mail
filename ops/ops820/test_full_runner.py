"""Exercise reversal ordering and refusal without a database or Docker mutation."""
from __future__ import annotations

import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parent
VERSIONS = (20261013000008, 20261013000009, 20261013000010, 20261013000016,
            20261015000011, 20261015000015, 20261015000018, 20261015000019)


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
        shutil.copyfile(ROOT / "runtime_env.py", self.packet / "runtime_env.py")
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
if "pg_dump" in args:
    key = next((value for value in args if value.startswith("--restrict-key=")), "")
    if not key:
        raise SystemExit(18)
    print("schema " + key)
    if failure == "drift" and any("pg_dump" in json.loads(line) for line in previous):
        print("changed permission")
''', encoding="ascii")
        fake.chmod(0o700)

    def run_script(self) -> tuple[subprocess.CompletedProcess[str], list[list[str]]]:
        result = subprocess.run(["bash", str(ROOT / "full-runner.sh"), "ops402-restore-123-456",
                                 str(self.private), str(self.root)], env=self.env,
                                capture_output=True, text=True, check=False, timeout=15)
        calls = [json.loads(line) for line in self.log.read_text().splitlines()] if self.log.exists() else []
        self.assertEqual(list(self.scratch.iterdir()), [], "private scratch must be removed even on failure")
        return result, calls

    def test_complete_tail_reverses_dependencies_and_restores_in_order(self) -> None:
        result, calls = self.run_script()
        self.assertEqual(result.returncode, 0, result.stderr)
        down = [call[-1] for call in calls if "db:migrate:down" in call]
        up = [call[-1] for call in calls if "db:migrate:up" in call]
        self.assertEqual(down, [f"VERSION={version}" for version in reversed(VERSIONS)])
        self.assertEqual(up, [f"VERSION={version}" for version in VERSIONS])
        dumps = [call for call in calls if "pg_dump" in call]
        self.assertEqual(len(dumps), 2)
        keys = [next(arg for arg in call if arg.startswith("--restrict-key=")) for call in dumps]
        self.assertEqual(keys[0], keys[1])
        self.assertRegex(keys[0], r"^--restrict-key=[a-f0-9]{64}$")
        self.assertFalse(any("pull" in call for call in calls))
        self.assertIn("PASS disposable migrations", result.stdout)

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


if __name__ == "__main__":
    unittest.main()
