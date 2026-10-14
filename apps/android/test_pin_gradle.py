"""Generated wrapper pinning regression cases; Soren runs inside fleet Docker only."""
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from pin_gradle import GRADLE_SHA256, GRADLE_URL, pin_wrapper


class PinWrapperTest(unittest.TestCase):
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
