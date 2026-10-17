"""Freeze unchanged application source into a fresh verification directory."""
from pathlib import Path
import json
import subprocess
import sys

base = Path('C:/Users/Tanzeel/Code and projects/Elevateo Mail - Local Completion/ops/local')
previous = base / 'acceptance-integration-r2-20261014'
current = base / 'acceptance-integration-r3-20261014'
current.mkdir(exist_ok=False)
prepare = (previous / 'prepare.py').read_text().replace('Acceptance Verification R2', 'Acceptance Verification R3').replace(
    'acceptance-integration-r2-20261014', 'acceptance-integration-r3-20261014')
(current / 'prepare.py').write_text(prepare, encoding='utf-8', newline='\n')
subprocess.run([sys.executable, '-B', str(current / 'prepare.py')], check=True)
manifest = json.loads((current / 'manifest.json').read_text())
old = json.loads((previous / 'manifest.json').read_text())
assert manifest['source_files'] == old['source_files'], 'Application source changed'
launch = (previous / 'launch.py').read_text().replace('acceptance-integration-r2-20261014', 'acceptance-integration-r3-20261014')
launch = launch.replace("len(unit['results']) == 1", "len(unit['results']) == 3")
(current / 'launch.py').write_text(launch, encoding='utf-8', newline='\n')
stage = (base / 'stage-acceptance-r3.py').read_text().replace('ARCHIVE_SHA_REPLACE', manifest['archive_sha256'])
stage = stage.replace('ARCHIVE_BYTES_REPLACE', str(manifest['archive_bytes'])).replace('FILE_COUNT_REPLACE', str(len(manifest['files'])))
(current / 'stage-and-unit.py').write_text(stage, encoding='utf-8', newline='\n')
print(json.dumps({'archive_sha256': manifest['archive_sha256'], 'unchanged_source_files': len(manifest['source_files'])}))
