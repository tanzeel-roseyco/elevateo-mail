# Expanded execution plan

Updated 2026-10-12. This folder turns the latest user brief into a staged build specification. **Initial research and architecture synthesis are complete; official Devin MCP is configured. BE-01 task synthesis and application implementation remain pending.** The repository still contains reference source rather than an integrated application.

## Read and execute in this order

1. [Research-first prompt](prompts/RESEARCH_FIRST.md) and [completed initial scan](research/reuse-market-scan.md): 25 repositories, eight Reddit threads; six threads opened and two snippet-only. This is a discovery scan, not 25 security audits. Pin and deeply audit selected components before copying them.
2. [Agent orchestration](AGENT_ORCHESTRATION.md) and [observed capabilities](capability-status.json): Codex coordinates; Astra MAX designs; Fable 5, Opus 5.5 and Fable 5.1 each supply independent opinions on every task; Devin implements backend tasks; Astra LOW repairs bounded reviewed issues.
3. [Polyglot architecture](POLYGLOT_ARCHITECTURE.md): Rails API and worker share one domain authority, with explicitly bounded jobs for all requested languages. This replaces the older Node backend proposal and is reconciled by [ADR 0002](../docs/decisions/0002-local-architecture.md).
4. [Clients and CLI connectors](CLIENTS_AND_CLI_CONNECTORS.md): React web, Rust/Tauri Mac, C# Windows, Java Android and SwiftUI iOS; separate platform builds. Distinguish mailbox MCP from in-app Codex and Claude/Fable CLI adapters. Opus 5.5 owns all motion and C++ work.
5. [Mail account and activation plan](MAIL_ACCOUNTS_AND_ACTIVATION.md): nine address slots across one or two domains, Resend CLI preflight, Instantly connection/warmup gates and explicit no-live-send behavior.
6. [Task backlog](TASK_BACKLOG.md), [local build prompt](../LOCAL_BUILD_PROMPT.md) and [local completion plan](../docs/local-completion-plan.md): issue-sized work with dependencies, owners, tests, PR review and honest completion evidence.

## Current decision state

The [Claude consultation handoff](consultations/README.md) contains ready-to-use shared and model-specific prompts, supported-runner launch examples, evidence requirements and the synthesis template. The initial three sessions succeeded with verified exact model identities; [their synthesis](consultations/results/initial-plan/synthesis.md) accepts local direction. BE-01 has three fresh completed opinions, with synthesis in progress.

The user's choices are Resend, self-hosted Supabase, the requested agent workflow, language coverage and client targets. Rails authority, exact client hosts, contracts and deployment topology are proposals by the actual Astra MAX design agent. Earlier consultation attempts failed authentication; subsequent exact-model runs and the initial Astra MAX synthesis succeeded. Those failures remain historical evidence. No alternative model's editorial review counts as those opinions.

Implement each bounded task after its separate accepted synthesis and dispatch controls. Local design direction is accepted; implementation checks remain outstanding. Credentials for mail, hosting, DNS, signing and external product inference remain the final activation inputs. Restore agent access through the supported account flow when implementation resumes.

The new architecture has more client/tool languages than the first proposal. This adds maintenance and release work. It deliberately keeps server domain logic in one codebase and treats Haskell/F#/Clojure, Lua, C/C++, Qt/Ionic/Electron and ray tracing as conditional alternatives where a real requirement justifies them. No language is universally best for every task.
