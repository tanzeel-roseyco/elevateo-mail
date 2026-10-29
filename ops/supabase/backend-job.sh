#!/usr/bin/env bash
# Host scheduling only; the existing frozen runner executes all app checks in containers.
set -Eeuo pipefail
umask 077
base=$(cd -- "$(dirname -- "$0")" && pwd)
source_dir=${1:?immutable source directory}
report=${2:?stdout evidence file}
mode=${3:-full}
case "$mode" in full|supplement|native) ;; *) exit 64;; esac
source_dir=$(cd -- "$source_dir" && pwd)
exec 9>/home/tanzeel/elevateo-mail-wave-20261014/control/soren-docker.lock
flock -n 9 || exit 75
admit() {
  python3 - "$source_dir" <<'PY'
import pathlib,os,sys,json
ram=int(next(line.split()[1] for line in pathlib.Path('/proc/meminfo').read_text().splitlines() if line.startswith('MemAvailable:')))*1024
stat=os.statvfs(sys.argv[1]); free=stat.f_bavail*stat.f_frsize; total=stat.f_blocks*stat.f_frsize
print(json.dumps({'available_ram_bytes':ram,'available_disk_bytes':free,'total_disk_bytes':total,'cpu_count':os.cpu_count(),'loadavg':os.getloadavg()}))
if ram<8589934592 or free<21474836480 or free*5<total:raise SystemExit(75)
PY
}
admit > "$report.resource-before.json"
# Git archives omit these ignored, empty nested tmpfs mountpoints.
mkdir -p "$source_dir/apps/server/log" "$source_dir/apps/server/tmp"
set +e
if [[ "$mode" == supplement ]]; then
  timeout --signal=TERM --kill-after=300s 1800s python3 "$base/schema-supplement.py" "$source_dir" "$report.evidence" > "$report" 2>&1
elif [[ "$mode" == native ]]; then
  timeout --signal=TERM --kill-after=300s 1800s python3 "$base/backend-native.py" "$source_dir" > "$report" 2>&1
else
(cd -- "$source_dir"; timeout --signal=TERM --kill-after=300s 1800s python3 ops/tests/be02/run.py \
  --context default --expect-host Ubuntu-noble-latest-amd64-base) > "$report" 2>&1
fi
result=$?
set -e
admit > "$report.resource-after.json" || true
printf 'runner_exit=%s\n' "$result" >> "$report"
exit "$result"
