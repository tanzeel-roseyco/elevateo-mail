# FE-01 first implementation checkpoint

Status: **design accepted for a bounded read checkpoint; coordinator dispatch record still required**. Full FE-01 remains open. Issue: [#4](https://github.com/tanzeel-roseyco/elevateo-mail/issues/4). This supersedes only the first-checkpoint scope in `brief.md`; the original consultation input stays immutable.

<!-- AIDEV-NOTE: The worker edits frontend files only; coordinator runs processes and retains the single contract-write authority. -->

## Dispatch and bounds

Writer: exact `claude-fable-5`, independently started by the coordinator with actual runtime model/session evidence. Branch `frontend/fable/fe-01` in a clean new directory under `Code and projects`. Record the dispatch base after these artifacts and the canonical schema are committed; the opinion baseline was `5ae9771ad30923a66a2a5ed6aa5d6902d3e439d2`, not an assertion about the eventual dispatch commit. Use a 30-minute first checkpoint, report partial work honestly at that checkpoint, and retain the mandatory consultation/review gate for any new repair or scope.

The worker gets file read/edit tools only: no subprocesses, children, network tools, package installation, Git mutation or live provider access. Allowed writes are `apps/web/**` excluding coordinator-generated outputs. The coordinator supplies an isolated source export from commit `4322cfbb639a383c4e8d940f2dbb019a9832e977`, generated API types, and the accepted contracts; it owns Docker, dependency resolution, testing, Git and shared state/README/review records. Backend files, shared Compose, `contracts/v1/**`, root documentation and other agents' files are read-only to this writer. Stop dependent code and report a precise proposal if a contract is insufficient.

## Read before editing

Read AGENTS.md, LOCAL_BUILD_PROMPT.md, STANDARDS, AGENT_ORCHESTRATION, the accepted initial/BE-01 decisions, `decisions.md`, `synthesis.md`, `contracts/v1/openapi.json`, its README and fixtures, the frontend reuse audit and supplemental runtime snapshot. Search existing AIDEV anchors in touched files and preserve their intent. No secrets or real mail are necessary.

Canonical schema SHA-256 is `94c5f31bc5d514fed420dcbcee2f6ce49bf4254e325000ea0794fe6a1140e8ca`. Use coordinator-generated `paths` and `components` types in `apps/web/src/data/generated/api.d.ts` from `openapi-typescript 7.13.0`; do not hand-edit generated files or create competing DTOs. Coordinator owns `contracts/tooling/package.json` and its resolved lock outside this contract directory. Implement deliberate runtime validation and enforce byte/timeout/origin/context limits before accepting data. The coordinator records generator command/options/output hash and checks regeneration.

## Implement this checkpoint

1. Create a minimal strict TypeScript React app and typed MailroomGateway for only session, mailbox listing, thread listing and paginated plaintext thread reading. HTTP and fixture adapters share the same canonical success/error scenarios. Fixture modules live behind a separate development/test entry point with a visible label and no production fallback.
2. Extract Ledger tokens and selected Button/Field/Async/Badge/sidebar presentation from the exact source export, retaining required notices. Actual paths are `src/styles/index.css` and the `SidebarFrame` export of `src/app/Sidebar.tsx`; the audit supplies blob IDs. Rework navigation around the selected mailbox and all/unread URL filter. Do not copy mock stores/campaign features, legacy DTOs/account headers or old auth markers.
3. Build responsive shell, inbox and plaintext reader with keyboard navigation, stable focus, loading/empty/error/retry/session-unavailable states, null-field placeholders, message continuation, and clear truncation indicators. No HTML, Markdown, autolinks, images or attachment fetching. A read does not mark mail read. Do not display enabled composer/send/logout/attachment controls for unspecified routes.
4. Enforce current context/capability consistency, generation-based rejection of delayed responses after mailbox/filter changes, and data clearing on 401 or required re-bootstrap. Implement at most one cursor reset and one context re-bootstrap before explicit retry. Use component/router state first; no speculative store or auth framework.
5. Author meaningful tests for behavior below and a small Docker test/build definition for coordinator execution. Provide the coordinator exact commands, dependency purposes and generated-file expectations. Do not claim those commands ran.

No composer/draft/save/review/send/job/cancel/collaboration mutation implementation is in this checkpoint. Their exact failure semantics remain required later. Do not build placeholder mutations against an invented API, or close the task using fixture coverage.

## Exact dependency inputs

Use Node build image `node:24.21.0-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20`; React/DOM 19.3.0; react-router 7.18.4; Vite 7.3.6; TypeScript 5.9.3; Zod 4.6.5; Vitest and coverage-v8 4.1.11; openapi-typescript 7.13.0. Radix dialog/alert-dialog 1.1.23 only if used. The coordinator selects and locks required supporting imports, preserving the source audit's dependency discipline. Do not reuse the entire historical lock or its vulnerable Vitest 3.2.7.

Browser checks use @playwright/test 1.64.0 and `mcr.microsoft.com/playwright:v1.64.0-noble@sha256:06a9939e57531807f8d5fd76ce44b53165ffb7d7501d87ab10e285c20b1e971f`. Browser-image Node is not assumed to equal the build image. The supplemental audit contains primary references, integrity values and limits of verification. Coordinator must resolve/audit the new full lock and verify actual container compatibility.

## Checkpoint acceptance evidence

| ID | Required evidence for this read checkpoint |
|---|---|
| R1 | Generated types regenerate unchanged from the recorded schema; strict typecheck/lint/build pass inside Docker; boundary schemas accept/reject the canonical cases. |
| R2 | The same conformance table exercises fixture gateway and HTTP gateway using a controlled transport: valid, empty, null, malformed, wrong content type, oversized, timed out, redirected and stable error responses. Real Rails conformance is separately pending. |
| R3 | Delayed actor/mailbox/filter responses cannot populate the new context; 401 clears mail and aborts requests; authorization-version mismatch re-bootstraps once; absent/inaccessible objects show the same unavailable UI. |
| R4 | Scoped/expired cursors recover once without loops, list and message pagination are separate, zero-message conversations work, truncation is visible, and GET navigation makes no write request. |
| R5 | Hostile HTML/script/URL/CSS strings display inertly; no remote image/link/attachment request occurs. Production import graph/output excludes fixture code/data; API failure cannot switch to fixtures. |
| R6 | Actual application inspected in a containerized browser at desktop and 390px width: keyboard traversal/reader focus, accessible labels, no horizontal overflow, readable empty/error states, reduced motion. Capture screenshots and identify observed defects. A 50-row interaction/long-task baseline is measurement, not an unmeasured performance claim. |
| R7 | Every changed code area is adversarially reviewed in assignments no larger than 200 lines plus a dedicated design reviewer using the full user rubric. Coordinator records coverage, defects, fixes and density in code-reviews.md and updates state/README in the implementation commit. |

The writer reports authored files, reuse provenance, pending tests and contract problems. The coordinator may accept a partial checkpoint with outstanding items explicitly listed; it must not mark R1–R7 passed without evidence. It runs application checks only in Docker, cleans only task-owned disposable resources after their use, preserves persistent data/preexisting resources and reports cleanup.

## Full FE-01 remains open

F01 shell/navigation can be evidenced for this subset. F03 plaintext reader can be evidenced for the defined contract. F02 real current-session permission/logout behavior, F04 durable cross-device drafts/recovery, F05 exact human approval, F06 authoritative jobs/unknown outcomes, and F07 authorized attachments/collaboration/search require real backend integration and complete safe contracts. F08 full-product visual/accessibility and F09 full-product automated checks/reviews remain open even if the read checkpoint passes. Settings, composer and later product surfaces are not silently removed. Each next implementation or bounded repair task retains three independent exact-model consultations and actual Astra MAX synthesis. No real sends, DNS/provider activation, production publishing or purchases are part of this dispatch.
