#!/usr/bin/env bash
set -euo pipefail

# AIDEV-NOTE: Soren runs this inside fleet Docker; fake PATH forbids reaching a real daemon.
if [[ ${MAIL818_RUNNER_TEST_CONTAINER:-} != 1 ]]; then
  echo 'fleet Docker test-container marker required' >&2
  exit 2
fi

source_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
test_dir=$(mktemp -d)
trap 'rm -rf -- "$test_dir"' EXIT
mkdir -p "$test_dir/pilot/scripts" "$test_dir/fake"
cp -- "$source_dir/scripts/run-pilot.sh" "$test_dir/pilot/scripts/run-pilot.sh"

cat >"$test_dir/fake/docker" <<'FAKE'
#!/usr/bin/env bash
exit 0
FAKE
cat >"$test_dir/fake/hostname" <<'FAKE'
#!/usr/bin/env bash
printf 'fleet-02-test\n'
FAKE
cat >"$test_dir/fake/df" <<'FAKE'
#!/usr/bin/env bash
printf 'Filesystem 1024-blocks Used Available Capacity Mounted\nfixture 10000000 1 9000000 1%% /tmp\n'
FAKE
cat >"$test_dir/fake/timeout" <<'FAKE'
#!/usr/bin/env bash
set -euo pipefail
if [[ $1 == -k ]]; then shift 2; fi
shift # duration
if [[ ${FAULT_INVENTORY:-0} == 1 && ${1:-} == docker && ${2:-} == ps && ${3:-} == -a ]]; then
  exit 124
fi
"$@"
FAKE
chmod 700 "$test_dir/fake/"*

export PATH="$test_dir/fake:$PATH"
export MOX_PILOT_LEASE_TOKEN=synthetic-test-lease
export MOX_SOURCE_SHA=1c9587665b321199312e11b6a47a0480a9e2750f
export MOX_IMAGE=r.xmox.nl/mox@sha256:831c6f11b3c2ee1633077052e6d4b7ae53f73972adf4bf08be0a740121d24cc7
export PROBE_IMAGE=sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
unset APP_TEST_IMAGE APP_SOURCE_DIR CORIN_SOURCE_SHA

export MOX_PILOT_RECEIPT_DIR="$test_dir/base-receipt"
"$test_dir/pilot/scripts/run-pilot.sh"
grep -Fqx 'schema=mail818-components-v1' "$MOX_PILOT_RECEIPT_DIR/component-status.txt"
grep -Fqx 'interop_result=not_run_missing_inputs' "$MOX_PILOT_RECEIPT_DIR/component-status.txt"
grep -Fqx 'corin_initial=skipped_missing_inputs' "$MOX_PILOT_RECEIPT_DIR/component-status.txt"
grep -Fqx 'corin_restart=skipped_missing_inputs' "$MOX_PILOT_RECEIPT_DIR/component-status.txt"
grep -Fqx 'base_result=pass' "$MOX_PILOT_RECEIPT_DIR/component-status.txt"
grep -Fqx 'interop_requested=0' "$MOX_PILOT_RECEIPT_DIR/inputs.txt"

export APP_TEST_IMAGE=sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
export MOX_PILOT_RECEIPT_DIR="$test_dir/partial-input-receipt"
if "$test_dir/pilot/scripts/run-pilot.sh"; then
  echo 'partial interop inputs were admitted' >&2
  exit 1
fi
[[ ! -e $MOX_PILOT_RECEIPT_DIR ]]
unset APP_TEST_IMAGE

export FAULT_INVENTORY=1
export MOX_PILOT_RECEIPT_DIR="$test_dir/hung-inventory-receipt"
if "$test_dir/pilot/scripts/run-pilot.sh"; then
  echo 'hung inventory was accepted' >&2
  exit 1
fi
grep -Fqx 'cleanup_verification=unverifiable' "$MOX_PILOT_RECEIPT_DIR/component-status.txt"
grep -Fqx 'base_result=incomplete' "$MOX_PILOT_RECEIPT_DIR/component-status.txt"
grep -Eq 'containers=124([[:space:]]|$)' "$MOX_PILOT_RECEIPT_DIR/cleanup-status.txt"
printf 'PASS: omitted inputs explicit, partial inputs rejected, timed-out inventory unverifiable\n'
