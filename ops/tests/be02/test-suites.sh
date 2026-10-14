#!/usr/bin/env bash
# AIDEV-NOTE: Separate suite processes prevent controller leaks; ADV807 also proves child-process behavior.
set -euo pipefail
shopt -s globstar nullglob
for required in session_database auth_entry auth_client auth_revocations session_lifecycle mailbox_reads thread_database thread_reads adv807_refresh_process; do
  [[ -f "test/be_02/${required}_test.rb" ]] || { echo "Missing required suite: ${required}"; exit 1; }
done
[[ -f test/requests/drafts_test.rb ]] || { echo 'Missing required draft request suite'; exit 1; }
for required in approval_database schema_database approval_faults_database approval_races_database; do
  [[ -f "test/sends/${required}_test.rb" ]] || { echo "Missing required send suite: ${required}"; exit 1; }
done
# AIDEV-NOTE: Classify every suite; new directories fail admission instead of silently losing coverage.
tests=()
deferred=()
for test_file in test/**/*_test.rb; do
  case "$test_file" in
    test/be_01_r1/*)
      deferred+=("$test_file: historical R1 state/role fixture") ;;
    test/attachment_gateway/migration_acl_test.rb)
      deferred+=("$test_file: migrator session and private gateway bootstrap") ;;
    test/attachment_gateway/authority_database_test.rb)
      deferred+=("$test_file: dedicated gateway login URL and private bootstrap") ;;
    test/attachments/database_test.rb)
      deferred+=("$test_file: ATT823 admin/migrator/API/worker task URLs") ;;
    test/campaigns/database_test.rb)
      deferred+=("$test_file: OUT804 admin/API task URLs") ;;
    test/send_worker/mailpit_protocol_test.rb)
      deferred+=("$test_file: isolated Mailpit protocol flag and network") ;;
    test/administration/*|test/attachment_gateway/*|test/attachments/*|test/be_02/*|test/campaigns/*|test/inbound/*|test/outreach_sequence/*|test/qa817/*|test/requests/*|test/send_worker/*|test/sends/*)
      tests+=("$test_file") ;;
    *) echo "Unclassified test suite: $test_file" >&2; exit 1 ;;
  esac
done
[[ ${#tests[@]} -gt 0 ]] || { echo 'No standard application suites selected' >&2; exit 1; }
printf 'Standard app suites selected: %s; dedicated suites deferred: %s\n' "${#tests[@]}" "${#deferred[@]}"
printf 'DEFERRED %s\n' "${deferred[@]}"
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
