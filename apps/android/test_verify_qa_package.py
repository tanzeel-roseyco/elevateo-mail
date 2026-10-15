"""Reject permission, TLS and identity regressions in actual decoded APK inputs."""
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from zipfile import ZipFile

from verify_qa_package import verify_ca, verify_manifest, verify_network

MANIFEST = '''<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="com.elevateo.mail.qa">
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="com.elevateo.mail.qa.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION" />
<permission android:name="com.elevateo.mail.qa.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION" android:protectionLevel="signature" />
<application android:debuggable="true" android:usesCleartextTraffic="false"
android:networkSecurityConfig="@xml/elevateo_qa_network_security" /></manifest>'''
NETWORK = (Path(__file__).parent / "qa/elevateo_qa_network_security.xml").read_text(encoding="utf-8")
CA = b"-----BEGIN CERTIFICATE-----\nsynthetic parser fixture\n-----END CERTIFICATE-----\n"


class QaPackageTest(unittest.TestCase):
    def test_expected_identity_and_policy(self) -> None:
        verify_manifest(MANIFEST)
        verify_network(NETWORK)

    def test_manifest_rejects_permission_identity_and_cleartext_changes(self) -> None:
        for old, new in [("com.elevateo.mail.qa", "com.elevateo.mail"), ('debuggable="true"', 'debuggable="false"'),
                         ('usesCleartextTraffic="false"', 'usesCleartextTraffic="true"'),
                         ("@xml/elevateo_qa_network_security", "@xml/other"), ("signature", "normal"),
                         ("android.permission.INTERNET", "android.permission.CAMERA"),
                         ("</manifest>", '<uses-permission android:name="android.permission.CAMERA" /></manifest>'),
                         ("</manifest>", '<application /></manifest>'),
                         ("</manifest>", '<action android:name="android.intent.action.VIEW" /></manifest>')]:
            with self.subTest(new=new), self.assertRaises(ValueError):
                verify_manifest(MANIFEST.replace(old, new))

    def test_network_rejects_broad_or_changed_trust(self) -> None:
        for old, new in [('includeSubdomains="false"', 'includeSubdomains="true"'),
                         ('cleartextTrafficPermitted="false"', 'cleartextTrafficPermitted="true"'),
                         ('src="system"', 'src="user"'), ('src="@raw/elevateo_qa_ca"', 'src="system"'),
                         ("elevateo.qa.internal", "attacker.invalid"),
                         ("</network-security-config>", "<debug-overrides /></network-security-config>")]:
            with self.subTest(new=new), self.assertRaises(ValueError):
                verify_network(NETWORK.replace(old, new))

    def test_ca_matches_exactly(self) -> None:
        with TemporaryDirectory() as directory:
            base = Path(directory)
            cert, apk = base / "ca.pem", base / "app.apk"
            cert.write_bytes(CA)
            with ZipFile(apk, "w") as archive:
                archive.writestr("res/raw/elevateo_qa_ca.pem", CA)
            verify_ca(apk, cert)
            cert.write_bytes(CA + b"different")
            with self.assertRaises(ValueError):
                verify_ca(apk, cert)

    def test_ca_missing_wrong_path_or_private_material_rejected(self) -> None:
        # AIDEV-NOTE: A PEM prefix must pass first, or this test never reaches the private-material guard.
        for name, content in [("other.pem", CA), ("res/raw/elevateo_qa_ca.pem", CA + b"PRIVATE KEY")]:
            with self.subTest(name=name), TemporaryDirectory() as directory:
                base = Path(directory)
                cert, apk = base / "ca.pem", base / "app.apk"
                cert.write_bytes(content)
                with ZipFile(apk, "w") as archive:
                    archive.writestr(name, content)
                with self.assertRaises(ValueError):
                    verify_ca(apk, cert)


if __name__ == "__main__":
    unittest.main()
