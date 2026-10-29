"""Host orchestration only; application and harness regressions execute inside Docker."""
from pathlib import Path, PurePosixPath
import hashlib
import json
import os
import socket
import subprocess
import sys
import tarfile

ROOT = Path('/home/tanzeel/elevateo-mail-tests-20261012-ultra/acceptance-integration-r2-20261014')
SOURCE = ROOT / 'source'
NAME = 'elevateo-acceptance-units-r2-20261014'
DOCKER = ['docker', '--context', 'default']
POSTGRES = 'supabase/postgres:17.6.1.136@sha256:f371b5f3f2ac0a05703f33d6e6134515fb2498cab708fb948a0aeb7481467c00'
ARCHIVE_SHA = '43d1de07a9d0501ad3a782cf9091edfdccb94c4d5b3ccc4bcc40e6284a6de8e7'
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
for pin in (POSTGRES,):
    inspected = invoke(['image', 'inspect', pin])
    assert inspected.returncode == 0
    item = json.loads(inspected.stdout)[0]
    assert item['Os'] == 'linux' and item['Architecture'] == 'amd64' and not item['Config'].get('Volumes')
before = os.statvfs(ROOT)
results: list[dict[str, object]] = []
try:
    verify()
    # AIDEV-NOTE: Unchanged prerequisites retain their original archive identity; only the portability repair reruns here.
    previous = ROOT.with_name('acceptance-integration-20261014')
    prior_units = json.loads((previous / 'unit-results.json').read_text())
    prior_manifest = json.loads((previous / 'manifest.json').read_text())
    assert prior_units['source_sha256'] == prior_manifest['archive_sha256'] == '1a368d4d0f71df09cbbc11d7661e016ed966cfe8cf3ec2ac2acada52e3ac065b'
    assert len(prior_units['results']) == 3 and all(row['exit_code'] == 0 for row in prior_units['results'])
    assert prior_units['container_absent'] is True
    differences = {name for name, digest in manifest['source_files'].items() if prior_manifest['source_files'].get(name) != digest}
    assert differences == {
        'ops/tests/be02-guards/auth-rls-concurrency.sh',
        'ops/tests/be02-guards/auth-rls-concurrency-processes.sh',
        'ops/tests/be02-guards/auth-rls-concurrency-harness-regression.sh',
    }
    assert set(manifest['source_files']) == set(prior_manifest['source_files'])
    checks = [
        ('busybox-timeout', POSTGRES, 'bash', ['-euc',
            'for script in auth-rls-concurrency.sh auth-rls-concurrency-processes.sh auth-rls-concurrency-harness-regression.sh; do '
            'bash -n /input/source/ops/tests/be02-guards/$script; done; '
            'timeout -k 1 5 bash /input/source/ops/tests/be02-guards/auth-rls-concurrency-harness-regression.sh'], 30, False),
    ]
    for key, pin, entrypoint, command, timeout, network in checks:
        args = ['run', '--rm', '--name', NAME, '--label', 'elevateo.task=' + NAME,
            '--user', '1001:1001', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
            '--read-only', '--memory', '2g', '--cpus', '2', '--pids-limit', '192',
            '--tmpfs', '/work:rw,nosuid,nodev,size=1024m,mode=1777',
            '--tmpfs', '/tmp:rw,nosuid,nodev,size=256m,mode=1777',
            '--mount', f'type=bind,source={ROOT},target=/input,readonly',
            '--env', 'BE02_GUARDS_DISPOSABLE=1', '--env', 'HOME=/tmp', '--env', 'npm_config_cache=/tmp/npm-cache',
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
              'build_cache_created': False, 'shared_bases_retained': [POSTGRES],
              'unchanged_prerequisite_archive': '1a368d4d0f71df09cbbc11d7661e016ed966cfe8cf3ec2ac2acada52e3ac065b',
              'free_bytes_before': before.f_bavail * before.f_frsize,
              'free_bytes_after': after.f_bavail * after.f_frsize}
    (ROOT / 'unit-results.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report), flush=True)
raise SystemExit(0 if len(results) == 1 and all(item['exit_code'] == 0 for item in results) else 1)
