"""Boundary and storage regressions for the offline deployment compiler."""
from dataclasses import asdict
import json
from pathlib import Path
import sys
from tempfile import TemporaryDirectory
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from plan import Plan, compile_plan, unique_fields

EXAMPLE = json.loads((Path(__file__).resolve().parents[1] / 'plan.example.json').read_text())


class PlanTest(unittest.TestCase):
    def test_712_accounts_remain_held_and_bounded(self) -> None:
        plan = Plan.parse(EXAMPLE)
        accounts = plan.accounts()
        self.assertEqual(len(accounts), 712)
        self.assertEqual(len({address for address, _, _ in accounts}), 712)
        self.assertEqual(plan.domains_config().count('LoginDisabled: activation pending'), 712)
        self.assertEqual(plan.domains_config().count('Disabled: true'), 3)
        self.assertNotIn('NoFirstTimeSenderDelay', plan.domains_config())
        self.assertNotIn('Routes:', plan.domains_config())
        self.assertIn('- 127.0.0.1', plan.static_config())

    def test_capacity_includes_metadata_and_free_space(self) -> None:
        capacity = Plan.parse(EXAMPLE).capacity()
        self.assertEqual(capacity['message_allowance_bytes'], 38000 * 1024 ** 2)
        self.assertEqual(capacity['maximum_planned_bytes'], 64000000000)
        self.assertLess(capacity['estimated_required_bytes'], capacity['maximum_planned_bytes'])
        for update in [{'disk_gb': 40}, {'mailbox_quota_mib': 1024}]:
            with self.subTest(update=update), self.assertRaises(ValueError):
                Plan.parse(EXAMPLE | update)

    def test_rejects_missing_extra_duplicate_or_wrong_type_fields(self) -> None:
        for raw in [None, [], {}, EXAMPLE | {'password': 'forbidden'}, EXAMPLE | {'workers': True},
                    EXAMPLE | {'seed_accounts': 200.0}, EXAMPLE | {'outbound_hold': False},
                    EXAMPLE | {'outbound_hold': 'true'}]:
            with self.subTest(raw=type(raw).__name__), self.assertRaises(ValueError):
                Plan.parse(raw)
        with self.assertRaises(ValueError):
            json.loads('{"a":1,"a":2}', object_pairs_hook=unique_fields)

    def test_integer_bounds(self) -> None:
        for key, invalid in [('outreach_accounts', 501), ('seed_accounts', 201), ('personal_accounts', 0),
                             ('workers', 3), ('planned_outreach_messages_per_day', 501), ('planned_seed_messages_per_day', -1),
                             ('personal_quota_mib', 0), ('mailbox_quota_mib', 0), ('disk_gb', 2001)]:
            with self.subTest(key=key), self.assertRaises(ValueError):
                Plan.parse(EXAMPLE | {key: invalid})

    def test_daily_projections_never_claim_to_enforce_aggregate_limits(self) -> None:
        plan = Plan.parse(EXAMPLE)
        lower_volume = Plan.parse(EXAMPLE | {'planned_outreach_messages_per_day': 100})
        self.assertEqual(plan.domains_config(), lower_volume.domains_config())
        self.assertNotEqual(plan.manifest()['input'], lower_volume.manifest()['input'])
        self.assertIs(plan.manifest()['activation_ready'], False)
        self.assertIs(plan.manifest()['aggregate_daily_caps_enforced'], False)
        self.assertEqual(plan.manifest()['per_account_safety_ceiling']['outgoing_per_day'], 30)

    def test_dns_and_config_injection_rejected(self) -> None:
        for value in ['a', 'a..test', '-a.test', 'a-.test', 'A.test', 'a.test\nAccounts:', 'a.' + 'b' * 64,
                      'localhost', 'a.test.', 'mail.lab.test', 123]:
            with self.subTest(value=value), self.assertRaises(ValueError):
                Plan.parse(EXAMPLE | {'outreach_domain': value})
        with self.assertRaises(ValueError):
            Plan.parse(EXAMPLE | {'outreach_domain': EXAMPLE['seed_domain']})

    def test_compile_creates_private_files_and_refuses_overwrite(self) -> None:
        with TemporaryDirectory() as directory:
            base = Path(directory)
            source, output = base / 'input.json', base / 'prepared'
            source.write_text(json.dumps(EXAMPLE))
            compile_plan(source, output)
            self.assertEqual(json.loads((output / 'plan.json').read_text())['input'], asdict(Plan.parse(EXAMPLE)))
            self.assertEqual((output / 'mox.conf').stat().st_mode & 0o777, 0o600)
            with self.assertRaises(FileExistsError):
                compile_plan(source, output)
            source.write_text(' ' * 16385)
            with self.assertRaises(ValueError):
                compile_plan(source, base / 'oversize')


if __name__ == '__main__':
    unittest.main()
