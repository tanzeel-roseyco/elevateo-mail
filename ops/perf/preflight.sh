#!/bin/sh
# AIDEV-NOTE: Read-only inventory on fleet-02. Lists only task-relevant names; aborts if any perf01 resource exists.
# Usage (inside ~/<PERF01_PROJECT>): PERF01_RESERVATION=<id> PERF01_PROJECT=perf01-<hex> sh ops/perf/preflight.sh [out-dir]
# Exit: 0 clear to proceed, 3 existing perf01 resources, 4 host too busy, 2 usage/guard failure.
set -eu
. "$(dirname -- "$0")/lib.sh"
perf01_require_reservation
perf01_require_project
PERF01_ROOT=$(perf01_root)
perf01_assert_no_forbidden_commands "$PERF01_ROOT"
OUT=${1:-$PERF01_ROOT/evidence/preflight-$(perf01_now)}
mkdir -p "$OUT"
[ -f "$PERF01_ROOT/source.json" ] || perf01_die "source.json missing; run ops/perf/transfer.sh from the host first"

{
  echo "preflight $(perf01_iso) reservation=$PERF01_RESERVATION project=$PERF01_PROJECT"
  echo "docker_server=$(docker version --format '{{.Server.Version}}') docker_client=$(docker version --format '{{.Client.Version}}')"
  echo "compose=$(docker compose version --short)"
  perf01_host_snapshot
  echo "cgroup=$(docker info --format '{{.CgroupDriver}}/{{.CgroupVersion}}') storage_driver=$(docker info --format '{{.Driver}}')"
  # Totals are recorded information only: foreign resources (no task label, no project prefix) never fail preflight.
  echo "network_count_total=$(docker network ls -q | wc -l) container_count_total=$(docker ps -aq | wc -l) volume_count_total=$(docker volume ls -q | wc -l)"
} | tee "$OUT/host.txt"

# Pinned images named by compose.yaml (tag@digest) and the Ruby base in the Dockerfile. Presence BEFORE the run
# decides what cleanup may later remove: only images this task pulls are task-created.
grep -ho 'image: [^ ]*@sha256:[0-9a-f]*' "$PERF01_ROOT/compose.yaml" | cut -d' ' -f2 | sort -u > "$OUT/pinned-refs.txt"
grep -ho '^FROM [^ ]*@sha256:[0-9a-f]*' "$PERF01_ROOT/apps/server/Dockerfile" | cut -d' ' -f2 >> "$OUT/pinned-refs.txt"
: > "$OUT/images-before.txt"
while read -r ref; do
  if id=$(docker image inspect --format '{{.Id}}' "$ref" 2>/dev/null); then
    echo "present $ref $id" >> "$OUT/images-before.txt"
  else
    echo "absent $ref -" >> "$OUT/images-before.txt"
  fi
done < "$OUT/pinned-refs.txt"
cat "$OUT/images-before.txt"

# Build-cache records before the task builds anything; cleanup.sh may prune only IDs that appear afterwards.
docker buildx du --verbose 2>/dev/null | awk '/^ID:/ { print $2 }' | sort > "$OUT/buildcache-before.txt" || : > "$OUT/buildcache-before.txt"
docker system df > "$OUT/system-df-before.txt"

echo "--- collision scan (label $PERF01_LABEL, prefix $PERF01_PROJECT)" | tee -a "$OUT/host.txt"
# Fail-closed inventory: any failing docker command exits 2 inside perf01_existing_resources; only a verified
# empty list means clean.
perf01_existing_resources "$OUT/existing.txt"
cat "$OUT/existing.txt"
if [ -s "$OUT/existing.txt" ]; then
  perf01_die "existing perf01 resources listed in $OUT/existing.txt; aborting" 3
fi

echo "--- host quiet check" | tee -a "$OUT/host.txt"
quiet_status=0
quiet=$(perf01_host_quiet) || quiet_status=$?
echo "$quiet" | tee -a "$OUT/host.txt"
[ "$quiet_status" -eq 0 ] || perf01_die "host is busier than the configured caps; do not start load" 4
# Pre-run disk headroom: build + images need roughly 5 GB; refuse under 20 GB free.
avail_gb=$(df -BG --output=avail / | tail -1 | tr -dc '0-9')
[ "$avail_gb" -ge "${PERF01_MIN_DISK_GB:-20}" ] || perf01_die "only ${avail_gb}G free on /; refusing" 4
echo "preflight: clear to proceed (evidence in $OUT)"
