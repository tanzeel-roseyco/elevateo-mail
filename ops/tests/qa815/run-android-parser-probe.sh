#!/usr/bin/env bash
set -euo pipefail

candidate=$(git rev-parse "${1:?usage: run-android-parser-probe.sh COMMIT}^{commit}")
short=${candidate:0:12}
root=$(git rev-parse --show-toplevel)
context=$(mktemp -d /tmp/qa815-android-probe.XXXXXXXX)
lock=/home/tanzeel/elevateo-mail-wave-20261014/control/soren-docker.lock
image=sha256:48a11b7ba705fd53bf15248d1f94d36c39549903c5d59edcfa2f3f84126e7b44
apk=/home/tanzeel/elevateo-mail-completion-20261015/control/qa815-artifacts/android-32d043fbce8e-permission-rejected-unsigned.apk
name=qa815-android-probe-$short
log="$root/docs/completion/qa815-evidence/android-parser-$short.txt"
exec 9>"$lock"
flock -x 9
test "$(sha256sum "$apk" | cut -d' ' -f1)" = 743046f42bb8fd6d3eb662cc7708ed06612839b1582a5323dc896a6913458c83
printf 'source=%s\nimage=%s\napk_sha256=%s\nstarted=%s\n' "$candidate" "$image" \
  "$(sha256sum "$apk" | cut -d' ' -f1)" "$(date -u +%FT%TZ)" > "$log"
cleanup() {
  status=$?
  set +e
  if docker container inspect "$name" >/dev/null 2>&1; then
    mounts=$(docker container inspect --format '{{range .Mounts}}{{println .Source}}{{end}}' "$name")
    if [[ $mounts == *"$context"* && $mounts == *"$apk"* ]]; then
      docker rm -f "$name" >> "$log" 2>&1
    else
      printf 'cleanup_error=unexpected task container mounts\n' >> "$log"
      status=90
    fi
  fi
  find "$context" -mindepth 1 -depth -delete
  rmdir "$context"
  printf 'runner_exit=%s\narchive_absent=%s\nremaining_task_containers=%s\nfinished=%s\n' \
    "$status" "$([[ ! -e $context ]] && echo yes || echo no)" \
    "$(docker ps -a --filter "name=^/$name$" -q | wc -l)" "$(date -u +%FT%TZ)" >> "$log"
}
trap cleanup EXIT
git archive "$candidate" | tar -x -C "$context"
test "$(docker image inspect --format '{{.Id}}' "$image")" = "$image"
set +e
timeout 900s docker run --rm --name "$name" --memory 1g --memory-swap 1g --cpus 1 --pids-limit 128 \
  -v "$context":/src:ro -v "$apk":/artifacts/rejected.apk:ro -w /src "$image" bash -c '
    set -e
    printf "SETUP apt OpenJDK17 curl unzip\n"
    apt-get update -qq >/tmp/apt-update.log 2>&1
    DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends \
      openjdk-17-jre-headless curl unzip ca-certificates >/tmp/apt-install.log 2>&1
    export ANDROID_HOME=/opt/android-sdk
    mkdir -p "$ANDROID_HOME/cmdline-tools"
    printf "SETUP pinned Android command-line tools\n"
    curl -fsSL https://dl.google.com/android/repository/commandlinetools-linux-15859902_latest.zip \
      -o /tmp/android-tools.zip
    printf "%s  %s\n" 4e4c464f145a7512b57d088ac6c278c03c9eea610886b35a5e0804e74eedf583 \
      /tmp/android-tools.zip | sha256sum -c -
    unzip -q /tmp/android-tools.zip -d "$ANDROID_HOME/cmdline-tools"
    mv "$ANDROID_HOME/cmdline-tools/cmdline-tools" "$ANDROID_HOME/cmdline-tools/latest"
    printf "SETUP pinned Build Tools 36.0.0\n"
    yes | "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" --licenses >/tmp/licenses.log 2>&1
    "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" "build-tools;36.0.0" >/tmp/sdkmanager.log 2>&1
    aapt="$ANDROID_HOME/build-tools/36.0.0/aapt"
    apksigner="$ANDROID_HOME/build-tools/36.0.0/apksigner"
    test -x "$aapt" && test -x "$apksigner"
    printf "aapt_version="; "$aapt" version
    printf "aapt_sha256="; sha256sum "$aapt" | cut -d" " -f1
    printf "apksigner_sha256="; sha256sum "$apksigner" | cut -d" " -f1
    printf "apk_sha256="; sha256sum /artifacts/rejected.apk | cut -d" " -f1
    run_probe() {
      label=$1; shift
      "$@" >"/tmp/$label.out" 2>"/tmp/$label.err"
      result=$?
      printf "=== %s exit=%s stdout ===\n" "$label" "$result"
      cat "/tmp/$label.out"
      printf "=== %s stderr ===\n" "$label"
      cat "/tmp/$label.err"
    }
    set +e
    run_probe manifest_units python3 -m unittest discover -s apps/android -p test_verify_manifest_tree.py -v
    run_probe unsigned_units python3 -m unittest discover -s apps/android -p test_verify_unsigned.py -v
    run_probe permissions_units python3 -m unittest discover -s apps/android -p test_verify_permissions.py -v
    run_probe manifest_classifier python3 apps/android/verify_manifest_tree.py "$aapt" /artifacts/rejected.apk
    run_probe aapt_xmltree "$aapt" dump xmltree /artifacts/rejected.apk AndroidManifest.xml
    run_probe aapt_permissions "$aapt" dump permissions /artifacts/rejected.apk
    run_probe apksigner_verify "$apksigner" verify --verbose /artifacts/rejected.apk
    run_probe unsigned_classifier python3 apps/android/verify_unsigned.py "$apksigner" /artifacts/rejected.apk
    exit 0
  ' >> "$log" 2>&1
status=$?
set -e
exit "$status"
