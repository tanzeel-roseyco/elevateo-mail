"""Set existing held accounts' passwords over stdin; no passwords in argv/logs."""
from __future__ import annotations

import json
import os
from pathlib import Path
import stat
import subprocess
import sys

from validation import load, unique, validate
from tls_preflight import private_file, private_root


def provision(root: Path, compose: Path) -> None:
    private_root(root)
    plan = validate(load(private_file(root, 'manifest.json')))
    if os.environ.get('MAIL_ROOT') != str(root) or not compose.is_file():
        raise ValueError('MAIL_ROOT must match the absolute private root')
    # AIDEV-NOTE: Prevalidate all 120 files before any mutation; retries reuse passwords rather than rotate them.
    entries: list[dict[str, str]] = []
    for index, account in enumerate(plan['accounts']):
        # AIDEV-NOTE: Reject symlinked or writable secret directories before the leaf O_NOFOLLOW admission.
        path = private_file(root, f'credentials/{index:03d}.json', 1024)
        descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
        with os.fdopen(descriptor, 'r', encoding='utf-8') as source:
            info = os.fstat(source.fileno())
            if not stat.S_ISREG(info.st_mode) or stat.S_IMODE(info.st_mode) != 0o600 or \
                    info.st_uid not in {0, os.getuid()} or info.st_nlink != 1 or info.st_size > 1024:
                raise ValueError('credential file must be private, bounded and owner-controlled')
            item = json.loads(source.read(), object_pairs_hook=unique)
        if not isinstance(item, dict) or set(item) != {'account', 'password'} or item['account'] != account:
            raise ValueError('credential identity mismatch')
        password = item['password']
        if not isinstance(password, str) or len(password) != 43 or \
                not all(c.isascii() and (c.isalnum() or c in '_-') for c in password):
            raise ValueError('invalid generated credential')
        entries.append(item)
    for entry in entries:
        result = subprocess.run(['docker', 'compose', '-f', str(compose), 'exec', '-T', 'mox',
                                 'mox', 'setaccountpassword', entry['account']],
                                input=(entry['password'] + '\n').encode(), capture_output=True,
                                timeout=60, check=False)
        if result.returncode:
            raise RuntimeError('password provisioning failed; held state retained; retry same inputs')


if __name__ == '__main__':
    if len(sys.argv) != 3:
        raise SystemExit('usage: provision.py ABSOLUTE_PRIVATE_ROOT ABSOLUTE_COMPOSE_PATH')
    provision(Path(sys.argv[1]), Path(sys.argv[2]))
