"""Freeze allowlisted source snapshots; host script performs no application tests."""
from pathlib import Path
import hashlib
import io
import json
import tarfile

PROJECTS = Path('C:/Users/Tanzeel/Code and projects')
COORD = PROJECTS / 'Elevateo Mail - Local Completion'
BE = PROJECTS / 'Elevateo Mail - BE02 Codex'
FE = PROJECTS / 'Elevateo Mail - Fable FE01 R1'
DEST = PROJECTS / 'Elevateo Mail - Acceptance Verification R3 20261014'
OUT = COORD / 'ops/local/acceptance-integration-r3-20261014'
DEST.mkdir(exist_ok=False)
sources: dict[str, Path] = {}
selections = [(BE, p) for p in ('apps/server', 'contracts', 'ops/db', 'ops/supabase/db',
    'ops/tests/be02', 'ops/tests/be02-guards', 'ops/compose.be02-test.yaml', 'ops/compose.acceptance-test.yaml')]
selections += [(FE, 'apps/web'), (COORD, 'tests/acceptance'), (COORD, 'ops/acceptance')]
for root, relative in selections:
    target = root / relative
    paths = [target] if target.is_file() else sorted(target.rglob('*'))
    for source in paths:
        rel = source.relative_to(root)
        if any(part in {'node_modules', 'dist', '.git', '.bundle', '__pycache__', 'tmp', 'log', 'coverage', 'test-results', 'playwright-report'} for part in rel.parts):
            continue
        if source.is_symlink():
            raise RuntimeError('Symlink in frozen source: ' + str(rel))
        if not source.is_file() or source.name.startswith('.env'):
            continue
        if source.stat().st_size > 32 * 1024**2 or rel.as_posix() in sources:
            raise RuntimeError('Unexpected context entry: ' + str(rel))
        sources[rel.as_posix()] = source
before = {rel: hashlib.sha256(source.read_bytes()).hexdigest() for rel, source in sources.items()}
for relative, source in sorted(sources.items()):
    data = source.read_bytes()
    if hashlib.sha256(data).hexdigest() != before[relative]:
        raise RuntimeError('Source drift: ' + relative)
    target = DEST / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)
generated = {
    '.dockerignore': 'ops/local\n**/node_modules\n**/dist\n**/.env*\n**/.git\n**/coverage\n**/test-results\n**/playwright-report\n',
    'state.md': 'Frozen BE02 + FE02 acceptance snapshot. Test and deployment status NOT_RUN. Source manifest is held by coordinator.\n',
    'documentation.md': 'Disposable verification source copy. All application tests run only in fleet-02 Docker. No live deployment or real mail.\n',
}
for relative, content in generated.items():
    (DEST / relative).write_text(content, encoding='utf-8', newline='\n')
for relative in ('AGENTS.md', 'README.md', '.planning/STANDARDS.md'):
    target = DEST / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes((COORD / relative).read_bytes())
after = {rel: hashlib.sha256(source.read_bytes()).hexdigest() for rel, source in sources.items()}
if before != after:
    raise RuntimeError('Source drift during freezing')
files = sorted(p for p in DEST.rglob('*') if p.is_file())
manifest = {p.relative_to(DEST).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest() for p in files}
archive = OUT / 'context.tar'
with archive.open('xb') as output:
    with tarfile.open(fileobj=output, mode='w', format=tarfile.PAX_FORMAT) as tar:
        for path in files:
            relative = path.relative_to(DEST).as_posix()
            data = path.read_bytes()
            if hashlib.sha256(data).hexdigest() != manifest[relative]:
                raise RuntimeError('Staged source drift')
            entry = tarfile.TarInfo(relative)
            entry.size = len(data)
            entry.mode = 0o755 if path.suffix in {'.sh', '.py'} or '/bin/' in relative else 0o644
            entry.mtime = 0
            tar.addfile(entry, io.BytesIO(data))
result = {'stage': str(DEST), 'files': manifest, 'source_files': before,
    'archive_sha256': hashlib.sha256(archive.read_bytes()).hexdigest(), 'archive_bytes': archive.stat().st_size}
(OUT / 'manifest.json').write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'files': len(files), 'sha256': result['archive_sha256'], 'bytes': result['archive_bytes']}))
