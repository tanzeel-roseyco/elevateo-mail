"""Prepare an independent read-only reconciliation for the exact R2 task."""
from pathlib import Path

base = Path('C:/Users/Tanzeel/Code and projects/Elevateo Mail - Local Completion/ops/local')
source = (base / 'acceptance-integration-20261014/audit-run1.py').read_text()
source = source.replace('acceptance-integration-20261014', 'acceptance-integration-r2-20261014')
source = source.replace('be02-e141bc46bcd943f2b61ea62568eb722a', 'be02-c99921afefc84652ad99adff8ad518e9')
source = source.replace('independent-run1-cleanup.json', 'independent-run2-cleanup.json')
target = base / 'acceptance-integration-r2-20261014/audit-run2.py'
target.write_text(source, encoding='utf-8', newline='\n')
print(target)
