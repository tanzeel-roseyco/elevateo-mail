#!/usr/bin/env bash
# Prepared only: parent runs on fleet-02 after review; see ../be-01-r1-fleet02-runner.md.
# Requires the adjacent helper. No automatic retry; this bounded subset does not grant final R1 acceptance.
set -euo pipefail
# AIDEV-NOTE: The outer deadline includes a cleanup grace; never automatically retry this credit-bounded run.
if [[ ${1:-} != --bounded-child ]]; then
  exec timeout --signal=TERM --kill-after=60s 660s bash "$0" --bounded-child
fi
umask 077
for tool in git docker jq timeout sha256sum tar realpath cmp; do command -v "$tool" >/dev/null; done
commit=5785eba47f3709debb2815c8d86608f7e62d02f3
# AIDEV-NOTE: Pin dirty bytes separately; the frozen commit does not contain the five authorized repairs.
repair_sha=d31859d7747c9035b994f167bd84c5f80268af2d2d5c499514183838a5f237bf
repair_path=ops/tests/egress_test.rb
repair_file=$(realpath "${R1_EGRESS_REPAIR:?Set the absolute path to the byte-preserved repaired egress_test.rb}")
[[ -f $repair_file && $(sha256sum "$repair_file" | cut -d' ' -f1) == "$repair_sha" ]]
catalog_sha=e1a347ce15e6779b93b9b8e4f1dd2baa3d3eac520d3ad294b919193aa1cdc77a
catalog_path=ops/tests/membership-catalog.sql
catalog_file=$(realpath "${R1_CATALOG_REPAIR:?Set the absolute path to the byte-preserved repaired membership-catalog.sql}")
[[ -f $catalog_file && $(sha256sum "$catalog_file" | cut -d' ' -f1) == "$catalog_sha" ]]
# AIDEV-NOTE: Backend overlays enter the build context before Docker builds the baked /app source.
backend_root=$(realpath "${R1_BACKEND_REPAIR_ROOT:?Set the absolute root containing the three repaired apps/server files}")
backend_paths=(apps/server/lib/elevateo/tenancy.rb apps/server/test/be_01_r1/tenancy_test.rb apps/server/test/be_01_r1/worker_role_test.rb)
backend_hashes=(6d38a972fc99f2f873bbc197062dd261eb4fcace3d842125df27c02800180f6c ebb80f9d45d6735d509e19d1953a654286126c7aa9ec1d09ad82b50f96744e4e 2212ca8a045b3fe82746c8105f693ebf11d58801013e4e7203ff40022212b57a)
for i in "${!backend_paths[@]}"; do
  file=$backend_root/${backend_paths[$i]}
  [[ -f $file && $(sha256sum "$file" | cut -d' ' -f1) == "${backend_hashes[$i]}" ]]
done
runner_dir=$(dirname "$(realpath "$0")")
[[ $(sha256sum "$runner_dir/be-01-r1-fleet02-resources.sh" | cut -d' ' -f1) == 86681089c789e3b636f518508e8c6cf496d332f69bd69e5696bbc1dd4302aa4d ]]
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
source "$runner_dir/be-01-r1-fleet02-resources.sh"
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
printf 'evidence=%s source=%s\n' "$evidence" "$commit"
sha256sum "$0" "$runner_dir/be-01-r1-fleet02-resources.sh" > "$evidence/runner-sha256.txt"
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
# AIDEV-NOTE: Verify the original manifest first, then overlay only the five authorized dirty source files.
cp "$repair_file" "$src/$repair_path"
[[ $(sha256sum "$src/$repair_path" | cut -d' ' -f1) == "$repair_sha" ]]
cp "$catalog_file" "$src/$catalog_path"
[[ $(sha256sum "$src/$catalog_path" | cut -d' ' -f1) == "$catalog_sha" ]]
cp "$evidence/source-manifest.json" "$evidence/base-source-manifest.json"
jq --arg path "$repair_path" --arg sha "$repair_sha" --arg base "$commit" \
  --arg catalog "$catalog_path" --arg catalog_sha "$catalog_sha" \
  --argjson catalog_bytes "$(wc -c < "$src/$catalog_path")" \
  --argjson bytes "$(wc -c < "$src/$repair_path")" \
  '.base_commit = $base | .description = "Frozen base plus explicitly hashed uncommitted egress and catalog overlays" |
   (.files[] | select(.path == $path)) |= (.sha256 = $sha | .bytes = $bytes) |
   (.files[] | select(.path == $catalog)) |= (.sha256 = $catalog_sha | .bytes = $catalog_bytes)' \
  "$evidence/base-source-manifest.json" > "$evidence/source-manifest.json"
