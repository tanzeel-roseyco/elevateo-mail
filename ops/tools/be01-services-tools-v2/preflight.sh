# AIDEV-NOTE: Inline command works even when scp directory modes prevent opening mounted shell scripts.
check_readability() {
  run_container -c '
    cd "$1" || exit
  for manifest in ops/tools/be01-services-tools-v2/package.sha256; do
      sha256sum -c "$manifest" || exit
    done
  ' bash "${1:-/src}"
}
