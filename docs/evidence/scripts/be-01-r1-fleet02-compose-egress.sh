#!/usr/bin/env bash
# Parent-only Lane C; no build/pull, live mail, persistent volumes, or broad cleanup.
set -euo pipefail
if [[ ${1:-} != --bounded-child ]]; then
  exec timeout --signal=TERM --kill-after=120s 600s bash "$0" --bounded-child
fi
umask 077
for tool in docker jq sha256sum realpath timeout hostname find sort cmp; do command -v "$tool" >/dev/null; done
[[ $(hostname -s) == "${R1_EXPECT_HOST:?Set the verified fleet-02 hostname}" ]]
[[ -z ${DOCKER_HOST:-} && -z ${DOCKER_TLS_VERIFY:-} && -z ${DOCKER_CERT_PATH:-} ]]
context=${DOCKER_CONTEXT:-default}
[[ $(docker --context "$context" context inspect "$context" --format '{{.Endpoints.docker.Host}}') == unix:///var/run/docker.sock ]]
export DOCKER_CONTEXT=$context
src=$(realpath "${R1_SOURCE:?Set frozen source plus five R3b overlays and reviewed Lane C files}")
[[ $src != *,* && $src != *$'\n'* && $src != *:* ]]
lane=$src/ops/tests
override=$src/ops/compose.fleet02-egress.yaml
package_sha=46b296fd1158da3e9df1362162d903e01013c5fedd33465bf8ab323ed4217862
[[ $(sha256sum "$lane/fleet02-egress-package.sha256" | cut -d' ' -f1) == "$package_sha" ]]
(cd "$src" && sha256sum --check --status ops/tests/fleet02-egress-package.sha256)
# AIDEV-NOTE: Reject links and every source mismatch before any Docker resource creation.
while read -r digest path; do
  [[ $path != /* && $path != *..* && -f $src/$path && ! -L $src/$path ]]
  [[ $(realpath "$src/$path") == "$src/$path" ]]
done < <(cat "$lane/fleet02-egress-source.sha256" "$lane/fleet02-egress-package.sha256")
(cd "$src" && sha256sum --check --status ops/tests/fleet02-egress-source.sha256)
app=${R1_APP_IMAGE:?Set the immutable prebuilt repaired application image ID}
[[ $app =~ ^sha256:[0-9a-f]{64}$ ]]
[[ $(docker --context "$context" image inspect -f '{{.Id}}' "$app") == "$app" ]]
ruby=$(docker --context "$context" image inspect -f '{{.Id}}' ruby:3.4.11-slim-bookworm@sha256:22165c5f904d76a8a02fbdd419d0269481369523fd66978232d16c88099730e2)
task=be01r1-$(cat /proc/sys/kernel/random/uuid)
runtime=$task-runtime
evidence=$(mktemp -d "${R1_EVIDENCE_PARENT:?Set private evidence parent directory}/$task.XXXXXX")
registry=$evidence/resources
mkdir "$registry"
source "$lane/fleet02-egress-resources.sh"
source "$lane/fleet02-egress-compose.sh"
source "$lane/egress-check-fleet02.sh"
trap cleanup_lane EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
printf 'task=%s evidence=%s base=5785eba plus_five_overlays=true\n' "$task" "$evidence"
cp "$lane/fleet02-egress-package.sha256" "$lane/fleet02-egress-source.sha256" "$evidence/"
sha256sum "$0" > "$evidence/driver.sha256"
daemon version --format '{{.Server.Version}}' > "$evidence/docker-version"
compose version --short > "$evidence/compose-version"
# Source checks execute inside the baked image, with no network or daemon mount.
jq -Rn '[inputs | capture("^(?<sha>[0-9a-f]{64})  apps/server/(?<path>.+)$") |
  select(.path != "Dockerfile" and .path != ".dockerignore" and (.path | startswith("tmp/.") or startswith("log/.") | not)) |
  {key:.path,value:.sha}] | from_entries' "$lane/fleet02-egress-source.sha256" |
  tool_run "$app" none /src/ops/tests/fleet02-egress-baked.rb > "$evidence/baked.log"
tool_run "$ruby" none -r/src/ops/bin/generate-secrets.rb -e \
  'LocalSecrets.generated.each { |key,value| puts "#{key}=#{value}" }' > "$evidence/disposable.env"
prepare_compose
create_services
start_service db
healthy db
oneshot bootstrap
oneshot migrate
for service in mailpit auth rest storage api worker; do start_service "$service"; done
for service in auth storage api worker; do healthy "$service"; done
# AIDEV-NOTE: Missing base healthchecks need bounded positive readiness; the global deadline still covers retries.
for pair in mailpit:8025 rest:3000; do
  wait_local_ready "${pair%:*}" "${pair#*:}"
done
lane_egress > "$evidence/egress.log" 2>&1
# Missing and stopped targets must be rejected; restore only the verified task service afterward.
missing=$(daemon ps -q --filter "label=com.docker.compose.project=$task-missing")
[[ -z $missing ]]
if (task=$task-missing; target api) > "$evidence/missing-target.log" 2>&1; then exit 1; fi
verify_container "$task-worker"
daemon stop --time 5 "$(cat "$registry/$task-worker.id")" >/dev/null
if target worker > "$evidence/stopped-target.log" 2>&1; then exit 1; fi
start_service worker
healthy worker
id=$(target worker)
{
  expect_probe "$id" "$restored_database_ip" 5432 connected
  expect_probe "$id" "$restored_gateway" "$restored_port" denied
  printf 'PASS restored actual worker connectivity and denial\n'
} > "$evidence/egress-restored.log" 2>&1
(cd "$src" && sha256sum --check --status ops/tests/fleet02-egress-source.sha256)
printf 'PASS Lane C actual Compose namespaces and negative controls; PowerShell/native acceptance pending\n'
