"""Generated wrapper pinning regression cases; Soren runs inside fleet Docker only."""
from pathlib import Path
from tempfile import TemporaryDirectory
import subprocess
import sys
import unittest

from pin_gradle import GRADLE_SHA256, GRADLE_URL, pin_wrapper


class PinWrapperTest(unittest.TestCase):
    def run_cli(self, path: Path) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [sys.executable, str(Path(__file__).with_name("pin_gradle.py")), str(path)],
            capture_output=True, text=True, check=False, timeout=10,
        )

    def test_cli_pins_wrapper_and_preserves_other_properties(self) -> None:
        # AIDEV-NOTE: Exercise Docker's actual entrypoint; helper-only tests missed a silent no-op.
        with TemporaryDirectory() as directory:
            path = Path(directory) / "gradle-wrapper.properties"
            path.write_text("networkTimeout=10000\ndistributionUrl=old\n", encoding="utf-8")
            result = self.run_cli(path)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(path.read_text(encoding="utf-8"),
                             f"networkTimeout=10000\ndistributionUrl={GRADLE_URL}\n"
                             f"distributionSha256Sum={GRADLE_SHA256}\n")

    def test_cli_rejects_invalid_input_without_mutating_it(self) -> None:
        for content in ["networkTimeout=10000\n", "distributionUrl=one\ndistributionUrl=two\n",
                        "distributionUrl=old\ndistributionSha256Sum=a\ndistributionSha256Sum=b\n"]:
            with self.subTest(content=content), TemporaryDirectory() as directory:
                path = Path(directory) / "gradle-wrapper.properties"
                path.write_text(content, encoding="utf-8")
                result = self.run_cli(path)
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(path.read_text(encoding="utf-8"), content)

    def test_cli_requires_existing_file_and_one_argument(self) -> None:
        with TemporaryDirectory() as directory:
            self.assertNotEqual(self.run_cli(Path(directory) / "absent").returncode, 0)
        result = subprocess.run([sys.executable, str(Path(__file__).with_name("pin_gradle.py"))],
                                capture_output=True, text=True, check=False, timeout=10)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("usage:", result.stderr)

    def test_pins_generated_wrapper(self) -> None:
        with TemporaryDirectory() as directory:
            path = Path(directory) / "gradle-wrapper.properties"
            path.write_text("distributionUrl=https\\://example.invalid/gradle.zip\n", encoding="utf-8")
            pin_wrapper(path)
            content = path.read_text(encoding="utf-8")
            self.assertIn(f"distributionUrl={GRADLE_URL}\n", content)
            self.assertIn(f"distributionSha256Sum={GRADLE_SHA256}\n", content)

    def test_rejects_missing_distribution(self) -> None:
        with TemporaryDirectory() as directory:
            path = Path(directory) / "gradle-wrapper.properties"
            path.write_text("networkTimeout=10000\n", encoding="utf-8")
            with self.assertRaises(ValueError):
                pin_wrapper(path)

    def test_rejects_duplicate_checksum(self) -> None:
        with TemporaryDirectory() as directory:
            path = Path(directory) / "gradle-wrapper.properties"
            path.write_text(
                "distributionUrl=https\\://example.invalid/gradle.zip\n"
                "distributionSha256Sum=first\n"
                "distributionSha256Sum=second\n",
                encoding="utf-8",
            )
            with self.assertRaises(ValueError):
                pin_wrapper(path)


if __name__ == "__main__":
    unittest.main()
