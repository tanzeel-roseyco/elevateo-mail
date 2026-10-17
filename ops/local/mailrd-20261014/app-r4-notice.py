from pathlib import Path
import subprocess
b=Path('/home/tanzeel/elevateo-mail-wave-20261014')
p=b/'reports/cassian-frozen-app-7b0678c.bundle'
r=subprocess.run(['git','bundle','list-heads',str(p)],capture_output=True,text=True,check=True)
print(r.stdout)
assert '7b0678c20d1b58e02e70c23b7844f9538b157eb0' in r.stdout
message='\nROOT EXACT INTEGRATION LOCATED: reports/cassian-frozen-app-7b0678c.bundle, HEAD7b0678c20d1b58e02e70c23b7844f9538b157eb0 independently verified by Jules git bundle list-heads. Fetch this exact bundle and incorporate exact source preserving own changes now; do not wait for incoming. Root reports prior native reviews I142LOC0/K1900 atfb79811; G99/B108/M1050 atb943166. Rowan newest28390d7cc75203959b5c5002d1e6069fa3f1e29a adds readonly bootstrap mount and cleanup allowlist N<35LOC; backend Soren currently running28390. Nadia J/L frozenfb79811 review scope unchanged. All actual app tests Docker via Soren.\n'
for name in ['mira','elara','nadia']:
 with (b/f'control/{name}-inbox.md').open('a') as f: f.write(message)
with (b/'reports/app-r4-dispatch.md').open('a') as f:f.write(message)
print('NOTIFIED_ALL_THREE')