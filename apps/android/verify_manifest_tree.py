"""Fail closed when the packaged APK manifest cannot be inspected."""

import subprocess
import sys
import re


def require_no_view_filter(returncode: int, output: str, stderr: str = "") -> None:
    if returncode != 0 or stderr.strip():
        raise ValueError("APK manifest xmltree inspection failed")
    namespace = "N: android=http://schemas.android.com/apk/res/android\n"
    manifest = re.search(r"(?m)^  E: manifest \(line=\d+\)$", output)
    application = re.search(r"(?m)^    E: application \(line=\d+\)$", output)
    if not output.startswith(namespace) or not manifest or not application:
        raise ValueError("aapt output did not contain an Android manifest tree")
    if "android.intent.action.VIEW" in output:
        raise ValueError("Unreviewed Android VIEW callback filter")


def verify_manifest_tree(aapt: str, apk: str) -> None:
    try:
        result = subprocess.run(
            [aapt, "dump", "xmltree", apk, "AndroidManifest.xml"],
            capture_output=True,
            text=True,
            check=False,
        )
    except OSError as error:
        raise ValueError("aapt xmltree could not run") from error
    require_no_view_filter(result.returncode, result.stdout, result.stderr)


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("usage: verify_manifest_tree.py AAPT APK")
    try:
        verify_manifest_tree(sys.argv[1], sys.argv[2])
    except ValueError as error:
        print(error, file=sys.stderr)
        raise SystemExit(2) from error
