"""Synchronize reviewed mount evidence without changing application source."""
from pathlib import Path

root = Path(__file__).resolve().parents[2]
old = 'Four Docker mount regressions passed, including the writable-source discrimination control; their source review is pending.'
new = 'The first mount repair review found a fixture-mode defect; the corrected four Docker cases passed, and final source review is being reconciled.'
paths = ['README.md', 'state.md', 'documentation.md', '.planning/STATE.md', 'docs/completion/verification-20261014.md']
for name in paths:
    path = root / name
    content = path.read_text(encoding='utf-8')
    assert old in content, name
    path.write_text(content.replace(old, new), encoding='utf-8')

path = root / 'docs/completion/verification-20261014.md'
content = path.read_text(encoding='utf-8')
content = content.replace('No production activation, external mail or new paid session has occurred in this checkpoint.', 'No production activation, external mail or new ultrareview has occurred. Required consultations use the existing authorized native Claude account.')
content = content.replace('Independent repair source review is pending; the original weaker oracle is not treated as proof of the stronger property.', 'The subsequent independent 136-LOC repair review found one medium fixture-mode defect (7.35 defects/KLOC): umask 0077 reduced the intended 0755 fixture directories to 0700. The mountinfo discrimination itself was sound, but the DAC comparison did not faithfully match the actual source. This attempt is retained as historical evidence; the original weaker oracle is not treated as proof of the stronger property.')
content += '\n\n### Corrected mount fixture and reconciled Auth/RLS log\n\n'
content += 'The separate 142-line `ops/local/mount-oracle-repair-r2.py` explicitly applies chmod 0755 and checks source/fixture UID, GID and mode. SHA-256 `3a107af599759737f99ea0a4d02af34d075317b288bafcf824e37c8d50594004` matches both local and independently queried remote source. All four Docker cases passed with exits 0, 66, 125 and 125. The exact task container was absent, frozen source unchanged, and no image, volume or build cache was created. Pinned Node remains. Free bytes were 266439553024 before and 266439708672 after; no attributable reclamation is claimed. Evidence: `ops/local/acceptance-integration-r3-20261014/mount-oracle-r2-results.json`. Independent source review is being reconciled; no application acceptance follows.\n\n'
content += 'The independently downloaded R3 `018-auth-rls-concurrency.log` confirms PASS in 7.48 seconds: two real bootstrap waiters serialized; the genuine five-second 55P03 timeout rolled back while the holder retained its lock; post-wait DDL drift raised P0001 and restored catalogs. All three schedules restored exact catalogs and left no owned sessions. This is separate from the later draft-migration failure.\n'
path.write_text(content, encoding='utf-8')

path = root / 'code-reviews.md'
content = path.read_text(encoding='utf-8')
needle = '| [Original mount packaging oracle](docs/completion/review-acceptance-mount-packaging.md) | 162 | 1 medium | 6.17 |'
assert needle in content
content = content.replace(needle, needle + '\n| [First mount repair fixture](docs/completion/review-acceptance-mount-oracle-repair.md) | 136 | 1 medium | 7.35 |', 1)
old = 'The four stronger mount regressions passed; their independent 136-LOC repair review is pending.'
assert old in content
content = content.replace(old, 'The first 136-LOC mount repair review found a fixture-mode defect caused by umask. A separate 142-LOC correction passed all four Docker cases; its final independent review is being reconciled.', 1)
path.write_text(content, encoding='utf-8')
print('Updated six documentation files; application source unchanged.')
