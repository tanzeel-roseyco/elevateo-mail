# BE02 bounded write-race repair

Task `task_304affd7040f`, dispatch `ctx_e9feab8b85dc`, run `run_5cc7ae2ab900`.
Source root: `C:/Users/Tanzeel/Code and projects/Elevateo Mail - BE02 Codex`.
Contract remains exactly `1.0.0-collaboration.1`. Authored evidence: **NOT_RUN**.

<!-- AIDEV-NOTE: This freezes test-only F2 repairs; root owns independent review, Docker evidence and shared docs. -->

## Repair and defect accounting

One reported defect addressed: F2 in the coordinator's sibling
`Elevateo Mail - Local Completion/docs/completion/review-be02-write-boundary-races.md`.
Original concurrency coverage was 127 physical LOC, one medium defect,
**7.87 defects/KLOC**. This is an implementation claim pending independent review,
not an executed closure or a new independent zero-defect review.

- Expiry is recorded from UPDATE RETURNING using database time plus three seconds.
  Writer transaction_timestamp is recorded before the asynchronous guard and must
  be strictly earlier than expiry. Delayed setup fails this explicit prerequisite.
- The guard must wait on the exact administrator PID with an ungranted
  `transactionid` lock while its database observation timestamp is before expiry.
  The administrator holds only the intended generation guard in this case: the
  session-expiry UPDATE committed before its generation transaction began.
- A bounded poll observes `clock_timestamp() >= recorded expiry`; fixed sleep is
  no longer the crossing oracle. The exact blocker is observed again before
  release so early return or SQL timeout cannot count as the intended race.
- Only this expiry transaction uses 8-second lock, 10-second statement and
  15-second transaction budgets. These SQL-fixture margins do not change production
  deadlines, the HTTP contract, other suites or production SQL.
- All five threaded races now supply exact blocker PID and lock kind. Polling
  clears cached PostgreSQL statistics and reports waiter, blocker, kind, state,
  wait event and observed blockers on a missed prerequisite. Polling deadlines
  are checked before accepting a successful observation.
- All five use bounded result joins and ensure cleanup. Cleanup releases the
  administrator blocker, waits at most 12 seconds, then requests thread termination
  and waits at most one second. Child exceptions propagate; prior assertions are
  preserved. There are no queue handshakes or unbounded joins in these files.

## Compatibility and scope

`wait_for_lock(connection, seconds: 0.7)` remains callable: omitted `blocker:`
means `@admin.backend_pid`, and omitted `lock_kind:` means `transactionid`.
Compatibility does not retain the former generic-any-lock success predicate.
New callers should explicitly pass both keywords. Success now returns the
observation row, including `observed_at`; callers ignoring the return remain valid.
All existing callers of this helper were in the owned concurrency file at intake.
The collaboration helper has an unrelated same-named method and was not modified.

No two protected-write API sessions compete in these five races: one real API
writer competes against a controlled admin fixture. Generation cases do not lock
the cookie row in the admin transaction, so no shared session lock can mask the
generation wait. The first revocation test intentionally uses another real API
connection against the same cookie to test session locking. Distinct-session
duplicate-entry coverage belongs to the guard repair owner; no duplicate test
was added here. WG-01/WG-02 and controller F1 remain outside this assignment.

No production/SQL, contract, frontend, root-document, draft, membership,
collaboration or `write_boundary_database_test.rb` changes were made. No agent,
model, ultrareview, SSH, Docker, host application test, commit or push was run.

## Frozen code and review manifest

Paths below are relative to the source root. Hashes cover complete physical files.

| Pass | Path | Inclusive lines | Physical LOC | SHA-256 |
| --- | --- | --- | ---: | --- |
| 1 | `apps/server/test/be_02/write_boundary_concurrency_test.rb` | 1-119 | 119 | `6013C99B6AE3808083C035DCA6FD5D6167D92EDB3687F41A2CF66DDA27692B4A` |
| 2 | `apps/server/test/be_02/write_boundary_database_test_helper.rb` | 1-99 | 99 | `708BDD3A4E0A14F93686EBF71EA7A8F73E259207A8B1C01A9375D4A55935011E` |

Proposed reviewer assignment: both passes, 218 physical LOC total, each under
200 and aggregate under 400. Dedicated design review may inspect these same
218 lines in two passes; root dispatches reviews. One addressed reported defect
per 218 changed-file LOC is **4.59 defects/KLOC**; this denominator describes
the repair packet, not independently reviewed defect discovery. Report itself
is the third changed path; its final hash is delivered through Orca to avoid
self-referential hashing.

## Remaining evidence and caveats

Root must run the real PostgreSQL suite in authorized fleet-02 Docker and obtain
independent review. Verify normal expiry denial, a mutation using transaction-start
time instead of post-lock wall clock, delayed setup failing its prerequisite,
wrong-blocker observation failing, and child-query failure cleanup. These are
requested runtime checks, **not executed results**. No new claim of full membership
revocation or HTTP deadline coverage is made by these guard-only SQL races.

Bounds use local monotonic deadlines plus inherited database statement timeouts;
a DB observation can take up to that statement timeout before the next deadline
check. Native driver/network failure and OS scheduling are not certified here.
Thread termination is a last-resort failed-test cleanup, not successful evidence.
The fixture's inherited connection/teardown implementation is unchanged and its
broader behavior remains outside this repair. No Docker resources were created.
