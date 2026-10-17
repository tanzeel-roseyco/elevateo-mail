#!/usr/bin/env bash
# AIDEV-NOTE: Docker-only socket-free regression of the real removal function and unsafe-original discriminator.
set -euo pipefail
: "${IMAGE_RECOVERY_SOURCE:?Authenticated image recovery script path}"
work=$(mktemp -d /tmp/be01-image-regression.XXXXXXXX)
trap 'rm -rf -- "$work"' EXIT
sed -n '/^remove_exact_image() {$/,/^}$/p' "$IMAGE_RECOVERY_SOURCE" > "$work/function.sh"
[[ -s $work/function.sh ]]
source "$work/function.sh"
image=sha256:7d755994b0456f71886c92ec548e55b64f58d0c8a579c14cde401f23b715b0f8
# This boundary rejects force, ancestor deletion, extra IDs, tags, and short IDs before simulating mutation.
d() {
  [[ $# == 4 && $1 == image && $2 == rm && $3 == --no-prune && $4 == "$image" ]] || return 91
  printf 'parent-preserved\n' > "$work/parent"
  return "${DAEMON_EXIT:-0}"
}
remove_exact_image
[[ $(cat "$work/parent") == parent-preserved ]]
status=0; DAEMON_EXIT=37 remove_exact_image || status=$?
[[ $status == 37 ]]
# Remove just the repair from the actual function: the exact same boundary must reject the unsafe original.
sed 's/--no-prune //' "$work/function.sh" > "$work/original.sh"
source "$work/original.sh"
status=0; remove_exact_image || status=$?
[[ $status == 91 ]]
printf 'PASS exact no-prune removal, daemon failure propagation, unsafe-original discrimination\n'
