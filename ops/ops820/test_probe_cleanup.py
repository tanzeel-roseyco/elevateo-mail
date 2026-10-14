"""No real Docker: collision and failed create may never remove an existing name."""
import os
import pathlib
import subprocess
import tempfile
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[2]
SCRIPTS = ("health-probe.sh", "worker-probe.sh")


class ProbeCleanupTest(unittest.TestCase):
    def test_collision_and_failed_create_preserve_existing_name(self):
        for script in SCRIPTS:
            for mode in ("collision", "run-failure"):
                with self.subTest(script=script, mode=mode), tempfile.TemporaryDirectory() as directory:
                    folder = pathlib.Path(directory)
                    fake = folder / "docker"
                    log = folder / "calls.txt"
                    envfile = folder / "private.env"
                    envfile.write_text("")
                    fake.write_text("""#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$OPS820_FAKE_LOG"
if [[ "$1" == inspect ]]; then
  [[ "$OPS820_FAKE_MODE" == collision ]] && exit 0
  exit 1
fi
if [[ "$1" == run ]]; then exit 125; fi
exit 99
""")
                    fake.chmod(0o700)
                    env = os.environ.copy()
                    env.update(PATH=f"{folder}:{env['PATH']}", OPS820_FAKE_LOG=str(log),
                               OPS820_FAKE_MODE=mode, OPS820_SERVER_IMAGE="sha256:" + "a" * 64)
                    result = subprocess.run(
                        ["bash", str(ROOT / "ops/ops820" / script), "ops402-restore-fake",
                         str(envfile), str(ROOT)], env=env, capture_output=True, text=True,
                        check=False, timeout=10)
                    self.assertNotEqual(result.returncode, 0)
                    calls = log.read_text().splitlines()
                    self.assertFalse(any(call.startswith("rm ") for call in calls), calls)
                    self.assertEqual(any(call.startswith("run ") for call in calls), mode == "run-failure")


if __name__ == "__main__":
    unittest.main()
