#!/usr/bin/env bash
set -euo pipefail
export PATH=/home/tanzeel/.nvm/versions/node/v24.21.0/bin:/home/tanzeel/.local/bin:$PATH
base=/home/tanzeel/elevateo-mail-wave-20261014
npm install --prefix "$base/cli-0160" --no-audit --no-fund @openai/codex@0.160.0
"$base/cli-0160/node_modules/.bin/codex" --version
cd "$base/soren"
set +e
"$base/cli-0160/node_modules/.bin/codex" exec --ignore-user-config --model gpt-6.1-sol -c model_reasoning_effort=low -c service_tier=fast -c features.fast_mode=true --dangerously-bypass-approvals-and-sandbox --json --output-last-message "$base/reports/model-probe-0160-last.md" 'Reply only READY. Do not use tools or modify files.' > "$base/reports/model-probe-0160.jsonl" 2>&1
rc=$?
printf '%s\n' "$rc" > "$base/reports/model-probe-0160-exit.txt"
tail -n 8 "$base/reports/model-probe-0160.jsonl"
exit "$rc"
