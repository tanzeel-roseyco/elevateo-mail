"""Deployment admission: validate all credentials before Docker or remote provider access."""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import re
import time
from collections.abc import Mapping
from urllib.parse import urlsplit
from uuid import UUID

IMAGES = ("ELEVATEO_PRODUCTION_IMAGE", "ELEVATEO_MCP_IMAGE", "ELEVATEO_OPERATIONS_IMAGE",
          "ELEVATEO_BACKUP_HELPER_IMAGE")
PASSWORDS = ("POSTGRES_PASSWORD", "AUTH_DB_PASSWORD", "REST_DB_PASSWORD", "STORAGE_DB_PASSWORD",
             "MIGRATOR_DB_PASSWORD", "API_DB_PASSWORD", "WORKER_DB_PASSWORD", "ATTACHMENT_GATEWAY_DB_PASSWORD")
REQUIRED = (*IMAGES, *PASSWORDS, "SECRET_KEY_BASE", "JWT_SECRET", "ANON_KEY", "SERVICE_ROLE_KEY",
            "ELEVATEO_SESSION_KEY_BASE64", "ELEVATEO_ATTACHMENT_GATEWAY_HMAC_KEY_BASE64",
            "ELEVATEO_AUTHENTIK_ISSUER", "ELEVATEO_AUTHENTIK_GROUP", "ELEVATEO_AUTHENTIK_API_TOKEN",
            "ELEVATEO_AUTHENTIK_CLIENT_ID", "ELEVATEO_AUTHENTIK_CLIENT_SECRET", "ELEVATEO_ATTACHMENT_BUCKET",
            "ELEVATEO_MCP_HTTP_HOST", "ELEVATEO_MOX_HOSTNAME", "ELEVATEO_MOX_IPV4", "ELEVATEO_MAIL_DOMAINS",
            "ELEVATEO_WORKSPACE_DOMAINS", "ELEVATEO_MOX_TLS_CERT_BASE64", "ELEVATEO_MOX_TLS_KEY_BASE64",
            "ELEVATEO_APPROVED_ASSIGNMENTS", "ELEVATEO_EGRESS_ID")


class AdmissionError(ValueError):
    pass


def require(condition: bool, name: str) -> None:
    if not condition:
        raise AdmissionError("invalid or missing " + name)


def validate(env: Mapping[str, str]) -> None:
    # AIDEV-NOTE: Error messages contain setting names only, never credential values or parsed token claims.
    for name in REQUIRED:
        value = env.get(name, "")
        require(bool(value) and len(value) <= 65536 and not any(ord(c) < 32 for c in value), name)
    for name in IMAGES:
        require(re.fullmatch(r"[a-zA-Z0-9][a-zA-Z0-9._:/-]*@sha256:[0-9a-f]{64}", env[name]) is not None, name)
    for name in PASSWORDS:
        require(re.fullmatch(r"[A-Za-z0-9_-]{32,128}", env[name]) is not None, name)
    require(len(set(env[name] for name in PASSWORDS)) == len(PASSWORDS), "distinct database passwords")
    require(len(env["SECRET_KEY_BASE"]) >= 64, "SECRET_KEY_BASE")
    require(len(env["JWT_SECRET"]) >= 32, "JWT_SECRET")
    for name in ("ELEVATEO_SESSION_KEY_BASE64", "ELEVATEO_ATTACHMENT_GATEWAY_HMAC_KEY_BASE64"):
        try:
            require(len(base64.b64decode(env[name], validate=True)) == 32, name)
        except ValueError:
            raise AdmissionError("invalid " + name) from None
    for name, role in (("ANON_KEY", "anon"), ("SERVICE_ROLE_KEY", "service_role")):
        try:
            header, payload, signature = env[name].split(".")
            decode = lambda value: base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))
            claims = json.loads(decode(payload))
            require(json.loads(decode(header)).get("alg") == "HS256" and claims.get("role") == role, name)
            # AIDEV-NOTE: Valid signatures alone admit expired credentials; bool is not an integer NumericDate.
            now = time.time()
            require(type(claims.get("exp")) is int and claims["exp"] > now, name)
            require("nbf" not in claims or (type(claims["nbf"]) is int and claims["nbf"] <= now), name)
            expected = hmac.new(env["JWT_SECRET"].encode(), (header + "." + payload).encode(), hashlib.sha256).digest()
            require(hmac.compare_digest(expected, decode(signature)), name)
        except (ValueError, TypeError, AttributeError):
            raise AdmissionError("invalid " + name) from None
    try:
        issuer = urlsplit(env["ELEVATEO_AUTHENTIK_ISSUER"])
        require(issuer.scheme == "https" and bool(issuer.hostname) and issuer.port in (None, 443)
                and not issuer.username and not issuer.password and not issuer.query and not issuer.fragment
                and re.fullmatch(r"/application/o/[a-z0-9-]+/", issuer.path) is not None, "ELEVATEO_AUTHENTIK_ISSUER")
    except ValueError:
        raise AdmissionError("invalid ELEVATEO_AUTHENTIK_ISSUER") from None
    for name in ("ELEVATEO_AUTHENTIK_GROUP", "ELEVATEO_EGRESS_ID"):
        try:
            require(str(UUID(env[name])) == env[name] and UUID(env[name]).int != 0, name)
        except ValueError:
            raise AdmissionError("invalid " + name) from None
    require(re.fullmatch(r"[A-Za-z0-9_-]{32,4096}", env["ELEVATEO_AUTHENTIK_API_TOKEN"]) is not None,
            "ELEVATEO_AUTHENTIK_API_TOKEN")
    require(re.fullmatch(r"[a-zA-Z0-9.-]+(?::[0-9]{1,5})?", env["ELEVATEO_MCP_HTTP_HOST"]) is not None,
            "ELEVATEO_MCP_HTTP_HOST")
    require(re.fullmatch(r"[a-z0-9][a-z0-9-]{2,62}", env["ELEVATEO_ATTACHMENT_BUCKET"]) is not None,
            "ELEVATEO_ATTACHMENT_BUCKET")
    require(env.get("ELEVATEO_OUTBOUND_MODE", "held") in ("held", "resend"), "ELEVATEO_OUTBOUND_MODE")
    require(env.get("ELEVATEO_OUTBOUND_HOLD", "true") == "true", "ELEVATEO_OUTBOUND_HOLD (deployment stays held)")
    require(env.get("ELEVATEO_PROVISIONING_ENABLED", "false") in ("true", "false"), "ELEVATEO_PROVISIONING_ENABLED")
    if env.get("ELEVATEO_OUTBOUND_MODE") == "resend":
        for name in ("RESEND_API_KEY", "RESEND_WEBHOOK_SECRET", "ELEVATEO_RESEND_FROM_DOMAIN"):
            require(bool(env.get(name)), name)
