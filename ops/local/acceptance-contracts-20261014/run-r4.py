import hashlib
import json
from pathlib import Path
import subprocess
import sys

ROOT = Path('/home/tanzeel/elevateo-mail-tests-20261012-ultra/acceptance-contracts-20261014')
NAME = 'elevateo-acceptance-contracts-r4-20261014'
IMAGE = 'node:24.21.0-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20'
DOCKER = ['docker', '--context', 'default']
expected = sys.argv[1]
assert hashlib.sha256((ROOT / 'context-r4.tar').read_bytes()).hexdigest() == expected
test_exit = 1
try:
    # AIDEV-NOTE: Source is immutable; dependencies and compiler output exist only in disposable tmpfs.
    command = DOCKER + ['run', '--rm', '--name', NAME, '--label', 'elevateo.task=' + NAME,
        '--user', '1001:1001', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
        '--read-only', '--memory', '2g', '--cpus', '2', '--pids-limit', '192',
        '--tmpfs', '/work:rw,nosuid,nodev,size=1024m,mode=1777',
        '--tmpfs', '/tmp:rw,nosuid,nodev,size=256m,mode=1777',
        '--mount', f'type=bind,source={ROOT},target=/input,readonly',
        '--env', 'HOME=/tmp', '--env', 'npm_config_cache=/tmp/npm-cache',
        '--workdir', '/work', IMAGE, 'sh', '-ec',
        'mkdir /work/source && tar -xf /input/context-r4.tar -C /work/source && cd /work/source && npm ci --ignore-scripts --no-audit --no-fund && node node_modules/typescript/bin/tsc && npm test']
    test_exit = subprocess.run(command, timeout=420, check=False).returncode
finally:
    found = subprocess.run(DOCKER + ['inspect', NAME], capture_output=True, text=True, timeout=15)
    if found.returncode == 0:
        container = json.loads(found.stdout)[0]
        assert container['Name'] == '/' + NAME
        assert container['Config']['Labels']['elevateo.task'] == NAME
        for mount in container['Mounts']:
            assert mount['Type'] == 'bind' and mount['Source'] == str(ROOT)
        subprocess.run(DOCKER + ['rm', '-f', container['Id']], check=True, timeout=30)
    absent = subprocess.run(DOCKER + ['ps', '-aq', '--filter', 'name=^/' + NAME + '$'],
                            capture_output=True, text=True, check=True, timeout=15)
    assert not absent.stdout.strip(), 'Task container cleanup failed'
    assert hashlib.sha256((ROOT / 'context-r4.tar').read_bytes()).hexdigest() == expected
    print(json.dumps({'test_exit': test_exit, 'container_absent': True, 'archive_sha256': expected,
                      'created_images': 0, 'created_volumes': 0, 'build_cache_created': False,
                      'shared_base_retained': IMAGE}))
raise SystemExit(test_exit)
