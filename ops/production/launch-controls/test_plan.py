"""Offline validation regressions; synthetic addresses never become mail accounts."""
from __future__ import annotations

import json
import unittest
from pathlib import Path

from plan import DOMAINS, review, unique_pairs


class PlanTest(unittest.TestCase):
    def setUp(self) -> None:
        self.value = json.loads(Path(__file__).with_name("plan.json").read_text())

    def test_default_plan_is_held_and_incomplete(self) -> None:
        result = review(self.value)
        self.assertFalse(result["ready_for_root_review"])
        self.assertFalse(result["runtime_enforcement_verified"])
        self.assertEqual(result["payload_capacity_bytes"], 240_000_000_000)

    def test_completed_plan_still_requires_trusted_evidence_and_runtime_gate(self) -> None:
        for key in ("organization_id", "verified_owner_id", "authorized_sender_user_id", "authorized_sender_mailbox_id"):
            self.value[key] = "11111111-1111-4111-8111-111111111111"
        self.value["mailboxes"] = [f"person{n}@{domain}" for domain in DOMAINS for n in range(24)]
        self.value.update(available_storage_bytes=300_000_000_000, storage_overhead_bytes=60_000_000_000)
        result = review(self.value)
        self.assertTrue(result["ready_for_root_review"])
        self.assertEqual(len(result["holds"]), 3)

    def test_activation_and_cost_cannot_be_enabled_by_plan(self) -> None:
        for field, value in (("outbound_hold", False), ("warmup_enabled", True), ("warmup_cost_approved", True),
                             ("company_signup_enabled", True), ("daily_mailbox_limit", 31), ("daily_mailbox_limit", True),
                             ("mailbox_quota_bytes", 2_147_483_648), ("authorized_sender_user_id", "display-name")):
            with self.subTest(field=field), self.assertRaises(ValueError):
                review(dict(self.value, **{field: value}))

    def test_address_limit_duplicates_apex_wrong_domain_and_plan_bounds(self) -> None:
        for boxes in (["p@roseyco.com"], ["p@mail.elevateoco.com"], ["p@mail.roseyco.com"] * 2,
                      [f"p{n}@mail.roseyco.com" for n in range(121)], [None],
                      ["p..x@mail.roseyco.com"], ["p.@mail.roseyco.com"]):
            with self.subTest(boxes=boxes), self.assertRaises(ValueError):
                review(dict(self.value, mailboxes=boxes))
        for days in ([], [1] * 13, [31] * 14, [2, 1] + [2] * 12):
            with self.assertRaises(ValueError):
                review(dict(self.value, warmup_daily_plan=days))

    def test_unknown_duplicate_fields_and_insufficient_capacity(self) -> None:
        with self.assertRaises(ValueError):
            unique_pairs([("outbound_hold", True), ("outbound_hold", False)])
        with self.assertRaises(ValueError):
            review(dict(self.value, activate=True))
        for capacity, overhead in ((240_000_000_000, 1), (300_000_000_000, 0), (True, 1)):
            with self.assertRaises(ValueError):
                review(dict(self.value, available_storage_bytes=capacity, storage_overhead_bytes=overhead))


if __name__ == "__main__":
    unittest.main()
