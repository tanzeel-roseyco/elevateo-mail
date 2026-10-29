"""Exercise shell cleanup reporting with a fake Docker command, never a real daemon."""
from __future__ import annotations

import os
import subprocess
import tempfile
import unittest
from pathlib import Path


class HarnessTest(unittest.TestCase):
    def run_harness(self, mode: str) -> subprocess.CompletedProcess[str]:
        # AIDEV-NOTE: Daemon errors must fail closed both before work and during independent cleanup verification.
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            script = Path(__file__).with_name("fleet-test.sh").read_text()
            script = script.replace("/home/tanzeel/elevateo-mail-wave-20261014/control/soren-docker.lock",
                                    str(root / "lock"))
            (root / "run.sh").write_text(script)
            docker = root / "docker"
            docker.write_text("""#!/bin/sh
if [ "$1 $2" = 'ps -aq' ]; then
  if [ "$MODE" = preflight ]; then exit 42; fi
  if [ -e "$STATE" ] && [ "$MODE" = cleanup ]; then exit 42; fi
  touch "$STATE"
fi
if [ "$1 $2" = 'container inspect' ]; then exit 1; fi
exit 0
""")
            docker.chmod(0o700)
            flock = root / "flock"
            flock.write_text("#!/bin/sh\nexit 0\n")
            flock.chmod(0o700)
            environment = dict(os.environ, PATH=str(root) + os.pathsep + os.environ["PATH"],
                               MODE=mode, STATE=str(root / "state"))
            return subprocess.run(["sh", str(root / "run.sh")], env=environment,
                                  capture_output=True, text=True, timeout=10)

    def test_preflight_daemon_error_does_not_claim_cleanup(self) -> None:
        result = self.run_harness("preflight")
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn("CLEANUP:", result.stdout)

    def test_cleanup_daemon_error_does_not_claim_absence(self) -> None:
        result = self.run_harness("cleanup")
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn("CLEANUP:", result.stdout)

    def test_successful_queries_allow_cleanup_report(self) -> None:
        result = self.run_harness("success")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("CLEANUP:", result.stdout)


if __name__ == "__main__":
    unittest.main()
