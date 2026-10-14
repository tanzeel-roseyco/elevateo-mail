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
require(not list((TAURI / "capabilities").glob("*.json")), "no capability files may be bundled")
require(config["app"].get("withGlobalTauri") is False, "global Tauri API must be disabled")
require(config["app"]["security"]["capabilities"] == [], "native capabilities must be empty")
require(config["app"]["security"]["assetProtocol"] == {"enable": False, "scope": []}, "asset protocol must be disabled")
require(len(config["app"]["windows"]) == 1, "expected one window")
require(config["app"]["windows"][0]["create"] is False, "window must be manually guarded")
require(config["bundle"]["windows"]["allowDowngrades"] is False, "NSIS downgrades must be denied")
print("native static package boundary PASS")
