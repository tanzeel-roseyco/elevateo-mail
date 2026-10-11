#!/usr/bin/env python3
"""End-to-end warmup flow test — runs against a live API server.

Usage:
    python scripts/test_warmup_e2e.py [--base-url http://localhost:8000]

Requires:
    - Postgres + Redis running (docker compose up -d)
    - Migrations applied (alembic upgrade head)
    - API server running (uvicorn app.main:app)
"""

from __future__ import annotations

import argparse
import sys
import uuid
from typing import Any

import httpx

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

DEFAULT_BASE_URL = "http://localhost:8000"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

class E2EClient:
    """Thin wrapper around httpx for the E2E test."""

    def __init__(self, base_url: str):
        self.base_url = base_url.rstrip("/")
        self.token: str | None = None
        self.client = httpx.Client(base_url=self.base_url, timeout=30)

    def _headers(self) -> dict[str, str]:
        h: dict[str, str] = {"Content-Type": "application/json"}
        if self.token:
            h["Authorization"] = f"Bearer {self.token}"
        return h

    def post(self, path: str, json: dict | None = None) -> httpx.Response:
        return self.client.post(path, json=json, headers=self._headers())

    def get(self, path: str, params: dict | None = None) -> httpx.Response:
        return self.client.get(path, params=params, headers=self._headers())

    def close(self):
        self.client.close()


def step(name: str):
    print(f"\n{'='*60}")
    print(f"  STEP: {name}")
    print(f"{'='*60}")


def check(condition: bool, msg: str):
    if condition:
        print(f"  [PASS] {msg}")
    else:
        print(f"  [FAIL] {msg}")
        raise AssertionError(msg)


# ---------------------------------------------------------------------------
# Test flow
# ---------------------------------------------------------------------------

def run_e2e(base_url: str):
    c = E2EClient(base_url)
    unique = uuid.uuid4().hex[:8]
    email = f"warmup-e2e-{unique}@test.local"
    password = "TestPass123!"
    results: list[tuple[str, bool]] = []

    try:
        # 1. Register
        step("Register user")
        resp = c.post("/api/auth/register", json={
            "email": email,
            "password": password,
            "full_name": "Warmup E2E",
            "workspace_name": f"e2e-{unique}",
        })
        check(resp.status_code == 200, f"Register returned {resp.status_code}")
        data = resp.json()
        c.token = data["access_token"]
        workspace_id = data["workspace_id"]
        print(f"  Token obtained, workspace={workspace_id}")
        results.append(("Register", True))

        # 2. Create email account
        step("Create email account")
        resp = c.post("/api/accounts/", json={
            "email": f"sender-{unique}@test.local",
            "display_name": "E2E Sender",
            "smtp_host": "smtp.test.local",
            "smtp_port": 587,
            "smtp_username": f"sender-{unique}@test.local",
            "smtp_password": "dummy-password",
            "daily_limit": 100,
        })
        check(resp.status_code == 201, f"Create account returned {resp.status_code}")
        account_id = resp.json()["id"]
        print(f"  Account created: {account_id}")
        results.append(("Create account", True))

        # 3. Create warmup program
        step("Create warmup program")
        resp = c.post("/api/warmup/program", json={
            "name": "E2E Test Program",
            "ramp_increment": 3,
            "target_volume": 50,
            "dns_required": False,
        })
        check(resp.status_code == 201, f"Create program returned {resp.status_code}")
        print(f"  Program created: {resp.json().get('id')}")
        results.append(("Create program", True))

        # 4. Enroll account in warmup
        step("Enroll account (start warmup)")
        resp = c.post(f"/api/warmup/accounts/{account_id}/start", json={
            "target_volume": 50,
        })
        check(resp.status_code == 200, f"Enroll returned {resp.status_code}")
        status = resp.json()
        check(status["phase"] == "ramping", f"Phase is '{status['phase']}', expected 'ramping'")
        print(f"  Enrolled: phase={status['phase']}, volume={status['current_allowed_volume']}")
        results.append(("Enroll", True))

        # 5. Check status
        step("Check status (should be ramping)")
        resp = c.get(f"/api/warmup/accounts/{account_id}/status")
        check(resp.status_code == 200, f"Status returned {resp.status_code}")
        status = resp.json()
        check(status["phase"] == "ramping", f"Phase is '{status['phase']}', expected 'ramping'")
        results.append(("Status (ramping)", True))

        # 6. Pause
        step("Pause warmup")
        resp = c.post(f"/api/warmup/accounts/{account_id}/pause", json={
            "reason": "E2E test pause",
        })
        check(resp.status_code == 200, f"Pause returned {resp.status_code}")
        status = resp.json()
        check(status["phase"] == "paused", f"Phase is '{status['phase']}', expected 'paused'")
        results.append(("Pause", True))

        # 7. Check status (paused)
        step("Check status (should be paused)")
        resp = c.get(f"/api/warmup/accounts/{account_id}/status")
        check(resp.status_code == 200, f"Status returned {resp.status_code}")
        status = resp.json()
        check(status["phase"] == "paused", f"Phase is '{status['phase']}', expected 'paused'")
        results.append(("Status (paused)", True))

        # 8. Resume
        step("Resume warmup")
        resp = c.post(f"/api/warmup/accounts/{account_id}/resume")
        check(resp.status_code == 200, f"Resume returned {resp.status_code}")
        status = resp.json()
        check(status["phase"] == "ramping", f"Phase is '{status['phase']}', expected 'ramping'")
        results.append(("Resume", True))

        # 9. Check status (ramping again)
        step("Check status (should be ramping again)")
        resp = c.get(f"/api/warmup/accounts/{account_id}/status")
        check(resp.status_code == 200, f"Status returned {resp.status_code}")
        status = resp.json()
        check(status["phase"] == "ramping", f"Phase is '{status['phase']}', expected 'ramping'")
        results.append(("Status (ramping again)", True))

        # 10. Timeline
        step("Get timeline (expect 3 actions: enroll, pause, resume)")
        resp = c.get(f"/api/warmup/accounts/{account_id}/timeline")
        check(resp.status_code == 200, f"Timeline returned {resp.status_code}")
        actions = resp.json()
        action_types = [a["action_type"] for a in actions]
        # Newest first, so: resume, pause, enroll
        check(len(actions) >= 3, f"Got {len(actions)} actions, expected >= 3")
        check("enroll" in action_types, "'enroll' in timeline")
        check("pause" in action_types, "'pause' in timeline")
        check("resume" in action_types, "'resume' in timeline")
        results.append(("Timeline", True))

    except AssertionError as e:
        results.append((str(e), False))
    except httpx.ConnectError:
        print(f"\n  [ERROR] Cannot connect to {base_url}")
        print("  Make sure the API server is running: uvicorn app.main:app --reload")
        sys.exit(1)
    except Exception as e:
        print(f"\n  [ERROR] Unexpected error: {e}")
        results.append((str(e), False))
    finally:
        c.close()

    # Summary
    print(f"\n{'='*60}")
    print("  SUMMARY")
    print(f"{'='*60}")
    passed = sum(1 for _, ok in results if ok)
    failed = sum(1 for _, ok in results if not ok)
    for name, ok in results:
        icon = "PASS" if ok else "FAIL"
        print(f"  [{icon}] {name}")
    print(f"\n  Total: {passed} passed, {failed} failed out of {len(results)}")

    if failed > 0:
        sys.exit(1)
    else:
        print("\n  All warmup E2E tests passed!")
        sys.exit(0)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Warmup E2E test")
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL, help="API base URL")
    args = parser.parse_args()
    run_e2e(args.base_url)
