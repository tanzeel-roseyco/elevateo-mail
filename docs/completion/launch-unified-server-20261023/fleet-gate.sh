#!/bin/bash
set -uo pipefail
cd /home/tanzeel/em-work/unified-server-20261023-e82
python3 ops/tests/be02/run.py --context default --expect-host Ubuntu-noble-latest-amd64-base > /home/tanzeel/em-work/unified-server-e82-run7.log 2>&1
application_status=$?
docker run --rm --name unified-e82-contract-test --read-only --tmpfs /tmp:rw,nosuid,nodev,size=128m -e HOME=/tmp -e XDG_CACHE_HOME=/tmp/cache -e GEM_HOME=/tmp/gems -e GEM_PATH=/tmp/gems -v /home/tanzeel/em-work/unified-server-20261023-e82/contracts:/contracts:ro ruby:3.4.11-slim-bookworm@sha256:22165c5f904d76a8a02fbdd419d0269481369523fd66978232d16c88099730e2 sh -c 'gem install minitest -v 6.0.6 --no-document && ruby /contracts/v1/tests/send_contract_test.rb' > /home/tanzeel/em-work/unified-server-e82-contract.log 2>&1
contract_status=$?
printf 'Application status: %s; contract status: %s\n' "$application_status" "$contract_status"
[ "$application_status" -eq 0 ] && [ "$contract_status" -eq 0 ]
