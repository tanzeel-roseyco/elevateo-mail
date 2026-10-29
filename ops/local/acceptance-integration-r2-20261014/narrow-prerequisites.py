"""Narrow R2 prerequisite execution to the three changed guard scripts; preserve prior immutable unit evidence."""
from pathlib import Path
import json
root = Path("C:/Users/Tanzeel/Code and projects/Elevateo Mail - Local Completion/ops/local/acceptance-integration-r2-20261014")
path = root / 'stage-and-unit.py'
source = path.read_text()
a = source.index('NODE = ')
b = source.index('ARCHIVE_SHA = ')
source = source[:a] + "POSTGRES = 'supabase/postgres:17.6.1.136@sha256:f371b5f3f2ac0a05703f33d6e6134515fb2498cab708fb948a0aeb7481467c00'\n" + source[b:]
source = source.replace('for pin in (NODE, PYTHON):', 'for pin in (POSTGRES,):')
a = source.index('    checks = [')
b = source.index('    for key, pin, entrypoint', a)
source = source[:a] + """    # AIDEV-NOTE: Unchanged prerequisites retain their original archive identity; only the portability repair reruns here.
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
""" + source[b:]
source = source.replace("'--env', 'HOME=/tmp',", "'--env', 'BE02_GUARDS_DISPOSABLE=1', '--env', 'HOME=/tmp',")
source = source.replace("'shared_bases_retained': [NODE, PYTHON],", "'shared_bases_retained': [POSTGRES],\n              'unchanged_prerequisite_archive': '1a368d4d0f71df09cbbc11d7661e016ed966cfe8cf3ec2ac2acada52e3ac065b',")
source = source.replace('len(results) == 3', 'len(results) == 1')
path.write_text(source, encoding='utf-8', newline='\n')
launch = root / 'launch.py'
launch.write_text(launch.read_text().replace("len(unit['results']) == 3", "len(unit['results']) == 1"), encoding='utf-8', newline='\n')
print('R2 orchestration will run only the changed timeout harness in the pinned PostgreSQL image.')

