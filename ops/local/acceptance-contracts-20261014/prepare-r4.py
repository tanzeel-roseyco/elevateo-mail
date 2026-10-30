from pathlib import Path
import hashlib, io, json, subprocess, tarfile
root=Path("C:/Users/Tanzeel/Code and projects/Elevateo Mail - Local Completion")
stage=root/'ops/local/acceptance-contracts-20261014'
source=root/'tests/acceptance'
paths=subprocess.run(['rg','--files','--hidden','-g','!node_modules','-g','!dist'],cwd=source,text=True,capture_output=True,check=True).stdout.splitlines()
files=sorted(Path(p) for p in paths)
before={}
for relative in files:
 p=source/relative
 if p.is_symlink() or '.env' in p.name: raise RuntimeError('unsafe context member')
 before[relative.as_posix()]=hashlib.sha256(p.read_bytes()).hexdigest()
archive=stage/'context-r4.tar'
with archive.open('xb') as output:
 with tarfile.open(fileobj=output,mode='w',format=tarfile.PAX_FORMAT) as tar:
  for relative in files:
   data=(source/relative).read_bytes()
   if hashlib.sha256(data).hexdigest()!=before[relative.as_posix()]: raise RuntimeError('source drift')
   info=tarfile.TarInfo(relative.as_posix()); info.size=len(data); info.mode=0o644; info.mtime=0
   tar.addfile(info,io.BytesIO(data))
after={p.as_posix():hashlib.sha256((source/p).read_bytes()).hexdigest() for p in files}
if before!=after: raise RuntimeError('source drift')
manifest={'files':before,'archive_sha256':hashlib.sha256(archive.read_bytes()).hexdigest()}
(stage/'manifest-r4.json').write_text(json.dumps(manifest,indent=2)+'\n')
run=(stage/'run.py').read_text().replace('context-r3.tar','context-r4.tar').replace("NAME = 'elevateo-acceptance-contracts-20261014'","NAME = 'elevateo-acceptance-contracts-r4-20261014'")
(stage/'run-r4.py').write_text(run)
old=root/'ops/local/fe02-postrun-repair-20261014-stage/independent-cleanup.py'
new=root/'ops/local/fe02-typecheck-repair-20261014-stage/independent-cleanup.py'
new.write_text(old.read_text().replace('fe01r1-20261013-211444-705a2d1b','fe01r1-20261013-213204-426844d8').replace('fe02-postrun-repair-20261014','fe02-typecheck-repair-20261014'))
print(json.dumps({'file_count':len(files),'archive_sha256':manifest['archive_sha256'],'archive_bytes':archive.stat().st_size}))
