"""Exercise generated Android customization against both supported artifact identities."""
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from xml.etree import ElementTree as ET

from customize_generated import ANDROID, GENERATED_BODY, NETWORK_STATE, customize

MANIFEST = '''<manifest xmlns:android="http://schemas.android.com/apk/res/android">
<uses-permission android:name="android.permission.INTERNET" />
<application><activity android:name=".MainActivity" android:exported="true" /></application></manifest>'''


class CustomizeGeneratedTest(unittest.TestCase):
    def setUp(self) -> None:
        self.directory = TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.project = Path(self.directory.name) / "generated"
        self.main = self.project / "app/src/main"
        self.activity = self.main / "java/com/elevateo/mail/qa/MainActivity.kt"
        self.activity.parent.mkdir(parents=True)
        self.activity.write_text("package com.elevateo.mail.qa\n\n" + GENERATED_BODY)
        self.manifest = self.main / "AndroidManifest.xml"
        self.manifest.write_text(MANIFEST)

    def test_installs_native_behavior_for_each_identity_and_is_idempotent(self) -> None:
        for package in ("com.elevateo.mail.qa", "com.elevateo.mail.fixture", "com.elevateo.mail"):
            with self.subTest(package=package):
                self.activity.write_text("package " + package + "\n\n" + GENERATED_BODY)
                self.manifest.write_text(MANIFEST)
                customize(self.project)
                root = ET.parse(self.manifest).getroot()
                uses = [n.get(ANDROID + "name") for n in root.findall("uses-permission")]
                self.assertEqual(uses.count(NETWORK_STATE), 1)
                self.assertIn("android.permission.INTERNET", uses)
                activity = root.find("application/activity")
                self.assertIsNotNone(activity)
                self.assertEqual(activity.get(ANDROID + "windowSoftInputMode"), "adjustResize")
                self.assertEqual(activity.get(ANDROID + "exported"), "true")
                actual = self.activity.read_text()
                self.assertTrue(actual.startswith("package " + package + "\n"))
                self.assertNotIn("@PACKAGE@", actual)
                # AIDEV-NOTE: Generated activities must retain the light chrome policy on every artifact identity.
                self.assertIn("AppCompatDelegate.MODE_NIGHT_NO", actual)
                self.assertIn("statusBarStyle = SystemBarStyle.light(Color.WHITE, Color.WHITE)", actual)
                self.assertIn("navigationBarStyle = SystemBarStyle.light(Color.WHITE, Color.WHITE)", actual)
                before = (self.activity.read_bytes(), self.manifest.read_bytes())
                customize(self.project)
                self.assertEqual(before, (self.activity.read_bytes(), self.manifest.read_bytes()))

    def test_removes_tv_advertising_but_preserves_mobile_and_other_intents(self) -> None:
        root = ET.fromstring(MANIFEST)
        ET.SubElement(root, "uses-feature", {ANDROID + "name": "android.software.leanback"})
        ET.SubElement(root, "uses-feature", {ANDROID + "name": "android.hardware.camera"})
        activity = root.find("application/activity")
        intent = ET.SubElement(activity, "intent-filter")
        ET.SubElement(intent, "action", {ANDROID + "name": "android.intent.action.MAIN"})
        for category in ("LAUNCHER", "LEANBACK_LAUNCHER", "DEFAULT"):
            ET.SubElement(intent, "category", {ANDROID + "name": "android.intent.category." + category})
        self.manifest.write_text(ET.tostring(root, encoding="unicode"))
        customize(self.project)
        actual = ET.parse(self.manifest).getroot()
        self.assertEqual([n.get(ANDROID + "name") for n in actual.findall("uses-feature")],
                         ["android.hardware.camera"])
        self.assertEqual([n.get(ANDROID + "name") for n in actual.findall("application/activity/intent-filter/category")],
                         ["android.intent.category.LAUNCHER", "android.intent.category.DEFAULT"])
        self.assertEqual(actual.find("application/activity/intent-filter/action").get(ANDROID + "name"),
                         "android.intent.action.MAIN")
        before = self.manifest.read_bytes()
        customize(self.project)
        self.assertEqual(self.manifest.read_bytes(), before)

    def test_rejects_changed_template_or_package_without_partial_edits(self) -> None:
        for source in ("package com.attacker.app\n" + GENERATED_BODY,
                       "package com.elevateo.mail.qa\n" + GENERATED_BODY.replace("enableEdgeToEdge()", "")):
            with self.subTest(source=source):
                self.activity.write_text(source)
                before = (self.activity.read_bytes(), self.manifest.read_bytes())
                with self.assertRaises(ValueError):
                    customize(self.project)
                self.assertEqual(before, (self.activity.read_bytes(), self.manifest.read_bytes()))

    def test_missing_or_multiple_activity_sources_fail(self) -> None:
        other = self.activity.with_name("extra") / "MainActivity.kt"
        other.parent.mkdir()
        other.write_text(self.activity.read_text())
        with self.assertRaises(ValueError):
            customize(self.project)
        other.unlink()
        self.activity.unlink()
        with self.assertRaises(ValueError):
            customize(self.project)

    def test_symlink_input_is_rejected_without_touching_target(self) -> None:
        outside = Path(self.directory.name) / "outside.xml"
        outside.write_text(MANIFEST)
        self.manifest.unlink()
        self.manifest.symlink_to(outside)
        with self.assertRaises(ValueError):
            customize(self.project)
        self.assertEqual(outside.read_text(), MANIFEST)

    def test_manifest_policy_changes_do_not_partially_write_activity(self) -> None:
        permission = '<uses-permission android:name="' + NETWORK_STATE + '" />'
        unsafe = [MANIFEST.replace("</manifest>", permission * 2 + "</manifest>"),
                  MANIFEST.replace("</manifest>", permission.replace("uses-permission", "uses-permission-sdk-23") + "</manifest>"),
                  MANIFEST.replace('android:exported="true"', 'android:windowSoftInputMode="adjustPan"'),
                  MANIFEST.replace(".MainActivity", ".OtherActivity"),
                  MANIFEST.replace("</application>", '<activity android:name=".Other" /></application>')]
        for manifest in unsafe:
            with self.subTest(manifest=manifest):
                self.manifest.write_text(manifest)
                before = self.activity.read_bytes()
                with self.assertRaises(ValueError):
                    customize(self.project)
                self.assertEqual(self.activity.read_bytes(), before)
                self.assertEqual(self.manifest.read_text(), manifest)


if __name__ == "__main__":
    unittest.main()
