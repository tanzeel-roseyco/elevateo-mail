#!/usr/bin/env bash
set -euo pipefail
# AIDEV-NOTE: Offline pinned wheels install only into disposable container tmpfs, never host or shared image.
base=/tmp/elevateo-mailruntime20261023
[[ $(cat /etc/machine-id) == 5992663e9659484e90c0129edd5bd24b ]]
exec 9>/home/tanzeel/elevateo-mail-wave-20261014/control/soren-docker.lock
flock -x -w 120 9
image=mcr.microsoft.com/playwright@sha256:35246d87a7c88ea9b771c65d33171b2611b02a8253b4b12ce6f94376c55f99f2
docker --host unix:///var/run/docker.sock run --rm --name mailruntime20261023-check --network none \
  --read-only --cap-drop ALL --security-opt no-new-privileges --memory 1g --cpus 1 \
  --tmpfs /tmp:rw,exec,nosuid,size=536870912,mode=1777 \
  --mount "type=bind,src=$base/source,dst=/src,readonly" \
  --mount "type=bind,src=$base/wheels,dst=/wheels,readonly" \
  --mount type=bind,src=/home/tanzeel/elevateo-mail-completion-20261015/control/mail1017/release/mox,dst=/release/mox,readonly \
  -e MOX_BINARY=/release/mox \
  -e PYTHONDONTWRITEBYTECODE=1 -w /src --entrypoint bash "$image" -c '
set -euo pipefail
python3 -c "import pathlib,zipfile; [zipfile.ZipFile(p).extractall(\"/tmp/tools\") for p in pathlib.Path(\"/wheels\").glob(\"*.whl\")]"
find /tmp/tools -name ruff -type f -exec chmod 700 {} +
export PYTHONPATH=/tmp/tools
$(find /tmp/tools -name ruff -type f -print -quit) check --no-cache --select E4,E7,E9,F .
python3 -m mypy --strict --follow-imports=silent --cache-dir /tmp/mypy export_bundle.py tls_preflight.py private_publish.py runtime_dns.py runtime_fixture.py runtime_protocol.py runtime_acceptance.py
python3 -c "import ast,pathlib; [ast.parse(p.read_text(), filename=str(p)) for p in pathlib.Path(\".\").glob(\"*.py\")]; print(\"Python syntax PASS\")"
for script in *.sh; do bash -n "$script"; done
echo "Bash syntax PASS"
python3 -m unittest discover -s /src -v
' > "$base/evidence/source-check.log" 2>&1
! docker --host unix:///var/run/docker.sock container inspect mailruntime20261023-check >/dev/null 2>&1
cat "$base/evidence/source-check.log"
