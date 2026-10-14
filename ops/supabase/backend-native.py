"""Full existing runner with an explicit disposable PostgreSQL diagnostic envelope."""
from __future__ import annotations
import hashlib, pathlib, sys
root=pathlib.Path(sys.argv[1]).resolve()
sys.path.insert(0,str(root/'ops/tests/be02'))
from docker_task import Task
import run
original=Task.compose

def compose(self: Task,name: str,args: list[str],seconds: int=30,quiet: bool=False) -> str:
    output=original(self,name,args,seconds,quiet)
    if name=='bootstrap':
        original(self,'native-log-verbosity', ['run','--rm','--no-deps','bootstrap',
                     '-c',"ALTER SYSTEM SET log_error_verbosity='verbose'",'-c','SELECT pg_reload_conf()'],45)
        actual=original(self,'native-log-verbosity-check',['run','--rm','--no-deps','bootstrap',
                        '-At','-c',"SHOW log_error_verbosity"],45).strip()
        if actual!='verbose':raise RuntimeError('native log verbosity not applied')
        self.write('soren-native-envelope.json',{'scope':'disposable CI only','log_error_verbosity':actual,
                   'helper_sha256':hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest(),
                   'application_source_unchanged':True,'timeout_oracle_unchanged':True})
    return output
Task.compose=compose
sys.argv=['run.py','--context','default','--expect-host','Ubuntu-noble-latest-amd64-base']
raise SystemExit(run.main())
