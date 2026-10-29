"""Create one private attachment bucket without widening an existing bucket's policy."""
from __future__ import annotations

import http.client
import json
import os
import re
from collections.abc import Mapping


class StorageError(RuntimeError):
    pass


def request(method: str, path: str, token: str, body: dict[str, object] | None = None) -> tuple[int, object]:
    # AIDEV-NOTE: Fixed private origin and bounded responses keep service authority away from redirects and logs.
    connection = http.client.HTTPConnection("storage", 5000, timeout=8)
    try:
        connection.request(method, path, None if body is None else json.dumps(body),
                           {"Authorization": "Bearer " + token, "Content-Type": "application/json"})
        response = connection.getresponse()
        raw = response.read(65537)
        if len(raw) > 65536:
            raise StorageError("storage administration response exceeded limit")
        return response.status, json.loads(raw)
    except (OSError, ValueError, http.client.HTTPException):
        raise StorageError("private storage administration failed") from None
    finally:
        connection.close()


def configure(env: Mapping[str, str]) -> None:
    bucket, token = env.get("ELEVATEO_ATTACHMENT_BUCKET", ""), env.get("SERVICE_ROLE_KEY", "")
    if re.fullmatch(r"[a-z0-9][a-z0-9-]{2,62}", bucket) is None or not 32 <= len(token) <= 4096 or re.fullmatch(r"[A-Za-z0-9._~+/-]+=*", token) is None:
        raise StorageError("invalid private storage configuration")
    status, current = request("GET", "/bucket/" + bucket, token)
    missing = status == 404 or (status == 400 and isinstance(current, dict) and
                               (current.get("code") == "NoSuchBucket" or str(current.get("statusCode")) == "404"))
    if missing:
        # AIDEV-NOTE: Never update a conflicting bucket; read back creation so a concurrent creator cannot widen access.
        created, _ = request("POST", "/bucket", token, {"id": bucket, "name": bucket, "public": False})
        if created not in (200, 201, 400, 409):
            raise StorageError("private bucket creation failed")
        status, current = request("GET", "/bucket/" + bucket, token)
    if status != 200 or not isinstance(current, dict) or current.get("id") != bucket or current.get("public") is not False:
        raise StorageError("private bucket unavailable or conflicting")


if __name__ == "__main__":
    try:
        configure(os.environ)
    except StorageError as error:
        raise SystemExit(str(error)) from None
