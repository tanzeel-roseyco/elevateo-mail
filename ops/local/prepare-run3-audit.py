"""Prepare the exact R3 read-only cleanup reconciliation from the inspected R2 script."""
from pathlib import Path

base = Path('C:/Users/Tanzeel/Code and projects/Elevateo Mail - Local Completion/ops/local')
text = (base / 'acceptance-integration-r2-20261014/audit-run2.py').read_text()
text = text.replace('acceptance-integration-r2-20261014', 'acceptance-integration-r3-20261014')
text = text.replace('be02-c99921afefc84652ad99adff8ad518e9', 'be02-95e5142d918d4a0ca3dae89acfd81d7e')
text = text.replace('independent-run2-cleanup.json', 'independent-run3-cleanup.json')
target = base / 'acceptance-integration-r3-20261014/audit-run3.py'
with target.open('x', encoding='utf-8', newline='\n') as output:
    output.write(text)
print(target)
