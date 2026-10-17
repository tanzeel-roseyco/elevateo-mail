"""Read-only independent reconciliation of the exact failed integration task."""
from pathlib import Path
import hashlib
import json
import os
import socket
import subprocess

root = Path('/home/tanzeel/elevateo-mail-tests-20261012-ultra/acceptance-integration-r3-20261014')
project = 'be02-95e5142d918d4a0ca3dae89acfd81d7e'
evidence = root / 'source/ops/local' / project
assert socket.gethostname().split('.')[0] == 'Ubuntu-noble-latest-amd64-base'
assert os.geteuid() == 1001

def docker(args: list[str]) -> str:
    result = subprocess.run(['docker', '--context', 'default', *args], capture_output=True,
                            text=True, timeout=30, check=True)
    return result.stdout.strip()

checks: dict[str, bool] = {}
for kind, args in [('containers', ['ps', '-aq']), ('volumes', ['volume', 'ls', '-q']),
                   ('networks', ['network', 'ls', '-q']), ('images', ['image', 'ls', '-q'])]:
    for label in ('elevateo.be02.project=', 'com.docker.compose.project='):
        checks[kind + ':' + label] = not docker([*args, '--filter', 'label=' + label + project])
    checks[kind + ':names'] = project not in docker([*args[:-1], '--format', '{{.Name}}'] if kind in ('volumes', 'networks')
                                                   else (['ps', '-a', '--format', '{{.Names}}'] if kind == 'containers'
                                                         else ['image', 'ls', '--format', '{{.Repository}}:{{.Tag}}']))
builders = [json.loads(line) for line in docker(['buildx', 'ls', '--format', 'json']).splitlines() if line]
checks['builder_absent'] = not any(row.get('Name') == project + '-builder' for row in builders)
checks['environment_absent'] = not (evidence / '.env').exists() and not list(evidence.glob('*.env'))
before = json.loads((evidence / 'source.sha256.json').read_text())
after = json.loads((evidence / 'source.after.sha256.json').read_text())
checks['source_unchanged'] = before == after and all(
    hashlib.sha256((root / 'source' / rel).read_bytes()).hexdigest() == digest for rel, digest in before.items())
checks['reported_cleanup'] = json.loads((evidence / 'result.json').read_text())['cleanup_passed'] is True
report = {'project': project, 'checks': checks, 'passed': all(checks.values()),
          'free_bytes': os.statvfs(root).f_bavail * os.statvfs(root).f_frsize,
          'scope': 'read-only exact task reconciliation; shared resources retained'}
with (root / 'independent-run3-cleanup.json').open('x') as output:
    json.dump(report, output, indent=2)
print(json.dumps(report))
raise SystemExit(0 if report['passed'] else 1)
