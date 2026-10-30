"""Host orchestration only; application and harness regressions execute inside Docker."""
from pathlib import Path, PurePosixPath
import hashlib
import json
import os
import socket
import subprocess
import sys
import tarfile

ROOT = Path('/home/tanzeel/elevateo-mail-tests-20261012-ultra/acceptance-integration-20261014')
SOURCE = ROOT / 'source'
NAME = 'elevateo-acceptance-units-20261014'
DOCKER = ['docker', '--context', 'default']
NODE = 'node:24.21.0-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20'
PYTHON = 'selenium/standalone-chrome:4.49.0-20260909@sha256:88dacdd42d93ab738bed045129376b2f965117c5f2e4710693e54695d531380d'
ARCHIVE_SHA = '1a368d4d0f71df09cbbc11d7661e016ed966cfe8cf3ec2ac2acada52e3ac065b'
assert socket.gethostname().split('.')[0] == 'Ubuntu-noble-latest-amd64-base'
assert os.geteuid() == 1001 and os.getegid() == 1001
assert not any(os.environ.get(key) for key in ('DOCKER_HOST', 'DOCKER_TLS_VERIFY', 'DOCKER_CERT_PATH'))
os.umask(0o077)
archive = ROOT / 'context.tar'
manifest = json.loads((ROOT / 'manifest.json').read_text())
assert hashlib.sha256(archive.read_bytes()).hexdigest() == ARCHIVE_SHA == manifest['archive_sha256']
assert archive.stat().st_size == manifest['archive_bytes'] == 2938880
expected = manifest['files']
assert len(expected) == 420
SOURCE.mkdir(mode=0o755)
# AIDEV-NOTE: Extract only regular allowlisted files; no links or archive-controlled ownership.
with tarfile.open(archive) as tar:
    entries = tar.getmembers()
    assert len(entries) == len(expected) and len({item.name for item in entries}) == len(expected)
    for entry in entries:
        rel = PurePosixPath(entry.name)
        assert entry.isfile() and not rel.is_absolute() and '..' not in rel.parts
        assert str(rel) in expected and 0 <= entry.size <= 32 * 1024**2
        stream = tar.extractfile(entry)
        assert stream is not None
        data = stream.read()
        assert hashlib.sha256(data).hexdigest() == expected[str(rel)]
        target = SOURCE.joinpath(*rel.parts)
        target.parent.mkdir(parents=True, exist_ok=True)
        with target.open('xb') as output:
            output.write(data)
        target.chmod(0o755 if entry.mode & 0o111 else 0o644)
for directory in (path for path in SOURCE.rglob('*') if path.is_dir()):
    directory.chmod(0o755)
SOURCE.chmod(0o755)

def verify() -> None:
    actual = {path.relative_to(SOURCE).as_posix(): hashlib.sha256(path.read_bytes()).hexdigest()
              for path in SOURCE.rglob('*') if path.is_file()}
    assert actual == expected, 'Frozen source drift'

def invoke(args: list[str], timeout: int = 30) -> subprocess.CompletedProcess[str]:
    return subprocess.run(DOCKER + args, text=True, capture_output=True, timeout=timeout, check=False)

def remove_owned() -> None:
    found = invoke(['inspect', NAME])
    if found.returncode == 0:
        item = json.loads(found.stdout)[0]
        assert item['Name'] == '/' + NAME
        assert item['Config']['Labels']['elevateo.task'] == NAME
        for mount in item['Mounts']:
            assert mount['Type'] == 'tmpfs' or (mount['Type'] == 'bind' and
                mount['Source'] == str(ROOT) and mount['Destination'] == '/input' and not mount['RW'])
        removed = invoke(['rm', '-f', item['Id']])
        assert removed.returncode == 0, removed.stderr
    absent = invoke(['ps', '-aq', '--filter', 'name=^/' + NAME + '$'])
    assert absent.returncode == 0 and not absent.stdout.strip(), 'Task container cleanup failed'

initial = invoke(['ps', '-aq', '--filter', 'name=^/' + NAME + '$'])
assert initial.returncode == 0 and not initial.stdout.strip()
endpoint = invoke(['context', 'inspect', 'default', '--format', '{{.Endpoints.docker.Host}}'])
assert endpoint.returncode == 0 and endpoint.stdout.strip() == 'unix:///var/run/docker.sock'
for pin in (NODE, PYTHON):
    inspected = invoke(['image', 'inspect', pin])
    assert inspected.returncode == 0
    item = json.loads(inspected.stdout)[0]
    assert item['Os'] == 'linux' and item['Architecture'] == 'amd64' and not item['Config'].get('Volumes')
before = os.statvfs(ROOT)
results: list[dict[str, object]] = []
try:
    verify()
    checks = [
        ('evidence', NODE, 'node', ['--test', '/input/source/ops/tests/be02/test_acceptance_evidence.mjs'], 90, False),
        ('policy-finalizer', PYTHON, 'python3', ['-B', '-m', 'unittest', 'discover', '-s',
            '/input/source/ops/tests/be02', '-p', 'test_*.py', '-v'], 90, False),
        ('acceptance', NODE, 'sh', ['-ec',
            'mkdir /work/source && tar -xf /input/context.tar -C /work/source && '
            'cd /work/source/tests/acceptance && npm ci --ignore-scripts --no-audit --no-fund && '
            'node node_modules/typescript/bin/tsc && npm test'], 480, True),
    ]
    for key, pin, entrypoint, command, timeout, network in checks:
        args = ['run', '--rm', '--name', NAME, '--label', 'elevateo.task=' + NAME,
            '--user', '1001:1001', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
            '--read-only', '--memory', '2g', '--cpus', '2', '--pids-limit', '192',
            '--tmpfs', '/work:rw,nosuid,nodev,size=1024m,mode=1777',
            '--tmpfs', '/tmp:rw,nosuid,nodev,size=256m,mode=1777',
            '--mount', f'type=bind,source={ROOT},target=/input,readonly',
            '--env', 'HOME=/tmp', '--env', 'npm_config_cache=/tmp/npm-cache',
            '--workdir', '/work', '--entrypoint', entrypoint]
        if not network:
            args += ['--network', 'none']
        log = ROOT / (key + '-units.log')
        try:
            with log.open('x') as output:
                done = subprocess.run(DOCKER + args + [pin, *command], stdout=output,
                                      stderr=subprocess.STDOUT, timeout=timeout, check=False)
            results.append({'suite': key, 'exit_code': done.returncode, 'log': log.name})
            print(json.dumps(results[-1]), flush=True)
        finally:
            remove_owned()
        verify()
finally:
    remove_owned()
    verify()
    after = os.statvfs(ROOT)
    report = {'source_sha256': ARCHIVE_SHA, 'source_files': len(expected), 'results': results,
              'container_absent': True, 'created_images': 0, 'created_volumes': 0,
              'build_cache_created': False, 'shared_bases_retained': [NODE, PYTHON],
              'free_bytes_before': before.f_bavail * before.f_frsize,
              'free_bytes_after': after.f_bavail * after.f_frsize}
    (ROOT / 'unit-results.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report), flush=True)
raise SystemExit(0 if len(results) == 3 and all(item['exit_code'] == 0 for item in results) else 1)
