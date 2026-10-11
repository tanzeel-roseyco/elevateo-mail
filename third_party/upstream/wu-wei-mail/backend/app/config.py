"""Application configuration loaded from environment variables."""

from functools import lru_cache
import logging
from urllib.parse import urlparse

from pydantic import model_validator
from pydantic_settings import BaseSettings

logger = logging.getLogger(__name__)


class Settings(BaseSettings):
    # Database
    DATABASE_URL: str = "postgresql+asyncpg://user:pass@localhost:5432/wuweimail"

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"

    # JWT
    JWT_SECRET: str = "change-me-in-production"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 1440

    # OAuth - Google
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    GOOGLE_REDIRECT_URI: str = ""

    # OAuth - Microsoft
    MICROSOFT_CLIENT_ID: str = ""
    MICROSOFT_CLIENT_SECRET: str = ""
    MICROSOFT_REDIRECT_URI: str = ""

    # CORS
    FRONTEND_URL: str = "http://localhost:3000"
    CORS_ORIGINS: str = ""

    # Encryption for secrets at rest (SMTP passwords, OAuth tokens)
    ENCRYPTION_KEY: str = ""

    # AI (OpenRouter)
    OPENROUTER_API_KEY: str = ""
    OPENROUTER_BASE_URL: str = "https://openrouter.ai/api/v1"
    OPENROUTER_MODEL: str = "google/gemini-2.5-flash"
    OPENROUTER_TEMPERATURE: float = 0.2
    OPENROUTER_MAX_TOKENS: int = 2000
    OPENROUTER_APP_NAME: str = "LeadAgent"
    OPENROUTER_APP_URL: str = "http://localhost:3000"
    OPENROUTER_TIMEOUT_SECONDS: int = 90

    # Tools
    SERPER_API_KEY: str = ""
    ANYMAILFINDER_API_KEY: str = ""

    # App
    APP_NAME: str = "Wu Wei Mail"
    DEBUG: bool = True
    BASE_URL: str = "http://localhost:8000"

    # Webhook / tracking security
    WEBHOOK_SIGNING_SECRET: str = ""
    CLICK_SIGNING_SECRET: str = ""

    # Feature flags - Prospecting
    PROSPECTING_ENABLED: bool = True
    PROSPECTING_EXTERNAL_INSTANTLY_ENABLED: bool = False

    # Prospecting - Website Validation
    PROSPECTING_VALIDATION_MODEL: str = "openai/gpt-4o-mini"
    PROSPECTING_VALIDATION_ENABLED: bool = True
    PROSPECTING_VALIDATION_HTTPX_TIMEOUT: int = 5
    PROSPECTING_VALIDATION_PLAYWRIGHT_TIMEOUT: int = 10
    PROSPECTING_VALIDATION_MAX_CHARS: int = 3000
    PROSPECTING_VALIDATION_PLAYWRIGHT_CONCURRENCY: int = 5

    # Feature flags - LinkedIn / Multichannel Outreach
    LINKEDIN_OUTREACH_V1: bool = False
    UNIPILE_API_KEY: str = ""
    UNIPILE_BASE_URL: str = "https://api.unipile.com/api/v1"

    # Feature flags - Warmup
    WARMUP_ENABLED: bool = False
    WARMUP_PROVIDER: str = "mailreach"
    WARMUP_PROVIDER_BASE_URL: str = "https://app.mailreach.co/api/v1"
    MAILREACH_API_KEY: str = ""

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8", "extra": "ignore"}

    def cors_origins(self) -> list[str]:
        """Return normalized CORS origins from env plus sensible defaults."""
        origins: list[str] = []
        if self.CORS_ORIGINS:
            origins.extend(
                origin.strip()
                for origin in self.CORS_ORIGINS.split(",")
                if origin.strip()
            )
        if self.FRONTEND_URL:
            origins.append(self.FRONTEND_URL.strip())
        if self.DEBUG:
            origins.append("http://localhost:3000")

        deduped: list[str] = []
        seen: set[str] = set()
        for origin in origins:
            if origin not in seen:
                seen.add(origin)
                deduped.append(origin)
        return deduped

    @model_validator(mode="after")
    def _validate_security_defaults(self) -> "Settings":
        if self.JWT_SECRET == "change-me-in-production":
            if not self.DEBUG:
                raise ValueError(
                    "JWT_SECRET must be changed from default in production. "
                    "Generate one with: python -c \"import secrets; print(secrets.token_urlsafe(64))\""
                )
            logger.warning("JWT_SECRET is using the insecure default - change before deploying")

        if not self.ENCRYPTION_KEY:
            if not self.DEBUG:
                raise ValueError(
                    "ENCRYPTION_KEY is required in production for encrypting SMTP passwords "
                    "and OAuth tokens. Generate one with: python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\""
                )
            logger.warning("ENCRYPTION_KEY not set - sensitive values may be stored in plain text")

        if not self.DEBUG:
            parsed = urlparse(self.BASE_URL)
            if parsed.scheme not in ("http", "https") or not parsed.netloc:
                raise ValueError("BASE_URL must be a valid absolute URL in production")
            if (parsed.hostname or "").lower() in {"localhost", "127.0.0.1", "0.0.0.0"}:
                raise ValueError("BASE_URL cannot point to localhost in production")

            if not self.CLICK_SIGNING_SECRET:
                raise ValueError(
                    "CLICK_SIGNING_SECRET is required in production to prevent open-redirect abuse. "
                    "Generate one with: python -c \"import secrets; print(secrets.token_urlsafe(32))\""
                )
            if len(self.CLICK_SIGNING_SECRET) < 16:
                raise ValueError("CLICK_SIGNING_SECRET must be at least 16 characters in production")

            if not self.WEBHOOK_SIGNING_SECRET:
                raise ValueError(
                    "WEBHOOK_SIGNING_SECRET is required in production to verify inbound webhooks. "
                    "Generate one with: python -c \"import secrets; print(secrets.token_urlsafe(32))\""
                )
            if len(self.WEBHOOK_SIGNING_SECRET) < 16:
                raise ValueError("WEBHOOK_SIGNING_SECRET must be at least 16 characters in production")

        return self


@lru_cache()
def get_settings() -> Settings:
    return Settings()
