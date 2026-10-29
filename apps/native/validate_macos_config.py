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
    if base.get("build", {}).get("frontendDist") is not None:
        errors.append("online-only shell must not bundle web assets")
    security = base.get("app", {}).get("security", {})
    if security.get("capabilities") != ["main"] or security.get("assetProtocol", {}).get("enable") is not False:
        errors.append("capability selection changed or asset protocol enabled")
    if base.get("app", {}).get("withGlobalTauri") is not False:
        errors.append("global Tauri bridge enabled")
    errors.extend(validate_capabilities(capabilities))
    if security.get("dangerousRemoteDomainIpcAccess"):
        errors.append("remote IPC access enabled")
    if base.get("app", {}).get("windows", [{}])[0].get("create") is not False:
        errors.append("manual guarded window creation is required")
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


# The single reviewed capability (FC-MAC): main window only, event IPC only; https://* is confined
# to the one approved origin by the Rust exact-origin navigation guard, not by this file alone.
ALLOWED_PERMISSIONS = {"core:event:default"}


def validate_capabilities(capabilities: list[dict]) -> list[str]:
    errors: list[str] = []
    if len(capabilities) != 1:
        return [f"expected exactly the one reviewed capability file, found {len(capabilities)}"]
    cap = capabilities[0]
    if cap.get("identifier") != "main" or cap.get("windows") != ["main"]:
        errors.append("capability identifier/window selection changed")
    if cap.get("remote", {}).get("urls") != ["https://*"]:
        errors.append("capability remote context changed")
    if not set(cap.get("permissions", [])) <= ALLOWED_PERMISSIONS:
        errors.append("capability grants an unreviewed permission")
    if cap.get("local") is True:
        errors.append("capability must not add a local context")
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
