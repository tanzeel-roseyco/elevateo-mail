# BE02 pool lifecycle adversarial review

Date: 2026-10-14 (Australia/Sydney). Task: `task_d2aef807772e`. Dispatch: `ctx_bd5cff5a8177`. Reviewer terminal: `term_2e9e81fa-aa2d-46d8-ad53-f47acf57b646`.

Actual execution identity: Codex, `gpt-6-astra`, effort `max`. Verified through `orca orchestration worker-show --dispatch ctx_bd5cff5a8177 --json`: both effective launch metadata and the live terminal footer identify GPT-6-Astra/max. This is the observed execution identity, not an assumed substitute.

## Result

**Zero confirmed defects in the assigned 397 physical lines; 0.00 defects/KLOC. Runtime: NOT_RUN.** The inspected implementation is consistent with the accepted repair and the coordinator's clarification below. This is bounded static evidence, not application acceptance or proof that every failure restores a healthy pool.

In particular, a public removal failure before eviction can leave the adapter registered or queued. The code records unresolved disposition and refuses to disconnect it; it does not guarantee quarantine or healthy pool recovery in that case. That residual risk is explicitly accepted by the supplied amendment and must remain visible in integration and operational assessments.

## Scope and integrity

Source root: `C:/Users/Tanzeel/Code and projects/Elevateo Mail - BE02 Codex/apps/server`.

Files were located by basename. All supplied SHA256 values and physical line counts matched before inspection, immediately before their respective source passes, and at the final integrity check at `2026-10-14T07:28:26+11:00`. No source drift was observed.

| File relative to source root | Inspected range | Physical LOC | SHA256 |
| --- | --- | ---: | --- |
| `lib/elevateo/session_writes.rb` | 1-206 | 206 | `65f7d28b75827d8cd7e30c189d8ddea930772d54d8d61511517968cf07b6cb00` |
| `sig/session_writes.rbs` | 1-29 | 29 | `30d8a476926f983d3d897bb926afbcb436f1e7b8d800f28d1740b7b82f696d54` |
| `sig/rails_seams.rbs` | 1-162 | 162 | `634de9e85515e003254c31cbb1c3d9a91427ee69e3a8064a5c1acdf129b37cc7` |

Review passes:

1. `session_writes.rb:1-113`: 113 lines.
2. `session_writes.rb:114-206` plus `sig/session_writes.rbs:1-29`: 93 + 29 = 122 lines.
3. `sig/rails_seams.rbs:1-162`: 162 lines.

Each pass was below 200 inspected lines. Total unique implementation/signature coverage is 397 lines: 206 Ruby implementation lines and 191 RBS lines, including comments and blanks. Test coverage inspected: **0 lines**. Instruction, context, metadata and hash reads are excluded from this denominator. No other implementation or test source was inspected.

Context included the applicable ancestor and project AGENTS instructions, `.planning/STANDARDS.md`, the orchestration policy, and selected project state/local-completion context. The full review rubric supplied in this dispatch was used. Formatting remains delegated to linters.

## Coordinator-supplied contracts

The reviewer asked through the required blocking Orca `ask` before inspecting any additional dependencies. The coordinator answered:

- The accepted amendment treats a public `remove` failure before eviction as unresolved disposition: log, preserve the primary exception, and do not disconnect while the adapter remains registered or queued. This is explicitly not healthy pool recovery.
- The coordinator verified that production `V1::WriteController#protected_write` checks `users.is_a?(Array) && users.length <= 2` before mapping UUIDs and calling `SessionWrites`; its search found one production transaction entry. Thus `guard_users` is a trusted internal array contract. Test callers are separate. This reviewer did not independently inspect that caller; no direct untrusted large-array path was established.
- The coordinator identified `write_boundary_pool_disposition_test.rb:172-226` as new coverage for before-remove, partial queue removal, after-remove and replacement failures, with independent schedule/design reviews still pending. Those test lines were not inspected or executed here and do not establish passing tests.

The coordinator explicitly authorized finishing this report without further source inspection.

## Checklist and evidence

