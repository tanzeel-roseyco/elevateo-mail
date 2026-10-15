"""Pin Tauri's generated Android wrapper distribution to the reviewed Gradle binary."""
from pathlib import Path
import sys

GRADLE_URL = "https\\://services.gradle.org/distributions/gradle-9.6.1-bin.zip"
GRADLE_SHA256 = "9c0f7faeeb306cb14e4279a3e084ca6b596894089a0638e68a07c945a32c9e14"


def pin_wrapper(path: Path) -> None:
    lines = path.read_text(encoding="utf-8").splitlines()
    if sum(line.startswith("distributionUrl=") for line in lines) != 1:
        raise ValueError("expected exactly one Gradle distributionUrl")
    if sum(line.startswith("distributionSha256Sum=") for line in lines) > 1:
        raise ValueError("duplicate Gradle checksum")
    lines = [line for line in lines if not line.startswith("distributionSha256Sum=")]
    lines = [
        f"distributionUrl={GRADLE_URL}" if line.startswith("distributionUrl=") else line
        for line in lines
    ]
    lines.append(f"distributionSha256Sum={GRADLE_SHA256}")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("usage: pin-gradle.py gradle-wrapper.properties")
    # AIDEV-NOTE: The Docker build invokes this CLI; testing the helper alone misses a no-op entrypoint.
    pin_wrapper(Path(sys.argv[1]))
