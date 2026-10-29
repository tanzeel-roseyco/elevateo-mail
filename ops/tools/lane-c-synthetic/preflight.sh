# AIDEV-NOTE: Inline command works even when scp directory modes prevent opening mounted shell scripts.
check_readability() {
  run_container bash -c '
    cd "$1" || exit
    for manifest in ops/tools/lane-c-synthetic/tools.sha256 ops/tests/fleet02-egress-source.sha256 ops/tests/fleet02-egress-package.sha256; do
      sha256sum -c "$manifest" || exit
    done
  ' bash "${1:-/src}"
}
