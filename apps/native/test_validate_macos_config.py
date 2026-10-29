import json
import plistlib
import tempfile
import unittest
from pathlib import Path

from validate_macos_config import validate


class MacConfigTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        (self.root / "macos").mkdir()
        (self.root / "capabilities").mkdir()
        self.capability = {"identifier": "main", "windows": ["main"], "remote": {"urls": ["https://*"]}, "permissions": ["core:event:default"]}
        self.base = {"identifier": "com.elevateo.mail", "app": {"windows": [{"create": False}], "security": {"capabilities": ["main"], "assetProtocol": {"enable": False}}, "withGlobalTauri": False}}
        self.mac = {"bundle": {"targets": ["dmg"], "macOS": {"minimumSystemVersion": "12.0", "entitlements": "./macos/Entitlements.plist"}}}
        self.entitlements = {}
        self.write()

    def write(self):
        (self.root / "tauri.conf.json").write_text(json.dumps(self.base))
        (self.root / "tauri.macos.conf.json").write_text(json.dumps(self.mac))
        (self.root / "macos/Entitlements.plist").write_bytes(plistlib.dumps(self.entitlements))
        (self.root / "capabilities/main.json").write_text(json.dumps(self.capability))

    def test_valid_overlay(self):
        self.assertEqual([], validate(self.root))

    def test_rejects_global_bridge(self):
        self.base["app"]["withGlobalTauri"] = True
        self.write()
        self.assertIn("global Tauri bridge enabled", validate(self.root))

    def test_rejects_second_capability_file(self):
        self.write()
        (self.root / "capabilities/extra.json").write_text(json.dumps({"identifier": "extra", "permissions": []}))
        self.assertIn("expected exactly the one reviewed capability file, found 2", validate(self.root))

    def test_rejects_unreviewed_capability_permission(self):
        self.capability["permissions"] = ["core:event:default", "fs:default"]
        self.write()
        self.assertIn("capability grants an unreviewed permission", validate(self.root))

    def test_rejects_widened_remote_context(self):
        self.capability["remote"] = {"urls": ["https://*", "http://*"]}
        self.write()
        self.assertIn("capability remote context changed", validate(self.root))

    def test_unapproved_callback_registration(self):
        self.mac["plugins"] = {"deep-link": {"desktop": {"schemes": ["elevateomail"]}}}
        self.write()
        self.assertIn("unapproved callback registration", validate(self.root))


if __name__ == "__main__":
    unittest.main()
