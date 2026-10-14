"""Static native package boundary check; run inside Soren's fleet Docker lane."""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TAURI = ROOT / "src-tauri"
config = json.loads((TAURI / "tauri.conf.json").read_text(encoding="utf-8"))

assert "frontendDist" not in config.get("build", {}), "online-only shell must not bundle a local UI"
assert not list((TAURI / "capabilities").glob("*.json")), "no capability files may be bundled"
assert config["app"].get("withGlobalTauri") is False
assert config["app"]["security"]["capabilities"] == []
assert config["app"]["security"]["assetProtocol"] == {"enable": False, "scope": []}
assert len(config["app"]["windows"]) == 1
assert config["app"]["windows"][0]["create"] is False
assert config["bundle"]["windows"]["allowDowngrades"] is False
print("native static package boundary PASS")
