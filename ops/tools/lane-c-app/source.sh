# AIDEV-NOTE: Only manifest-listed regular files enter the app context; dirty staging extras never enter layers.
check_sources() {
  local manifest path
  for manifest in ops/tests/fleet02-egress-source.sha256 ops/tests/fleet02-egress-package.sha256 \
    ops/tools/lane-c-synthetic/tools.sha256 ops/tools/lane-c-app/app.sha256; do
    while read -r digest path; do
      [[ $digest =~ ^[a-f0-9]{64}$ && $path =~ ^[a-zA-Z0-9_./-]+$ ]] || return 1
      [[ -f $path && ! -L $path && $(realpath "$path") == "$TOOLS_SOURCE/$path" ]] || return 1
    done < "$manifest"
    sha256sum -c "$manifest" || return 1
  done
  [[ -x apps/server/bin/rails && -x apps/server/bin/worker && -x apps/server/bin/worker-health ]]
}
prepare_context() {
  check_sources || return 1
  awk '$2 ~ /^apps\/server\// {sub(/^apps\/server\//,"",$2); print $2}' \
    ops/tests/fleet02-egress-source.sha256 > "$evidence/app-files"
  [[ $(wc -l < "$evidence/app-files") == 34 ]] || return 1
  tar -C apps/server --no-recursion -cf "$evidence/app-context.tar" -T "$evidence/app-files" || return 1
  check_sources || return 1
  sha256sum "$evidence/app-context.tar" > "$evidence/app-context.sha256"
}
preflight_images() {
  local reference
  # The parent authenticates compose.yaml through the source manifest before parsing these fixed entries.
  sed -nE 's/^    image: ([^ ]+@sha256:[a-f0-9]{64})$/\1/p' compose.yaml | sort -u > "$evidence/compose-images"
  [[ $(wc -l < "$evidence/compose-images") == 5 ]] || return 1
  while read -r reference; do docker image inspect "$reference" >/dev/null || return 1; done < "$evidence/compose-images"
}
finish_app() {
  local status=$1
  trap - EXIT INT TERM
  set +e
  # AIDEV-NOTE: Hash drift fails a successful run, but never replaces the original failure or bypasses cleanup.
  if ! check_sources > "$evidence/source.after.log" 2>&1; then
    echo 'Source verification failed after run'; ((status != 0)) || status=1
  fi
  (exit "$status")
  cleanup_tools
}
