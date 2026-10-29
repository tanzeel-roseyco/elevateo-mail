"""Run the frozen integrated suite; this host wrapper executes no application assertions."""
from pathlib import Path
import hashlib
import json
import subprocess

root = Path('/home/tanzeel/elevateo-mail-tests-20261012-ultra/acceptance-integration-r2-20261014')
source = root / 'source'
manifest = json.loads((root / 'manifest.json').read_text())
unit = json.loads((root / 'unit-results.json').read_text())
assert len(unit['results']) == 1 and all(item['exit_code'] == 0 for item in unit['results'])
assert unit['container_absent']
actual = {path.relative_to(source).as_posix(): hashlib.sha256(path.read_bytes()).hexdigest()
          for path in source.rglob('*') if path.is_file()}
assert actual == manifest['files']
command = ['python3', '-B', '-u', str(source / 'ops/tests/be02/run.py'),
           '--context', 'default', '--expect-host', 'Ubuntu-noble-latest-amd64-base',
           '--acceptance', '--acceptance-dispatch-id', 'acceptance-integration-r2-20261014']
print('Starting frozen BE02 and real-browser acceptance; inspect integration.log', flush=True)
with (root / 'integration.log').open('x') as output:
    result = subprocess.run(command, stdout=output, stderr=subprocess.STDOUT, check=False, timeout=7600)
(root / 'integration-exit.json').write_text(json.dumps({'exit_code': result.returncode}) + '\n')
print(json.dumps({'exit_code': result.returncode, 'log': str(root / 'integration.log')}), flush=True)
raise SystemExit(result.returncode)

