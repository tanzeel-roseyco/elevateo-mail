#!/usr/bin/env bash
set -euo pipefail
export PATH=/home/tanzeel/.nvm/versions/node/v24.21.0/bin:/home/tanzeel/.local/bin:$PATH
base=/home/tanzeel/elevateo-mail-wave-20261014
cd "$base/soren"
set +e
printf 'Reply only READY. Do not use tools or modify files.\n' | "$base/cli-0160/node_modules/.bin/codex" exec --ignore-user-config --model gpt-6.1-sol -c model_reasoning_effort=low -c service_tier=fast -c features.fast_mode=true --dangerously-bypass-approvals-and-sandbox --json --output-last-message "$base/reports/model-probe-0160-r2-last.md" - > "$base/reports/model-probe-0160-r2.jsonl" 2>&1
rc=$?
printf '%s\n' "$rc" > "$base/reports/model-probe-0160-r2-exit.txt"
tail -n 12 "$base/reports/model-probe-0160-r2.jsonl"
exit "$rc"
