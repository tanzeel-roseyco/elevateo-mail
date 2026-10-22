#!/bin/sh
set -eu

# AIDEV-NOTE: Gate every deployment command on a content digest before invoking Docker.
image=${ELEVATEO_PRODUCTION_IMAGE-}
case "$image" in
  sha256:*) digest=${image#sha256:} ;;
  ?*@sha256:*) digest=${image##*@sha256:} ;;
  *) printf '%s\n' 'ELEVATEO_PRODUCTION_IMAGE must identify a SHA256 digest' >&2; exit 64 ;;
esac
case "$digest" in
  ''|*[!0-9a-f]*) printf '%s\n' 'Invalid SHA256 image digest' >&2; exit 64 ;;
esac
if [ "${#digest}" -ne 64 ]; then
  printf '%s\n' 'SHA256 image digest must contain 64 lowercase hex characters' >&2
  exit 64
fi
ELEVATEO_ADMITTED_PRODUCTION_IMAGE=$image
export ELEVATEO_ADMITTED_PRODUCTION_IMAGE
script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
exec docker compose -f "$script_dir/compose.yaml" "$@"
