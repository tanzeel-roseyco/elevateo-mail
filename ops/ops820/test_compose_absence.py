"""Safe fake-Docker regression for exact project cleanup inventory."""
from __future__ import annotations

import os
import pathlib
import subprocess
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]
HELPER = ROOT / "ops/ops820/compose_absence.sh"


class ComposeAbsenceTest(unittest.TestCase):
    def test_success_failure_and_remaining_resource(self) -> None:
        modes = ("clean", "fail-ps", "fail-volume", "fail-network",
                 "present-ps", "present-volume", "present-network")
        for mode in modes:
            with self.subTest(mode=mode), tempfile.TemporaryDirectory() as directory:
                fake = pathlib.Path(directory) / "docker"
                fake.write_text("""#!/usr/bin/env bash
key="$1"
[[ "$OPS820_FAKE_MODE" == "fail-$key" ]] && exit 17
[[ "$OPS820_FAKE_MODE" == "present-$key" ]] && echo task-owned-resource
exit 0
""")
                fake.chmod(0o700)
                env = os.environ.copy()
                env.update(PATH=f"{directory}:{env['PATH']}", OPS820_FAKE_MODE=mode)
                result = subprocess.run(
                    ["bash", "-c", 'source "$1"; ops820_compose_absent ops820-test',
                     "bash", str(HELPER)], env=env, capture_output=True, text=True,
                    timeout=10, check=False)
                self.assertEqual(result.returncode == 0, mode == "clean", result.stderr)


if __name__ == "__main__":
    unittest.main()
