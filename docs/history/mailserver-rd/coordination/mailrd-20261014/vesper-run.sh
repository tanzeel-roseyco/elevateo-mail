#!/bin/bash
set -uo pipefail
export PATH=/home/tanzeel/elevateo-mail-wave-20261014/cli-0160/node_modules/.bin:/home/tanzeel/.nvm/versions/node/v24.21.0/bin:/home/tanzeel/.local/bin:$PATH
root=/home/tanzeel/elevateo-mail-rd-20261014
name=vesper
cd "$root/$name" || exit 1
printf '%s\n' "$$" > "$root/reports/$name-runner.pid"
git branch --show-current > "$root/reports/$name-branch.txt"
timeout --signal=TERM --kill-after=20s 2400 codex exec --ignore-user-config --model gpt-6.1-sol -c model_reasoning_effort=low -c service_tier=fast -c features.fast_mode=true --dangerously-bypass-approvals-and-sandbox --json --output-last-message "$root/reports/$name-last-message.md" - < "$root/incoming/$name-task.md" 2>&1 | tee "$root/reports/$name-events.jsonl"
rc=${PIPESTATUS[0]}
printf '%s\n' "$rc" > "$root/reports/$name-exit.txt"
exit "$rc"