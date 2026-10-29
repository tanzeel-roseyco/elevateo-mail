import json
from pathlib import Path
import subprocess

ROOT = Path('/home/tanzeel/elevateo-mail-tests-20261012-ultra/acceptance-lock-20261014')
NAME = 'elevateo-acceptance-lock-20261014'
IMAGE = 'node:24.21.0-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20'
DOCKER = ['docker', '--context', 'default']
output = ROOT / 'output'
output.mkdir(mode=0o700)
exit_code = 1
try:
    # AIDEV-NOTE: Only the resolver's output bind is writable; cache and work files die with the container.
    command = DOCKER + ['run', '--rm', '--name', NAME, '--label', 'elevateo.task=' + NAME,
        '--user', '1001:1001', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
        '--read-only', '--memory', '1g', '--cpus', '2', '--pids-limit', '128',
        '--tmpfs', '/work:rw,nosuid,nodev,size=256m,mode=1777',
        '--tmpfs', '/tmp:rw,nosuid,nodev,size=128m,mode=1777',
        '--mount', f'type=bind,source={ROOT},target=/input,readonly',
        '--mount', f'type=bind,source={output},target=/output',
        '--env', 'HOME=/tmp', '--env', 'npm_config_cache=/tmp/npm-cache',
        '--workdir', '/work', IMAGE, 'node', '/input/resolve-inputs.mjs']
    exit_code = subprocess.run(command, timeout=390, check=False).returncode
finally:
    found = subprocess.run(DOCKER + ['inspect', NAME], capture_output=True, text=True, timeout=15)
    if found.returncode == 0:
        container = json.loads(found.stdout)[0]
        assert container['Name'] == '/' + NAME
        assert container['Config']['Labels']['elevateo.task'] == NAME
        for mount in container['Mounts']:
            assert mount['Type'] == 'bind' and mount['Source'] in [str(ROOT), str(output)]
        subprocess.run(DOCKER + ['rm', '-f', container['Id']], check=True, timeout=30)
    absent = subprocess.run(DOCKER + ['ps', '-aq', '--filter', 'name=^/' + NAME + '$'],
                            capture_output=True, text=True, check=True, timeout=15)
    assert not absent.stdout.strip(), 'Task container cleanup failed'
    print(json.dumps({'test_exit': exit_code, 'container_absent': True, 'created_images': 0,
                      'created_volumes': 0, 'build_cache_created': False, 'shared_base_retained': IMAGE}))
raise SystemExit(exit_code)
