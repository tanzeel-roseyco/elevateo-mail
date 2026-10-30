"""Synchronize the current evidence checkpoint without altering historical records."""
from pathlib import Path
import re

root = Path('C:/Users/Tanzeel/Code and projects/Elevateo Mail - Local Completion')
checkpoint = ('Verification checkpoint (2026-10-14 Sydney): frozen frontend validation passed API generation, lint, typecheck, production build, 611 unit tests and 270 fixture-backed Playwright tests on fleet-02; 72 conditional skips remain excluded. Of 571 captured PNGs, 14 were manually inspected without obvious clipping or overlap; full visual acceptance remains open. The frozen acceptance prerequisites passed TypeScript, 51 JavaScript unit checks, 12 evidence unit checks and 14 Python policy/finalization checks. Bounded independent repairs were re-reviewed with zero new defects. Integrated R2 passed real Auth/RLS concurrency and built Rails, then failed migration startup because the frozen archive omitted empty bind-mount directories. Independent cleanup passed all 16 checks for both R1 and R2. Test-packaging repair is in progress. Real Rails browser journeys, performance, restore, connectors, native clients and BE-03 remain unaccepted; 16 explicit Playwright controls are still NOT_RUN. No live deployment or new ultrareviews. Evidence and limits: docs/completion/verification-20261014.md. Earlier checkpoints below are historical.')
for relative in ('README.md', 'state.md', 'documentation.md', '.planning/STATE.md', 'docs/completion/verification-20261014.md'):
    path = root / relative
    content = path.read_text(encoding='utf-8')
    content, count = re.subn(r'Verification checkpoint \(2026-10-14 Sydney\):[^\n]+', checkpoint, content)
    assert count == (2 if relative == 'README.md' else 1), (relative, count)
    path.write_text(content, encoding='utf-8', newline='\n')
path = root / 'docs/completion/verification-20261014.md'
content = path.read_text()
content = content.replace('| GUI artifacts | 571 PNGs captured | Capture is not equivalent to manual approval of all screenshots |', '| GUI artifacts | 571 PNGs captured; 14 manually inspected | No obvious clipping/overlap in that sample; full visual approval remains open |')
content = content.replace('| Acceptance package TypeScript and unit tests | 48 passed, 0 failed/skipped | Harness contracts, proxy, boundaries, origin and screenshot helpers; not real app journeys |', '| Acceptance prerequisites | TypeScript; 51 JS, 12 evidence and 14 Python checks passed | Frozen integration archive 1a368d4d0f71df09cbbc11d7661e016ed966cfe8cf3ec2ac2acada52e3ac065b; not real app journeys |')
start = content.index('Repair and independently re-review')
end = content.index('\n\nFull visual approval', start)
content = content[:start] + ('Cleanup exception finalization, exact sandbox validation, unique expected evidence, Selenium plaintext and screenshot-write repairs have completed bounded static re-review and focused Docker regressions. Integrated execution is blocked at Rails migration container startup by omitted empty directories in the frozen source bind mount. The Playwright real-app suite declares 26 cases per engine with 16 explicit NOT_RUN controls. Puppeteer and Selenium each author four app journeys; none has executed against Rails yet. Authored synthetic probes do not increase application scenario counts. The 216 proposed matrix paths remain a plan, not executed tests.') + content[end:]
content += '''
## Integrated attempts and repair evidence

R1 (`be02-e141bc46bcd943f2b61ea62568eb722a`, archive `1a368d4d0f71df09cbbc11d7661e016ed966cfe8cf3ec2ac2acada52e3ac065b`) failed before Rails build because BusyBox timeout rejected a GNU long option. R2 (`be02-c99921afefc84652ad99adff8ad518e9`, archive `43d1de07a9d0501ad3a782cf9091edfdccb94c4d5b3ccc4bcc40e6284a6de8e7`) contains exactly three changed guard scripts. Its focused pinned-image regression passed 3 actual timeout fixtures, 18 diagnostic fixtures and 16 cleanup fixtures. The integrated run then passed all three real Auth/RLS lock schedules, exact catalog restoration and absence of owned sessions (7.44 seconds total), and built the Rails image. Migration did not start: Docker could not create `/workspace/apps/server/log` beneath the read-only source mount. Rails tests and browser lanes remain NOT_RUN.

Independent read-only reconciliation found all 16 exact task cleanup checks passed for each attempt: containers, volumes, networks, image, builder, runtime environment and source integrity. R2 removed its disposable Rails image, builder/cache, database volumes and services; shared pinned images remain. R2 free bytes after cleanup were 266473910272; shared-host deltas are not attributable reclamation. Remote evidence is under `/home/tanzeel/elevateo-mail-tests-20261012-ultra/acceptance-integration-20261014` and `acceptance-integration-r2-20261014`; local mirrors are under `ops/local` with the same directory names.

Latest independent source reviews: evidence validation 336 LOC/0 defects; resource policy and finalization 312 LOC/0 defects; portable timeout 272 LOC/0 defects. These overlap earlier reviews and are not additive application coverage. All used bounded passes of at most 200 physical lines; test runtime belongs to the root-run fleet evidence.

Manually inspected flattened screenshot IDs: 0112, 0117, 0122, 0124, 0130, 0135, 0143, 0144, 0125, 0137, 0160, 0161, 0167 and 0173. `ops/local/fe-rerun-evidence/inventory.json` records full source paths and hashes. These include narrow/dark drafts, hostile plaintext messages, membership errors, authentication, mobile inboxes and keyboard focus. Screenshots alone do not prove interactions, and the remaining captures are not manually approved.
'''
path.write_text(content, encoding='utf-8', newline='\n')
path = root / 'code-reviews.md'
content = path.read_text()
section = '''## 2026-10-14 acceptance repairs and runtime checkpoint

All reviews used the full adversarial rubric, at most 200 physical lines per pass and 400 unique lines per assignment; formatting remains assigned to linters. Static review does not certify runtime or uninspected dependencies.

| Assignment | Unique LOC | Defects | Defects/KLOC |
| --- | ---: | ---: | ---: |
| [Acceptance evidence validation repair](docs/completion/review-acceptance-evidence-repair.md) | 336 | 0 | 0.00 |
| [Resource policy and finalization repair](docs/completion/review-acceptance-policy-repair.md) | 312 | 0 | 0.00 |
| [BusyBox timeout repair](docs/completion/review-be02-busybox-timeout.md) | 272 | 0 | 0.00 |

Fleet Docker prerequisites passed TypeScript, 51 JavaScript, 12 evidence and 14 Python checks. The portable timeout passed 3 actual signal/status fixtures, 18 diagnostic fixtures and 16 cleanup fixtures; actual integrated Auth/RLS schedules also passed. R2 subsequently failed migration container startup because its frozen archive omitted required empty source directories. This is a confirmed packaging defect; review defect density is N/A for the runtime discovery. Both failed attempts passed all 16 independent cleanup checks. Full source identities, runtime limits and remaining release gates are in [the verification checkpoint](docs/completion/verification-20261014.md). No ultrareviews or deployment occurred.

'''
assert '## 2026-10-14 acceptance repairs and runtime checkpoint' not in content
path.write_text(content.replace('# Code reviews\n\n', '# Code reviews\n\n' + section, 1), encoding='utf-8', newline='\n')
report = Path('C:/Users/Tanzeel/Code and projects/Elevateo Mail - BE02 Codex/docs/completion/review-be02-busybox-timeout.md')
(root / 'docs/completion/review-be02-busybox-timeout.md').write_bytes(report.read_bytes())
print('Synchronized current evidence in five state documents and the review ledger.')
