#!/usr/bin/env bash
# AIDEV-NOTE: Include request suites as well as BE02 units; separate processes prevent controller constant leaks.
set -euo pipefail
shopt -s nullglob
for required in session_database auth_entry auth_client auth_revocations session_lifecycle mailbox_reads thread_database thread_reads; do
  [[ -f "test/be_02/${required}_test.rb" ]] || { echo "Missing required suite: ${required}"; exit 1; }
done
[[ -f test/requests/drafts_test.rb ]] || { echo 'Missing required draft request suite'; exit 1; }
tests=(test/be_02/*_test.rb test/requests/*_test.rb)
failed=0
for test_file in "${tests[@]}"; do
  printf 'RUN %s\n' "$test_file"
  if ! timeout -k 3s 90s bundle exec ruby "$test_file"; then
    failed=$((failed + 1))
  fi
done
echo 'RUN Steep'
if ! timeout -k 3s 180s bundle exec steep check; then
  failed=$((failed + 1))
fi
echo 'RUN RuboCop lint'
if ! timeout -k 3s 90s bundle exec rubocop --lint --format simple; then
  failed=$((failed + 1))
fi
printf 'Failed checks: %s\n' "$failed"
[[ "$failed" -eq 0 ]]
