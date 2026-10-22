"""Strict, offline admission for operator-approved mail domains and 120 identities."""
from __future__ import annotations

import ipaddress
import json
from pathlib import Path
import re
from typing import TypedDict, cast


class Plan(TypedDict):
    hostname: str
    public_ipv4: str
    verified_domains: list[str]
    workspace_domains: list[str]
    accounts: list[str]
    quota_mib: int
    disk_gib: int
    outbound_hold: bool


def unique(pairs: list[tuple[str, object]]) -> dict[str, object]:
    result: dict[str, object] = {}
    for key, value in pairs:
        if key in result:
            raise ValueError('duplicate JSON key')
        result[key] = value
    return result


def load(path: Path) -> dict[str, object]:
    if path.stat().st_size > 131072:
        raise ValueError('manifest exceeds 128 KiB')
    value = json.loads(path.read_text(encoding='utf-8'), object_pairs_hook=unique)
    if not isinstance(value, dict):
        raise ValueError('manifest must be an object')
    return value


def fqdn(value: object) -> str:
    if not isinstance(value, str) or len(value) > 253 or '.' not in value:
        raise ValueError('exact lowercase FQDN required')
    if not all(re.fullmatch(r'[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?', p)
               for p in value.split('.')):
        raise ValueError('invalid FQDN')
    if value.rsplit('.', 1)[1] in {'test', 'example', 'invalid', 'localhost', 'local'}:
        raise ValueError('reserved/non-public domain')
    # AIDEV-NOTE: Documentation domains are reserved even though their top-level domains are public.
    if any(value == suffix or value.endswith('.' + suffix)
           for suffix in ('example.com', 'example.net', 'example.org')):
        raise ValueError('reserved documentation domain')
    return value


def domains(value: object) -> list[str]:
    if not isinstance(value, list) or not 1 <= len(value) <= 120:
        raise ValueError('domain list must contain 1..120 exact names')
    result = [fqdn(item) for item in value]
    if len(set(result)) != len(result):
        raise ValueError('duplicate domains')
    return result


def validate(raw: dict[str, object]) -> Plan:
    fields = {'hostname', 'public_ipv4', 'verified_domains', 'workspace_domains',
              'accounts', 'quota_mib', 'disk_gib', 'outbound_hold'}
    if set(raw) != fields:
        raise ValueError('unexpected or missing manifest fields')
    hostname = fqdn(raw['hostname'])
    if not isinstance(raw['public_ipv4'], str):
        raise ValueError('IPv4 string required')
    address = ipaddress.IPv4Address(raw['public_ipv4'])
    if not address.is_global or address.is_multicast:
        raise ValueError('globally routable IPv4 required')
    approved = domains(raw['verified_domains'])
    workspace = domains(raw['workspace_domains'])
    # AIDEV-NOTE: Explicitly approved child domains are allowed; Workspace apex MX is never generated or changed.
    if set(approved) & set(workspace) or raw['hostname'] in workspace:
        raise ValueError('Workspace domain cannot be hosted here')
    if not any(hostname.endswith('.' + domain) for domain in approved):
        raise ValueError('mail hostname must belong to an explicitly verified mail domain')
    accounts = raw['accounts']
    if not isinstance(accounts, list) or len(accounts) != 120:
        raise ValueError('exactly 120 explicitly supplied accounts required')
    for account in accounts:
        if not isinstance(account, str) or len(account) > 254 or account.count('@') != 1:
            raise ValueError('invalid account')
        local, domain = account.split('@')
        if not re.fullmatch(r'[a-z0-9]+(?:[._-][a-z0-9]+)*', local) or len(local) > 64:
            raise ValueError('invalid account localpart')
        if domain not in approved:
            raise ValueError('account domain not explicitly approved')
    if len(set(accounts)) != 120 or {a.split('@')[1] for a in accounts} != set(approved):
        raise ValueError('duplicate accounts or unused approved domain')
    for key, low, high in [('quota_mib', 50, 10240), ('disk_gib', 40, 4096)]:
        value = raw[key]
        if type(value) is not int or not low <= value <= high:
            raise ValueError('invalid capacity')
    if raw['outbound_hold'] is not True:
        raise ValueError('outbound hold required')
    plan = cast(Plan, raw)
    if 120 * plan['quota_mib'] * 1024**2 * 115 // 100 + 10 * 1024**3 > plan['disk_gib'] * 1024**3 * 80 // 100:
        raise ValueError('insufficient disk for quotas, metadata, reserve and 20% free')
    return plan
