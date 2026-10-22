# Bounded SQL authority review — 2026-10-23

Task `task_38f11a210269`, dispatch `ctx_65da5fbaae96`; implementation recipient `ctx_6594097677c5`.
Static review only: **0 confirmed actionable defects, 0/348 × 1000 = 0 defects/KLOC**.
This is bounded source evidence, not migration, concurrency, delivery or release acceptance.

## Exact coverage and provenance

Paths below are relative to `apps/server/db/be03_send/production_mox/`.
Hashes are SHA-256 of complete on-disk file bytes; only assigned implementation ranges were inspected.

| Packet | File/range | Physical LOC | SHA-256 |
|---|---|---:|---|
| A | authority.sql:1–180 | 180 | f59d3f660633bc6a9e406e85af7cd3c966d35eb18e4081f0eefe7bec5cf044f4 |
| B | authority.sql:181–231 | 51 | same file/hash as A |
| B | schema.sql:1–59 | 59 | 51c5e85806b6d1a7a1f188f67d94034968a19c5c448a10fec7f3585a31175536 |
| B | observation.sql:1–58 | 58 | f4be3bfa4f71fd3a76b7275e82c8b89aa72f37069801543af86a95e732614614 |

Packet B totals 168 LOC; combined unique implementation coverage is 348 physical lines, including comments/blanks.
Packet A: 0 defects, 0/KLOC. Packet B: 0 defects, 0/KLOC. No imported implementation or tests inspected.

Guidance/context: AGENTS.md, .planning/STANDARDS.md, README.md, state.md, documentation.md,
docs/completion/selfhosted-mail-20261023.md and docs/completion/selfhosted-initialize-20261023.md.
The full supplied adversarial rubric governed review; formatting was excluded as instructed.

## Checklist and findings

| Concern | Source finding | Evidence limit |
|---|---|---|
| Forced RLS / least privilege | schema:10–13 enables and forces RLS on the new domain table, permits its owner role and revokes runtime table access. authority:224–230 exposes wrappers to worker while revoking legacy entry points. observation:53–56 restricts worker entry. | Existing table policies, role attributes, function owners and migration caller context were outside scope. |
| Locked final authorization | authority:122–128 rechecks guard, policy, mailbox and account; :139 locks job; :144–164 combines lease, generation, deadline, cancellation, capability and account checks with COALESCE(false). Wrappers lock matching lead rows FOR SHARE. | Guard/helper locking and actual transaction boundaries require runtime evidence. No claim that locks span external SMTP I/O. |
| Exact sender / tuple / version | authority:54–55 checks snapshot sender; :73–79 freezes SMTP binding; :95–97 returns organization/mailbox/account/version/reference/protocol; :159–163 rechecks exact account, version, reference and sender. schema:21–29 distinguishes production secret refs and test refs. | Credential resolver and transport consumption of this tuple were not inspected. |
| Domain activation | schema:6–8 defaults disabled and requires evidence for enabled domains; :45–49 checks organization/domain and active matching sender account. | Operator evidence validity and exact DNS are outside scope; regex is not evidence verification. |
| Suppression / consent | authority:26–35 and :132–138 canonicalize and check suppressions; wrappers :181–194/:208–219 invoke marketing checks and require locked granted lead evidence for live profiles. | Concurrent suppression synchronization and helper consent semantics remain unverified; see follow-up below. |
| Capability / budgets | authority validates 32-byte capability and permitted profile, compares fixed profile hashes, checks current capability, reserves budget in a subtransaction, and rechecks time after waits; final check calls check_budget. | Budget axes, counter locking and helper fail-closed behavior cannot be proven from calls alone. |
| Unknown outcomes / replay | observation:31–45 sends unknown to reconcile or needs_review, clears lease and never sets submit; authority:39–41 requires queued/submit before authorizing. | Discovery/reaper/reconciliation implementations are uninspected. No exactly-once delivery claim. |
| Null / empty / maximum | Explicit null/type/profile/deadline/digest/receipt checks are present. Final legacy result coalesces null to denial. Attempt cap 3 and bounded reconciliation count are visible. | Empty recipient arrays pass these loops vacuously; immutable snapshot admission must enforce nonempty bounded recipients. That admission was not assigned, so no confirmed defect is inferred. |
| State coupling / atomicity | Budget exceptions roll back attempts and partial reservations before scheduling a held retry; observation updates job and audit in the same function transaction. | Real rollback/locking tests not inspected or run. |
| Maintainability / performance | Helpers retain shared policy responsibility; comments explain lock ordering, rollback and profile coupling. No new abstraction recommendation. Recipient loops/lead queries are bounded only if upstream snapshot admission supplies limits. | Indexes, query plans and latency were not inspected. |
| Tests / documentation | Standards and deployment/initialization docs explicitly preserve held activation and evidence limits. | No assigned tests: happy path, failure cases, coverage and exact migration rollback remain NOT_VERIFIED, rather than presumed missing. |

## Required evidence follow-ups (not counted as confirmed defects)

1. **Suppression concurrency:** authority:132–138 reads suppressions before waiting for the job lock at :139; suppression rows/predicate are not visibly locked here. Verify the suppression writer shares a retained guard/policy lock or another serialization mechanism. A real PostgreSQL regression should hold the job lock, start final authorization, insert/commit a suppression, release the job lock and require denial. If no shared serialization exists, recheck after obtaining the job lock and serialize suppression insertion against dispatch; a row lock alone cannot protect an absent suppression row. This is a security-sensitive evidence gap, not a proven race across uninspected code.
2. **Ownership/ACL migration:** legacy definitions precede SET LOCAL ROLE at authority:166. Verify the enclosing migration establishes the intended owner and final ACLs for both legacy functions, including PostgreSQL default privileges. The assigned slice alone does not establish an ownership defect.
3. **Boundary/helpers:** confirm immutable snapshots enforce shape/nonempty/max recipients and prove helper null/failure behavior, actual-role forced-RLS denial, concurrent revocation/version rotation, late budget denial rollback and unknown outcome reconciliation without resubmission.

## Runtime and authority limits

No tests, builds, dependency installs, database connections, secret inspection, cloud/DNS access,
external mail, source edits, commits or nested workers. Only this assigned report was written.
Historical receipts were context only and do not verify these hashes. Actual model billing identity
is not independently exposed. Coordinator owns central code-reviews.md/state integration and acceptance.
