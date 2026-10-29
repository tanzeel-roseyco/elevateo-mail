"""Reconcile the third real-stack failure and the independent mount regressions."""
from pathlib import Path
import re

root = Path('C:/Users/Tanzeel/Code and projects/Elevateo Mail - Local Completion')
checkpoint = ('Verification checkpoint (2026-10-14 Sydney): frozen frontend validation passed API generation, lint, typecheck, production build, 611 unit tests and 270 fixture-backed Playwright tests on fleet-02; 72 conditional skips remain excluded. Of 571 captured PNGs, 14 were manually inspected without obvious clipping or overlap; full visual acceptance remains open. Frozen acceptance prerequisites passed TypeScript, 51 JavaScript unit checks, 12 evidence unit checks and 14 Python policy/finalization checks. Integrated R3 repaired the missing mount directories, built Rails and reached the draft migration, which failed because its restricted role cannot create the private schema. The database repair is undergoing fresh consultations and design review. All 16 independent cleanup checks passed for each of R1, R2 and R3. Four Docker mount regressions passed, including the writable-source discrimination control; their source review is pending. The controls design review found three coverage-record defects and browser expansion is in design. Real Rails browser journeys, performance, restore, connectors, native clients and BE-03 remain unaccepted; 16 explicit Playwright controls are still NOT_RUN. No live deployment or new ultrareviews. Evidence and limits: docs/completion/verification-20261014.md. Earlier checkpoints below are historical.')
for relative in ('README.md', 'state.md', 'documentation.md', '.planning/STATE.md', 'docs/completion/verification-20261014.md'):
    path = root / relative
    content, count = re.subn(r'Verification checkpoint \(2026-10-14 Sydney\):[^\n]+', checkpoint, path.read_text(encoding='utf-8'))
    assert count == (2 if relative == 'README.md' else 1), (relative, count)
    path.write_text(content, encoding='utf-8', newline='\n')

path = root / 'docs/completion/verification-20261014.md'
content = path.read_text(encoding='utf-8').replace('Integrated execution is blocked at Rails migration container startup by omitted empty directories in the frozen source bind mount.', 'R3 repaired the omitted empty source directories. Integrated execution is now blocked at the draft migration by a private-schema creation privilege defect; fresh consultations and a least-privilege repair design are in progress.')
section = '''
## R3: migration failure, cleanup and stronger mount evidence

R3 (`be02-95e5142d918d4a0ca3dae89acfd81d7e`, archive `0b912b001fcd7f0392b20434a57e47dfc90fd40a75788491f5922b57d910e07c`) retained the 414 application source files from R2 unchanged and restored empty `apps/server/tmp` and `log` directories before mounting them. Rails built and the first five migrations completed. `20261013000004 CreateAppDraftsOperations` failed with PostgreSQL permission denied for database `postgres` while creating its private schema. Rails tests and all real-stack browser journeys remain NOT_RUN. No broad database CREATE grant has been applied.

The separate read-only reconciliation passed all 16 checks: exact task containers, volumes, network, image, builder and runtime environment were absent, frozen source was unchanged, and reported cleanup agreed. Host free bytes at reconciliation were 266407550976; shared-host movement is not attributable reclamation. Local evidence is `ops/local/acceptance-integration-r3-20261014`; remote evidence is `/home/tanzeel/elevateo-mail-tests-20261012-ultra/acceptance-integration-r3-20261014`.

The original mount review found one medium defect in 162 inspected LOC (6.17 defects/KLOC): a failed source write could establish Unix permission denial without establishing a read-only mount. A separate 136-line repair reads `/proc/self/mountinfo` and checks both writable child tmpfs mounts. Four actual pinned-Node Docker cases passed: read-only source with writable children (exit 0), a writable disposable source rejected despite DAC denial (exit 66), missing log (expected Docker exit 125 and exact read-only target diagnostic), and missing tmp (same specific failure). Frozen source remained unchanged and the exact one-off container was absent after each case; no images, volumes or build cache were created. Shared pinned Node was retained. Before/after free bytes were 266457661440 and 266474479616, an unattributable shared-host delta. Independent repair source review is pending; the original weaker oracle is not treated as proof of the stronger property.

The bounded controls design review inspected 294 unique LOC and found three medium coverage-record defects (10.20 defects/KLOC): an inaccurate draft-recovery fault description, an omitted allowed membership-revocation partition, and two seed-blocker descriptions contradicted by the existing fixture. These are three findings, not executed production failures or sixteen passing controls. Fresh independent opinions and Astra MAX synthesis are being prepared for the existing-API cases. New fixture, private DB observation and session-lock controls require their own bounded design and execution evidence. Obsidian was unavailable; the recorded tradeoffs are analytical simulations only.
'''
assert '## R3: migration failure, cleanup and stronger mount evidence' not in content
path.write_text(content + section, encoding='utf-8', newline='\n')
path = root / 'code-reviews.md'
content = path.read_text(encoding='utf-8')
needle = '| [BusyBox timeout repair](docs/completion/review-be02-busybox-timeout.md) | 272 | 0 | 0.00 |'
assert content.count(needle) == 1
content = content.replace(needle, needle + '\n| [Original mount packaging oracle](docs/completion/review-acceptance-mount-packaging.md) | 162 | 1 medium | 6.17 |\n| [Acceptance controls design](docs/completion/acceptance-controls-design.md) | 294 | 3 medium | 10.20 |')
content = content.replace('Both failed attempts passed all 16 independent cleanup checks.', 'All three failed attempts passed all 16 independent cleanup checks. R3 repaired the missing directories and reached a real draft-migration privilege failure; its review defect density is N/A for runtime discovery. The four stronger mount regressions passed; their independent 136-LOC repair review is pending. The controls design findings are coverage-record defects, and all sixteen controls remain NOT_RUN.')
path.write_text(content, encoding='utf-8', newline='\n')
print('R3 evidence synchronized in five state documents and the review ledger.')
