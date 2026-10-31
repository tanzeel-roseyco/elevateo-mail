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
    test/administration/assignment_member_options_migration_test.rb)
      deferred+=("$test_file: migrator session for reversible assignment-options DDL") ;;
    test/administration/organization_access_migration_test.rb)
      deferred+=("$test_file: migrator session for organization-access rollback DDL") ;;
    test/attachment_gateway/authority_database_test.rb)
      deferred+=("$test_file: dedicated gateway login URL and private bootstrap") ;;
    test/attachments/database_test.rb)
      deferred+=("$test_file: ATT823 admin/migrator/API/worker task URLs") ;;
    test/campaigns/database_test.rb)
      deferred+=("$test_file: OUT804 admin/API task URLs") ;;
    test/campaigns/rollback_migration_test.rb)
      deferred+=("$test_file: migrator DDL with private admin fixtures") ;;
    test/send_worker/mailpit_protocol_test.rb)
      deferred+=("$test_file: isolated Mailpit protocol flag and network") ;;
    test/send_worker/resend_wire_test.rb)
      deferred+=("$test_file: exactly six HTTP calls in dedicated network-none container") ;;
    test/support/launch_mailflows/app_chain_test.rb)
      deferred+=("$test_file: dedicated isolated Mox app-chain harness") ;;
    test/support/launch_mailflows/cleanup_test.rb|test/v2_attachment_error_test.rb|test/v2_route_registry_test.rb)
      tests+=("$test_file") ;;
    test/architecture/*|test/email_finder/*|test/administration/*|test/attachment_gateway/*|test/attachments/*|test/be_02/*|test/campaigns/*|test/inbound/*|test/resend_events/*|test/outreach_sequence/*|test/qa817/*|test/requests/*|test/send_worker/*|test/sends/*)
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
# AIDEV-NOTE: One worker fits this gate's 1 CPU/768 MiB budget; Steep's eight-worker default exceeds it.
if ! timeout -k 3s 180s bundle exec steep check --jobs=1; then
  failed=$((failed + 1))
fi
echo 'RUN RuboCop lint'
if ! timeout -k 3s 90s bundle exec rubocop --lint --format simple; then
  failed=$((failed + 1))
fi
printf 'Failed checks: %s\n' "$failed"
[[ "$failed" -eq 0 ]]
