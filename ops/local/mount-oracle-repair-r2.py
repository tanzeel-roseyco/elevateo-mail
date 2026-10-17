"""Docker-only, task-owned regression distinguishing read-only mounts from DAC denial."""
from pathlib import Path
import hashlib
import json
import os
import socket
import subprocess

ROOT = Path('/home/tanzeel/elevateo-mail-tests-20261012-ultra/acceptance-integration-r3-20261014')
SOURCE = ROOT / 'source'
OUT = ROOT / 'mount-oracle-repair-r2'
NAME = 'elevateo-mount-oracle-r2-20261014'
NODE = 'node:24.21.0-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20'
TARGET = '/workspace/apps/server'
assert socket.gethostname().split('.')[0] == 'Ubuntu-noble-latest-amd64-base'
assert os.geteuid() == 1001 and os.getegid() == 1001
assert not any(os.environ.get(key) for key in ('DOCKER_HOST', 'DOCKER_TLS_VERIFY', 'DOCKER_CERT_PATH'))
os.umask(0o077)
OUT.mkdir(mode=0o755)
manifest = json.loads((ROOT / 'manifest.json').read_text())
assert manifest['archive_sha256'] == '0b912b001fcd7f0392b20434a57e47dfc90fd40a75788491f5922b57d910e07c'

def invoke(args: list[str], timeout: int = 30) -> subprocess.CompletedProcess[str]:
    return subprocess.run(['docker', '--context', 'default', *args], text=True,
                          capture_output=True, timeout=timeout, check=False)

def verify_source() -> None:
    actual = {path.relative_to(SOURCE).as_posix(): hashlib.sha256(path.read_bytes()).hexdigest()
              for path in SOURCE.rglob('*') if path.is_file() and 'ops/local/' not in path.relative_to(SOURCE).as_posix()}
    assert actual == manifest['files'], 'Frozen regular-file source drift'
    for name in ('tmp', 'log'):
        path = SOURCE / 'apps/server' / name
        assert path.is_dir() and not path.is_symlink() and not list(path.iterdir())

fixtures: dict[str, Path] = {}
for key in ('writable-control', 'missing-log', 'missing-tmp'):
    path = OUT / key
    path.mkdir(mode=0o755)
    path.chmod(0o755)
    for name in ('tmp', 'log'):
        if key != 'missing-' + name:
            (path / name).mkdir(mode=0o755)
            (path / name).chmod(0o755)
    fixtures[key] = path
allowed = {str(SOURCE / 'apps/server'): False, **{str(path): key == 'writable-control' for key, path in fixtures.items()}}
# AIDEV-NOTE: Explicit chmod defeats the private umask; verify identical host DAC before testing mount semantics.
for value in allowed:
    metadata = Path(value).stat()
    assert (metadata.st_uid, metadata.st_gid, metadata.st_mode & 0o777) == (1001, 1001, 0o755)

def cleanup() -> None:
    found = invoke(['inspect', NAME])
    if found.returncode == 0:
        item = json.loads(found.stdout)[0]
        assert item['Name'] == '/' + NAME and item['Config']['Labels']['elevateo.task'] == NAME
        for mount in item['Mounts']:
            assert mount['Type'] == 'tmpfs' or (mount['Type'] == 'bind' and
                mount['Source'] in allowed and mount['Destination'] == TARGET and mount['RW'] == allowed[mount['Source']])
        removed = invoke(['rm', '-f', item['Id']])
        assert removed.returncode == 0, removed.stderr
    absent = invoke(['ps', '-aq', '--filter', 'name=^/' + NAME + '$'])
    assert absent.returncode == 0 and not absent.stdout.strip()

