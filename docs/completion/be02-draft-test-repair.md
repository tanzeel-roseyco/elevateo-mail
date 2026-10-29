# BE02 bounded draft regression repair

Task: task_e2b323491185; dispatch: ctx_9e88bfe53bbc; run: run_5cc7ae2ab900.
Contract: 1.0.0-collaboration.1, unchanged. Production files and shared write-boundary helpers unchanged.
Requested role: supervised Astra LOW repair worker; no new model calls or reviewer agents were started.

## Changes and finding coverage

| Finding | Authored repair |
| --- | --- |
| DTB01 | Revocation uses a distinct authenticated API session of the same authorized manager, production begin_protected_write then change_mailbox_membership. Both commit orders are controlled by observing the exact blocker before release. Stale generation returns context_changed; refreshed authorization permits the scope check, which denies save/lookup without ledger mutation. |
| DTB02 | Same actor has real organization and compose memberships in two organizations. Real session switching establishes a successful save in each; home context cannot replay the foreign draft, look up its operation, or bind its reply. Both organizations' full draft/ledger rows remain unchanged; admin composite FK rejection is asserted. Existing same-org other-mailbox tests remain. |
| DTB03 | Otherwise valid null-valued recipient objects succeed at 100 and fail at 101; malformed object coverage remains separate. |
| DTB04 | Unit cursor fixture has distinct included/lookahead IDs and timestamps, validates included cursor binds, exactly-once next-page membership and null terminal cursor. A database test executes production LIST_SQL with equal timestamps and descending IDs across the seek boundary. |
| DTB05 | Two distinct recipients have exact forward/reverse canonical bytes and SHA256 assertions, unequal order-sensitive digests, and key-order-neutral digests. Reordered retry cannot repurpose an operation or change draft/ledger rows. |
| DTB06 | Absent detail checks exact not_available code, 404 status and This item is unavailable. message at service boundary. |
| DR01 | Observer checks pg_blocking_pids for the exact holder PID and active begin_protected_write query. Distinct sessions eliminate the common session-row lock as the explanation; no administrative prelock participates in either race. Worker completion waits are bounded; no timing sleeps are evidence. |
| DR02 | Original applied and conflict rows have exactly 604800 seconds between recorded_at and detail_expires_at; complete original rows survive retries unchanged. Compaction test checks original retention before fixture aging. Misleading exact-expiry test name is replaced with past-expiry wording. |
| DR03 | Compaction compares every original aged column with only detail replaced by nil, preserving permanent identity, binding, digest and timestamps. Second compaction affects zero rows and leaves the record unchanged. |

The administrative fixture_change session prelock is preserved for unrelated setup behavior, with an explicit setup-only anchor. Race mutations never call it while a competing transaction is held. Production code was not changed to accommodate tests.

## Validation and caveats

- All authored tests: **NOT_RUN**. No Docker, host application tests, syntax execution, SSH, frontend work, commits or pushes were performed; coordinator owns Docker evidence.
- Static inspection checked the touched tests against production signatures, tuple SQL, mutation guard ordering, error vocabulary and table columns. This is not a runtime pass or independent adversarial review.
- Exact expiry equality remains **UNPROVEN**: production compares clock_timestamp, and no existing safe injectable clock seam was found. Aging proves past-expiry behavior only; production was not changed to create a testing seam.
- HTTP request-ID/error-envelope and end-to-end stale-token 409/current-token 404 evidence remain coordinator-owned outside these files. These tests assert database status transitions and the direct service error's status/code/message, not an HTTP transport exercise.
- The 0.7-second observation deadline is a failure bound below the fixture's one-second lock timeout, not timing-based proof; slow Docker scheduling can fail the test and must be investigated rather than treated as product failure.
- These files were already untracked in the shared workspace; only assigned paths were edited, preserving existing test cases and other writers' files.

## Review handoff manifest

Each row is a separate proposed pass, covering the entire physical file (including comments/blank lines), under 200 LOC. Suggested reviewers remain below 400 total LOC. No reviewer was launched by this worker.

| Reviewer | Pass / path under apps/server/test/be_02/ | Physical lines | SHA256 |
| --- | --- | ---: | --- |
| A | draft_payload_test.rb:1-83 | 83 | 2DD71FC87F9AB386F0A94AFB6C3DB88F0AF92D23510D9F637D669097CFA7AD54 |
| A | draft_reads_test.rb:1-121 | 121 | 00ACC66DC1CBBA3E87D9D6B21A9709D146B3E2043359F7B592211E5D49D339B6 |
| A | draft_database_test_helper.rb:1-76 | 76 | 93F8E02B887400CC646719FE45A89BA147533A77C4D68E32C3F76CC9A1051E5E |
| B | draft_authorization_test.rb:1-131 | 131 | 22F7EEF04A7F0AA577C4E7F35E8F3315E00D20A03F4AFF05E275E664862B28D1 |
| B | draft_database_test.rb:1-133 | 133 | 015663B9A0B062DB29F8A4EA4978A12320BE0FA5E72E15EC8D2A9D09B2600656 |
| C | draft_concurrency_test.rb:1-157 | 157 | 58CCEEE542291B5F19BB280E590492C9E4CA5B0BD382D67ACCF73C904E48086D |

Review checklist: A validates boundary controls, exact bytes, cursor fixture fidelity and setup preservation; B validates actual cross-organization authority, failure cleanup, no-write snapshots, retention and permanent records; C validates both commit orders, exact guard blocker, bounded completion and failure cleanup. Coordinator should separately assign its required design reviewer the concurrency pass (157 LOC) and this report; no structural design change is proposed.

Defects addressed: nine reported test-evidence findings, pending runtime and independent review confirmation. Review surface: 701 physical test LOC; historical finding density over this repaired surface is 9/701 = 12.84 findings/KLOC (not a measured post-repair defect rate). Confirmed new defects: unknown until review. This report is the seventh changed path; its own SHA256 is delivered in the completion message to avoid a self-referential hash.
