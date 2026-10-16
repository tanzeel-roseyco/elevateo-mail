"""Bounded emulator/fixture runtime; invoked only by the leased fleet build gate."""
from pathlib import Path
import hashlib
import json
import re
import subprocess
import signal
import sys
from typing import Callable
import time


def stop_fixture(fixture: subprocess.Popen[str], fixture_evidence: Path | None, control: Path,
                 evidence: Path, failure: BaseException | None = None) -> None:
    errors: list[Exception] = []
    # AIDEV-NOTE: Disk failures must not bypass fixture shutdown; retain both acceptance and cleanup errors.
    try:
        if fixture_evidence is not None:
            (fixture_evidence / 'android-stop').touch()
        elif fixture.poll() is None:
            # AIDEV-NOTE: Startup can fail before the marker path is known; interrupt immediately to release resources.
            fixture.send_signal(signal.SIGINT)
    except OSError as error:
        errors.append(error)
        try:
            if fixture.poll() is None:
                fixture.send_signal(signal.SIGINT)
        except OSError as signal_error:
            errors.append(signal_error)
    try:
        if fixture.poll() is None:
            try:
                fixture.wait(timeout=300)
            except subprocess.TimeoutExpired:
                try:
                    fixture.send_signal(signal.SIGINT)
                except OSError as error:
                    errors.append(error)
                try:
                    fixture.wait(timeout=300)
                except subprocess.TimeoutExpired:
                    try:
                        fixture.kill()
                    except OSError as error:
                        errors.append(error)
                    fixture.wait(timeout=10)
    except (OSError, subprocess.TimeoutExpired) as error:
        errors.append(error)
    try:
        (control / 'android-active.json').write_text(json.dumps({'status': 'CLOSED' if fixture.returncode is not None else 'CLEANUP_FAILED', 'evidence': str(evidence)}) + '\n')
    except OSError as error:
        errors.append(error)
    if fixture.returncode != 0:
        errors.append(RuntimeError('Android fixture failed; inspect scoped cleanup evidence'))
    if errors:
        raise BaseExceptionGroup('Android acceptance or cleanup failed', ([failure] if failure else []) + errors)



def require_emulator(emulator: str, run: Callable[[list[str]], subprocess.CompletedProcess[str]], phase: str) -> None:
    state = json.loads(run(['docker', 'inspect', emulator]).stdout)[0]['State']
    if not state['Running']:
        raise RuntimeError('Emulator stopped ' + phase)

def exercise(root: Path, control: Path, evidence: Path, emulator: str, socket_directory: Path, tls: Path, run: Callable[[list[str]], subprocess.CompletedProcess[str]],
             logged: Callable[[list[str], int], None]) -> None:
    deadline = time.monotonic() + 500
    ready = evidence / 'emulator-ready.json'
    while not ready.exists() and time.monotonic() < deadline:
        require_emulator(emulator, run, 'before installation')
        time.sleep(2)
    if not ready.exists():
        raise RuntimeError('Emulator installation deadline exceeded')
    digest = hashlib.sha256((tls / 'ca.pem').read_bytes()).hexdigest()
    # AIDEV-NOTE: run.py validates hostname -s; the outer gate separately verifies the full fleet hostname.
    arguments = ['python3', str(root / 'ops/tests/be02/run.py'), '--context', 'default',
        '--expect-host', 'Ubuntu-noble-latest-amd64-base', '--android-fixture',
        '--android-socket-dir', str(socket_directory), '--android-certs', str(tls), '--android-ca-sha256', digest, '--android-ttl', '900',
        '--acceptance-dispatch-id', evidence.name]
    fixture_evidence: Path | None = None
    with (evidence / 'fixture.log').open('w') as log:
        fixture = subprocess.Popen(arguments, stdout=log, stderr=subprocess.STDOUT)
        try:
            deadline = time.monotonic() + 1800
            while time.monotonic() < deadline:
                if fixture.poll() is not None:
                    raise RuntimeError('Android fixture stopped before READY')
                require_emulator(emulator, run, 'while fixture startup was active')
                content = (evidence / 'fixture.log').read_text()[:10000]
                match = re.search(r'BE02 project=(be02-[a-f0-9]{32}) evidence=(\S+)', content)
                if match:
                    candidate = Path(match.group(2))
                    if candidate != root / 'ops/local' / match.group(1):
                        raise RuntimeError('Unexpected fixture evidence directory')
                    fixture_evidence = candidate
                    if (candidate / 'android-ready.json').exists():
                        readiness = json.loads((candidate / 'android-ready.json').read_text())
                        if readiness['status'] != 'READY':
                            raise RuntimeError('Android fixture readiness rejected')
                        break
                time.sleep(2)
            else:
                raise RuntimeError('Android fixture startup deadline exceeded')
            # AIDEV-NOTE: This traverses emulator loopback, the owned UNIX socket and verified TLS before any GUI claim.
            logged(['docker', 'exec', emulator, 'python3', '-I', '-B', '/probe.py'], 70)
            # AIDEV-NOTE: Installation does not launch Android; fail startup before advertising GUI readiness.
            launch = run(['docker', 'exec', emulator, 'adb', '-s', 'emulator-5554', 'shell', 'am', 'start',
                          '-W', '-n', 'com.elevateo.mail.qa/.MainActivity'])
            if not re.search(r'^Status: ok$', launch.stdout, re.MULTILINE):
                raise RuntimeError('Activity launch did not report success')
            (evidence / 'activity-launch.txt').write_text(launch.stdout)
            active = {'status': 'READY', 'emulator': emulator, 'evidence': str(evidence),
                      'fixture_evidence': str(fixture_evidence), 'acceptance': 'NOT_RUN'}
            (control / 'android-active.json').write_text(json.dumps(active, indent=2) + '\n')
            (evidence / 'relay-chain.json').write_text(json.dumps({'status': 'PASSED'}) + '\n')
            remaining = min(850, readiness['expires_at'] - time.time() - 30)
            if remaining <= 0:
                raise RuntimeError('Fixture has no GUI acceptance budget remaining')
            deadline = time.monotonic() + remaining
            completed = False
            # AIDEV-NOTE: Accept only within expiry while both the fixture and installed emulator remain alive.
            while time.monotonic() < deadline:
                if fixture.poll() is not None:
                    raise RuntimeError('Fixture ended while GUI acceptance was active')
                require_emulator(emulator, run, 'while GUI acceptance was active')
                if (evidence / 'acceptance-done').exists():
                    completed = time.monotonic() < deadline
                    break
                time.sleep(2)
            if not completed:
                raise RuntimeError('GUI acceptance deadline reached without completion')
            result = json.loads((evidence / 'acceptance-result.json').read_text())
            required = {'login', 'inbox', 'thread', 'navigation', 'rotation', 'lifecycle', 'offline', 'logout', 'keyboard'}
            if result.get('status') != 'PASSED' or set(result.get('checks', {})) != required or any(
                    result['checks'][check] != 'PASSED' for check in required):
                raise RuntimeError('Required Android acceptance checks did not pass')
        finally:
            stop_fixture(fixture, fixture_evidence, control, evidence, sys.exception())
