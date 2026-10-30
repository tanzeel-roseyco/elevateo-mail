#!/usr/bin/env bash
# AIDEV-NOTE: Fail prerequisites before the frozen harness; Linux pwsh evidence never implies Windows acceptance.
set -euo pipefail
[[ -f /.dockerenv && ! -S /var/run/docker.sock && $(id -u) == 10001 ]]
[[ $(uname -m) == x86_64 ]]
for command in bash ruby pwsh timeout sha256sum grep; do command -v "$command" >/dev/null; done
# AIDEV-NOTE: Match the frozen test's require order in a fresh process, without inline gem activation.
[[ ${RUBYOPT:-} == -r/opt/lane-p/gems.rb ]]
ruby <<'RUBY'
require "minitest/autorun"
require "minitest/mock"
require "base64"
{ "minitest" => "6.0.6", "minitest-mock" => "5.27.0", "base64" => "0.3.0" }.each do |name, version|
  abort "#{name} activation mismatch" unless Gem.loaded_specs.fetch(name).version.to_s == version
end
abort "Mock unavailable" unless defined?(Minitest::Mock)
puts "PASS fresh Ruby require-order prerequisite"
RUBY
[[ $(pwsh -NoLogo -NoProfile -Command '$PSVersionTable.PSVersion.ToString()') == 7.4.20 ]]
printf '%s  %s\n' 5c011bd57503af6d17f570a3b2793e7e255c5c45bd50b79dcc6f5aeecc861701 \
 /src/ops/tests/fleet02_powershell_protocol.sh | sha256sum -c -
exec bash /src/ops/tests/fleet02_powershell_protocol.sh
