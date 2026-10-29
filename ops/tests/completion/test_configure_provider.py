"""Private OIDC registration boundaries; all HTTP calls are replaced with a recorder."""
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "production" / "authentik"))
import configure_provider as provider


class ProviderTest(unittest.TestCase):
    def setUp(self) -> None:
        self.env = {"ELEVATEO_AUTHENTIK_ISSUER": "https://id.example.net/application/o/mail/",
                    "ELEVATEO_AUTHENTIK_CLIENT_ID": "fixture-client", "ELEVATEO_AUTHENTIK_CLIENT_SECRET": "fixture-secret",
                    "SERVICE_ROLE_KEY": "fixture-admin"}

    def test_registers_when_no_other_enabled_provider(self) -> None:
        inventory = {"providers": [{"identifier": "custom:retired", "enabled": False}]}
        with patch.object(provider, "request", side_effect=[(200, inventory), (404, {}), (201, {})]) as request:
            provider.configure(self.env)
        self.assertEqual("POST", request.call_args_list[-1].args[0])
        self.assertEqual("custom:authentik", request.call_args_list[-1].args[3]["identifier"])

    def test_updates_existing_authentik(self) -> None:
        inventory = {"providers": [{"identifier": "custom:authentik", "enabled": True}]}
        with patch.object(provider, "request", side_effect=[(200, inventory), (200, {"provider_type": "oidc"}), (200, {})]) as request:
            provider.configure(self.env)
        self.assertEqual("PUT", request.call_args_list[-1].args[0])

    def test_other_enabled_provider_refuses_before_registration(self) -> None:
        with patch.object(provider, "request", return_value=(200, {"providers": [{"identifier": "custom:other", "enabled": True}]})) as request:
            with self.assertRaises(provider.ProviderError):
                provider.configure(self.env)
        self.assertEqual(1, request.call_count)

    def test_invalid_inventory_refuses_before_registration(self) -> None:
        for value in (None, {}, {"providers": None}, {"providers": [{"identifier": "custom:other"}]}):
            with patch.object(provider, "request", return_value=(200, value)) as request:
                with self.assertRaises(provider.ProviderError):
                    provider.configure(self.env)
                self.assertEqual(1, request.call_count)

    def test_malformed_issuer_is_redacted_without_http(self) -> None:
        for issuer in ("https://id.example.net:secret-marker/application/o/mail/", "https://[secret-marker"):
            with patch.object(provider, "request") as request, self.assertRaises(provider.ProviderError) as caught:
                provider.configure({**self.env, "ELEVATEO_AUTHENTIK_ISSUER": issuer})
            request.assert_not_called()
            self.assertNotIn("secret-marker", str(caught.exception))


if __name__ == "__main__":
    unittest.main()
