#!/usr/bin/env bash
set -euo pipefail

candidate=$(git rev-parse "${1:?usage: run-rubocop-diagnostic.sh COMMIT}^{commit}")
short=${candidate:0:12}
root=$(git rev-parse --show-toplevel)
lock=/home/tanzeel/elevateo-mail-wave-20261014/control/soren-docker.lock
image=sha256:7dc61d4b7e12f94764f95f4f1bfe8e3940049247e6d409898ce9d3ed2810f348
name=qa815-rubocop-$short
log="$root/docs/completion/qa815-evidence/rubocop-$short.txt"
context=$(mktemp -d /tmp/qa815-rubocop.XXXXXXXX)
exec 9>"$lock"
flock -x 9
printf 'source=%s\nimage=%s\nstarted=%s\n' "$candidate" "$image" "$(date -u +%FT%TZ)" > "$log"
cleanup() {
  status=$?
  set +e
  if docker container inspect "$name" >/dev/null 2>&1; then
    mounts=$(docker container inspect --format '{{range .Mounts}}{{println .Source}}{{end}}' "$name")
    if [[ $mounts == "$context" ]]; then
      docker rm -f "$name" >> "$log" 2>&1
    else
      printf 'cleanup_error=unexpected task container mounts\n' >> "$log"
      status=90
    fi
  fi
  find "$context" -mindepth 1 -depth -delete
  rmdir "$context"
  printf 'run_exit=%s\narchive_absent=%s\nremaining_task_containers=%s\nfinished=%s\n' \
    "$status" "$([[ ! -e $context ]] && echo yes || echo no)" \
    "$(docker ps -a --filter "name=^/$name$" -q | wc -l)" "$(date -u +%FT%TZ)" >> "$log"
}
trap cleanup EXIT
git archive "$candidate" | tar -x -C "$context"
test "$(docker image inspect --format '{{.Id}}' "$image")" = "$image"
set +e
timeout 300s docker run --rm --name "$name" --pull never --network none \
  --read-only --memory 2g --memory-swap 2g --cpus 2 --pids-limit 256 \
  --user "$(id -u):$(id -g)" -e HOME=/tmp -e BUNDLE_APP_CONFIG=/tmp/bundle \
  --tmpfs /tmp:rw,size=256m -v "$context":/workspace:ro -w /workspace/apps/server \
  "$image" bash -c '
    bundle exec rubocop --lint --format json > /tmp/rubocop.json 2>/tmp/rubocop.err
    status=$?
    ruby -rjson -e '\''data=JSON.parse(File.read("/tmp/rubocop.json")); data.fetch("files").each do |file|
      file.fetch("offenses").each do |offense|
        p=offense.fetch("location"); puts [file.fetch("path"),p.fetch("start_line"),offense.fetch("cop_name"),offense.fetch("severity")].join(":")
      end
    end; puts "files=#{data.fetch("summary").fetch("inspected_file_count")} offenses=#{data.fetch("summary").fetch("offense_count")}"'\''
    printf "rubocop_exit=%s\n" "$status"
    exit 0
  ' >> "$log" 2>&1
status=$?
set -e
exit "$status"
