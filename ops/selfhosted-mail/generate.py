"""Generate private held Mox configuration; never connects or activates mail."""
from __future__ import annotations

import json
import os
from pathlib import Path
import secrets
import sys

from validation import load, validate


def write(path: Path, content: str) -> None:
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, 'w', encoding='utf-8', newline='\n') as output:
        output.write(content)


def generate(source: Path, target: Path) -> None:
    plan = validate(load(source))
    if not target.is_absolute() or target != target.resolve() or any((p / '.git').exists() for p in [target, *target.parents]):
        raise ValueError('private output must be absolute and outside every Git checkout')
    # AIDEV-NOTE: Exclusive directory creation prevents regeneration from rotating live credentials or mail state.
    target.mkdir(mode=0o700, parents=False, exist_ok=False)
    for directory in ['config', 'data', 'tls', 'credentials']:
        (target / directory).mkdir(mode=0o700)
    accounts = plan['accounts']
    static = f'''DataDir: ../data
User: 1000
LogLevel: info
Hostname: {plan['hostname']}
QuotaMessageSize: {plan['quota_mib'] * 1024**2}
Postmaster:
\tAccount: {accounts[0]}
\tMailbox: Inbox
Listeners:
\tpublic:
\t\tIPs:
\t\t\t- {plan['public_ipv4']}
\t\tTLS:
\t\t\tKeyCerts:
\t\t\t\t-
\t\t\t\t\tCertFile: ../tls/fullchain.pem
\t\t\t\t\tKeyFile: ../tls/privkey.pem
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
    dynamic = ['Domains:']
    for domain in plan['verified_domains']:
        dynamic += [f'\t{domain}:', '\t\tDisabled: true', '\t\tDKIM:', '\t\t\tSelectors:',
                    '\t\t\t\tmail2026:', f'\t\t\t\t\tPrivateKeyFile: dkim/{domain}.pem',
                    '\t\t\tSign:', '\t\t\t\t- mail2026']
    dynamic += ['Accounts:']
    for index, account in enumerate(accounts):
        dynamic += [f'\t{account}:', f'\t\tDomain: {account.split("@")[1]}',
                    '\t\tLoginDisabled: activation pending', '\t\tMaxOutgoingMessagesPerDay: 30',
                    '\t\tMaxFirstTimeRecipientsPerDay: 10', '\t\tDestinations:', f'\t\t\t{account}: nil']
        write(target / 'credentials' / f'{index:03d}.json', json.dumps(
            {'account': account, 'password': secrets.token_urlsafe(32)}) + '\n')
    (target / 'config' / 'dkim').mkdir(mode=0o700)
    write(target / 'config' / 'mox.conf', static)
    write(target / 'config' / 'domains.conf', '\n'.join(dynamic) + '\n')
    write(target / 'manifest.json', json.dumps(plan, indent=2) + '\n')


if __name__ == '__main__':
    if len(sys.argv) != 3:
        raise SystemExit('usage: generate.py MANIFEST_JSON NEW_ABSOLUTE_PRIVATE_DIRECTORY')
    generate(Path(sys.argv[1]), Path(sys.argv[2]))
