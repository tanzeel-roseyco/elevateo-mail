#!/usr/bin/env python3
"""Static, offline MAC-814 release-template validation; no packaging or signing."""
import json
import sys
from pathlib import Path

REQUIRED = {
    "schemaVersion": 1,
    "productName": "Elevateo Mail",
    "bundleIdentifier": "com.elevateo.mail",
    "tauriMajor": 2,
    "sharedWebRoot": "../../../web",
    "frontendDist": "../../../web/dist",
    "target": "universal-apple-darwin",
    "bundleFormat": "dmg",
    "minimumSystemVersion": "12.0",
    "authCallbackScheme": "elevateomail",
    "releaseState": "template-only",
}


def validate(path: Path) -> list[str]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        return [f"cannot read JSON template: {error}"]
    if not isinstance(data, dict):
        return ["template must be a JSON object"]
    errors = []
    for key, expected in REQUIRED.items():
        if key not in data or type(data[key]) is not type(expected) or data[key] != expected:
            errors.append(f"{key}: expected {expected!r}")
    errors.extend(f"unexpected key: {key}" for key in data.keys() - REQUIRED.keys())
    if any(word in json.dumps(data).lower() for word in ("password", "private_key", "api_key")):
        errors.append("credential-like field is forbidden")
    return errors


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: validate_release_template.py TEMPLATE", file=sys.stderr)
        return 2
    errors = validate(Path(sys.argv[1]))
    for error in errors:
        print(error, file=sys.stderr)
    if errors:
        return 1
    print("MAC-814 template static validation PASS; DMG build and macOS validation NOT RUN")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
