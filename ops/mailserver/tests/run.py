"""Execute inside fleet-02's network-none container; no host testing."""
from __future__ import annotations

import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time
import traceback

import dns_fixture
from fixture import ROOT, CONFIG, command, configure, start, stop
from protocol import DELIVERIES, exercise, wait_delivery
from prepared import verify_prepared
from limits import verify_limits


def main() -> None:
    out = Path('/evidence')
    report: dict[str, object] = {'passed': False, 'mode': 'serve', 'network': 'none'}
    process = None
    dns = None
    started = time.monotonic()
    try:
        configure()
        dns = dns_fixture.start()
        subprocess.run([sys.executable, '-m', 'unittest', 'test_plan', '-v'],
                       cwd=Path(__file__).parent, check=True, timeout=30)
        report['planner_unit_tests'] = 7
        report.update(verify_prepared())
        process = start(ROOT / 'server.log')
        report.update(exercise())
        report['limit_checks'] = verify_limits()
        command('backup', str(ROOT / 'backup'))
        stop(process)
        command('verifydata', str(ROOT / 'backup/data'))
        # AIDEV-NOTE: Restart first proves durability; restore uses a different data directory below.
        process = start(ROOT / 'server.log')
        for index, token in DELIVERIES:
            wait_delivery(index, token)
        report['restart_verified'] = True
        stop(process)
        original = ROOT / 'original-data'
        (ROOT / 'data').rename(original)
        CONFIG.rename(ROOT / 'original-config')
        shutil.copytree(ROOT / 'backup/config', CONFIG)
        shutil.copytree(ROOT / 'backup/data', ROOT / 'data')
        for path in [CONFIG, *CONFIG.rglob('*'), ROOT / 'data', *(ROOT / 'data').rglob('*')]:
            os.chown(path, 1000, 1000)
        process = start(ROOT / 'server.log')
        for index, token in DELIVERIES:
            wait_delivery(index, token)
        report['restore_verified_messages'] = len(DELIVERIES)
        report['restore_scope'] = 'mail store plus config and TLS files from Mox backup'
        report['mail_storage_bytes'] = sum(p.stat().st_size for p in original.rglob('*') if p.is_file())
        report['mail_storage_allocated_bytes'] = sum(p.stat().st_blocks * 512 for p in original.rglob('*') if p.is_file())
        report['memory_peak_bytes'] = int(Path('/sys/fs/cgroup/memory.peak').read_text().strip())
        report['elapsed_seconds'] = time.monotonic() - started
        report['passed'] = True
    except BaseException as exc:
        report['failure'] = f'{type(exc).__name__}: {exc}'
        (out / 'traceback.txt').write_text(traceback.format_exc(), encoding='utf-8')
        raise
    finally:
        cleanup_errors = []
        actions = ([lambda: stop(process)] if process else [])
        actions += [dns.shutdown, dns.server_close] if dns else []
        for action in actions:
            try:
                action()
            except BaseException as exc:
                cleanup_errors.append(type(exc).__name__)
        if cleanup_errors:
            report.update(passed=False, cleanup_errors=cleanup_errors)
        (out / 'result.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
        for name in ['server.log', 'cli-errors.log']:
            path = ROOT / name
            if path.exists():
                shutil.copyfile(path, out / name)
        if cleanup_errors:
            raise RuntimeError('fixture cleanup failed; see result.json')


if __name__ == '__main__':
    main()
