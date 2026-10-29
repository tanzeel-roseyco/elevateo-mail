"""Register the single pinned Authentik provider through private GoTrue administration."""
from __future__ import annotations

import http.client
import json
import os
import re
from collections.abc import Mapping


class ProviderError(RuntimeError):
    pass


def settings(env: Mapping[str, str]) -> dict[str, object]:
    from urllib.parse import urlsplit
    issuer = env.get("ELEVATEO_AUTHENTIK_ISSUER", "")
    # AIDEV-NOTE: URL parsing errors may echo credential-like port values; never propagate those diagnostics.
    try:
        parsed = urlsplit(issuer)
        if (parsed.scheme != "https" or not parsed.hostname or parsed.port not in (None, 443)
                or parsed.username or parsed.password or parsed.query or parsed.fragment
                or re.fullmatch(r"/application/o/[a-z0-9-]+/", parsed.path) is None
                or any(ord(char) < 33 for char in issuer)):
            raise ValueError("issuer rejected")
    except ValueError:
        raise ProviderError("invalid pinned Authentik issuer") from None
    values = [env.get(name, "") for name in ("ELEVATEO_AUTHENTIK_CLIENT_ID", "ELEVATEO_AUTHENTIK_CLIENT_SECRET")]
    if any(not value or len(value) > 4096 or any(ord(char) < 32 for char in value) for value in values):
        raise ProviderError("missing or invalid OIDC credentials")
    return {"provider_type": "oidc", "identifier": "custom:authentik", "name": "Authentik",
            "client_id": values[0], "client_secret": values[1], "issuer": issuer,
            "scopes": ["openid", "profile", "email"], "pkce_enabled": True,
            "enabled": True, "email_optional": False, "skip_nonce_check": False}


def request(method: str, path: str, token: str, body: dict[str, object] | None = None) -> tuple[int, object]:
    # AIDEV-NOTE: Fixed private origin, no redirects/proxies; admin credentials never reach the public callback.
    connection = http.client.HTTPConnection("auth", 9999, timeout=8)
    try:
        connection.request(method, path, None if body is None else json.dumps(body),
                           {"Authorization": "Bearer " + token, "Content-Type": "application/json"})
        response = connection.getresponse()
        raw = response.read(262145)
        if len(raw) > 262144:
            raise ProviderError("provider administration response exceeded limit")
        return response.status, json.loads(raw)
    except (OSError, ValueError, http.client.HTTPException):
        raise ProviderError("private provider administration failed") from None
    finally:
        connection.close()


def configure(env: Mapping[str, str]) -> None:
    desired = settings(env)
    token = env.get("SERVICE_ROLE_KEY", "")
    if not token or len(token) > 8192 or any(ord(char) < 33 for char in token):
        raise ProviderError("missing private Auth administrator token")
    # AIDEV-NOTE: Refuse fallback IdPs instead of silently retaining alternative production login authority.
    status, inventory = request("GET", "/admin/custom-providers", token)
    providers = inventory.get("providers") if isinstance(inventory, dict) else None
    if status != 200 or not isinstance(providers, list) or len(providers) > 1000:
        raise ProviderError("provider inventory unavailable")
    for provider in providers:
        if (not isinstance(provider, dict) or not isinstance(provider.get("identifier"), str)
                or type(provider.get("enabled")) is not bool):
            raise ProviderError("invalid provider inventory")
        if provider["enabled"] and provider["identifier"] != "custom:authentik":
            raise ProviderError("another custom provider is enabled")
    status, current = request("GET", "/admin/custom-providers/custom:authentik", token)
    if status not in (200, 404):
        raise ProviderError("provider lookup failed")
    if status == 200:
        if not isinstance(current, dict) or current.get("provider_type") != "oidc":
            raise ProviderError("existing provider has incompatible type")
        # AIDEV-NOTE: Updating the pinned identifier is idempotent and rotates credentials without adding fallback IdPs.
        desired.pop("provider_type")
        desired.pop("identifier")
    method, path = ("PUT", "/admin/custom-providers/custom:authentik") if status == 200 else ("POST", "/admin/custom-providers")
    status, _ = request(method, path, token, desired)
    if status not in (200, 201):
        raise ProviderError("provider registration failed")


if __name__ == "__main__":
    try:
        configure(os.environ)
    except ProviderError as error:
        raise SystemExit(str(error)) from None
