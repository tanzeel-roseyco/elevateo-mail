# Final bounded SQL repair review — 2026-10-23

Task `task_8358f1f01d70`; dispatch `ctx_9bc8a11ee85b`. Read-only adversarial review applying the complete supplied rubric. Only this report was written; no source edits, tests, secrets/cloud/DNS access, nested workers or commits.

## Exact coverage

Read AGENTS.md, .planning/STANDARDS.md, README/state/documentation context and the prior bounded SQL approval report. Imported implementation and parent tests were not opened. Physical counts include blanks/comments; hashes were checked again before reporting and were unchanged.

| Packet | File | Full physical range | SHA-256 |
| --- | --- | --- | --- |
| A | apps/server/db/be03_send/production_mox/approval.sql | 1–103 | a65f95b2fdb3f346d0d2e7480d8a457ed851aca0d03fd26de82d6b6aa2424860 |
| A | apps/server/db/migrate/20261023000041_enable_production_mox_transport.rb | 1–65 | 91414b5a6d5926f2c4aef0544f2fe7f34d2b3e7491d6bdd0c8aa4f678334aa8b |
| B | apps/server/test/sends/production_mox_database_test.rb | 1–180 | 57e3c830038c9c34589a29db2882ab62601c48c18a5ff147e8e0f30a65700394 |

Packet A: 168 lines. Packet B: 180 lines. Total: **348 unique physical lines**. Each packet is below 200 lines and total below the 365-line assignment ceiling.

## Findings and repair dispositions

**Zero actionable defects found in the assigned final source.** Critical/high/medium/low counts are all zero; packet A, packet B and aggregate density are **0 defects/KLOC**. Limits below are not counted as defects.

- Prior SQL-APP-01 (LOW NULL-mode boundary validation): **closed statically**. Approval line 12 explicitly rejects NULL before authentication, binding, replay lookup or writes. Tests 137–147 exercise NULL through the restricted API connection first with a fresh operation, then after ordinary approval, requiring `request_invalid` and unchanged intent count. This is boundary rejection, not evidence of a historical replay bypass; the prior withdrawn replay-bypass claim remains withdrawn.
- Rollback private-table ACL repair: migration 17–20 switches to `elevateo_send_owner` before private-table locks and queries, then resets before application-table inspection. Restoration and private DDL likewise use the send owner; inbound DDL occurs after RESET ROLE. This removes the visible migrator/private-table ACL mismatch. Actual grants and role membership are outside scope and require real-role runtime verification.
- Populated production refusal: migration 18–23 locks the relevant tables and refuses **any** domain row (including disabled rows), production-profile attempt history, secret-backed SMTP account or secret-backed inbound IMAP account before destructive restoration. Refusal retains production authority/history instead of silently deleting it. Transactional lock retention and refusal atomicity require fleet PostgreSQL evidence.

## Rubric checklist

| Area | Assessment within scope |
| --- | --- |
| Purpose and integration | Production approval remains nonsimulated for mox/resend; explicit NULL rejection is early and transport-specific behavior remains distinct. Loaded migration SQL and worker implementation are uninspected dependencies. |
| Null, empty and maximum inputs | Explicit required IDs/version/digest/mode guards and 1 MiB supplied-snapshot bound are visible. Snapshot shape, empty recipients, attachment validation and helper NULL behavior remain delegated to uninspected validators. No new actionable defect established. |
| State, replay and concurrency | Current session guard is rechecked after business waits; organization/actor operation lock and locked draft binding precede replay resolution. NULL cannot reach either fresh or existing operation paths. Lock correctness under concurrency remains runtime-only. |
| Authorization and sanitization | Parameterized test SQL, SECURITY DEFINER pinned search_path and organization-scoped consent checks are visible. Tests explicitly deny worker domain reads/API domain writes and reject another tenant's domain authority. Helper/schema grants are not certified by this review. |
| Generation regression | Setup 13–14 advances credential_version when switching the credential namespace; binding expects version 2. Test 90–103 first requires successful attempt authorization, then increments generation and requires final refusal. This exercises revocation after authorization rather than only initial invalid configuration. Parent fixture initial generation and runtime behavior are outside scope. |
| Tenant and budget regressions | Tenant test provisions the same domain for another organization, removes this tenant's domain and requires held/zero submissions. Budget test disables a configured limit and advances version, requiring held/zero submissions. It proves disabled-budget refusal, not numeric budget exhaustion despite its test name. Numeric limit/concurrency behavior is unverified here. |
| Happy and failure paths | Explicit production acceptance/provenance/no replay, unknown/no resubmit, disabled domain, role denial, generation rotation, foreign tenant, missing consent, disabled budget, NULL mode and evidence-NULL cases are present. Test source is not execution evidence. Parent test methods are deliberately undefined; inherited cases must not be counted for this subclass. |
| Regression oracle limits | NULL regression compares intent counts, but not jobs/approval-operation counts, and does not explicitly assert successful creation before its existing-operation branch. Early-return source establishes no writes in the reviewed repair; fuller runtime side-effect assertions would strengthen evidence. No migration up/down/up or refusal regression appears in this assigned test file; coverage elsewhere was not inspected. |
| Design, cohesion and overengineering | Minimal boundary guard and ownership-scoped rollback changes preserve existing architecture. Approval coordinates a single transaction; no speculative abstraction, extra dependency, duplicated new service or actionable naming/nesting issue found. Separate design reviewer remains coordinator-owned. |
| Performance | No additional hot-path query/loop from NULL repair; rollback locks are intentionally maintenance-only. Query plans and lock contention require real database evidence; no measured bottleneck claimed. |
| Comments and documentation | AIDEV notes explain account generation, parent fixture differences, lock/replay order and schema ownership. Existing project context explicitly withholds live/release acceptance. Central documentation synchronization was not audited or edited. |
| Standards and formatting | Scoped source aligns with deliberate boundary rejection, retained history and least-privilege role intent. Formatting delegated to linters; no lint/type/runtime checks run by this reviewer. |

## Delivery and evidence limits

Preliminary findings were delivered to the coordinator and implementation dispatch `ctx_6594097677c5`. No source changed between inspection and final hash check, so no additional repair revision was available to rereview. Prior report hashes and dispositions remain preserved in `selfhosted-review-sql-approval-20261023.md`; this report supersedes only its NULL-mode finding for the hashes above.

Fleet Docker must still establish actual role-correct up/down/up, populated-domain/history refusal and transaction/privilege restoration, plus the affected regression suite. This static review establishes neither application acceptance nor production authority. No Docker resources were created; cleanup is not applicable.
