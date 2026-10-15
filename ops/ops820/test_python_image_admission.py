"""Image admission must finish before a restore drill can mutate Docker state."""
from __future__ import annotations

import os
import pathlib
import subprocess
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]
PIN = "sha256:" + "a" * 64


class PythonImageAdmissionTest(unittest.TestCase):
    def test_immutable_local_image_admission(self) -> None:
        # AIDEV-NOTE: fake Docker records every call; refusals must never reach compose/run or pull.
        for script in ("source-snapshot.sh", "restore-rehearsal.sh"):
            for value, available in ((None, True), ("python:latest", True),
                                     ("sha256:bad", True), (PIN, False), (PIN, True)):
                with self.subTest(script=script, value=value, available=available), \
                        tempfile.TemporaryDirectory() as directory:
                    folder = pathlib.Path(directory)
                    fake = folder / "docker"
                    log = folder / "calls"
                    fake.write_text('#!/usr/bin/env bash\nprintf "%s\\n" "$*" >> "$CALLS"\n'
                                    '[[ "$1 $2" == "image inspect" ]] || exit 99\n'
                                    'exit "$IMAGE_EXIT"\n', encoding="ascii")
                    fake.chmod(0o700)
                    env = {key: val for key, val in os.environ.items() if not key.startswith("OPS820_")}
                    env.update(PATH=f"{folder}:{env['PATH']}", CALLS=str(log),
                               IMAGE_EXIT="0" if available else "1")
                    if value is not None:
                        env["OPS820_PYTHON_IMAGE"] = value
                    result = subprocess.run(
                        ["bash", str(ROOT / "ops/ops820" / script), str(folder / "absent")],
                        env=env, capture_output=True, text=True, check=False, timeout=5)
                    self.assertNotEqual(result.returncode, 0)
                    calls = log.read_text().splitlines() if log.exists() else []
                    self.assertEqual(calls, [f"image inspect {PIN}"] if value == PIN else [])
                    if value == PIN and not available:
                        self.assertEqual(result.returncode, 66)
                        self.assertIn("Python image unavailable", result.stderr)
                    if value == PIN and available and script == "source-snapshot.sh":
                        self.assertIn("private disposable test env required", result.stderr)
                    self.assertFalse((folder / "absent").exists())


if __name__ == "__main__":
    unittest.main()
