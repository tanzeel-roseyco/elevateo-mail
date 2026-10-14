"""Validate the exact compile-only APK permission list from aapt."""

import sys
from xml.etree import ElementTree


EXPECTED = frozenset(
    {
        "android.permission.INTERNET",
        "com.elevateo.mail.fixture.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION",
    }
)
FIXTURE_ID = "com.elevateo.mail.fixture"
RECEIVER_PERMISSION = f"{FIXTURE_ID}.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION"
ANDROID_NS = "{http://schemas.android.com/apk/res/android}"


def verify_permissions(output: str) -> None:
    names = output.splitlines()
    if not names or any(not name or name != name.strip() for name in names):
        raise ValueError("Malformed APK permission list")
    if len(names) != len(set(names)) or frozenset(names) != EXPECTED:
        raise ValueError(f"Unexpected APK permissions: {', '.join(names)}")


def verify_receiver_declaration(manifest: str) -> None:
    try:
        root = ElementTree.fromstring(manifest)
    except ElementTree.ParseError as error:
        raise ValueError("Malformed merged Android manifest") from error
    declarations = root.findall("permission")
    if len(declarations) != 1:
        raise ValueError("Expected one receiver permission declaration")
    declaration = declarations[0]
    if (
        declaration.get(f"{ANDROID_NS}name") != RECEIVER_PERMISSION
        or declaration.get(f"{ANDROID_NS}protectionLevel") != "signature"
    ):
        raise ValueError("Receiver permission must be fixture scoped and signature protected")
    uses = [
        item.get(f"{ANDROID_NS}name")
        for item in root.findall("uses-permission")
    ]
    if uses.count(RECEIVER_PERMISSION) != 1:
        raise ValueError("Receiver permission use must match its declaration")


if __name__ == "__main__":
    try:
        verify_permissions(sys.stdin.read())
        if len(sys.argv) != 2:
            raise ValueError("Merged Android manifest path required")
        with open(sys.argv[1], encoding="utf-8") as source:
            verify_receiver_declaration(source.read())
    except ValueError as error:
        print(error, file=sys.stderr)
        raise SystemExit(2) from error
