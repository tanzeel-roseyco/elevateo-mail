#!/usr/bin/env bash
set -euo pipefail
# AIDEV-NOTE: Only the reviewed Lane P image supplies pwsh; no host interpreter or socket is used.
cd /fixture
sha256sum -c fixture.sha256
[[ $(id -u) == 10001 ]]
[[ $(pwsh -NoLogo -NoProfile -Command '$PSVersionTable.PSVersion.ToString()') == 7.4.20 ]]
ruby -c fake-ssh.rb
ruby -c regression.rb
pwsh -NoLogo -NoProfile -Command '$t=$null; $e=$null; [void][System.Management.Automation.Language.Parser]::ParseFile("/fixture/bootstrap.ps1",[ref]$t,[ref]$e); if($e.Count){exit 1}'
ruby regression.rb
sha256sum -c fixture.sha256
