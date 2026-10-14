"""Validate the exact compile-only APK permission list from aapt."""

import sys


EXPECTED = frozenset(
    {
        "android.permission.INTERNET",
        "com.elevateo.mail.fixture.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION",
    }
)


def verify_permissions(output: str) -> None:
    names = output.splitlines()
    if not names or any(not name or name != name.strip() for name in names):
        raise ValueError("Malformed APK permission list")
    if len(names) != len(set(names)) or frozenset(names) != EXPECTED:
        raise ValueError(f"Unexpected APK permissions: {', '.join(names)}")


if __name__ == "__main__":
    try:
        verify_permissions(sys.stdin.read())
    except ValueError as error:
        print(error, file=sys.stderr)
        raise SystemExit(2) from error
