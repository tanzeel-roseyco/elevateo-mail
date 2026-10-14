#!/usr/bin/env bash
set -euo pipefail

candidate=$(git rev-parse "${1:?usage: run-android-candidate.sh COMMIT}^{commit}")
short=${candidate:0:12}
lock=/home/tanzeel/elevateo-mail-wave-20261014/control/soren-docker.lock
root=$(git rev-parse --show-toplevel)
context=$(mktemp -d /tmp/qa815-android-source.XXXXXXXX)
output=$(mktemp -d /tmp/qa815-android-output.XXXXXXXX)
tag=qa815-apk813-tool-$short
log="$root/docs/completion/qa815-evidence/android-$short.txt"
artifact=/home/tanzeel/elevateo-mail-completion-20261015/control/qa815-artifacts/android-$short-compile-only-unsigned.apk
exec 9>"$lock"
flock -x 9
mkdir -p "$(dirname "$log")" "$(dirname "$artifact")"
printf 'source=%s\nstarted=%s\nimage=%s\ncontext=%s\noutput=%s\n' "$candidate" "$(date -u +%FT%TZ)" "$tag" "$context" "$output" > "$log"
git archive "$candidate" | tar -x -C "$context"
chmod -R a+rX "$context"

cleanup() {
  status=$?
  set +e
  if docker image inspect "$tag" >/dev/null 2>&1; then
    docker run --rm --name "qa815-apk813-clean-$short" --network none --memory 256m --cpus 1 --pids-limit 64 \
      -v "$context":/source -v "$output":/output "$tag" bash -ceu \
      'find /source /output -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +' >> "$log" 2>&1
    mapfile -t owned_images < <(docker history --no-trunc --format '{{.ID}}' "$tag" | head -n 8)
    for image_id in "${owned_images[@]}"; do docker image rm "$image_id" >> "$log" 2>&1 || true; done
  fi
  rm -rf "$context" "$output"
  printf 'run_exit=%s\nfinished=%s\ncontext_absent=%s\noutput_absent=%s\nimage_absent=%s\nremaining_compile_containers=%s\n' \
    "$status" "$(date -u +%FT%TZ)" "$([[ ! -e $context ]] && echo yes || echo no)" \
    "$([[ ! -e $output ]] && echo yes || echo no)" \
    "$(! docker image inspect "$tag" >/dev/null 2>&1 && echo yes || echo no)" \
    "$(docker ps -a --filter "name=^/qa815-apk813-compile-$short$" -q | wc -l)" >> "$log"
}
trap cleanup EXIT

DOCKER_BUILDKIT=0 timeout 1800s docker build --memory 8g --cpu-quota 400000 --cpu-period 100000 \
  --build-arg RUST_IMAGE='rust:1.90.0-bookworm@sha256:3914072ca0c3b8aad871db9169a651ccfce30cf58303e5d6f2db16d1d8a7e58f' \
  -f "$context/ops/build/android/Dockerfile" -t "$tag" "$context" >> "$log" 2>&1

mkdir -p "$output/cargo-home"
docker run --rm --name "qa815-apk813-seed-$short" --network none --memory 512m --cpus 1 \
  -v "$output":/artifacts "$tag" bash -ceu \
  "cp -a /usr/local/cargo/registry /artifacts/cargo-home/; chown -R $(id -u):$(id -g) /artifacts" >> "$log" 2>&1

timeout 5400s docker run --rm --name "qa815-apk813-compile-$short" --user "$(id -u):$(id -g)" \
  --memory 8g --memory-swap 10g --cpus 4 --pids-limit 512 --ulimit nofile=65535:65535 \
  -v "$context":/src -v "$output":/artifacts -e APK813_BUILD_ROOT=/artifacts -w /src "$tag" \
  bash ops/build/android/build-unsigned.sh >> "$log" 2>&1

test -f "$output/elevateo-android-aarch64-compile-only-unsigned.apk"
cp "$output/elevateo-android-aarch64-compile-only-unsigned.apk" "$artifact"
printf 'artifact=%s\n' "$artifact" >> "$log"
sha256sum "$artifact" >> "$log"
