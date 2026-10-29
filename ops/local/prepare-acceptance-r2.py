"""Prepare the next immutable integration snapshot without running host application tests."""
from pathlib import Path
import json
import subprocess
import sys
base = Path("C:/Users/Tanzeel/Code and projects/Elevateo Mail - Local Completion") / 'ops/local'
previous = base / 'acceptance-integration-20261014'
current = base / 'acceptance-integration-r2-20261014'
current.mkdir(exist_ok=False)
prepare = (previous / 'prepare.py').read_text().replace(
    "Elevateo Mail - Acceptance Verification 20261014", "Elevateo Mail - Acceptance Verification R2 20261014").replace(
    "'ops/local/acceptance-integration-20261014'", "'ops/local/acceptance-integration-r2-20261014'")
(current / 'prepare.py').write_text(prepare, encoding='utf-8', newline='\n')
subprocess.run([sys.executable, '-B', str(current / 'prepare.py')], check=True)
manifest = json.loads((current / 'manifest.json').read_text())
old = json.loads((previous / 'manifest.json').read_text())
changed = [name for name, value in manifest['source_files'].items() if old['source_files'].get(name) != value]
assert changed == sorted(changed)
assert set(changed) == {
    'ops/tests/be02-guards/auth-rls-concurrency.sh',
    'ops/tests/be02-guards/auth-rls-concurrency-processes.sh',
    'ops/tests/be02-guards/auth-rls-concurrency-harness-regression.sh',
}, changed
for filename in ['stage-and-unit.py', 'launch.py']:
    content = (previous / filename).read_text().replace('acceptance-integration-20261014', 'acceptance-integration-r2-20261014').replace(
        'elevateo-acceptance-units-20261014', 'elevateo-acceptance-units-r2-20261014').replace(
        old['archive_sha256'], manifest['archive_sha256']).replace(
        '== 2938880', '== ' + str(manifest['archive_bytes'])).replace(
        '== 420', '== ' + str(len(manifest['files'])))
    (current / filename).write_text(content, encoding='utf-8', newline='\n')
print(json.dumps({'changed_source': changed, 'archive_sha256': manifest['archive_sha256'], 'files': len(manifest['files'])}))

