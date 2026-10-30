#!/usr/bin/env bash
# AIDEV-NOTE: Socket-free verification only; this cannot establish real service or persistence acceptance.
set -euo pipefail
cd /src
[[ $(id -u) == 10001 ]]
for manifest in ops/tools/be01-services-tools/package.sha256 ops/tools/be01-services/package.sha256 ops/tools/be01-services/dependencies.sha256 ops/tests/be01-services/package.sha256 ops/tests/fleet02-egress-source.sha256; do
  sha256sum -c "$manifest"
done
ruby -e 'abort "Ruby pin" unless RUBY_VERSION == "3.4.11"; gem "minitest", "6.0.6"; require "minitest"'
for file in ops/tools/be01-services-tools/*.sh ops/tools/be01-services/*.sh; do bash -n "$file"; done
for file in ops/tools/be01-services/*.rb ops/tests/be01-services/*.rb; do ruby -c "$file"; done
bash ops/tools/be01-services/regression.sh
bash ops/tools/be01-services/profile-regression.sh
bash ops/tools/be01-services/fixture-regression.sh
ruby -e 'gem "minitest", "6.0.6"; load ARGV.fetch(0)' ops/tests/be01-services/boundary_test.rb 2>&1 | tee /tmp/boundary.log
grep -Eq '^7 runs, 14 assertions, 0 failures, 0 errors, 0 skips$' /tmp/boundary.log
printf 'PASS syntax, three shell regressions and boundary 7/14/0\n'
