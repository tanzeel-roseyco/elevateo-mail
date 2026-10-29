#!/usr/bin/env bash
set -euo pipefail
# AIDEV-NOTE: Run only in a socket-free Docker container; execute the actual post-parent block under errexit.
[[ -f /.dockerenv && ! -S /var/run/docker.sock && $(id -u) == 10001 ]]
source_packet=$(cd "$(dirname "$0")" && pwd)
work=$(mktemp -d)
trap 'rm -rf -- "$work"' EXIT
sed -n '/^set +e$/,$p' "$source_packet/invoke.sh" > "$work/tail.sh"
[[ -s $work/tail.sh ]]
mkdir "$work/stubs"
cat > "$work/stubs/parent.sh" <<'PARENT'
#!/usr/bin/env bash
set -euo pipefail
if [[ $broken != none ]]; then mkdir "$audit/$broken.status"; fi
exit "$injected_parent"
PARENT
cat > "$work/stubs/reconcile.sh" <<'RECONCILE'
#!/usr/bin/env bash
set -euo pipefail
[[ $1 == "$audit" && $2 == "$audit/reconciliation" ]]
printf 'attempted\n' > "$audit/reconcile.called"
exit "$injected_reconcile"
RECONCILE
run_case() {
  local label=$1 expected=$5 stderr_target=${6:-/dev/null} actual=0
  export injected_parent=$2 injected_reconcile=$3 broken=$4
  export audit="$work/$label" packet="$work/stubs"
  mkdir "$audit"
  # AIDEV-NOTE: A child Bash preserves errexit semantics despite the caller's status-capturing conditional.
  timeout -k 1s 5s bash -euo pipefail "$work/tail.sh" 2> "$stderr_target" || actual=$?
  [[ $actual == "$expected" && $(cat "$audit/reconcile.called") == attempted ]]
  if [[ $broken != parent ]]; then
    [[ $(cat "$audit/parent.status") == "parent_exit=$injected_parent" ]]
  fi
  if [[ $broken != invocation ]]; then
    grep -qx "parent_exit=$injected_parent" "$audit/invocation.status"
    grep -qx "reconcile_exit=$injected_reconcile" "$audit/invocation.status"
    local expected_write=0
    if [[ $broken == parent ]]; then expected_write=1; fi
    grep -qx "parent_write_exit=$expected_write" "$audit/invocation.status"
  fi
  printf 'PASS %s\n' "$label"
}
run_case parent124-parent-write 124 0 parent 124
run_case parent124-invocation-write 124 0 invocation 124
run_case parent0-parent-write 0 0 parent 1
run_case parent0-invocation-write 0 0 invocation 1
run_case parent124-reconcile1 124 1 none 124
run_case parent0-reconcile1 0 1 none 1
run_case all0 0 0 none 0
run_case diagnostic-failure 124 0 invocation 124 /dev/full
