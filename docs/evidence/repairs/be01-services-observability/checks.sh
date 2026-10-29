#!/usr/bin/env bash
# AIDEV-NOTE: Offline, socket-free fixture checks; install the authenticated test gem only into disposable tmpfs.
set -euo pipefail
cd /src
sha256sum -c inputs.sha256
printf '%s  %s\n' 153ea36d1d987a62942382b61075745042a2b3123b1cd48f4c3675af9cc7d6f1 minitest-6.0.6.gem | sha256sum -c -
gem install --local --ignore-dependencies --no-document /src/minitest-6.0.6.gem
ruby -e 'gem "minitest", "=6.0.6"; require "minitest"'
cd docs/evidence/repairs/be01-services-observability
sha256sum -c package.sha256
ruby -c services.rb
ruby -c diagnostic.rb
ruby -c regression.rb
ruby regression.rb
