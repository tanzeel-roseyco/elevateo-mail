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
        self.base = {"identifier": "com.elevateo.mail", "build": {"frontendDist": "../../web/dist"}, "app": {"security": {"csp": "connect-src 'self'"}}}
        self.mac = {"bundle": {"targets": ["dmg"], "macOS": {"minimumSystemVersion": "12.0", "entitlements": "./macos/Entitlements.plist"}}}
        self.entitlements = {}
        self.write()

    def write(self):
        (self.root / "tauri.conf.json").write_text(json.dumps(self.base))
        (self.root / "tauri.macos.conf.json").write_text(json.dumps(self.mac))
        (self.root / "macos/Entitlements.plist").write_bytes(plistlib.dumps(self.entitlements))

    def test_valid_overlay(self):
        self.assertEqual([], validate(self.root))

    def test_remote_connection_regression(self):
        self.base["app"]["security"]["csp"] = "connect-src https:"
        self.write()
        self.assertIn("remote connections are not fail closed", validate(self.root))

    def test_unapproved_callback_registration(self):
        self.mac["plugins"] = {"deep-link": {"desktop": {"schemes": ["elevateomail"]}}}
        self.write()
        self.assertIn("unapproved callback registration", validate(self.root))


if __name__ == "__main__":
    unittest.main()
