"""Static native package boundary check; run inside Soren's fleet Docker lane."""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TAURI = ROOT / "src-tauri"
config = json.loads((TAURI / "tauri.conf.json").read_text(encoding="utf-8"))


def require(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit(message)


require("frontendDist" not in config.get("build", {}), "online-only shell must not bundle local UI")
# FC-MAC: exactly one reviewed capability (main window, core events only, https remote context
# confined by the Rust exact-origin navigation guard). Anything beyond it fails the boundary.
capability_files = sorted((TAURI / "capabilities").glob("*.json"))
require([p.name for p in capability_files] == ["main.json"], "only the reviewed main capability may be bundled")
capability = json.loads(capability_files[0].read_text(encoding="utf-8"))
require(capability.get("identifier") == "main" and capability.get("windows") == ["main"], "capability window selection changed")
require(capability.get("permissions") == ["core:event:default"], "capability permissions widened")
require(capability.get("remote") == {"urls": ["https://*"]}, "capability remote context changed")
require(config["app"].get("withGlobalTauri") is False, "global Tauri API must be disabled")
require(config["app"]["security"]["capabilities"] == ["main"], "capability selection changed")
require(config["app"]["security"]["assetProtocol"] == {"enable": False, "scope": []}, "asset protocol must be disabled")
require(len(config["app"]["windows"]) == 1, "expected one window")
require(config["app"]["windows"][0]["create"] is False, "window must be manually guarded")
require(config["bundle"]["windows"]["allowDowngrades"] is False, "NSIS downgrades must be denied")
print("native static package boundary PASS")
