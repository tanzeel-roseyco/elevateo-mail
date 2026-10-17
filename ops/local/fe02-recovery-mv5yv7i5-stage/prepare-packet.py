"""Metadata-only integrity packet for the frozen lint/type repair rerun."""
from pathlib import Path
import hashlib
import json
import shutil

stage = Path(__file__).resolve().parent
previous = stage.parent / "fe02-cd-stage-561fa71d811e467dad2c81c54ffe4c62"
shutil.copyfile(previous / "invoke-fleet-02.sh", stage / "invoke-fleet-02.sh")
file_list = stage / "file-list.txt"
file_list.write_bytes(file_list.read_bytes().replace(b"\r\n", b"\n"))
names = ["context.tar.gz", "context.tar.gz.sha256", "manifest.sha256", "file-list.txt", "invoke-fleet-02.sh"]
names += sorted("runner/" + p.name for p in (stage / "runner").iterdir() if p.is_file())
manifest = "".join(hashlib.sha256((stage / n).read_bytes()).hexdigest() + "  " + n + "\n" for n in names)
(stage / "packet.sha256").write_bytes(manifest.encode("utf-8"))
print(json.dumps({"stage": str(stage), "files": len(names), "packet_sha256": hashlib.sha256(manifest.encode()).hexdigest()}))
