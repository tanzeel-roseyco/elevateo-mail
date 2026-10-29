"""Host staging and Docker-only regression for nested tmpfs mountpoints."""
from pathlib import Path, PurePosixPath
import hashlib
import json
import os
import socket
import subprocess
import tarfile

ROOT = Path('/home/tanzeel/elevateo-mail-tests-20261012-ultra/acceptance-integration-r3-20261014')
SOURCE = ROOT / 'source'
NAME = 'elevateo-acceptance-units-r3-20261014'
DOCKER = ['docker', '--context', 'default']
NODE = 'node:24.21.0-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20'
ARCHIVE_SHA = 'ARCHIVE_SHA_REPLACE'
assert socket.gethostname().split('.')[0] == 'Ubuntu-noble-latest-amd64-base'
assert os.geteuid() == 1001 and os.getegid() == 1001
assert not any(os.environ.get(key) for key in ('DOCKER_HOST', 'DOCKER_TLS_VERIFY', 'DOCKER_CERT_PATH'))
os.umask(0o077)
archive = ROOT / 'context.tar'
manifest = json.loads((ROOT / 'manifest.json').read_text())
assert hashlib.sha256(archive.read_bytes()).hexdigest() == ARCHIVE_SHA == manifest['archive_sha256']
assert archive.stat().st_size == manifest['archive_bytes'] == ARCHIVE_BYTES_REPLACE
expected = manifest['files']
assert len(expected) == FILE_COUNT_REPLACE
SOURCE.mkdir(mode=0o755)
# AIDEV-NOTE: Only manifest-pinned regular files may be extracted; no archive-owned links or ownership.
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
# AIDEV-NOTE: Docker cannot create nested tmpfs targets beneath the read-only Rails source bind.
# These fixed empty directories are topology, not mutable application data or archive entries.
for name in ('tmp', 'log'):
    (SOURCE / 'apps/server' / name).mkdir(exist_ok=False)
for directory in (path for path in SOURCE.rglob('*') if path.is_dir()):
    directory.chmod(0o755)
SOURCE.chmod(0o755)

def verify() -> None:
    actual = {path.relative_to(SOURCE).as_posix(): hashlib.sha256(path.read_bytes()).hexdigest()
              for path in SOURCE.rglob('*') if path.is_file()}
    assert actual == expected, 'Frozen source drift'
    for name in ('tmp', 'log'):
        path = SOURCE / 'apps/server' / name
        assert path.is_dir() and not path.is_symlink() and not list(path.iterdir())

def invoke(args: list[str], timeout: int = 30) -> subprocess.CompletedProcess[str]:
    return subprocess.run(DOCKER + args, text=True, capture_output=True, timeout=timeout, check=False)

fixtures = ROOT / 'mount-fixtures'
fixtures.mkdir(mode=0o755)
allowed_sources = {str(SOURCE / 'apps/server')}
for missing in ('tmp', 'log'):
    fixture = fixtures / ('missing-' + missing)
    (fixture / ('log' if missing == 'tmp' else 'tmp')).mkdir(parents=True)
    fixture.chmod(0o755)
    allowed_sources.add(str(fixture))

def remove_owned() -> None:
    found = invoke(['inspect', NAME])
    if found.returncode == 0:
        item = json.loads(found.stdout)[0]
        assert item['Name'] == '/' + NAME and item['Config']['Labels']['elevateo.task'] == NAME
        for mount in item['Mounts']:
            assert mount['Type'] == 'tmpfs' or (mount['Type'] == 'bind' and
                mount['Source'] in allowed_sources and mount['Destination'] == '/workspace/apps/server' and not mount['RW'])
        removed = invoke(['rm', '-f', item['Id']])
        assert removed.returncode == 0, removed.stderr
    absent = invoke(['ps', '-aq', '--filter', 'name=^/' + NAME + '$'])
    assert absent.returncode == 0 and not absent.stdout.strip(), 'Task container cleanup failed'

initial = invoke(['ps', '-aq', '--filter', 'name=^/' + NAME + '$'])
assert initial.returncode == 0 and not initial.stdout.strip()
endpoint = invoke(['context', 'inspect', 'default', '--format', '{{.Endpoints.docker.Host}}'])
assert endpoint.returncode == 0 and endpoint.stdout.strip() == 'unix:///var/run/docker.sock'
inspected = invoke(['image', 'inspect', NODE])
assert inspected.returncode == 0
item = json.loads(inspected.stdout)[0]
assert item['Os'] == 'linux' and item['Architecture'] == 'amd64' and not item['Config'].get('Volumes')
prior = ROOT.with_name('acceptance-integration-r2-20261014')
assert manifest['source_files'] == json.loads((prior / 'manifest.json').read_text())['source_files']
prior_units = json.loads((prior / 'unit-results.json').read_text())
assert len(prior_units['results']) == 1 and prior_units['results'][0]['exit_code'] == 0 and prior_units['container_absent']
before = os.statvfs(ROOT)
results: list[dict[str, object]] = []
try:
    verify()
    for key in ('writable-targets', 'missing-log', 'missing-tmp'):
        source = SOURCE / 'apps/server' if key == 'writable-targets' else fixtures / key
        args = ['run', '--rm', '--name', NAME, '--label', 'elevateo.task=' + NAME,
            '--user', '10001:10001', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
            '--read-only', '--memory', '128m', '--cpus', '1', '--pids-limit', '32', '--network', 'none',
            '--mount', f'type=bind,source={source},target=/workspace/apps/server,readonly']
        for name in ('tmp', 'log'):
            args += ['--tmpfs', f'/workspace/apps/server/{name}:rw,nosuid,nodev,size=16m,uid=10001,gid=10001,mode=1770']
        args += ['--workdir', '/workspace/apps/server', '--entrypoint', 'sh', NODE, '-eu', '-c',
            'touch tmp/write-proof log/write-proof; '
            'if touch .unexpected-write 2>/dev/null; then exit 70; fi; '
            'test -f tmp/write-proof; test -f log/write-proof; printf "MOUNTS_OK\\n"']
        try:
            done = invoke(args)
            log = ROOT / (key + '-units.log')
            with log.open('x') as output:
                output.write(done.stdout + done.stderr)
            passed = (done.returncode == 0 and done.stdout.strip() == 'MOUNTS_OK') if key == 'writable-targets' else (
                done.returncode == 125 and 'read-only file system' in done.stderr and
                '/workspace/apps/server/' + key.removeprefix('missing-') in done.stderr)
            results.append({'suite': key, 'exit_code': 0 if passed else 1, 'observed_exit': done.returncode, 'log': log.name})
            print(json.dumps(results[-1]), flush=True)
        finally:
            remove_owned()
        verify()
finally:
    remove_owned()
    verify()
    after = os.statvfs(ROOT)
    report = {'source_sha256': ARCHIVE_SHA, 'source_files': len(expected), 'results': results,
        'container_absent': True, 'created_images': 0, 'created_volumes': 0, 'build_cache_created': False,
        'shared_bases_retained': [NODE], 'prior_prerequisites': str(prior / 'unit-results.json'),
        'free_bytes_before': before.f_bavail * before.f_frsize, 'free_bytes_after': after.f_bavail * after.f_frsize}
    with (ROOT / 'unit-results.json').open('x') as output:
        json.dump(report, output, indent=2)
    print(json.dumps(report), flush=True)
raise SystemExit(0 if len(results) == 3 and all(row['exit_code'] == 0 for row in results) else 1)
