# Claude consultations — next-agent launch handoff

Status: **pending; assigned to the next AI agent to launch**. The user asked to leave these consultations in the repository. Do not treat the prompts as completed opinions or retry authentication merely to publish this handoff. Earlier attempts failed before inference; retain that historical evidence in [capability status](../capability-status.json).

Packet revision **2026-10-13**: the user confirmed Rails API/worker plus Laravel Blade/Livewire presentation, Supabase and Resend. [ADR 0002](../../docs/decisions/0002-rails-laravel-presentation.md) supersedes React/TypeScript as the product frontend. Ask the next agents to review the chosen boundary and tradeoffs; do not mistake a stack decision for completed model opinions. No consultation is launched by this documentation update.

## Three separate sessions

| Session | Exact requested model | Additional focus prompt | Status |
| --- | --- | --- | --- |
| Second opinion | `claude-fable-5` | [Fable 5](fable-5.md) | Pending next-agent launch |
| Third opinion | `claude-opus-5-5` | [Opus 5.5](opus-5-5.md) | Pending next-agent launch |
| Fourth opinion | `claude-fable-5-1` | [Fable 5.1](fable-5-1.md) | Pending next-agent launch |

Use [the shared brief](shared-brief.md) for all three. These are independent initial opinions: each receives the same design/evidence packet and its own focus prompt, without the other two answers. Sequential fresh sessions are acceptable when concurrency is limited. Do not use a shared conversation, resume another opinion session, silently fall back to another model or claim success from a requested model label alone.

## Coordinator procedure

1. Read [agent orchestration](../AGENT_ORCHESTRATION.md), the [backlog](../TASK_BACKLOG.md) and current state. Refresh the shared brief's dated implementation/research/capability facts against the selected base before freezing the packet. Record the exact base commit, task IDs, input-file hashes, date, requested model and available time/cost bound. For the initial handoff use the five PLAN tasks in the shared brief; later repeat this process for each bounded implementation/fix task using [the task template](../templates/task-brief.md).
2. Verify the installed runner's current help/version and supported exact model route. Use existing authorized access. If authentication is still unavailable, record the blocker and continue unrelated preparation; account recovery belongs to the supported user-controlled login flow. Application/provider/signing credentials remain last. Do not extract tokens or invent an alternate model.
3. Assemble three input files outside Git. Each must contain the complete shared brief, its model-specific focus prompt, the same task brief and **the actual contents** of the following current files, with path/commit headings: `documentation.md`, `docs/decisions/0002-rails-laravel-presentation.md`, `docs/architecture-diagram.md`, `docs/cross-platform-testing.md`, `.planning/POLYGLOT_ARCHITECTURE.md`, `.planning/CLIENTS_AND_CLI_CONNECTORS.md`, `.planning/AGENT_ORCHESTRATION.md`, `.planning/MAIL_ACCOUNTS_AND_ACTIVATION.md`, `.planning/TASK_BACKLOG.md`, `.planning/research/reuse-market-scan.md`, `docs/component-adoption.md`, `docs/component-reuse-playbook.md`, `docs/contracts-and-reliability.md` and `docs/local-completion-plan.md`. Add only relevant pinned source excerpts for a task. The opinion runner below has tools disabled and cannot read paths itself. Exclude secrets, real mail, raw logs and earlier opinion outputs. If the packet is too large, split it into the same task-specific packets for all three and disclose omissions.
4. Launch three fresh processes through a supported runner. The example below uses flags observed in installed Claude CLI 2.1.241; recheck them on the next host. Safe mode disables custom hooks/plugins/MCP and automatic repository instructions; tools are disabled. The coordinator must supply the packet's governing constraints explicitly. Do not add permission bypass or automatic fallback flags. Set the two example directory variables to private existing directories outside the repository; use distinct filenames for each new attempt and capture each exit code.
5. Inspect the structured result **and** process exit status. Require a non-error result with substantive answers for every assigned task. Record returned execution/session/model metadata where available, separately from requested identity; never treat the model's self-description as runtime evidence. A JSON result with an error or empty usage is not a completed opinion. If identity cannot be verified, record it as unverified and keep the gate pending.
6. Retain sanitized successful opinions under a new `.planning/consultations/results/<task-id>/` directory when they actually exist. Keep raw process/authentication logs outside Git. Each opinion needs base/input identity, exact requested and observed model, execution ID if available, outcome, recommendations and evidence limits. Do not create empty result files that look like completed reviews. Preserve failed attempts as sanitized status entries.
7. After all three valid opinions cover the same task/base, assign **`gpt-6-astra` at `max` effort** to [the synthesis template](synthesis-template.md). Record acceptance, adaptation or rejection of each recommendation and why, retain dissent, update affected ADRs/plans and link the resulting implementation brief. Reconsult on materially changed assumptions; an opinion on old code does not approve a new boundary.

Illustrative launch commands for prepared packets, run individually by the next agent after preflight:

```sh
: "${ELEVATEO_CONSULT_INPUT_DIR:?Set the prepared input directory outside Git}"
: "${ELEVATEO_CONSULT_OUTPUT_DIR:?Set a private fresh output directory outside Git}"

claude --safe-mode --print --model claude-fable-5 --tools "" --no-session-persistence --output-format json \
  < "$ELEVATEO_CONSULT_INPUT_DIR/fable-5.txt" > "$ELEVATEO_CONSULT_OUTPUT_DIR/fable-5.json" 2> "$ELEVATEO_CONSULT_OUTPUT_DIR/fable-5.stderr"

claude --safe-mode --print --model claude-opus-5-5 --tools "" --no-session-persistence --output-format json \
  < "$ELEVATEO_CONSULT_INPUT_DIR/opus-5-5.txt" > "$ELEVATEO_CONSULT_OUTPUT_DIR/opus-5-5.json" 2> "$ELEVATEO_CONSULT_OUTPUT_DIR/opus-5-5.stderr"

claude --safe-mode --print --model claude-fable-5-1 --tools "" --no-session-persistence --output-format json \
  < "$ELEVATEO_CONSULT_INPUT_DIR/fable-5-1.txt" > "$ELEVATEO_CONSULT_OUTPUT_DIR/fable-5-1.json" 2> "$ELEVATEO_CONSULT_OUTPUT_DIR/fable-5-1.stderr"
```

These are future consultation commands, not implementation commands and not evidence of execution. They do not request file edits, mail sends, account linking, installs or deployment. The latest user instruction leaves actual launching to the next agent.
