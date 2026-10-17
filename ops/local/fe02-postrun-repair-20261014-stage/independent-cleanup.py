import datetime,json,pathlib,subprocess,shutil,hashlib
task="fe01r1-20261013-211444-705a2d1b"
out=pathlib.Path("/home/tanzeel/elevateo-mail-tests-20261012-ultra/fe02-postrun-repair-20261014/results-fe02-postrun-repair-20261014")
def run(args):
 p=subprocess.run(args,text=True,capture_output=True,timeout=45)
 return {"argv":args,"exit":p.returncode,"stdout":p.stdout.strip(),"stderr":p.stderr.strip()}
checks={}
for kind,args in {
 "labelled_containers":["docker","ps","-a","--filter","label=elevateo.task="+task,"--format","{{.ID}} {{.Names}}"],
 "named_containers":["docker","ps","-a","--filter","name="+task,"--format","{{.ID}} {{.Names}}"],
 "labelled_images":["docker","image","ls","--filter","label=elevateo.task="+task,"--format","{{.ID}} {{.Repository}}:{{.Tag}}"],
 "named_images":["docker","image","ls","--format","{{.ID}} {{.Repository}}:{{.Tag}}"],
 "labelled_volumes":["docker","volume","ls","--filter","label=elevateo.task="+task,"--format","{{.Name}}"],
 "named_volumes":["docker","volume","ls","--format","{{.Name}}"],
 "builders":["docker","buildx","ls","--format","{{.Name}}"],
}.items():
 result=run(args)
 if kind in ("named_images","named_volumes"):result["stdout"]="\n".join(line for line in result["stdout"].splitlines() if task in line)
 result["pass"]=result["exit"]==0 and (task not in result["stdout"] if kind=="builders" else result["stdout"]=="")
 checks[kind]=result
shared=[]
for ref in [
 "node:24.21.0-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20",
 "mcr.microsoft.com/playwright:v1.64.0-noble@sha256:06a9939e57531807f8d5fd76ce44b53165ffb7d7501d87ab10e285c20b1e971f"
]:
 # Exact source pins are checked separately if absent; inspection cannot delete shared images.
 p=run(["docker","image","inspect","--format","{{.Id}}",ref]);shared.append(p)
files=[p for p in out.rglob("*") if p.is_file()]
extensions={}
for p in files:
 key=p.suffix
 d=extensions.setdefault(key,{"count":0,"bytes":0});d["count"]+=1;d["bytes"]+=p.stat().st_size
result={"utc":datetime.datetime.now(datetime.timezone.utc).isoformat(),"task":task,"checks":checks,"pass":all(x["pass"] for x in checks.values()),"shared":shared,"host_free_bytes":shutil.disk_usage("/").free,"artifact_directory":str(out),"artifacts":extensions,"total_artifact_bytes":sum(p.stat().st_size for p in files)}
print(json.dumps(result,indent=2))
raise SystemExit(0 if result["pass"] else 1)