# AIDEV-NOTE: A mode-0755 directory denies UID 10001 even on rw; mountinfo is the independent topology oracle.
PROBE = r'''
const fs = require('node:fs');
const root = '/workspace/apps/server';
const mounts = fs.readFileSync('/proc/self/mountinfo', 'utf8').trim().split('\n').map(line => line.split(' '));
const at = path => {
  const entries = mounts.filter(fields => fields[4] === path);
  if (entries.length !== 1) throw new Error('Ambiguous mount');
  return entries[0];
};
const mount = at(root);
if (!mount[5].split(',').includes('ro')) {
  // The rw discrimination case proves that DAC failure alone cannot satisfy the positive oracle.
  try { fs.writeFileSync(root + '/unexpected-write', 'x', { flag: 'wx' }); process.exit(71); }
  catch (error) { if (error.code !== 'EACCES') throw new Error('Wrong denial control'); }
  process.stdout.write('RW_REJECTED_WITH_DAC_DENIAL\n');
  process.exit(66);
}
for (const name of ['tmp', 'log']) {
  const fields = at(root + '/' + name);
  if (!fields[5].split(',').includes('rw') || fields[fields.indexOf('-') + 1] !== 'tmpfs') {
    throw new Error('Wrong writable target');
  }
  fs.writeFileSync(root + '/' + name + '/proof', 'x', { flag: 'wx' });
  if (fs.readFileSync(root + '/' + name + '/proof', 'utf8') !== 'x') throw new Error('Write not visible');
}
process.stdout.write('RO_SOURCE_RW_TMPFS_OK\n');
'''
initial = invoke(['ps', '-aq', '--filter', 'name=^/' + NAME + '$'])
assert initial.returncode == 0 and not initial.stdout.strip()
endpoint = invoke(['context', 'inspect', 'default', '--format', '{{.Endpoints.docker.Host}}'])
assert endpoint.returncode == 0 and endpoint.stdout.strip() == 'unix:///var/run/docker.sock'
inspected = invoke(['image', 'inspect', NODE])
assert inspected.returncode == 0
item = json.loads(inspected.stdout)[0]
assert item['Os'] == 'linux' and item['Architecture'] == 'amd64' and not item['Config'].get('Volumes')
before = os.statvfs(OUT)
results: list[dict[str, object]] = []
try:
    verify_source()
    for key in ('read-only-positive', 'writable-control', 'missing-log', 'missing-tmp'):
        source = SOURCE / 'apps/server' if key == 'read-only-positive' else fixtures[key]
        writable = key == 'writable-control'
        args = ['run', '--rm', '--name', NAME, '--label', 'elevateo.task=' + NAME,
            '--user', '10001:10001', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
            '--read-only', '--memory', '128m', '--cpus', '1', '--pids-limit', '32', '--network', 'none',
            '--mount', f'type=bind,source={source},target={TARGET}' + ('' if writable else ',readonly')]
        for name in ('tmp', 'log'):
            args += ['--tmpfs', f'{TARGET}/{name}:rw,nosuid,nodev,size=16m,uid=10001,gid=10001,mode=1770']
        args += ['--workdir', TARGET, '--entrypoint', 'node', NODE, '-e', PROBE]
        try:
            done = invoke(args)
            with (OUT / (key + '.log')).open('x') as output:
                output.write(done.stdout + done.stderr)
            if key == 'read-only-positive':
                passed = done.returncode == 0 and done.stdout == 'RO_SOURCE_RW_TMPFS_OK\n'
            elif writable:
                passed = done.returncode == 66 and done.stdout == 'RW_REJECTED_WITH_DAC_DENIAL\n'
            else:
                passed = done.returncode == 125 and 'read-only file system' in done.stderr and \
                    TARGET + '/' + key.removeprefix('missing-') in done.stderr
            results.append({'case': key, 'passed': passed, 'observed_exit': done.returncode})
            print(json.dumps(results[-1]), flush=True)
        finally:
            cleanup()
        verify_source()
        assert not any((path / 'unexpected-write').exists() for path in fixtures.values())
finally:
    cleanup()
    verify_source()
    after = os.statvfs(OUT)
    report = {'results': results, 'passed': len(results) == 4 and all(row['passed'] for row in results),
        'source_unchanged': True, 'container_absent': True, 'created_images': 0, 'created_volumes': 0,
        'build_cache_created': False, 'shared_bases_retained': [NODE],
        'free_bytes_before': before.f_bavail * before.f_frsize, 'free_bytes_after': after.f_bavail * after.f_frsize}
    with (OUT / 'results.json').open('x') as output:
        json.dump(report, output, indent=2)
    print(json.dumps(report), flush=True)
raise SystemExit(0 if report['passed'] else 1)
