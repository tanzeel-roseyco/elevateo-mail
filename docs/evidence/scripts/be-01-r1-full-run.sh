#!/usr/bin/env bash
# Run: bash /path/to/be-01-r1-full-run.sh from the remote Linux repository containing the pinned commit.
# Requires the adjacent helper. No automatic retry; this bounded subset does not grant final R1 acceptance.
set -euo pipefail
# AIDEV-NOTE: The outer deadline includes a cleanup grace; never automatically retry this credit-bounded run.
if [[ ${1:-} != --bounded-child ]]; then
  exec timeout --signal=TERM --kill-after=60s 660s bash "$0" --bounded-child
fi
umask 077
for tool in git docker jq timeout sha256sum tar; do command -v "$tool" >/dev/null; done
commit=5785eba47f3709debb2815c8d86608f7e62d02f3
pg='supabase/postgres:17.6.1.136@sha256:f371b5f3f2ac0a05703f33d6e6134515fb2498cab708fb948a0aeb7481467c00'
nonce=$(cat /proc/sys/kernel/random/uuid)
task=be01r1-$nonce
evidence=$(mktemp -d "${TMPDIR:-/tmp}/$task.XXXXXX")
src=$evidence/source
mkdir "$src"
network=$task-net; config=$task-config; builder=$task-build
build_container=buildx_buildkit_${builder}0; cache=${build_container}_state
db=$task-db; app_image=$task:repair
declare -A profiles=() ids=()
failures=0; builder_id=''; build_image=''; config_ready=false
docker image ls -q --no-trunc | sort -u > "$evidence/preexisting-images"
source "$(dirname "$(realpath "$0")")/be-01-r1-resources.sh"
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
printf 'evidence=%s source=%s\n' "$evidence" "$commit"
[[ $(git rev-parse "$commit^{commit}") == "$commit" ]]
git archive "$commit" | tar -x -C "$src"
git show "$commit:docs/evidence/be-01-r1-git-blobs.json" > "$evidence/source-manifest.json"
jq -e '.files | length == 31' "$evidence/source-manifest.json" >/dev/null
# AIDEV-NOTE: Archive attributes can alter bytes; restore each reviewed file from its canonical Git blob.
while IFS= read -r path; do
  [[ "$path" != /* && "$path" != *..* ]]
  git show "$commit:$path" > "$src/$path"
done < <(jq -r '.files[].path' "$evidence/source-manifest.json")
while IFS=$'\t' read -r path expected bytes; do
  [[ $(sha256sum "$src/$path" | cut -d' ' -f1) == "$expected" ]]
  [[ $(wc -c < "$src/$path") -eq "$bytes" ]]
done < <(jq -r '.files[] | [.path,.sha256,.bytes] | @tsv' "$evidence/source-manifest.json")
for file in Gemfile Gemfile.lock; do
  git show "$commit:apps/server/$file" | sha256sum | cut -d' ' -f1 > "$evidence/$file.sha256"
done
chmod -R a+rX,a-w "$src"
for name in "$db" "$build_container"; do ! docker container inspect "$name" >/dev/null 2>&1; done
for name in "$config" "$cache"; do ! docker volume inspect "$name" >/dev/null 2>&1; done
! docker network inspect "$network" >/dev/null 2>&1
docker volume create --label "elevateo.r1.run=$nonce" "$cache" >/dev/null
docker buildx create --name "$builder" --driver docker-container --driver-opt restart-policy=no >/dev/null
# The dedicated builder state volume must be the nonce-labelled volume, never a shared cache.
timeout 420s docker buildx build --builder "$builder" --load --progress plain \
  --label "elevateo.r1.run=$nonce" -t "$app_image" "$src/apps/server" > "$evidence/build.log" 2>&1
builder_id=$(docker inspect -f '{{.Id}}' "$build_container")
verify_builder
run_app baked none none 5 sh -ceu 'sha256sum Gemfile Gemfile.lock; bundle check; bundle exec ruby -e '\''require "base64"; require "minitest/mock"; puts "base64=#{Gem.loaded_specs.fetch("base64").version}"'\''' > "$evidence/baked.log"
for file in Gemfile Gemfile.lock; do
  expected=$(cat "$evidence/$file.sha256")
  grep -Fx "$expected  $file" "$evidence/baked.log" >/dev/null
done
grep -Fx 'base64=0.3.0' "$evidence/baked.log" >/dev/null
for suite in secrets heartbeat egress; do
  record "ops-$suite" run_app "ops-$suite" none none 5 bundle exec ruby "/src/ops/tests/${suite}_test.rb"
done
[[ $failures -eq 0 ]] || exit 1
timeout 45s docker pull "$pg" > "$evidence/postgres-pull.log" 2>&1
[[ $(docker image inspect -f '{{json .Config.Volumes}}' "$pg") =~ ^(null|\{\})$ ]]
docker network create --internal --label "elevateo.r1.run=$nonce" "$network" >/dev/null
docker volume create --label "elevateo.r1.run=$nonce" "$config" >/dev/null
config_ready=true
inspect_config rw
profiles[$db]=database
docker create --name "$db" --label "elevateo.r1.run=$nonce" --network "$network" --network-alias db \
  --mount type=tmpfs,dst=/var/lib/postgresql/data \
  --mount "type=volume,src=$config,dst=/etc/postgresql-custom,volume-nocopy" \
  --mount "type=bind,src=$src/ops,dst=/ops,readonly" \
  --mount "type=bind,src=$src/ops/supabase/db/99-roles.sql,dst=/docker-entrypoint-initdb.d/init-scripts/99-roles.sql,readonly" \
  --mount "type=bind,src=$src/ops/supabase/db/99-jwt.sql,dst=/docker-entrypoint-initdb.d/init-scripts/99-jwt.sql,readonly" \
  -e POSTGRES_PASSWORD=r1-disposable-fixture-password -e PGPASSWORD=r1-disposable-fixture-password \
  -e PGDATABASE=postgres -e POSTGRES_DB=postgres -e POSTGRES_HOST=/var/run/postgresql \
  -e PGPORT=5432 -e POSTGRES_PORT=5432 -e JWT_EXP=3600 \
  -e MIGRATOR_DB_PASSWORD=r1-disposable-migrator -e API_DB_PASSWORD=r1-disposable-api \
  -e WORKER_DB_PASSWORD=r1-disposable-worker "$pg" postgres \
  -c config_file=/etc/postgresql/postgresql.conf -c log_min_messages=fatal >/dev/null
verify_container "$db"
docker start "$db" >/dev/null
ready=false
for ((attempt=0; attempt<60; attempt++)); do
  [[ $(docker inspect -f '{{.State.Running}}' "$db") == true ]] || break
  if docker exec "$db" pg_isready -h 127.0.0.1 -U supabase_admin -d postgres >/dev/null 2>&1; then ready=true; break; fi
  sleep 1
done
if [[ $ready != true ]]; then
  docker inspect -f 'status={{.State.Status}} exit={{.State.ExitCode}} oom={{.State.OOMKilled}}' "$db"
  exit 1
fi
psql_file() { docker exec "$db" psql -X -h 127.0.0.1 -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -Atq "$@"; }
psql_file -f /ops/db/bootstrap.sql > "$evidence/bootstrap-first.log"
psql_file -f /ops/db/bootstrap.sql > "$evidence/bootstrap-second.log"
run_app foundation migrate migrator 5 bundle exec rails db:migrate VERSION=20261012000001 > "$evidence/foundation.log" 2>&1
psql_file -f /ops/tests/db-fixtures.sql > "$evidence/fixtures.log"
psql_file -v state=absent -f /ops/tests/membership-catalog.sql > "$evidence/catalog-before.log"
run_app migration migrate migrator 5 bundle exec rails db:migrate > "$evidence/migration.log" 2>&1
psql_file -v state=repair -f /ops/tests/membership-catalog.sql > "$evidence/catalog-after.log"
tail -n 4 "$evidence/catalog-before.log" > "$evidence/fingerprints-before"
tail -n 4 "$evidence/catalog-after.log" > "$evidence/fingerprints-after"
cmp "$evidence/fingerprints-before" "$evidence/fingerprints-after"
record driver run_app driver api api 5 bundle exec ruby test/be_01_r1/baseline_driver.rb repair
if ! grep '^{' "$evidence/driver.log" | jq -se \
  'length == 3 and (map(.scenario) | sort == ["T1","T2","T3"]) and all(.[]; .mode == "repair" and .result == "REPAIR_PASS")' >/dev/null; then
  printf 'FAIL driver-json\n'; failures=$((failures+1))
fi
record authority run_app authority api api 5 bundle exec ruby test/be_01_r1/authority_guards_test.rb
record tenancy-pool5 run_app tenancy-pool5 api api 5 bundle exec ruby test/be_01_r1/tenancy_test.rb
record tenancy-pool1 run_app tenancy-pool1 api api 1 bundle exec ruby test/be_01_r1/tenancy_test.rb
record worker run_app worker worker worker 5 bundle exec ruby test/be_01_r1/worker_role_test.rb
while IFS=$'\t' read -r path expected; do
  if [[ $(sha256sum "$src/$path" | cut -d' ' -f1) != "$expected" ]]; then failures=$((failures+1)); fi
done < <(jq -r '.files[] | [.path,.sha256] | @tsv' "$evidence/source-manifest.json")
printf 'required_failures=%s legacy_and_rollback=pending final_acceptance=pending\n' "$failures"
[[ $failures -eq 0 ]]
