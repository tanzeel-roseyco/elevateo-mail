"""Classify the pinned apksigner result for a compile-only unsigned APK."""

import subprocess
import sys


UNSIGNED_DIAGNOSTIC = "DOES NOT VERIFY\nERROR: Missing META-INF/MANIFEST.MF"


def require_unsigned(returncode: int, stdout: str, stderr: str) -> None:
    if returncode != 1 or stdout.strip() or stderr.strip() != UNSIGNED_DIAGNOSTIC:
        raise ValueError("APK unsigned status was not established by apksigner")


def verify_unsigned(apksigner: str, apk: str) -> None:
    try:
        result = subprocess.run(
            [apksigner, "verify", "--verbose", apk],
            capture_output=True,
            text=True,
            check=False,
        )
    except OSError as error:
        raise ValueError("apksigner could not run") from error
    require_unsigned(result.returncode, result.stdout, result.stderr)


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("usage: verify_unsigned.py APKSIGNER APK")
    try:
        verify_unsigned(sys.argv[1], sys.argv[2])
    except ValueError as error:
        print(error, file=sys.stderr)
        raise SystemExit(2) from error
