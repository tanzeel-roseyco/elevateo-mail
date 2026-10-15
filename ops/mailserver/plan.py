"""Compile a credential-free, disabled Mox account plan; never contacts a server."""
from __future__ import annotations

from dataclasses import asdict, dataclass, fields
import json
from pathlib import Path
import re
import sys

MIB = 1024 ** 2
GIB = 1024 ** 3
DOMAIN = re.compile(r'[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?')


@dataclass(frozen=True)
class Plan:
    hostname: str
    personal_domain: str
    outreach_domain: str
    seed_domain: str
    personal_accounts: int
    outreach_accounts: int
    seed_accounts: int
    personal_quota_mib: int
    mailbox_quota_mib: int
    disk_gb: int
    workers: int
    planned_outreach_messages_per_day: int
    planned_seed_messages_per_day: int
    outbound_hold: bool

    @classmethod
    def parse(cls, raw: object) -> Plan:
        if not isinstance(raw, dict) or set(raw) != {field.name for field in fields(cls)}:
            raise ValueError('plan must contain exactly the documented fields')
        limits = {'personal_accounts': (1, 50), 'outreach_accounts': (1, 500), 'seed_accounts': (1, 200),
                  'personal_quota_mib': (50, 10240), 'mailbox_quota_mib': (10, 1024), 'disk_gb': (40, 2000),
                  'workers': (1, 2), 'planned_outreach_messages_per_day': (1, 500),
                  'planned_seed_messages_per_day': (1, 200)}
        for key, (low, high) in limits.items():
            if type(raw[key]) is not int or not low <= raw[key] <= high:
                raise ValueError('invalid plan integer: ' + key)
        domains = [raw[key] for key in ('hostname', 'personal_domain', 'outreach_domain', 'seed_domain')]
        for value in domains:
            if not isinstance(value, str) or len(value) > 253 or '.' not in value or \
                    not all(DOMAIN.fullmatch(label) for label in value.split('.')):
                raise ValueError('invalid lowercase DNS name')
        if len(set(domains)) != 4 or raw['outbound_hold'] is not True:
            raise ValueError('distinct DNS names and outbound hold are required')
        plan = cls(**raw)
        if plan.capacity()['estimated_required_bytes'] > plan.capacity()['maximum_planned_bytes']:
            raise ValueError('disk cannot hold quotas, metadata, OS reserve and 20% free space')
        return plan

    def capacity(self) -> dict[str, int]:
        allowance = (self.personal_accounts * self.personal_quota_mib +
                     (self.outreach_accounts + self.seed_accounts) * self.mailbox_quota_mib) * MIB
        # AIDEV-NOTE: Quotas cover message bytes only; indexes, OS/queues and free space consume additional disk.
        return {'accounts': self.personal_accounts + self.outreach_accounts + self.seed_accounts,
                'message_allowance_bytes': allowance, 'metadata_allowance_bytes': (allowance * 15 + 99) // 100,
                'os_queue_reserve_bytes': 10 * GIB, 'estimated_required_bytes': (allowance * 115 + 99) // 100 + 10 * GIB,
                'maximum_planned_bytes': self.disk_gb * 1_000_000_000 * 80 // 100,
                'local_backup_allowance_bytes': 0}

    def accounts(self) -> list[tuple[str, str, int]]:
        groups = [('member', self.personal_domain, self.personal_accounts, self.personal_quota_mib),
                  ('outreach', self.outreach_domain, self.outreach_accounts, self.mailbox_quota_mib),
                  ('seed', self.seed_domain, self.seed_accounts, self.mailbox_quota_mib)]
        return [(f'{prefix}{index:03d}@{domain}', domain, quota * MIB)
                for prefix, domain, count, quota in groups for index in range(count)]

    def domains_config(self) -> str:
        lines = ['# AIDEV-NOTE: Prepared accounts cannot log in or send; activation is a separate verified operation.',
                 'Domains:']
        for domain in (self.personal_domain, self.outreach_domain, self.seed_domain):
            lines.extend([f'\t{domain}:', '\t\tDisabled: true'])
        lines.append('Accounts:')
        for address, domain, quota in self.accounts():
            lines.extend([f'\t{address}:', f'\t\tDomain: {domain}', '\t\tLoginDisabled: activation pending',
                          f'\t\tQuotaMessageSize: {quota}', '\t\tMaxOutgoingMessagesPerDay: 30',
                          '\t\tMaxFirstTimeRecipientsPerDay: 10', '\t\tNoCustomPassword: true',
                          '\t\tDestinations:', f'\t\t\t{address}: nil'])
        return '\n'.join(lines) + '\n'

    def manifest(self) -> dict[str, object]:
        # AIDEV-NOTE: Mox limits are per account; fleet projections are not enforced aggregate sending budgets.
        return {'input': asdict(self), 'capacity': self.capacity(),
                'activation_ready': False, 'aggregate_daily_caps_enforced': False,
                'per_account_safety_ceiling': {'outgoing_per_day': 30, 'first_time_recipients_per_day': 10},
                'activation_blockers': ['credentials and public DNS/TLS', 'aggregate application quota enforcement',
                                        'production application transport and acceptance tests']}

    def static_config(self) -> str:
        # AIDEV-NOTE: Native staging uses only loopback; no ACME, admin HTTP or outward route is enabled here.
        return f'''DataDir: ../data
User: mox
LogLevel: info
Hostname: {self.hostname}
QuotaMessageSize: {self.mailbox_quota_mib * MIB}
Postmaster:
\tAccount: member000@{self.personal_domain}
\tMailbox: Inbox
Listeners:
\tstaging:
\t\tIPs:
\t\t\t- 127.0.0.1
\t\tTLS:
\t\t\tKeyCerts:
\t\t\t\t-
\t\t\t\t\tCertFile: tls.crt
\t\t\t\t\tKeyFile: tls.key
\t\tSMTPMaxMessageSize: 10485760
\t\tSMTP:
\t\t\tEnabled: true
\t\t\tPort: 25
\t\tSubmission:
\t\t\tEnabled: true
\t\t\tPort: 587
\t\tSubmissions:
\t\t\tEnabled: true
\t\t\tPort: 465
\t\tIMAPS:
\t\t\tEnabled: true
\t\t\tPort: 993
'''


def unique_fields(pairs: list[tuple[str, object]]) -> dict[str, object]:
    result: dict[str, object] = {}
    for key, value in pairs:
        if key in result:
            raise ValueError('duplicate JSON key')
        result[key] = value
    return result


def compile_plan(source: Path, destination: Path) -> None:
    if source.stat().st_size > 16384:
        raise ValueError('plan exceeds size limit')
    plan = Plan.parse(json.loads(source.read_text(encoding='utf-8'), object_pairs_hook=unique_fields))
    destination.mkdir(mode=0o700, parents=False, exist_ok=False)
    for name, content in [('mox.conf', plan.static_config()), ('domains.conf', plan.domains_config()),
                          ('plan.json', json.dumps(plan.manifest(), indent=2) + '\n')]:
        path = destination / name
        with path.open('x', encoding='utf-8', newline='\n') as output:
            output.write(content)
        path.chmod(0o600)


if __name__ == '__main__':
    if len(sys.argv) != 3:
        raise SystemExit('usage: plan.py PLAN_JSON NEW_OUTPUT_DIRECTORY')
    compile_plan(Path(sys.argv[1]), Path(sys.argv[2]))
