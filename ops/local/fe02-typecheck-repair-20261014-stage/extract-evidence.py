from pathlib import Path
import json, tarfile, hashlib
root = Path("C:/Users/Tanzeel/Code and projects/Elevateo Mail - Local Completion")
stage = root / 'ops/local/fe02-typecheck-repair-20261014-stage'
archive = stage / 'results.tgz'
dest = root / 'ops/local/fe-rerun-evidence'
dest.mkdir(exist_ok=False)
inventory=[]
with tarfile.open(archive, 'r:gz') as tar:
 for member in tar:
  relative=Path(member.name)
  if relative.is_absolute() or '..' in relative.parts: raise RuntimeError('unsafe archive member')
  if member.isdir(): continue
  if not member.isfile() or member.size > 10*1024*1024: raise RuntimeError('unexpected archive member')
  data=tar.extractfile(member).read()
  name=relative.name if member.name.count('/') == 1 else ('file-'+str(len(inventory)).zfill(4)+relative.suffix)
  target=dest/name
  target.write_bytes(data)
  inventory.append({'source':member.name,'local':name,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()})
(dest/'inventory.json').write_text(json.dumps(inventory,indent=2)+'\n')
print(json.dumps({'files':len(inventory),'pngs':sum(x['local'].endswith('.png') for x in inventory),'archive_sha256':hashlib.sha256(archive.read_bytes()).hexdigest(),'destination':str(dest)}))

