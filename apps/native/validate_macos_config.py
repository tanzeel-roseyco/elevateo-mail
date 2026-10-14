#!/usr/bin/env python3
"""Offline check of Orion macOS overlay against the fail-closed base configuration."""
import json
import plistlib
import sys
from pathlib import Path


def validate(root: Path) -> list[str]:
    errors: list[str] = []
    try:
        base = json.loads((root / "tauri.conf.json").read_text())
        mac = json.loads((root / "tauri.macos.conf.json").read_text())
        entitlements = plistlib.loads((root / "macos/Entitlements.plist").read_bytes())
        capabilities = [json.loads(path.read_text()) for path in (root / "capabilities").glob("*.json")]
    except (OSError, ValueError, TypeError) as error:
        return [f"config read failed: {error}"]
    if base.get("identifier") != "com.elevateo.mail":
        errors.append("bundle identifier changed")
    if base.get("build", {}).get("frontendDist") != "../../web/dist":
        errors.append("Orion no longer shares apps/web/dist")
    if base.get("app", {}).get("security", {}).get("csp", "").find("connect-src 'self'") < 0:
        errors.append("remote connections are not fail closed")
    if not capabilities:
        errors.append("no reviewed Tauri capability file")
    for capability in capabilities:
        if capability.get("remote") is not None or capability.get("permissions") != []:
            errors.append("remote or privileged capability granted")
    if base.get("app", {}).get("security", {}).get("dangerousRemoteDomainIpcAccess"):
        errors.append("remote IPC access enabled")
    if mac.get("bundle", {}).get("targets") != ["dmg"]:
        errors.append("macOS target must be DMG")
    options = mac.get("bundle", {}).get("macOS", {})
    if options.get("minimumSystemVersion") != "12.0":
        errors.append("minimum system version changed")
    if options.get("entitlements") != "./macos/Entitlements.plist":
        errors.append("entitlements path changed")
    if entitlements != {}:
        errors.append("unreviewed entitlement requested")
    if "url" in json.dumps(mac).lower() or "deep-link" in json.dumps(mac).lower():
        errors.append("unapproved callback registration")
    return errors


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("usage: validate_macos_config.py SRC_TAURI_DIR")
    failures = validate(Path(sys.argv[1]))
    for failure in failures:
        print(failure, file=sys.stderr)
    if failures:
        raise SystemExit(1)
    print("MAC-814 static configuration PASS; macOS build and native auth NOT RUN")