printf 'uncommitted_overlay=%s sha256=%s\n' "$repair_path" "$repair_sha"
printf 'uncommitted_overlay=%s sha256=%s\n' "$catalog_path" "$catalog_sha"
for i in "${!backend_paths[@]}"; do
  path=${backend_paths[$i]}; expected=${backend_hashes[$i]}
  cp "$backend_root/$path" "$src/$path"
  [[ $(sha256sum "$src/$path" | cut -d' ' -f1) == "$expected" ]]
  jq -e --arg path "$path" '[.files[] | select(.path == $path)] | length == 1' "$evidence/source-manifest.json" >/dev/null
  jq --arg path "$path" --arg sha "$expected" --argjson bytes "$(wc -c < "$src/$path")" \
    '.description = "Frozen base plus five explicitly hashed uncommitted backend/ops overlays" |
     (.files[] | select(.path == $path)) |= (.sha256 = $sha | .bytes = $bytes)' \
    "$evidence/source-manifest.json" > "$evidence/next-manifest.json"
  mv "$evidence/next-manifest.json" "$evidence/source-manifest.json"
  printf 'uncommitted_overlay=%s sha256=%s\n' "$path" "$expected"
done
for file in Gemfile Gemfile.lock; do
  git show "$commit:apps/server/$file" | sha256sum | cut -d' ' -f1 > "$evidence/$file.sha256"
done
chmod -R a+rX,a-w "$src"
for name in "$db" "$build_container"; do ! docker container inspect "$name" >/dev/null 2>&1; done
for name in "$config" "$cache"; do ! docker volume inspect "$name" >/dev/null 2>&1; done
! docker network inspect "$network" >/dev/null 2>&1
docker volume create --label "elevateo.r1.run=$nonce" "$cache" >/dev/null
docker buildx create --name "$builder" --driver docker-container \
  --driver-opt restart-policy=no,memory=2g,cpu-period=100000,cpu-quota=200000 >/dev/null
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
run_app runtime-profile none none 5 sh -ceu 'id; ruby --version; cat /proc/mounts; grep -E " /tmp tmpfs [^ ]*noexec(,| )" /proc/mounts' > "$evidence/runtime-profile.log"
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
  --cpus 2 --memory 2g --memory-swap 2g \
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
# AIDEV-NOTE: Expected failures must reach the oracle exception; parser errors must never satisfy a negative test.
catalog_reject() {
  local state=$1 message=$2 status=0
  psql_file -v "state=$state" -f /ops/tests/membership-catalog.sql > "$evidence/catalog-reject-$state.log" 2>&1 || status=$?
  [[ $status == 3 ]] && grep -F "ERROR:  $message" "$evidence/catalog-reject-$state.log" >/dev/null
}
catalog_reject repair 'catalog membership state differs'
catalog_reject invalid 'invalid catalog state'
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
# AIDEV-NOTE: Keep role-changing negative tests separate from API tests; all mutations target the disposable DB.
record membership run_app membership migrate migrator 5 bundle exec ruby test/be_01_r1/membership_migration_test.rb
[[ $failures -eq 0 ]] || exit 1
run_app down migrate migrator 5 bundle exec rails db:migrate VERSION=20261012000001 > "$evidence/down.log" 2>&1
psql_file -v state=absent -f /ops/tests/membership-catalog.sql > "$evidence/catalog-down.log"
psql_file -f /ops/db/bootstrap.sql > "$evidence/bootstrap-after-down.log"
psql_file -f /ops/db/bootstrap.sql > "$evidence/bootstrap-after-down-repeat.log"
psql_file -v state=absent -f /ops/tests/membership-catalog.sql > "$evidence/catalog-down-bootstrap.log"
run_app up-again migrate migrator 5 bundle exec rails db:migrate > "$evidence/up-again.log" 2>&1
psql_file -v state=repair -f /ops/tests/membership-catalog.sql > "$evidence/catalog-up-again.log"
for phase in down down-bootstrap up-again; do
  tail -n 4 "$evidence/catalog-$phase.log" > "$evidence/fingerprints-$phase"
  cmp "$evidence/fingerprints-before" "$evidence/fingerprints-$phase"
done
record authority-after-transition run_app authority-after-transition api api 5 bundle exec ruby test/be_01_r1/authority_guards_test.rb
while IFS=$'\t' read -r path expected; do
  if [[ $(sha256sum "$src/$path" | cut -d' ' -f1) != "$expected" ]]; then failures=$((failures+1)); fi
done < <(jq -r '.files[] | [.path,.sha256] | @tsv' "$evidence/source-manifest.json")
printf 'required_failures=%s legacy_and_network=pending powershell=pending final_acceptance=pending\n' "$failures"
[[ $failures -eq 0 ]]
