#!/usr/bin/env bash
# Run diagnostics independently; original contract drift remains an overall failure.
set -u
out=/tmp/ops402-frontend
mkdir -p "$out"
status=0
run() {
  local name=$1 result
  shift
  "$@" > "$out/$name.txt" 2>&1
  result=$?
  echo "$name exit=$result" | tee -a "$out/exits.txt"
  (( result == 0 )) || status=1
  return "$result"
}
run original-api-artifact cp src/data/generated/api.d.ts "$out/api.original.d.ts"
if ! run check-api npm run check:api; then
  run generate-api npm run generate:api
  run check-generated-api npm run check:api
fi
run generated-api-artifact cp src/data/generated/api.d.ts "$out/api.generated.d.ts"
run lint npm run lint
run typecheck npm run typecheck
run unit npm run test -- --coverage
run build npm run build
if [[ -d dist ]]; then
  run fixture-markers bash -c 'grep -rl "dev-fixtures\|Development fixtures\|fixture_token_a" dist; code=$?; (( code == 1 ))'
else
  echo 'fixture-markers NOT_RUN no bundle' | tee -a "$out/exits.txt"
  status=1
fi
exit "$status"
