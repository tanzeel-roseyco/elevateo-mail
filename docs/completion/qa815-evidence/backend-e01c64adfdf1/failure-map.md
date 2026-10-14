# QA815 e01c64ad expanded backend failed-suite map

Exact source `e01c64adfdf1ef05107239e947ed7351b771580f`; sole fleet Docker task, OPS820 task-only gateway bootstrap and 1800s TEST929 outer suite cap. Log `029-ruby-suites.txt` SHA256 `ff62ff2c0efcc359f9e9ee98a0d7bf1019bde228848ad959268df242a9eafc2b`. The sanitized log redacts many RUN paths, so path-to-result matching below is inferred from the exact immutable TEST929 Bash glob order and cross-checked against visible RUN names. Counts column is runs/assertions/failures/errors/skips; elapsed seconds is the task ledger integer.

| Order | Suite | Exit | Counts R/A/F/E/S | Seconds | First failure / prerequisite |
| ---: | --- | ---: | --- | ---: | --- |
| 1 | `test/administration/assignee_options_http_test.rb` | 1 | 3/0/0/3/0 | 1 | ApplicationController rescue calls Rails.logger; unavailable in this test boot |
| 4 | `test/administration/assignment_member_options_migration_test.rb` | 1 | 1/1/1/0/0 | 1 | task service is API; suite requires migrator session (expected migrator, actual API) |
| 7 | `test/administration/organization_role_audit_http_test.rb` | 1 | 3/0/0/3/0 | 1 | ApplicationController rescue calls Rails.logger; unavailable in this test boot |
| 10 | `test/administration/user_display_preferences_database_test.rb` | 1 | 3/6/0/3/0 | 1 | resolve_session EXECUTE denied under current task role |
| 80 | `test/campaigns/accounts_controller_test.rb` | 1 | 4/8/0/4/0 | 1 | ApplicationController rescue calls Rails.logger; unavailable in this test boot |
| 81 | `test/campaigns/authorized_database_test.rb` | 1 | 8/41/0/2/0 | 2 | SET ROLE elevateo_app_read denied under current task role |
| 96 | `test/inbound/permalink_http_test.rb` | 1 | 3/0/0/3/0 | 1 | ApplicationController rescue calls Rails.logger; unavailable in this test boot |
| 98 | `test/outreach_sequence/authorized_database_test.rb` | 1 | 4/2/0/4/0 | 1 | SET ROLE elevateo_app_read denied under current task role |
| 104 | `test/qa817/cancellation_privileges_database_test.rb` | 1 | 2/0/0/2/0 | 0 | database fixture is not empty; shared DB contamination suspected |
| 105 | `test/qa817/grant_actor_database_test.rb` | 1 | 3/0/0/3/0 | 1 | database fixture is not empty; shared DB contamination suspected |
| 106 | `test/qa817/legacy_ceiling_database_test.rb` | 1 | 3/0/0/3/0 | 0 | database fixture is not empty; shared DB contamination suspected |
| 108 | `test/qa817/private_sales_database_test.rb` | 1 | 3/0/0/3/0 | 1 | database fixture is not empty; shared DB contamination suspected |
| 109 | `test/qa817/role_audit_database_test.rb` | 1 | 5/0/0/5/0 | 1 | database fixture is not empty; shared DB contamination suspected |
| 110 | `test/qa817/role_escalation_database_test.rb` | 1 | 3/0/0/3/0 | 0 | database fixture is not empty; shared DB contamination suspected |
| 111 | `test/qa817/role_owner_race_database_test.rb` | 1 | 1/0/0/1/0 | 1 | database fixture is not empty; shared DB contamination suspected |
| 112 | `test/qa817/tenant_authority_database_test.rb` | 1 | 3/0/0/3/0 | 1 | database fixture is not empty; shared DB contamination suspected |
| 113 | `test/qa817/worker_observation_database_test.rb` | 1 | 3/0/0/3/0 | 0 | database fixture is not empty; shared DB contamination suspected |
| 123 | `test/sends/approval_database_test.rb` | 1 | 15/0/0/15/0 | 0 | database fixture is not empty; shared DB contamination suspected |
| 124 | `test/sends/approval_faults_database_test.rb` | 1 | 1/0/0/1/0 | 1 | database fixture is not empty; shared DB contamination suspected |
| 125 | `test/sends/approval_races_database_test.rb` | 1 | 2/0/0/2/0 | 0 | database fixture is not empty; shared DB contamination suspected |
| 126 | `test/sends/cancellation_database_test.rb` | 1 | 5/0/0/5/0 | 0 | database fixture is not empty; shared DB contamination suspected |
| 127 | `test/sends/cancellation_worker_race_database_test.rb` | 1 | 4/0/0/4/0 | 1 | database fixture is not empty; shared DB contamination suspected |
| 128 | `test/sends/mailpit_test_receipt_database_test.rb` | 1 | 8/0/0/8/0 | 0 | database fixture is not empty; shared DB contamination suspected |
| 129 | `test/sends/mailpit_worker_database_test.rb` | 1 | 3/0/0/3/0 | 0 | database fixture is not empty; shared DB contamination suspected |
| 130 | `test/sends/schema_database_test.rb` | 1 | 6/0/0/6/0 | 1 | database fixture is not empty; shared DB contamination suspected |
| 134 | `test/sends/send_worker_database_test.rb` | 1 | 5/0/0/5/0 | 0 | database fixture is not empty; shared DB contamination suspected |
| 135 | `test/sends/worker_authority_database_test.rb` | 1 | 9/0/0/9/0 | 1 | database fixture is not empty; shared DB contamination suspected |

Of 137 standard suites, 110 exited zero and 27 nonzero; 807 runs/7715 assertions/1 failure/106 errors/0 skips in 137 Minitest summaries. These 27 are grouped as four Rails.logger rescue failures, one migrator-role expectation, one resolve_session privilege denial, two SET ROLE privilege denials, and 19 dirty-fixture suites. The 19 dirty-fixture suites contain 84 error occurrences; later closed-connection errors are secondary in their traces. Each role test needs a separately configured task-owned role/profile. The dirty-fixture groups need fresh disposable migrated DBs with empty-fixture checks still active; no result is accepted from bypassing those guards.

Migrations through 00019 passed, Steep found zero errors, RuboCop --lint inspected 319 files with zero offenses. HTTP, worker and real Auth/browser were not reached. Nine dedicated suites were deferred with explicit reasons in the raw receipt; none passed in this run. `cleanup.json` reports removed builder/container, three task containers, three task volumes, network and derived image with no errors, and the source archive was removed. This map classifies evidence, not a source review or a proof that fresh isolation will fix every case.