| Area | Static assessment and limits |
| --- | --- |
| Deadline and checkout ownership | `session_writes.rb:15-24,66-82` defers this request's asynchronous expiry around ownership changes and establishes cleanup before checkout. The operation has an immediate-expiry region at `35-57`; explicit checks surround the response/return boundaries. `60-62,80-82` reject absent or invalid responses rather than interpreting a swallowed rollback as success. RequestDeadline, transaction and driver behavior remain external contracts. |
| Handoff before late expiry | `83-100` acquires adapter then pool locks, checks membership/current owner/no open transaction, performs checkin, verifies registered/unowned/closed state, and only then sets `handed_off`. Later expiry changes the result without invoking discard on the transferred adapter (`103,110`). No hard COMMIT or cleanup deadline is claimed. |
| Rejected checkin containment | The inner `ensure` at `101-104` runs quarantine while the pool monitor remains held. It covers exceptions and nonlocal exits through checkin. The outer `ensure` at `108-110` supplies disposal after the synchronized region. Actual queue and callback scheduling still requires the root-owned runtime evidence. |
| Foreign-owner safety | `141-146` refuses removal for a foreign owner. `154-162` checks ownership again after removal, and only proven detachment enables disconnect at `120-122`. This protects foreign leases under the accepted pool ownership contract; no unconditional disconnect is present. |
| Removal exactly once and disposition proof | `116-118,142,150` uses the shared `started` flag to prevent retrying public removal. `169-180` proves absence from both the registered connections and the availability queue, with runtime class/array/entry guards. Unknown inspection state is recorded without claiming detachment (`164-166`). |
| Exception ordering and disclosure | Removal errors are collected before the `ensure` inspection (`148-163`), so failure after actual eviction can still permit safe disconnect. Disconnect errors are collected separately (`121-125`). Cleanup records include phase, error class and generated correlation only (`128-135`); logging failure re-raises an existing primary or emits a safe service error. These deliberate cleanup rescues do not by themselves prove behavior of uninspected native primitives. |
| Null, empty and maximum inputs | Context/version must be strings (`43-45`); absent/wrong response and missing result metadata are rejected (`53-54,60-61,81,198-200`). An empty guard list creates an empty bound UUID-array literal; duplicates are normalized. The two-user check follows mapping (`30-31`), relying on the coordinator-confirmed caller bound. Nil `guard_users` is outside the declared/internal contract. Invalid or missing queue shape cannot authorize disconnect (`173-180`). |
| Authentication, authorization and SQL boundaries | The inspected flow checks session metadata, organization, context/version and CSRF before invoking the mutation (`37-52`). Guard UUIDs are validated before joining into a bound array, and SQL values use query attributes (`183-204`). Correct stored authorization/RLS, identity provenance and tenancy restoration are dependencies, not proven by this wrapper. |
| Type contract | The local signature tracks disposition flags, exception arrays, adapter/block arguments and private cleanup helpers. `rails_seams.rbs:71-75,115-145` represents nullable ownership, locks, checkout/checkin/removal, registration and the opaque queue seam without an `untyped` escape. Nullable transaction/results acknowledge rollback behavior. The conservative nullable `with_write_connection` signature is guarded in Ruby. No direct implementation/signature contradiction was identified; no typechecker was run. |
| Structure, comments and performance | Helpers separate acquisition, quarantine, disposition proof and disposal; no speculative dependency or repeated database-query loop was identified. Comments explain lock order, late-expiry semantics, native-I/O limits, primary preservation and the pinned private seam. Membership/queue scans are linear in pool size. Native replacement under the outer monitor can block pool progress; that is an accepted limit, not a bounded-latency guarantee. |
| Regression and integration evidence | NOT_RUN and not independently inspected. Required happy-path/failure evidence belongs to the root's separate test and scheduling assignments. No passing result is inferred from source or the coordinator's list of test cases. |
| Standards and documentation | No confirmed violation of the applicable scoped standards was established within these files and accepted contracts. AIDEV comments capture the non-obvious lifecycle decisions and pinned queue dependency. Repository-wide documentation synchronization, commit contents, CI, UI and release gates were not certified by this review. |

## Defects and density

Confirmed numbered defects: **none**. Consequently there are no severity/evidence/minimal-repair entries and no source repair is proposed by this assignment.

- Confirmed defects: **0**.
- Reviewed unique physical LOC: **397**.
- Defect density: `0 / 397 * 1000 = 0.00 defects/KLOC`.
- Accepted risks and unverified dependencies below are excluded from this defect count; zero findings is not a guarantee of correctness outside the inspected scope.

## Design limits and unchecked dependencies

1. **Unresolved disposition remains a real risk.** If removal fails before eviction or only partly evicts, the code can leave a pool-visible adapter intact (`150-162,169-180`). It logs rather than disconnecting an adapter whose safe ownership/disposition is unproved. Do not describe all abnormal paths as successful quarantine or recovery. The coordinator explicitly accepted this residual behavior; changing it requires the design owner, not an unreviewed additional removal/disconnect attempt.
2. **No absolute cleanup deadline.** The outer monitor intentionally spans public removal's replacement work (`149-150`); native connect/disconnect, lock acquisition and COMMIT can outlive request expiry. A rejected response does not prove the transaction failed to commit. The implementation comments and task contract acknowledge this limit.
3. **Pinned framework seam.** Actual Rails 8.1.4 checkout/checkin/remove behavior, reentrant lock order, queue monitor sharing, queue inheritance/representation and driver effects were not inspected. The RBS declarations describe permitted calls; they do not prove those runtime behaviors. Future Rails changes require renewed verification of the private read-only `@available`/`@queue` seam.
4. **Application contracts outside coverage.** RequestDeadline, Tenancy transaction/context cleanup, WriteStatements, SessionStore, Sessions/presentation/crypto, identity validation, WriteInput/AuthInput, WriteResponse/ReadResponse, stored procedures/RLS, database timeouts, controller error translation and configuration remain unchecked dependencies. The guard-user caller contract is coordinator evidence only.
5. **Evidence still required.** Root-owned regression, concurrency/scheduling and design reviews remain necessary, including healthy reuse, pre/post-handoff expiry, foreign owner, callback/nonlocal-exit failure, removal failure before/after eviction, partial queue removal, replacement failure and logging/disconnect failure. This report does not certify that this list is fully implemented or passing.

This assignment reviews lifecycle correctness against an already accepted repair. It is not a separate architectural approval or an Obsidian-backed design simulation; no new deep design choice was made. The coordinator retains dedicated design-review and overall acceptance ownership.

## Execution record

Runtime validation: **NOT_RUN**. No host application tests, Docker, SSH, web server, ultrareviews, subagents, dependency installs, commits, external-channel posts or source edits were performed. No disposable runtime resources were created. The only file written is this report. Root must incorporate its coverage and limitations into the central review ledger and completion evidence.
