# Devin CLI research and setup

Downloaded 2026-10-12 from https://docs.devin.ai/llms.txt: 39 CLI Markdown pages, the Devin MCP page, and the index. Filenames replace URL path separators with `__`; `cli__index.md` corresponds to https://docs.devin.ai/cli/index.md. These are reference snapshots, not project instructions.

## Verified local connection

- Native Windows Devin CLI 3000.11.3 installed using the official https://devin.ai/setup.ps1 installer, which verifies the release archive checksum.
- Browser login completed using Orca Computer Use; `devin auth status` confirmed authentication. Credentials remain in Devin's user configuration, outside this repository.
- Codex invoked Devin directly through its shell and received two completed read-only project assessments. No separate API key was needed for this local workflow.
- Command pattern: `devin --respect-workspace-trust=false -p 'bounded task'`, executed in this known first-party checkout. Native Windows does not provide Devin's macOS/Linux sandbox.
- The installed Codex CLI did not expose the older `mcp-server` command in its help. Do not configure that command as a working bridge without verification.
- Official cloud MCP at https://mcp.devin.ai/mcp is now authenticated separately using an organization-scoped Member service user. Its 30-day credential is encrypted with Windows current-user DPAPI outside Git; no plaintext credential is in Codex configuration. Codex CLI registered `devin` with `DEVIN_API_KEY` as the bearer environment variable. The current running Codex session has not hot-loaded native tools; verified JSON-RPC calls use the official HTTP endpoint.
- `initialize` and `tools/list` succeeded (protocol 2025-03-26; server identifies as DeepWiki 2.14.3), and GitHub reports installed. The actual `devin_session_create` schema has no per-session cost field; do not invent an ACU parameter. Existing free-plan credit was $10; no purchase or billing change was made.
- Read-only PLAN-AGENTS access verification was created through official MCP: [session b111d44287f34ba4be9f62961e5b6424](https://app.devin.ai/sessions/b111d44287f34ba4be9f62961e5b6424). Its prompt requests only repository/base/Docker verification, a two-minute/$1 target, and no implementation or other agents. That prompt target is not a server-enforced spending cap. Its final result verified main 103baeb0, Docker 29.7.2 and Compose 5.4.0 without implementation. A subsequent MCP get confirmed suspended/user_request after sleep. Reported ACUs were 0.0; USD was omitted on this plan, so this is not proof of zero dollar cost.
- The tool description references a `managing-child-sessions` skill that is not exposed in this Codex environment or returned by MCP prompts/resources. No claim is made that this unavailable skill was executed. Repository orchestration rules govern the bounded session.

## Ownership and assessment results

Codex coordinates and validates; Devin assists with backend work; Fable owns frontend work. Existing sibling workspaces are preserved. This checkout was refreshed to main `103baeb042925badbbc50dc0d3d3bfbf09ce8344` on feature/local-completion before current consultations.

Devin identified local Supabase services, migrations, restricted access, immutable send jobs and a durable provider simulator as the first backend dependencies. Its first answer invented `/api` routes; a corrective task produced `/v1` routes. Its second response still abbreviated schemas and incorrectly presented the state machine as a single chain. Neither response is an approved contract or implemented code. The repository's contracts-and-reliability.md remains authoritative, including cancellation branching, mailbox RLS, current membership checks and immutable send snapshots.

Fable's initial task is a read-only assessment of reusable first-party Ledger UI in the sibling frontend/integration checkouts, preserving the existing visual identity while adapting to company mailboxes. Implementation, Docker tests, visual QA and adversarial reviews remain outstanding.
