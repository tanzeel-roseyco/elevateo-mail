# Elara FIX947: backend suite fixture contamination diagnosis

Actual Orca runtime `80fd7f05-8c59-444a-83d8-7ecea07e715b`; source/evidence review on 2026-10-14. Exact Soren receipt: `completion-soren-qa815/docs/completion/qa815-evidence/backend-e01c64adfdf1/029-ruby-suites.txt` for integrated `e01c64adfdf1ef05107239e947ed7351b771580f`. All 137 selected suites ran: 110 exit 0, 27 exit 1; aggregate 807 runs, 7715 assertions, one failure, 106 errors, zero skips. This branch has **not** executed any application build or test. Fleet-02 Docker remains Soren's sole gate.

## Source provenance and bounded packets

The BE02 `database_test_helper.rb`, `collaboration_database_helper.rb`, `mailbox_membership_database_helper.rb` and `organization_access_fixture_cleanup.rb` blobs in this branch match their Git blobs at integrated `e01c64adfdf1` exactly. Reviewed helper packets: database helper 1-90 (90 LOC), collaboration helper 1-75 (75), membership helper 1-60 (60), cleanup helper 1-73 (73), membership helper 105-145 (41), collaboration helper 105-132 (28); overlapping reads are nonadditive. Reviewed candidate-specific outreach sequence authorized test 1-153 (153 LOC) and campaign authorized test 105-140 (36); other tests were inspected in narrow ranges. Each source read was <=200 LOC and no packet exceeded 400 unique source/context LOC. No production guard or migration change is proposed.

## Exact failure ordering

The receipt masks `RUN` file names. I mapped the 137 `RUN`/`SUITE_RESULT` ordinals to the sorted tracked `_test.rb` names at **the same integrated SHA**, excluding its nine dedicated files. This is static reconstruction, not a rerun.

| Ordinal | Failed suite | Primary category in receipt |
| ---: | --- | --- |
| 1 | administration/assignee_options_http_test.rb | Rails.logger unavailable |
| 4 | administration/assignment_member_options_migration_test.rb | separate early failure; see raw receipt |
| 7 | administration/organization_role_audit_http_test.rb | Rails.logger unavailable |
| 10 | administration/user_display_preferences_database_test.rb | separate early failure; see raw receipt |
| 80 | campaigns/accounts_controller_test.rb | Rails.logger unavailable |
| 81 | campaigns/authorized_database_test.rb | permission denied to set role `elevateo_app_read` |
| 96 | inbound/permalink_http_test.rb | Rails.logger unavailable |
| 98 | outreach_sequence/authorized_database_test.rb | role denial; teardown owner-loss; fixture lock retained |
| 104-106, 108-113 | qa817/cancellation_privileges, grant_actor, legacy_ceiling, private_sales, role_audit, role_escalation, role_owner_race, tenant_authority, worker_observation database tests | strict fixture-not-empty; grant_actor, legacy_ceiling, role_audit, role_escalation and role_owner_race also secondary closed-PG-connection teardown errors |
| 123-130, 134-135 | sends/approval, approval_faults, approval_races, cancellation, cancellation_worker_race, mailpit_test_receipt, mailpit_worker, schema, send_worker, worker_authority database tests | strict fixture-not-empty |

## Causal diagnosis

- `outreach_sequence/authorized_database_test.rb:28-40` deletes `app.organization_access` for the test's owner at line 38 *before* calling inherited `super`. `app.prevent_owner_loss()` raises `owner transfer required` at this delete in run 98, so inherited `OrganizationAccessFixtureCleanup#teardown` and `SessionDatabaseTestCase#teardown` never run. The next cases in that same process fail `database fixture already owned` (advisory lock retained). Later processes fail the correctly strict `database fixture is not empty` check because rows remain in the disposable database. This is the first proven persistent contaminator.
- The outreach test also calls `SET LOCAL ROLE elevateo_app_read` at lines 73, 119, 133, 138 and 145; the real API login cannot assume that role in the receipt. This is deliberate: `RestrictApiReadMembership#up` grants API `INHERIT TRUE, SET FALSE`, so role-switch expectations are stale while inherited privilege remains available. Campaigns authorized test has an earlier independent role-denial at run 81. Tests must assert the real API identity and negative SET-role boundary while retaining the intended RLS/write denials; granting SET privilege or weakening the guard would invalidate the boundary.
- Five QA817 subclasses query `@admin.transaction_status` in teardown after inherited cleanup has already closed it when setup failed. These errors are secondary to strict setup failure. A follow-up may guard the closed handle for diagnostic clarity, but it is not the source of persistent fixture contamination and should not replace the owner fix.
- The four Rails.logger suites and two additional administration failures precede the contaminator and are independent owner lanes; this packet does not claim to repair them.

## Repair and verification status

The source owner boundary for outreach/campaign test files has been requested from the coordinator before any overlapping implementation edit. Preserve final-owner trigger, exact-role checks, strict empty-fixture check, and rollback semantics. The smallest candidate is to let inherited fixture cleanup remove organization-access rows under its transaction-local trigger bypass, ensure the parent teardown runs even if child-specific deletion fails, and replace stale SET-role test expectations with explicit API `current_user`/`session_user` and negative `pg_has_role(..., 'SET')` assertions, retaining real-login RLS/write denials. Add a regression that a revoked/failed case leaves the fixture reusable and the owner-loss trigger intact; run only through Soren on a disposable fleet-02 database.

Requested Soren command order after authorized owner repair: isolated `bundle exec ruby test/outreach_sequence/authorized_database_test.rb`, then `bundle exec ruby test/campaigns/authorized_database_test.rb`, then a fresh full 137-suite runner on one immutable integrated SHA. Capture role identity, per-file exits, exact source/image SHA and cleanup. No result is claimed for these requests. Dedicated suites remain separate.

### Import/ownership constraint

Elara's isolated branch has the exact shared BE02 helper blobs from `e01c64adfdf1`, but it does **not** contain `test/outreach_sequence/authorized_database_test.rb`, and its campaign authorized test blob differs from that integrated SHA. Any repair of those two tests must import the exact integrated test source under the owning lane and be reconciled by Cassian; editing this branch's older campaign test as though it were the integrated candidate would produce a misleading patch. Scoped owner authorization has been requested through Orca and the shared outbox; no such source edit has been made.

Existing `test/be_02/organization_access_fixture_cleanup_test.rb:31-51` already exercises the shared helper with a closed API connection, a closed admin connection, and an injected cleanup-preparation failure while asserting fixture rows and the advisory lease disappear. Lines 73-93 also preserve the original delete error if rollback fails. These tests support keeping the shared helper unchanged; they do not cover a subclass that raises before `super`, which is the outreach defect. A new regression belongs in the outreach test lane or a dedicated child-teardown probe after ownership is resolved.
