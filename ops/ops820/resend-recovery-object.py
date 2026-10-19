"""Bounded private-object recovery fixture, executed inside the existing drill container."""
from __future__ import annotations
import hashlib
import json
import os
import sys
import urllib.request

# AIDEV-NOTE: Exact marker and key couple to the committed draft metadata recovery fixture.
KEY = "drafts/10400000-0000-4000-8000-000000000001/10400000-0000-4000-8000-000000000005"
BODY = b"ops1040-private-draft-marker"
BASE = "http://storage:5000"
BUCKET = "ops1040-recovery"

def request(path: str, data: bytes | None = None, content_type: str = "application/json") -> bytes:
    headers = {"Authorization": "Bearer " + os.environ["SERVICE_ROLE_KEY"], "Content-Type": content_type}
    req = urllib.request.Request(BASE + path, data=data, headers=headers, method="POST" if data is not None else "GET")
    with urllib.request.urlopen(req, timeout=20) as response:
        result = response.read(65537)
        if len(result) > 65536:
            raise ValueError("recovery response exceeds bound")
        return result

if sys.argv[1:] == ["create"]:
    request("/bucket", json.dumps({"id": BUCKET, "name": BUCKET, "public": False}).encode())
    request("/object/" + BUCKET + "/" + KEY, BODY, "text/plain")
elif sys.argv[1:] == ["verify"]:
    bucket = json.loads(request("/bucket/" + BUCKET))
    restored = request("/object/" + BUCKET + "/" + KEY)
    if bucket.get("public") is not False or restored != BODY or hashlib.sha256(restored).hexdigest() != "cae81b29dfd7cb6103a87f58e7276abd897ee3844e4c2242554bfb6831ad40d4":
        raise ValueError("private draft recovery mismatch")
    print("PASS restored private draft bytes and digest")
else:
    raise ValueError("invalid recovery phase")
