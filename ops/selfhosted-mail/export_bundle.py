"""Offline adapter from operator-supplied SQL binding metadata to private app Bundle v1."""
from __future__ import annotations

import json
from pathlib import Path
import re
import sys
from typing import cast

from tls_preflight import private_file, private_root
from validation import load, validate
from private_publish import publish

IDENTITY = {'account_id', 'organization_id', 'mailbox_id', 'credential_version', 'credential_ref'}
FIELDS = IDENTITY | {'username', 'protocol', 'host', 'port', 'tls_mode'}
UUID = re.compile(r'[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}')


def binding_entries(raw: dict[str, object], host: str, accounts: list[str]) -> list[dict[str, object]]:
    if set(raw) != {'format_version', 'entries'} or type(raw['format_version']) is not int or raw['format_version'] != 1:
        raise ValueError('binding metadata version or fields invalid')
    entries = raw['entries']
    if not isinstance(entries, list) or not 2 <= len(entries) <= 240:
        raise ValueError('supply 1..120 actual paired account bindings')
    result: list[dict[str, object]] = []
    owners: dict[str, tuple[object, ...]] = {}
    seen: set[tuple[object, ...]] = set()
    identities: dict[tuple[object, ...], str] = {}
    for value in entries:
        if not isinstance(value, dict) or set(value) != FIELDS:
            raise ValueError('binding metadata fields invalid')
        entry = cast(dict[str, object], value)
        for field in ['account_id', 'organization_id', 'mailbox_id']:
            if not isinstance(entry[field], str) or UUID.fullmatch(cast(str, entry[field])) is None:
                raise ValueError('actual lowercase SQL UUID required')
        version, reference = entry['credential_version'], entry['credential_ref']
        if type(version) is not int or not 1 <= version <= 2147483647:
            raise ValueError('actual active credential version required')
        if not isinstance(reference, str) or re.fullmatch(r'secret:[A-Za-z0-9_.:-]{1,120}', reference) is None:
            raise ValueError('production secret: reference required')
        username, protocol = entry['username'], entry['protocol']
        if not isinstance(username, str) or username not in accounts or protocol not in ('smtp', 'imap'):
            raise ValueError('bound username or protocol invalid')
        port, mode = (587, 'starttls_required') if protocol == 'smtp' else (993, 'verified_tls')
        if entry['host'] != host or type(entry['port']) is not int or entry['port'] != port or entry['tls_mode'] != mode:
            raise ValueError('binding endpoint must require production verified TLS')
        identity = tuple(entry[field] for field in sorted(IDENTITY))
        key = (*identity, protocol)
        if key in seen or (username in owners and owners[username] != identity):
            raise ValueError('duplicate or conflicting account binding')
        if identity in identities and identities[identity] != username:
            raise ValueError('one tenant binding cannot alias another mailbox')
        seen.add(key)
        owners[username] = identity
        identities[identity] = username
        result.append({field: entry[field] for field in IDENTITY | {'username', 'protocol'}})
    if len(seen) != 2 * len(owners):
        raise ValueError('SMTP and IMAP must share the same complete active binding')
    return result


def export_bundle(root: Path, metadata: str, output: str) -> None:
    private_root(root)
    if Path(metadata).name != metadata or Path(output).name != output or output in {'.', '..'}:
        raise ValueError('metadata and new Bundle must be direct private-root basenames')
    plan = validate(load(private_file(root, 'manifest.json')))
    entries = binding_entries(load(private_file(root, metadata)), plan['hostname'], plan['accounts'])
    for entry in entries:
        index = plan['accounts'].index(cast(str, entry['username']))
        credential = load(private_file(root, f'credentials/{index:03d}.json', 1024))
        password = credential.get('password')
        if set(credential) != {'account', 'password'} or credential['account'] != entry['username'] or \
                not isinstance(password, str) or re.fullmatch(r'[A-Za-z0-9_-]{43}', password) is None:
            raise ValueError('generated credential does not match binding')
        entry['password'] = password
    # AIDEV-NOTE: No identities or versions are generated; replacing an active Bundle requires prior SQL revocation.
    payload = json.dumps({'format_version': 1, 'entries': entries}, sort_keys=True) + '\n'
    publish(root / output, payload.encode('utf-8'))


if __name__ == '__main__':
    if len(sys.argv) != 4:
        raise SystemExit('usage: export_bundle.py ABSOLUTE_PRIVATE_ROOT BINDINGS_BASENAME NEW_BUNDLE_BASENAME')
    export_bundle(Path(sys.argv[1]), sys.argv[2], sys.argv[3])
