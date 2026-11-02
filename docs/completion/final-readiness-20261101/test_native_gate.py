"""Regression: missing suite directories must stop the evidence wrapper."""
from pathlib import Path
import subprocess
import unittest


class NativeGateTests(unittest.TestCase):
    def test_each_failed_directory_change_stops_before_next_gate(self) -> None:
        # AIDEV-NOTE: Exercise the real wrapper commands with an injected filesystem failure.
        script = Path(__file__).with_name("native-gate.sh").read_text()
        commands = [line for line in script.splitlines() if line.startswith("cd ")]
        self.assertEqual(len(commands), 4)
        for command in commands:
            with self.subTest(command=command):
                result = subprocess.run(
                    ["bash", "-c", "cd() { return 1; };\n" + command + "\necho WRONG_SUITE"],
                    capture_output=True, text=True, check=False,
                )
                self.assertEqual(result.returncode, 1)
                self.assertNotIn("WRONG_SUITE", result.stdout)


if __name__ == "__main__":
    unittest.main()
