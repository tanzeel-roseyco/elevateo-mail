"""Typed, bounded inputs for private Android acceptance orchestration."""
import json
from pathlib import Path
import re
from typing import TypedDict

CONTROL = Path('/home/tanzeel/elevateo-mail-completion-20261015/control')
ROOT = Path('/home/tanzeel/orca/workspaces/integration/completion-cassian-int801')

class Active(TypedDict):
    emulator: str
    evidence: str
    fixture_evidence: str

class AcceptanceResult(TypedDict, total=False):
    status: str
    checks: dict[str, str]
    visual_review: str
    failure: str
    restore_error: str

def record(value: object) -> dict[str, object]:
    if not isinstance(value, dict) or not all(isinstance(key, str) for key in value):
        raise ValueError('QA object required')
    return {key: item for key, item in value.items()}

def decode(data: str) -> object:
    if len(data.encode('utf-8')) > 65536:
        raise ValueError('QA input exceeds limit')
    value: object = json.loads(data)
    return value

def active_fixture(value: object) -> Active:
    data = record(value)
    if data.get('status') != 'READY':
        raise ValueError('Android fixture is not READY')
    emulator, evidence, fixture = (data.get(key) for key in ('emulator', 'evidence', 'fixture_evidence'))
    if not isinstance(emulator, str) or not re.fullmatch(r'android[0-9]+-runtime-[a-f0-9]{12}-emulator', emulator):
        raise ValueError('Unexpected QA container')
    # AIDEV-NOTE: Cross-bind evidence to the exact leased container; never select a different task from arbitrary input.
    expected = CONTROL / 'qa815-artifacts' / emulator.removesuffix('-emulator')
    if evidence != str(expected) or not isinstance(fixture, str):
        raise ValueError('Unexpected QA evidence')
    path = Path(fixture)
    if path.parent != ROOT / 'ops/local' or not re.fullmatch(r'be02-[a-f0-9]{32}', path.name):
        raise ValueError('Unexpected private fixture path')
    return {'emulator': emulator, 'evidence': str(expected), 'fixture_evidence': fixture}

def command(value: object) -> dict[str, str]:
    data = record(value)
    action = data.get('action')
    fields = {'snapshot': (), 'private-login': (), 'evaluate': ('expression',),
              'click': ('selector',), 'fill': ('selector', 'value'), 'screen': ('name',)}
    if not isinstance(action, str) or action not in fields or set(data) != {'action', *fields[action]}:
        raise ValueError('Invalid QA action or fields')
    result = {'action': action}
    for key in fields[action]:
        item = data[key]
        if not isinstance(item, str) or (key != 'value' and not item) or len(item.encode('utf-8')) > 16384:
            raise ValueError('Invalid QA field')
        result[key] = item
    if action == 'screen' and not re.fullmatch(r'[a-z0-9-]{1,40}', result['name']):
        raise ValueError('Invalid QA evidence name')
    return result

def private_password(value: object) -> str:
    data = record(value)
    if type(data.get('schema_version')) is not int or data['schema_version'] != 1:
        raise ValueError('Unknown QA credential schema')
    password = record(data.get('passwords')).get('manager_primary')
    if not isinstance(password, str) or not re.fullmatch(r'Be02![a-f0-9]{48}', password):
        raise ValueError('Invalid QA password format')
    return password
