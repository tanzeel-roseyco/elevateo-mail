"""Container-only Ruby/Mox gate; run with --network none and a /private tmpfs."""
from __future__ import annotations

import os
from pathlib import Path
import subprocess
import time


def wait_ready(process: subprocess.Popen[bytes], ready: Path, seconds: float = 90) -> None:
    deadline = time.monotonic() + seconds
    while True:
        if process.poll() is not None:
            raise RuntimeError("isolated Mox fixture exited before Ruby admission")
        # AIDEV-NOTE: A stale ready marker cannot admit a fixture that has already exited.
        if ready.is_file():
            return
        if time.monotonic() >= deadline:
            raise TimeoutError("isolated Mox readiness deadline exceeded")
        time.sleep(0.1)


def main() -> int:
    if os.getuid() != 0 or not Path('/.dockerenv').exists():
        raise RuntimeError("protocol fixture requires its disposable root container")
    # AIDEV-NOTE: Network-none plus loopback DNS prevents all external delivery, including fixture misconfiguration.
    if set(Path('/sys/class/net').iterdir()) != {Path('/sys/class/net/lo')}:
        raise RuntimeError("protocol fixture requires --network none")
    Path('/etc/resolv.conf').write_text('nameserver 127.0.0.1\noptions timeout:1 attempts:1\n')
    with Path('/etc/hosts').open('a') as hosts:
        hosts.write('\n127.0.0.1 mail.dispatch.company.com mail.second.company.com\n')
    directory = Path('/private/runtime')
    # AIDEV-NOTE: Never echo fixture diagnostics: generated credentials and MIME remain in disposable memory.
    with Path('/private/fixture.log').open('wb') as log:
        fixture = subprocess.Popen(['python3', '/source/protocol.py'], stdout=log, stderr=log)
        try:
            wait_ready(fixture, directory / 'ready')
            environment = dict(os.environ, BE02_MOX_PRODUCTION_PROTOCOL='1',
                               BE02_MOX_PROTOCOL_DIRECTORY=str(directory), SSL_CERT_FILE=str(directory / 'ca.pem'))
            result = subprocess.run(['bundle', 'exec', 'ruby', '-Itest',
                                     'test/send_worker/production_mox_protocol_test.rb'],
                                    cwd='/app', env=environment, user=10001, group=10001,
                                    timeout=150, check=False)
            return result.returncode
        finally:
            if directory.exists():
                (directory / 'done').touch()
            try:
                fixture.wait(timeout=30)
            except subprocess.TimeoutExpired:
                fixture.kill()
                fixture.wait(timeout=5)
            if fixture.returncode != 0:
                raise RuntimeError('isolated Mox fixture failed; private diagnostics retained until container removal')


if __name__ == '__main__':
    raise SystemExit(main())
