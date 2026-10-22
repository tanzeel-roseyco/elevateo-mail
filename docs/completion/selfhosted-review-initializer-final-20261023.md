# Bounded initializer adversarial review â€” 2026-10-23

Task `task_f8e28965af83`; dispatch `ctx_4d08b1dd9883`; implementation owner `ctx_f5eab65ab665` (supersedes the earlier owner in the brief).

Result: **zero confirmed actionable defects in 310 inspected physical source lines; 0 defects/KLOC**. This is source-only review, not approval to initialize production. No tests, builds, database queries, secret access, cloud/DNS operations, imported implementation reads, or nested workers were performed. Only this report was written.

## Exact coverage

SHA-256 values identify complete file bytes; coverage is limited to the listed ranges, including blank lines and comments.

| Packet | File | Inspected lines | Physical LOC | SHA-256 |
| --- | --- | --- | ---: | --- |
| A | `ops/production/initialize/admission.py` | 1â€“100 | 100 | `5f11a63a4aa11ccd339be10ad3e9c72f59b615a974bb93147ffebc17fc92e9db` |
| A | `ops/production/initialize/initialize.py` | 1â€“96 | 96 | `0c519827edf8abae32a1a0c510f23a080018f81e46bbcc6568a52b3e786f08bf` |
| B | `ops/production/initialize/tenant.sql` | 1â€“88 | 88 | `f338ce20388a24bc07aa92192bed5bd91be190004e2913a0670600c4831f1c32` |
| B | `ops/production/initialize/preflight.sql` | 1â€“18 | 18 | `d98cfab30b13483c5a79ebb410dc9c710f41de324fe3e9635ec5eb272e38ee7b` |

Packet A: 196 LOC, zero defects, 0/KLOC. Packet B: 106 LOC, zero defects, 0/KLOC. Supplemental Packet C: admission.py lines 101–108, 8 LOC, same complete-file SHA-256, zero defects, 0/KLOC. No overlapping source counted twice.

**Coverage exception:** admission.py is now 108 physical lines. Lines 101â€“108 were not read because the explicit Packet A allowance is 196 lines, including at most 100 admission lines. The final evidence/tenant binding logic therefore needs separate bounded coverage; this report does not assert complete gate correctness. Coordinator and corrected implementation owner were notified immediately.

Context consulted: AGENTS.md, .planning/STANDARDS.md, README current-state context, state.md and documentation.md current context, initializer README, and the schema-initialization assessment. Large historical documentation output was truncated; no claim of exhaustive historical reconciliation is made.

## Rubric checklist and findings

- **Purpose, empty inputs and limits:** source_digest requires each of three source directories to exist and contain selected files, and requires named critical files to be nonempty. An empty source tree can no longer yield the empty SHA-256 as an admitted source. Tenant parsing bounds names/receipts, validates canonical nonzero UUIDs and restricts roles. Environment credentials are byte-bounded and reject NUL/line breaks. Gate JSON is bounded to 16 KiB at the inspected boundary.
- **Directory symlink escape repair:** checked() examines each selected path and its in-root ancestors for symlinks, including the three directory entrypoints before rglob. It also requires resolved descendants to stay inside the resolved root. This statically addresses directory symlink escapes as well as file links. No filesystem attack or regression test was executed. The documented immutable/read-only source mount remains necessary to exclude check/use mutation races.
- **Environment and production admission:** subprocesses receive a constructed allowlist rather than caller environment inheritance. Rails migration environment removes PG settings and non-migrator role passwords; outbound hold, held mode and disabled send API are explicit. The normal CLI requires an accepted gate before execute; its inspected portion binds source, target, phase and six operator attestations. Preflight checks PostgreSQL 17, privileged Supabase identity and existing Auth/Storage tables. Server/network identity is deliberately an operator prerequisite, not proven by a source hash or generic Docker hostname. Supplemental Packet C checks the four evidence identities and exact tenant binding; it does not establish the truth of operator attestations.
- **State, idempotency and authorization:** tenant changes occur within one transaction under a shared advisory lock and Auth row locks. A new organization requires owner role; for new memberships, the boolean comparison rejects a second owner and rejects nonowners before an owner exists. Exact retries require matching organization name, access role, receipt role and receipt reference; conflicts raise and roll back. No repeated lookup constitutes an apparent performance bottleneck in this single-tenant operator flow. Generation-lock implementation and RLS behavior outside these ranges were not inspected.
- **Auth/Storage preservation:** preflight is read-only. Tenant SQL locks existing confirmed, active Auth users and Google identities but does not create/update/delete Auth or Storage rows. No reset/drop/fixture path appears in the entrypoint. Imported bootstrap and migration bodies can change privileges/schema and were excluded: their data-preservation behavior still requires independent review and isolated restore verification.
- **Complexity, scope and maintainability:** the short admission, execution and SQL units have clear responsibilities and intent comments for non-obvious authority/locking boundaries. No actionable over-engineering, duplicated logic, misleading identifier, deep nesting or avoidable hot loop was confirmed. Formatting was not reviewed.
- **Tests and failure scenarios:** tests were outside the assigned source budget, so existence, adequacy and results are unverified. Required fleet evidence includes empty source/missing required file; directory/file symlink escape; malicious inherited environment; wrong gate/evidence/tenant; valid owner plus exact retry; conflicting role/receipt, second owner and nonowner-first; missing/banned/deleted/unconfirmed/non-Google Auth; transactional rollback and Auth/Storage preservation. No historical test result is promoted to current verification.
- **Documentation and standards:** initializer documentation explains held default, private immutable runner prerequisites, backup/restore gates, forward-only partial-failure handling, role-password rotation and separate tenant enrollment. Strict Python annotations, parameter-safe psql literal interpolation and explicit failure handling are present in inspected ranges. Full standards conformance requires the excluded implementation, tests and runtime evidence.

## Remaining acceptance boundaries

Obtain separate review of admission.py lines 101â€“108 at the exact hash, inspect required regression coverage through its own assignment, and execute authorized fleet Docker tests plus an isolated full restore/migration rehearsal. Keep application services stopped and outbound held until the coordinator accepts the exact evidence. No production release, successful restore, runtime tenant creation, complete migration audit or whole-project approval is claimed.
