#!/usr/bin/env bash
set -euo pipefail
# AIDEV-NOTE: Wire compatibility and the adapter regression use the same source mount and pinned bundle.
timeout 60s bundle exec ruby /mailserver/tests/app_compatibility.rb
timeout 30s bundle exec ruby test/inbound/tls_imap_transport_test.rb
timeout 30s bundle exec ruby test/inbound/imap_sync_test.rb
timeout 30s bundle exec ruby test/send_worker/mox_smtp_transport_test.rb
timeout 30s bundle exec ruby test/send_worker/smtp_transport_test.rb
timeout 120s bundle exec steep check --jobs 1
timeout 45s bundle exec rubocop --lint --format simple \
  lib/elevateo/inbound/tls_imap_transport.rb test/inbound/tls_imap_transport_test.rb \
  lib/elevateo/send_worker/{smtp_profile,smtp_transport,mox_smtp_transport,database_store,submission_result}.rb \
  test/send_worker/mox_smtp_transport_test.rb test/sends/mox_worker_database_test.rb
