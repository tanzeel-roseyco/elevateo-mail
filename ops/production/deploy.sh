#!/bin/sh
set -eu
# AIDEV-NOTE: Gate every deployment command on validated environment and pinned content digests before Docker.
script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
exec python3 "$script_dir/deployment.py" "$@"
