"""Tests for settings helpers used in production hardening."""

from app.config import Settings


class TestCorsOrigins:
    def test_cors_origins_parses_csv_and_dedupes(self):
        settings = Settings(
            DEBUG=True,
            FRONTEND_URL="https://app.example.com",
            CORS_ORIGINS="https://api.example.com, https://app.example.com , https://ops.example.com",
        )

        assert settings.cors_origins() == [
            "https://api.example.com",
            "https://app.example.com",
            "https://ops.example.com",
            "http://localhost:3000",
        ]

    def test_cors_origins_handles_empty_csv(self):
        settings = Settings(
            DEBUG=False,
            FRONTEND_URL="https://app.example.com",
            CORS_ORIGINS="",
            JWT_SECRET="production-secret",
            ENCRYPTION_KEY="iAjfMwHXlGTF5Z-OPEGTY_Pn0rtJA8gbwPTVrqZHgRQ=",
            BASE_URL="https://api.example.com",
            CLICK_SIGNING_SECRET="0123456789abcdef",
            WEBHOOK_SIGNING_SECRET="fedcba9876543210",
        )

        assert settings.cors_origins() == ["https://app.example.com"]


class TestSettingsEnvCompatibility:
    def test_extra_env_keys_are_ignored(self):
        settings = Settings(
            DEBUG=True,
            APP_VERSION="1.0.0",
            ALLOWED_HOSTS="mail.example.com",
            REPLY_AI_CATEGORIZATION="true",
        )

        assert settings.DEBUG is True
