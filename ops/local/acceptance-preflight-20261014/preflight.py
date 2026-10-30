import hashlib
import json
import os
from pathlib import Path
import subprocess

ROOT = Path('/home/tanzeel/elevateo-mail-tests-20261012-ultra/acceptance-preflight-20261014')
NODE = 'node:24.21.0-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20'
GRID = 'selenium/standalone-chrome:4.49.0-20260909@sha256:88dacdd42d93ab738bed045129376b2f965117c5f2e4710693e54695d531380d'
NAME = 'elevateo-acceptance-inspect-20261014'
DOCKER = ['docker', '--context', 'default']

def docker(*args, timeout=30):
    return subprocess.run(DOCKER + list(args), check=True, capture_output=True, text=True, timeout=timeout).stdout

assert hashlib.sha256((ROOT / 'seccomp.json').read_bytes()).hexdigest() == 'cc3e61cabda6bbc1e53e54d27ba4d55a9d3be829b6dd1a596f4a7b31b1cc7849'
assert not docker('ps', '-aq', '--filter', 'name=^/' + NAME + '$').strip()
container_id = None
try:
    container_id = docker('create', '--name', NAME, '--label', 'elevateo.task=' + NAME,
        '--user', f'{os.getuid()}:{os.getgid()}', '--read-only', '--cap-drop', 'ALL',
        '--security-opt', 'no-new-privileges:true', '--security-opt', 'seccomp=' + str(ROOT / 'seccomp.json'),
        '--pids-limit', '512', '--cpus', '2', '--memory', '3g', '--shm-size', '1g',
        '--tmpfs', '/tmp:rw,nosuid,nodev,size=512m,mode=1777', '--network', 'none', NODE, 'true').strip()
    item = json.loads(docker('inspect', container_id))[0]
    assert item['Name'] == '/' + NAME and item['Config']['Labels']['elevateo.task'] == NAME
    selected = {key: item['HostConfig'].get(key) for key in ['SecurityOpt', 'Tmpfs', 'PidsLimit', 'NanoCpus', 'Memory', 'ShmSize', 'ReadonlyRootfs', 'CapDrop', 'UsernsMode']}
    selected['User'] = item['Config']['User']
    selected['daemonSecurityOptions'] = json.loads(docker('info', '--format', '{{json .SecurityOptions}}'))
    (ROOT / 'inspect-policy.json').write_text(json.dumps(selected, indent=2) + '\n')
    print(json.dumps({key: value for key, value in selected.items() if key != 'SecurityOpt'}), flush=True)
finally:
    if container_id:
        item = json.loads(docker('inspect', container_id))[0]
        assert item['Name'] == '/' + NAME and item['Config']['Labels']['elevateo.task'] == NAME
        assert all(mount['Type'] == 'tmpfs' and mount['Destination'] == '/tmp' for mount in item['Mounts'])
        docker('rm', container_id)
    assert not docker('ps', '-aq', '--filter', 'name=^/' + NAME + '$').strip()
    print('inspect_container_absent=true', flush=True)

before = os.statvfs(ROOT).f_bavail * os.statvfs(ROOT).f_frsize
with (ROOT / 'grid-pull.log').open('w') as stream:
    subprocess.run(DOCKER + ['pull', GRID], check=True, stdout=stream, stderr=subprocess.STDOUT, timeout=900)
grid = json.loads(docker('image', 'inspect', GRID))[0]
assert grid['Os'] == 'linux' and grid['Architecture'] == 'amd64'
assert not grid['Config'].get('Volumes')
after = os.statvfs(ROOT).f_bavail * os.statvfs(ROOT).f_frsize
print(json.dumps({'grid_pin_present': GRID, 'grid_id': grid['Id'], 'platform': 'linux/amd64', 'free_before': before, 'free_after': after, 'shared_base_retained': True}), flush=True)
