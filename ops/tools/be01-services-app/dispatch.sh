# AIDEV-NOTE: Authenticate the child before build allocation, dispatch and parent cleanup; never source its globals.
check_services_sources() {
  local manifest digest path
  (
    cd "$TOOLS_SOURCE" || exit 1
    printf '%s  %s\n' "$SERVICES_APP_PACKAGE_SHA" ops/tools/be01-services-app/package.sha256 | sha256sum -c - || exit 1
    printf '%s  %s\n' ad4773807748c99d23c763f2a6203a4cde276c68cca09ea6f9f030380252235d \
      ops/tools/be01-services/package.sha256 | sha256sum -c - || exit 1
    for manifest in ops/tools/be01-services/package.sha256 ops/tools/be01-services/dependencies.sha256 \
      ops/tests/be01-services/package.sha256 ops/tests/fleet02-egress-source.sha256 \
      ops/tools/be01-services-app/package.sha256; do
      while read -r digest path; do
        [[ $digest =~ ^[a-f0-9]{64}$ && $path =~ ^[a-zA-Z0-9_./-]+$ && $path != *..* ]] || exit 1
        [[ -f $path && ! -L $path && $(realpath "$path") == "$TOOLS_SOURCE/$path" ]] || exit 1
      done < "$manifest"
      sha256sum -c "$manifest" || exit 1
    done
  )
}
dispatch_services() {
  check_services_sources || return 1
  [[ $image_id =~ ^sha256:[a-f0-9]{64}$ ]] || return 1
  # The child owns its 1200s deadline and 600s cleanup grace; wait for it before parent image recovery.
  BE01_SOURCE=$TOOLS_SOURCE BE01_CONTEXT=$TOOLS_CONTEXT BE01_APP_IMAGE=$image_id \
    BE01_EVIDENCE=$TOOLS_EVIDENCE \
    BE01_PACKAGE_SHA=ad4773807748c99d23c763f2a6203a4cde276c68cca09ea6f9f030380252235d \
    bash "$TOOLS_SOURCE/ops/tools/be01-services/run.sh"
}
finish_services_app() {
  local status=$1
  trap - EXIT INT TERM
  set +e
  if ! check_services_sources > "$evidence/services-source.after.log" 2>&1; then
    echo 'Services source verification failed after run'; ((status != 0)) || status=1
  fi
  # Frozen finish_app forwards the original status via $? to cleanup_tools; its ownership checks stay intact.
  finish_app "$status"
}
