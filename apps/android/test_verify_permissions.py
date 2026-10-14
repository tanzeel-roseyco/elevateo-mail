"""Permission oracle cases; Soren runs them in fleet Docker only."""

import unittest

from verify_permissions import verify_permissions


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

    def test_rejects_lookalike_receiver_permission(self) -> None:
        with self.assertRaises(ValueError):
            verify_permissions(
                "android.permission.INTERNET\n"
                "com.elevateo.mail.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION\n"
            )


if __name__ == "__main__":
    unittest.main()
