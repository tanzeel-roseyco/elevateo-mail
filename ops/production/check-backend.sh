#!/usr/bin/env bash
set -uo pipefail
# AIDEV-NOTE: Run only inside a fleet Docker container with --network none; no real credentials are needed.
failed=0
for suite in auth_config production_runtime auth_client auth_entry auth_revocations; do
  printf 'RUN %s\n' "$suite"
  timeout 60s bundle exec ruby "test/be_02/${suite}_test.rb" || failed=$((failed + 1))
done
timeout 180s bundle exec steep check --jobs 1 || failed=$((failed + 1))
timeout 90s bundle exec rubocop --lint --format simple \
  lib/elevateo/config.rb config/application.rb test/be_02/auth_config_test.rb \
  test/be_02/production_runtime_test.rb || failed=$((failed + 1))
printf 'Failed checks: %s\n' "$failed"
exit "$failed"
