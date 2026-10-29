#!/usr/bin/env bash
# AIDEV-NOTE: Run serially after standard suites; rollback DDL must not overlap application database tests.
set -euo pipefail
: "${BE02_ADMIN_DATABASE_URL:?isolated admin URL required}"
: "${BE02_MIGRATOR_DATABASE_URL:?isolated migrator URL required}"
: "${BE02_API_DATABASE_URL:?isolated API URL required}"
: "${BE02_WORKER_DATABASE_URL:?isolated worker URL required}"
: "${BE02_ATTACHMENT_GATEWAY_DATABASE_URL:?isolated gateway URL required}"
: "${BE02_TASK_DATABASE_NAME:?isolated database name required}"

export ATT823_ADMIN_DATABASE_URL="$BE02_ADMIN_DATABASE_URL"
export ATT823_MIGRATOR_DATABASE_URL="$BE02_MIGRATOR_DATABASE_URL"
export ATT823_API_DATABASE_URL="$BE02_API_DATABASE_URL"
export ATT823_WORKER_DATABASE_URL="$BE02_WORKER_DATABASE_URL"
export ATT823_TASK_DATABASE_NAME="$BE02_TASK_DATABASE_NAME"
export OUT804_ADMIN_DATABASE_URL="$BE02_ADMIN_DATABASE_URL"
export OUT804_API_DATABASE_URL="$BE02_API_DATABASE_URL"
export OUT804_TASK_DATABASE_NAME="$BE02_TASK_DATABASE_NAME"
export SEND811_MAILPIT_PROTOCOL=true

failed=0
run_suite() {
  printf 'RUN supplemental %s\n' "$1"
  if ! timeout -k 3s 90s bundle exec ruby "$1"; then
    failed=$((failed + 1))
  fi
}

run_suite test/attachment_gateway/authority_database_test.rb
run_suite test/attachments/database_test.rb
run_suite test/campaigns/database_test.rb
run_suite test/send_worker/mailpit_protocol_test.rb

# AIDEV-NOTE: Rails reads typed role config, not DATABASE_URL; derive only the disposable fixture password.
export MIGRATOR_DB_PASSWORD
MIGRATOR_DB_PASSWORD=$(ruby -ruri -e 'print URI.decode_www_form_component(URI(ENV.fetch("BE02_MIGRATOR_DATABASE_URL")).password)')
export ELEVATEO_DB_ROLE=elevateo_migrator ELEVATEO_PROCESS=migrate
run_suite test/administration/assignment_member_options_migration_test.rb
run_suite test/administration/organization_access_migration_test.rb
run_suite test/attachment_gateway/migration_acl_test.rb
run_suite test/campaigns/rollback_migration_test.rb

printf '%s\n' \
  'NOT RUN: four test/be_01_r1 suites require historical schema/role fixtures (migrations 1-2).' \
  'NOT RUN: launch_mailflows/app_chain_test requires private Mox TLS/DNS/control/API fixture.'
printf 'Supplemental suites: 8; failures: %s; separate-fixture suites not run: 5\n' "$failed"
[[ "$failed" -eq 0 ]]
