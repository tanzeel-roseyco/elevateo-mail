#!/usr/bin/env bash
set -euo pipefail
# AIDEV-NOTE: Wire compatibility and the adapter regression use the same source mount and pinned bundle.
timeout 60s bundle exec ruby /mailserver/tests/app_compatibility.rb
timeout 30s bundle exec ruby test/inbound/tls_imap_transport_test.rb
timeout 30s bundle exec ruby test/inbound/imap_sync_test.rb
timeout 120s bundle exec steep check --jobs 1
timeout 45s bundle exec rubocop --lint --format simple \
  lib/elevateo/inbound/tls_imap_transport.rb test/inbound/tls_imap_transport_test.rb
