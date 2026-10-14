"""Permission oracle cases; Soren runs them in fleet Docker only."""

import unittest

from verify_permissions import verify_permissions, verify_receiver_declaration


def merged_manifest(protection: str = "signature", package: str = "com.elevateo.mail.fixture") -> str:
    permission = f"{package}.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION"
    return (
        '<manifest xmlns:android="http://schemas.android.com/apk/res/android">'
        f'<permission android:name="{permission}" android:protectionLevel="{protection}" />'
        '<uses-permission android:name="android.permission.INTERNET" />'
        f'<uses-permission android:name="{permission}" />'
        '</manifest>'
    )


class VerifyPermissionsTest(unittest.TestCase):
    def test_allows_internet_and_androidx_signature_receiver(self) -> None:
        verify_permissions(
            "android.permission.INTERNET\n"
            "com.elevateo.mail.fixture.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION\n"
        )

    def test_rejects_extra_platform_permission(self) -> None:
        with self.assertRaises(ValueError):
            verify_permissions(
                "android.permission.INTERNET\n"
                "android.permission.CAMERA\n"
                "com.elevateo.mail.fixture.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION\n"
            )

    def test_rejects_empty_aapt_permission_output(self) -> None:
        with self.assertRaises(ValueError):
            verify_permissions("")

    def test_rejects_lookalike_receiver_permission(self) -> None:
        with self.assertRaises(ValueError):
            verify_permissions(
                "android.permission.INTERNET\n"
                "com.elevateo.mail.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION\n"
            )

    def test_requires_signature_receiver_declaration(self) -> None:
        verify_receiver_declaration(merged_manifest())
        with self.assertRaises(ValueError):
            verify_receiver_declaration(merged_manifest(protection="normal"))

    def test_rejects_receiver_namespace_substitution(self) -> None:
        with self.assertRaises(ValueError):
            verify_receiver_declaration(merged_manifest(package="com.elevateo.mail"))

    def test_rejects_missing_and_duplicate_receiver_declarations(self) -> None:
        manifest = merged_manifest()
        declaration = (
            '<permission '
            'android:name="com.elevateo.mail.fixture.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION" '
            'android:protectionLevel="signature" />'
        )
        with self.assertRaises(ValueError):
            verify_receiver_declaration(manifest.replace(declaration, ""))
        with self.assertRaises(ValueError):
            verify_receiver_declaration(manifest.replace(declaration, declaration * 2))

    def test_rejects_sdk_specific_extra_manifest_permission(self) -> None:
        manifest = merged_manifest().replace(
            '</manifest>',
            '<uses-permission-sdk-23 android:name="android.permission.CAMERA" />'
            '</manifest>',
        )
        with self.assertRaises(ValueError):
            verify_receiver_declaration(manifest)


if __name__ == "__main__":
    unittest.main()
