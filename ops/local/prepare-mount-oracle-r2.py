"""Preserve the first probe and make its fixture permissions explicit for the rerun."""
from pathlib import Path
import hashlib

base = Path('C:/Users/Tanzeel/Code and projects/Elevateo Mail - Local Completion/ops/local')
prior = base / 'mount-oracle-repair.py'
assert hashlib.sha256(prior.read_bytes()).hexdigest() == 'b3cd8a3b071c194549cc8b6e5c40cf7450a185e2b1ca98fa3e72630034347fa3'
content = prior.read_text().replace("OUT = ROOT / 'mount-oracle-repair'", "OUT = ROOT / 'mount-oracle-repair-r2'").replace("NAME = 'elevateo-mount-oracle-20261014'", "NAME = 'elevateo-mount-oracle-r2-20261014'")
content = content.replace('    path.mkdir(mode=0o755)\n', '    path.mkdir(mode=0o755)\n    path.chmod(0o755)\n')
content = content.replace("            (path / name).mkdir(mode=0o755)\n", "            (path / name).mkdir(mode=0o755)\n            (path / name).chmod(0o755)\n")
needle = "allowed = {str(SOURCE / 'apps/server'): False, **{str(path): key == 'writable-control' for key, path in fixtures.items()}}\n"
assert content.count(needle) == 1
content = content.replace(needle, needle + "# AIDEV-NOTE: Explicit chmod defeats the private umask; verify identical host DAC before testing mount semantics.\nfor value in allowed:\n    metadata = Path(value).stat()\n    assert (metadata.st_uid, metadata.st_gid, metadata.st_mode & 0o777) == (1001, 1001, 0o755)\n")
target = base / 'mount-oracle-repair-r2.py'
with target.open('x', encoding='utf-8', newline='\n') as output:
    output.write(content)
print(target)
print('SHA256', hashlib.sha256(target.read_bytes()).hexdigest(), 'LOC', len(content.splitlines()))
