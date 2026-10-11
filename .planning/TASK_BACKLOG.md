# Task sequence and completion contract

Status: planning backlog, not GitHub issues already created. Every task below requires its own [brief](templates/task-brief.md), Astra MAX design/synthesis and separate Fable 5, Opus 5.5 and Fable 5.1 opinions under [orchestration](AGENT_ORCHESTRATION.md). Model opinions for the initial planning packet are pending authentication. Existing research and proposals are useful evidence, not bypasses of that gate.

| Task | Depends on | Implementation owner | Deliverable and acceptance |
| --- | --- | --- | --- |
| PLAN-RESEARCH | None; first Codex assignment | Codex | Initial 25-repository/eight-thread scan exists; complete commit-pinned shortlist audits and adoption decisions before copying new code |
| PLAN-ARCH | Research shortlist | Astra MAX + three opinions | Accepted ADR: one backend authority, schema/roles, send/receive state machine, versioned API/events, target languages, provisional topology and a measurement/acceptance plan |
| PLAN-AGENTS | Capability preflight | Codex + Astra MAX | Actual supported model/Devin routes, scoped repository access, costs, isolated writers and evidence ledger; no secret values |
| PLAN-CLIENTS | API and auth contracts | Fable 5 / Opus 5.5 + Astra MAX | Platform/connector ADR, local UI inventory, motion specification, supported agent product-auth boundary |
| PLAN-MAIL | Nine-slot inventory template | Astra MAX + three opinions | No-live-send policy, local routing/alias fixtures, provider boundaries and deferred Instantly/Resend activation |
| BE-01 | Accepted PLAN-ARCH/AGENTS | Devin through Codex | Rails API/worker skeleton, one SQL migration lane, containerized local Supabase, restricted DB roles and cross-org/mailbox tests |
| BE-02 | BE-01 | Devin | Supabase sessions/revocation, memberships, thread/message/draft/assignment/search APIs; real Auth, conflict and leak tests |
| BE-03 | BE-02 | Devin | Atomic approval/snapshot/job/audit, leases/fences, unknown outcomes, retries and suppression; real PostgreSQL failure tests |
| BE-04 | BE-03 | Devin | Ruby provider interface plus offline-tested Resend adapter; local Express simulator durable outside restore; duplicate/timeout/expiry fixtures |
| BE-05 | BE-02/04 | Devin | Signed inbound persistence, idempotent routing, MIME/resource limits, quarantine/scanner/storage and authorization on download |
| FE-01 | PLAN-CLIENTS; versioned contract | Fable 5 or Opus 5.5 | Reuse local primitives into functioning React inbox/composer/settings; integrate BE-02 through BE-05, no disconnected mock completion |
| FE-02 | FE-01 | Opus 5.5 | Anime.js transitions, keyboard/focus/reduced motion, loading/conflict/error states; actual browser and frame/interaction measurements |
| AI-01 | BE-02, scoped grants | Codex | TypeScript mailbox MCP read/search/draft adapter, actual protocol tests and revoked-grant denial |
| AI-02 | PLAN-CLIENTS, FE-01 | Codex | In-app Codex process adapter, approved protocol/auth, allowlisted tools, cancellation/approval/stream tests with fake local runner first |
| AI-03 | PLAN-CLIENTS, FE-01 | Fable 5; Opus 5.5 reviews | Separate Claude/Fable in-app adapter with supported SDK/CLI terms, same lifecycle/security acceptance; actual provider test pending authorized auth |
| TOOL-01 | BE-02 and stable contracts | Devin coordinates bounded tasks | PHP SDK/conformance example, Go read-only doctor and Python MIME/fault fixtures; no duplicate backend or send authority |
| DESK-01 | FE-01/02, AI contracts | Fable 5 or Opus 5.5; Codex owns its adapter | Rust/Tauri Mac and C# Windows host, protected credentials, installers and actual per-OS evidence; all C++ subtasks go to Opus 5.5 |
| MOBILE-01 | Stable API/auth + FE workflows | Fable 5 or Opus 5.5 | Java Android APK and SwiftUI iOS client; native lifecycle/security/accessibility, device/emulator tests; no fake universal installer |
| OPS-01 | BE-01 through BE-05 | Devin | Reproducible local startup/health/backup/restore, outbound hold, reconciliation and ten-user resource measurements; confirm or revise provisional host sizing from results |
| REVIEW-01 | Each implementation PR | Independent bounded reviewers + design reviewer | Review final revision, open deduplicated actionable issues, record lines/findings/limitations |
| FIX-<issue> | Reviewed issue + task opinions | Astra LOW | Reproduce, repair, regression, fix PR, independent final check; escalate structural changes to Astra MAX |
| RELEASE-LOCAL | All local core/client/tool checks | Codex coordinator | Completion matrix, tested commands/artifacts, explicit pending platform/AI checks and credential-last activation packet |
| ACTIVATE-01 | Local acceptance + OPS-01 sizing evidence + explicit operational scope | Authorized operator with Codex | Production host/secret/signing/DNS setup; no live sends remain enforced unless explicitly changed; accounts/warmup follow separate gates |

Allow frontend work against accepted schemas while backend tasks progress, and allow mobile after the core proves stable. Keep a separate worktree per writer. Do not parallelize competing schema edits or multiple owners of a send-state transition. A dependency is met by accepted evidence, not a plan saying it will be met.

Issue/PR bodies must identify source reuse, exact base and head, scope, dependencies, runnable checks, limitations and reviewers. Never mark a task done from a summary alone. Track implementation, actual model consultation, platform verification and external activation independently. A production release requires all release-critical deliverables and its approved operational evidence; untested platforms must not be advertised as supported.

Before implementation, convert these rows into bounded issues in this repository only. Issues are not needed merely to publish this planning update. Do not create unrelated external issues, notify third parties or configure recurring automation as a side effect of this plan.
