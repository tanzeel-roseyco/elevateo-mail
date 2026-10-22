# Bounded schema-test oracle review — 2026-10-23

Task: `task_e0e281e7d689`; dispatch: `ctx_86298be906a4`.
Implementation owner notified: `ctx_6594097677c5`.

Result: **zero actionable defects in 44 reviewed physical lines; 0 defects/KLOC**.
This is source-only review, not a runtime PASS or whole-file acceptance.

## Evidence and boundaries

- File: `apps/server/test/sends/schema_database_test.rb`.
- SHA256: `1e0f5d53a613dbb914941081023e39e37d29958670f230d7e7d3ff63ff68dba5`, verified against the assignment.
- Packet 1: lines 60–70, 11 physical lines.
- Packet 2: lines 107–117, 11 physical lines.
- Packet 3: lines 122–132, 11 physical lines.
- Packet 4: lines 146–156, 11 physical lines.
- Total: 44 unique physical lines, including comments/blanks; no imported implementation or additional test lines reviewed.
- Context: AGENTS.md, .planning/STANDARDS.md, and current README/state/documentation self-hosted records.
- No source edits, tests, builds, secrets, cloud/DNS access, nested workers, or commits.

## Findings and checklist

| Rubric area | Assessment within assigned ranges |
| --- | --- |
| Purpose and regression oracle | Exact sorted table equality now includes `mox_domains`; unexpected/missing table detection remains active. RLS, forced RLS and expected owner assertions remain visible. |
| Dependency teardown | Exact typed `mox_dispatch_allowed(app_send_private.intents)` removal parallels the two existing typed-function removals. No CASCADE or broader production teardown is introduced in these lines. |
| Restoration | Exact-signature `to_regprocedure` non-null checks cover all three explicitly removed functions. Constraint-definition equality and approval-code absence checks remain visible. Function-body identity is not asserted by these existence checks; surrounding restoration is outside this assignment. |
| Null/empty/max boundaries | Inventory equality rejects an empty inventory. Missing restored function yields null and fails `refute_nil`. No new variable-size external input or numeric limit appears in the patch. |
| State and failure handling | BEGIN and ensure/conditional ROLLBACK are visible. Main rollback ordering and unassigned transaction body were not reviewed; complete restoration is not independently established here. |
| Security and validation | Constraint names are identifier-quoted; relation names originate in PostgreSQL catalog output. No new user-supplied input or authorization path is introduced in these ranges. Real role enforcement remains runtime work. |
| Design, scope and duplication | Small test-only additions match the existing dependency pattern without adding abstractions or changing domain behavior. Three explicit function pairs are bounded and readable. |
| Naming, comments and complexity | AIDEV note explains later typed-function/FK coupling. No newly convoluted loops or conditionals identified. Formatting delegated to project tooling. |
| Performance | Catalog inventory and bounded dependency cleanup are test work, with no production hot-path change visible. |
| Tests and documentation | Assigned code is the regression test itself; happy inventory/restoration and fail-on-missing-object oracles remain visible. Broader happy/failure coverage, lint and actual execution were not inspected or run. This report records the bounded repair; central documentation remains coordinator-owned. |

No visible assertion weakening was identified in the assigned final source. A historical diff was not inspected, so this does not certify every earlier assertion or unassigned line remained unchanged.

## Remaining verification

Coordinator-owned fleet Docker execution must establish that dependency detachment permits the original teardown and that rollback restores usable objects. Existence checks alone do not prove function definition/privilege identity; PostgreSQL transactional DDL behavior and the unassigned test body were not exercised. No release authority follows from this review.
