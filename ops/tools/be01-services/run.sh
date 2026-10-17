#!/usr/bin/env bash
# AIDEV-NOTE: Separate acceptance driver; prebuilt immutable image prerequisite avoids touching frozen build lifecycle.
set -euo pipefail
if [[ ${1:-} != --bounded ]]; then exec timeout -k 600s 1200s bash "$0" --bounded; fi
umask 077
: "${BE01_SOURCE:?}" "${BE01_CONTEXT:?}" "${BE01_APP_IMAGE:?}" "${BE01_EVIDENCE:?}" "${BE01_PACKAGE_SHA:?}"
[[ $(hostname -s) == Ubuntu-noble-latest-amd64-base ]]
[[ -z ${DOCKER_HOST:-} && -z ${DOCKER_TLS_VERIFY:-} && -z ${DOCKER_CERT_PATH:-} ]]
for tool in docker jq timeout sha256sum realpath df sed grep; do command -v "$tool" >/dev/null; done
src=$(realpath "$BE01_SOURCE"); context=$BE01_CONTEXT; app=$BE01_APP_IMAGE
[[ $src == "$BE01_SOURCE" && $src != *,* && $src != *:* && $src != *$'\n'* ]]
[[ $app =~ ^sha256:[a-f0-9]{64}$ && $BE01_PACKAGE_SHA =~ ^[a-f0-9]{64}$ ]]
[[ -z ${LANE_PUBLISH:-} ]]
for executable in rails worker worker-health; do [[ -x $src/apps/server/bin/$executable ]]; done
adapter=$src/ops/tools/be01-services; lane=$src/ops/tests
authenticate() {
  local manifest digest path
  cd "$src" || return 1
  printf '%s  %s\n' "$BE01_PACKAGE_SHA" ops/tools/be01-services/package.sha256 | sha256sum -c - || return 1
  for manifest in ops/tools/be01-services/package.sha256 ops/tools/be01-services/dependencies.sha256 \
    ops/tests/be01-services/package.sha256 ops/tests/fleet02-egress-source.sha256; do
    while read -r digest path; do
      [[ $digest =~ ^[a-f0-9]{64}$ && $path =~ ^[a-zA-Z0-9_./-]+$ && $path != *..* ]] || return 1
      [[ -f $src/$path && ! -L $src/$path && $(realpath "$src/$path") == "$src/$path" ]] || return 1
    done < "$manifest"
    sha256sum -c "$manifest" || return 1
  done
}
authenticate
export DOCKER_CONTEXT=$context R1_PROJECT='' R1_APP_IMAGE=$app
source "$lane/fleet02-egress-resources.sh"
source "$lane/fleet02-egress-compose.sh"
source "$adapter/stack.sh"
source "$adapter/fixture.sh"
source "$adapter/volumes.sh"
source "$adapter/phases.sh"
[[ $(daemon context inspect "$context" --format '{{.Endpoints.docker.Host}}') == unix:///var/run/docker.sock ]]
[[ $(daemon image inspect -f '{{.Id}}' "$app") == "$app" ]]
daemon image inspect "$app" | jq -e '.[0].Config.Volumes//{}|length==0' >/dev/null
task=be01services-$(cat /proc/sys/kernel/random/uuid); runtime=$task-runtime
evidence=$(mktemp -d "$BE01_EVIDENCE/$task.XXXXXX"); registry=$evidence/resources; mkdir "$registry"
trap finish_services EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
printf 'task=%s evidence=%s\n' "$task" "$evidence"
df -B1 "$evidence" > "$evidence/host-space.before"
daemon image ls --no-trunc > "$evidence/images.before"
daemon_for 15s buildx ls > "$evidence/builders.before"
# AIDEV-NOTE: Exercise actual UID readability before allocating persistent task volumes.
tool_run "$app" none -e 'ARGV.each { |p| File.foreach(p) { |l| File.open("/src/" + l.split.fetch(1), "rb") { |f| f.read(1) } } }' \
  /src/ops/tools/be01-services/package.sha256 /src/ops/tests/be01-services/package.sha256 > "$evidence/readability.log"
# Frozen socket-free helper checks the source embedded in the immutable app before private stack creation.
jq -Rn '[inputs|capture("^(?<sha>[0-9a-f]{64})  apps/server/(?<path>.+)$")|
  select(.path!="Dockerfile" and .path!=".dockerignore" and (.path|startswith("tmp/.") or startswith("log/.")|not))|
  {key:.path,value:.sha}]|from_entries' "$lane/fleet02-egress-source.sha256" |
  tool_run "$app" none /src/ops/tests/fleet02-egress-baked.rb > "$evidence/baked.log"
tool_run "$app" none -r/src/ops/bin/generate-secrets.rb -e \
  'LocalSecrets.generated.each { |key,value| puts "#{key}=#{value}" }' > "$evidence/disposable.env"
# Parent directory stays 0700; only the explicit credential-check mount exposes this file to UID10001.
chmod 644 "$evidence/disposable.env"
prepare_stack
volumes_new
fixture state-init volume init-state
create_services
run_phases
authenticate > "$evidence/source.final.log"
