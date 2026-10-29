#!/usr/bin/env bash
set -uo pipefail
export PATH=/home/tanzeel/.nvm/versions/node/v24.21.0/bin:/home/tanzeel/.local/bin:$PATH
cd /home/tanzeel/elevateo-mail-wave-20261014/mira
printf '%s\n' "$$" > /home/tanzeel/elevateo-mail-wave-20261014/reports/mira-launcher.pid
codex exec --ignore-user-config --model gpt-6.1-sol -c model_reasoning_effort=low -c service_tier=fast -c features.fast_mode=true --dangerously-bypass-approvals-and-sandbox --json --output-last-message /home/tanzeel/elevateo-mail-wave-20261014/reports/mira-last-message.md - < /home/tanzeel/elevateo-mail-wave-20261014/incoming/mira-task.md 2>&1 | tee /home/tanzeel/elevateo-mail-wave-20261014/reports/mira-events.jsonl
rc=${PIPESTATUS[0]}
printf '%s\n' "$rc" > /home/tanzeel/elevateo-mail-wave-20261014/reports/mira-exit.txt
exit "$rc"
