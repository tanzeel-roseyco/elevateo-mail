"""Invoke QA CDP inside the isolated Android container; never echo fixture credentials."""
from pathlib import Path
import json
import os
import stat
import subprocess
import sys
from boundaries import Active, CONTROL, active_fixture, command, decode, private_password

def invoke(active: Active, request: dict[str, str]) -> None:
    result = subprocess.run(['docker', 'exec', '-i', active['emulator'], 'node', '/qa/gui.mjs'],
        input=json.dumps(request), text=True, capture_output=True, timeout=60)
    print(result.stdout, end=''); print(result.stderr, end='', file=sys.stderr)
    if result.returncode:
        raise SystemExit(result.returncode)

def main() -> None:
    active = active_fixture(decode((CONTROL / 'android-active.json').read_text()))
    request = command(decode(sys.stdin.read(65537)))
    if request['action'] == 'private-login':
        path = Path(active['fixture_evidence']) / 'acceptance-private/acceptance-credentials.json'
        # AIDEV-NOTE: Validate the opened file, preventing a symlink swap between permission checks and credential read.
        with os.fdopen(os.open(path, os.O_RDONLY | os.O_NOFOLLOW), 'r') as stream:
            info = os.fstat(stream.fileno())
            if not (stat.S_ISREG(info.st_mode) and info.st_uid == os.getuid() and stat.S_IMODE(info.st_mode) == 0o600):
                raise RuntimeError('Private QA credential file rejected')
            password = private_password(decode(stream.read(65537)))
        invoke(active, {'action': 'fill', 'selector': 'input[name=email]', 'value': 'manager_primary@acceptance.test'})
        invoke(active, {'action': 'fill', 'selector': 'input[name=password]', 'value': password})
        invoke(active, {'action': 'click', 'selector': 'button[type=submit]'})
    else:
        invoke(active, request)

if __name__ == '__main__':
    main()
