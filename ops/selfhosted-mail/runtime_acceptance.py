"""Fleet Docker entrypoint: production serve, populated snapshot and isolated restore."""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time

from runtime_fixture import MOX, ROOT, command, configure, start, stop
from runtime_protocol import exercise, verify_message
from runtime_dns import FixtureDNS


def verify_binary(path: Path) -> str:
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    if digest != '29f054f2b2bc0f191b22576ffbd95fbe74901dae31ac749058c7efb8f61e547c':
        raise ValueError('Mox binary does not match the reviewed pin')
    return digest


def main() -> None:
    # AIDEV-NOTE: Protocol assertions perform probes; optimization would remove both operations and evidence checks.
    if sys.flags.optimize:
        raise RuntimeError('Runtime acceptance requires Python without optimization')
    report: dict[str, object] = {'passed': False, 'network': 'none', 'mode': 'serve'}
    process = None
    dns = FixtureDNS()
    dns.start()
    started = time.monotonic()
    try:
        digest = verify_binary(Path(MOX))
        report['binary_sha256'] = digest
        report['version'] = subprocess.check_output([MOX, 'version'], timeout=10).decode().strip()
        ca = configure()
        process = start(ROOT)
        report['checks'] = exercise(ca)
        # AIDEV-NOTE: Production serve restricts writable paths; backup must stay under its admitted data/tmp subtree.
        snapshot = ROOT / 'data/tmp/runtime-snapshot'
        command(ROOT, 'backup', str(snapshot))
        stop(process)
        process = None
        command(ROOT, 'verifydata', str(snapshot / 'data'))
        report['populated_snapshot_verifydata'] = True
        process = start(ROOT)
        for index in [0, 1]:
            verify_message(ca, f'private-sentinel-{index}', index)
        verify_message(ca, 'owned-smtp-runtime', 1)
        stop(process)
        process = None
        report['restart_persistence_messages'] = 3
        # AIDEV-NOTE: Copy, never run or mutate the snapshot; original data remains intact throughout the drill.
        restored = Path('/tmp/mailruntime-restored')
        restored.mkdir(mode=0o700)
        for name in ['config', 'data']:
            shutil.copytree(snapshot / name, restored / name)
        shutil.copytree(ROOT / 'tls', restored / 'tls')
        for path in [restored, *restored.rglob('*')]:
            os.chown(path, 1000, 1000)
        command(restored, 'verifydata', str(restored / 'data'))
        process = start(restored)
        for index in [0, 1]:
            verify_message(ca, f'private-sentinel-{index}', index)
        verify_message(ca, 'owned-smtp-runtime', 1)
        report['isolated_restore_messages'] = 3
        report['passed'] = True
    except BaseException as exc:
        report['failure_type'] = type(exc).__name__
        raise
    finally:
        dns.close()
        if process is not None:
            stop(process)
        report['seconds'] = round(time.monotonic() - started, 3)
        Path('/evidence/runtime-result.json').write_text(json.dumps(report, indent=2) + '\n')
        # Logs remain private on fleet for diagnosis; no credentials/message payloads enter the public report.
        for root in [ROOT, Path('/tmp/mailruntime-restored')]:
            if (root / 'server.log').exists():
                shutil.copyfile(root / 'server.log', Path('/evidence') / (root.name + '-server.log'))


if __name__ == '__main__':
    main()
