from pathlib import Path
import shutil, subprocess, hashlib, json

# AIDEV-NOTE: Overlay ownership is explicitly bounded; older prototypes remain in preserved refs/snapshots.
root = Path.cwd()
parent = root.parent
sources = [
    ('Elevateo Mail - Fable FE01 R1', ['apps/web']),
    ('Elevateo Mail - BE02 Codex', ['apps/server', 'ops', 'scripts', 'compose.yaml']),
    ('Elevateo Mail - Local Completion', ['tests/acceptance', 'docs/completion']),
    ('Elevateo Mail - Backend Performance', ['ops/perf', 'docs/perf-01']),
    ('Elevateo Mail - BE01 R1', ['ops/tests/be01-services', 'ops/tools',
      'docs/evidence/scripts/be-01-r1-fleet02-resources.sh',
      'docs/evidence/scripts/be01-capability-volume-transport.sh',
      'docs/evidence/scripts/be01-capability-volume-transport-regression.sh']),
]
manifest = []
for source, scopes in sources:
    src = parent / source
    for scope in scopes:
        scope_path = src / scope
        for p in sorted([scope_path] if scope_path.is_file() else scope_path.rglob('*')):
            if not p.is_file():
                continue
            rel = p.relative_to(src)
            if rel.as_posix().startswith('ops/local/'):
                continue
            if any(part in {'node_modules', 'dist', 'coverage', '__pycache__', 'tmp', 'log'} or part.startswith('.env') for part in rel.parts):
                continue
            # AIDEV-NOTE: Select the tool root, not each leaf name; nested run.sh/config.jq belong to that tool.
            if scope == 'ops/tools' and not rel.parts[2].startswith('be01-'):
                continue
            dest = root / rel
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(p, dest)
            manifest.append({'path': rel.as_posix(), 'source': source, 'sha256': hashlib.sha256(p.read_bytes()).hexdigest()})
contract_sources = ['Elevateo Mail - Local Completion', 'Elevateo Mail - Fable FE01 R1', 'Elevateo Mail - BE02 Codex']
contract_hashes = {}
for name in contract_sources:
    contract_hashes[name] = {p.relative_to(parent / name).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest()
                             for p in (parent / name / 'contracts').rglob('*') if p.is_file()}
(root / 'docs' / 'completion').mkdir(parents=True, exist_ok=True)
(root / 'docs/completion/int401-overlay-manifest.json').write_text(json.dumps({'files': manifest, 'contracts': contract_hashes}, indent=2))
print('Overlaid', len(manifest), 'files; contracts identical:', len({json.dumps(v, sort_keys=True) for v in contract_hashes.values()}) == 1)
