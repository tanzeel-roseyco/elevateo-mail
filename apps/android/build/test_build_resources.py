"""Exercise the actual APK entrypoint through its first compilation command."""
from __future__ import annotations

import os
from pathlib import Path
import subprocess
import tempfile
import unittest


class BuildResourceTests(unittest.TestCase):
    def run_configuration(self, supplied: dict[str, str]) -> list[str]:
        # AIDEV-NOTE: Stub tool execution, not configuration, so script-level overrides remain observable.
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            tools = root / "bin"
            tools.mkdir()
            scripts = {
                "id": "echo 1000",
                "rustc": "echo 'rustc 1.90.0 (test)'",
                "javac": "echo 'javac 17.0.1'",
                "python3": "exit 0",
                "cargo": (
                    'if [ "$1" = tauri ]; then echo "tauri-cli 2.12.2"; exit 0; fi\n'
                    'printf "%s\\n" "$CARGO_BUILD_JOBS" "$GRADLE_OPTS" > "$RESOURCE_CAPTURE"\n'
                    "exit 42"
                ),
            }
            for name, body in scripts.items():
                executable = tools / name
                executable.write_text("#!/bin/sh\n" + body + "\n", encoding="utf-8")
                executable.chmod(0o755)
            environment = dict(os.environ)
            for key in tuple(environment):
                if key.startswith("ELEVATEO_ANDROID_") or key in {"CARGO_BUILD_JOBS", "GRADLE_OPTS"}:
                    del environment[key]
            capture = root / "resources.txt"
            environment.update({
                "PATH": str(tools) + os.pathsep + environment["PATH"],
                "ANDROID_HOME": str(root),
                "APK_BUILD_ROOT": str(root / "output"),
                "QA_CA_CERT": str(root / "public-ca.pem"),
                "RESOURCE_CAPTURE": str(capture),
                **supplied,
            })
            result = subprocess.run(
                ["bash", str(Path(__file__).with_name("build-apk.sh"))],
                env=environment, capture_output=True, text=True, check=False, timeout=10,
            )
            self.assertEqual(result.returncode, 42, result.stdout + result.stderr)
            return capture.read_text(encoding="utf-8").splitlines()

    def test_defaults_bound_parallelism(self) -> None:
        jobs, gradle = self.run_configuration({})
        self.assertEqual(jobs, "1")
        self.assertIn("workers.max=1", gradle)
        self.assertIn("-Xmx1024m", gradle)

    def test_caller_limits_survive(self) -> None:
        gradle = "-Dorg.gradle.workers.max=1 -Dorg.gradle.jvmargs=-Xmx768m"
        self.assertEqual(self.run_configuration({"CARGO_BUILD_JOBS": "2", "GRADLE_OPTS": gradle}), ["2", gradle])

    def test_empty_values_use_safe_defaults(self) -> None:
        self.assertEqual(self.run_configuration({"CARGO_BUILD_JOBS": "", "GRADLE_OPTS": ""}),
                         self.run_configuration({}))


if __name__ == "__main__":
    unittest.main()
