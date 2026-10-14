#!/usr/bin/env bash
# OPS-402 bounded scheduler: immutable source, dedicated builder/cache, exact cleanup.
set -Eeuo pipefail
umask 077
base=$(cd -- "$(dirname -- "$0")" && pwd)
source_dir=${1:?immutable source directory}
evidence=${2:?evidence directory}
mkdir -p "$evidence"
source_dir=$(cd -- "$source_dir" && pwd)
evidence=$(cd -- "$evidence" && pwd)
exec 9>/home/tanzeel/elevateo-mail-wave-20261014/control/soren-docker.lock
flock -n 9 || exit 75
available=$(awk '/MemAvailable:/ {printf "%.0f\n", $2*1024}' /proc/meminfo)
awk -v a="$available" 'BEGIN {exit !(a >= 8589934592)}' || exit 75
[[ $(df -B1 --output=avail "$evidence" | tail -1) -ge 21474836480 ]] || exit 75
name="ops402-fe-$(date +%s)-$$"
builder="$name-builder"
cache="buildx_buildkit_${builder}0_state"
image="$name:job"
kit=moby/buildkit:buildx-stable-1@sha256:cec9f139f45e93c5c69c60f8b07cfad9f43f4ef6b6a6cd917527fea5ff2e3dea
cleanup() {
  local job=$? clean=0
  if docker container inspect "$name" >/dev/null 2>&1; then docker rm -f "$name" >/dev/null 2>&1 || clean=$?; fi
  docker buildx rm "$builder" >/dev/null 2>&1 || clean=$?
  if docker volume inspect "$cache" >/dev/null 2>&1; then docker volume rm "$cache" >/dev/null || clean=$?; fi
  if docker image inspect "$image" >/dev/null 2>&1; then docker image rm "$image" >/dev/null || clean=$?; fi
  awk '/MemAvailable:/ {printf "%.0f\n", $2*1024}' /proc/meminfo > "$evidence/available-ram-after.txt"
  df -B1 --output=avail "$evidence" > "$evidence/disk-after.txt"
  docker ps -aq > "$evidence/containers-after.txt"
  echo "job_exit=$job cleanup_exit=$clean" | tee "$evidence/result.txt"
  (( clean == 0 )) || job=1
  exit "$job"
}
trap cleanup EXIT
awk '/MemAvailable:/ {printf "%.0f\n", $2*1024}' /proc/meminfo > "$evidence/available-ram-before.txt"
df -B1 --output=avail "$evidence" > "$evidence/disk-before.txt"
docker ps -aq > "$evidence/containers-before.txt"
docker buildx create --name "$builder" --driver docker-container \
  --driver-opt "image=$kit,restart-policy=no,memory=2g,cpu-period=100000,cpu-quota=200000" >/dev/null
set +e
timeout --signal=TERM --kill-after=30s 720s docker buildx build --builder "$builder" --load --progress plain --label "elevateo.ops402.job=$name" \
  -f "$source_dir/apps/web/docker/test.Dockerfile" -t "$image" "$source_dir" > "$evidence/build.txt" 2>&1
build_result=$?
set -e
echo "build_exit=$build_result" > "$evidence/build-result.txt"
(( build_result == 0 )) || exit "$build_result"
docker image inspect "$image" --format '{{.Id}}' > "$evidence/image.txt"
set +e
timeout --signal=TERM --kill-after=30s 600s docker run --name "$name" --network none --memory 2g --cpus 2 -v "$base/frontend-gates.sh:/job.sh:ro" "$image" bash /job.sh > "$evidence/test.txt" 2>&1
test_result=$?
set -e
echo "test_exit=$test_result" > "$evidence/test-result.txt"
mkdir -p "$evidence/gates"
docker cp "$name:/tmp/ops402-frontend/." "$evidence/gates/"
mkdir -p "$evidence/bundle"
if grep -qx 'build exit=0' "$evidence/gates/exits.txt"; then
  set +e
  docker cp "$name:/workspace/apps/web/dist/." "$evidence/bundle/" > "$evidence/bundle-export.txt" 2>&1
  export_result=$?
  set -e
  echo "bundle_export_exit=$export_result" >> "$evidence/bundle-export.txt"
  (( export_result == 0 )) || test_result=1
else
  echo 'bundle_export NOT_RUN build failed' > "$evidence/bundle-export.txt"
fi
python3 - "$evidence/bundle" > "$evidence/bundle-sizes.json" <<'PY'
import pathlib,gzip,json,sys
root=pathlib.Path(sys.argv[1])
print(json.dumps([{'file':str(p.relative_to(root)),'raw_bytes':p.stat().st_size,'gzip_bytes':len(gzip.compress(p.read_bytes()))} for p in root.rglob('*') if p.is_file()],indent=2))
PY
exit "$test_result"
