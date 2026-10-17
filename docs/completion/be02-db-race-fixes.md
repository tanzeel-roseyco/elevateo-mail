# BE02 database generation and expiry regression follow-up

Implementation handoff for `task_f9a4a0a2cb6b`, dispatch `ctx_c4d798cc036d`.
Status: patch authored; all 19 new test cases are **NOTRUN** pending coordinator-owned container execution.
This is implementation evidence, not independent review or approval.

## Generation repair

`apps/server/db/be02/generations.sql` now locks and increments the exact old and new `(organization_id, user_id)` tuples for organization and mailbox membership changes. Previously, independent organization/user `IN` predicates also selected the two unrelated cross-pairs when both keys changed.

Mailbox changes deliberately retain whole-organization invalidation, including both organizations when a mailbox moves. Ordered tombstone creation, sorted generation locks, insert/delete handling with one absent tuple, and incrementing each affected row once remain intact. The same exact-tuple predicate selects both the rows locked and the rows updated; no function signature or privilege changes were made.

## Authored coverage

`apps/server/test/be_02/authorization_generation_test.rb` contains seven cases:

| Cases | Assertions |
| --- | --- |
| Organization membership changes both keys | All four generation pairs exist; only the old/new diagonal pairs advance |
| Organization key alone changes | Both affected organizations advance for that user; other users remain unchanged |
| User key alone changes | Both affected users advance in that organization; the other organization remains unchanged |
| Organization membership delete/readd | Tombstone remains and increases on each operation, even without a session |
| Mailbox membership changes both keys | Only the exact old/new pairs advance; cross-pairs remain unchanged |
| Mailbox capability update and membership delete/readd | Each operation advances only its single pair, once |
| Mailbox insert, visibility update, organization move, delete | Whole affected organizations still advance, including both organizations on a move |

These fixtures use two organizations and two users. Extra fixtures live inside a transaction rolled back by the shared teardown; the four generation pairs are locked in sorted order before business mutations.

`apps/server/test/be_02/session_expiry_race_test.rb` contains 12 cases:

| Cases | Expected result and durable state |
| --- | --- |
| Touch waits on a session row across idle, absolute, or Auth expiry (3) | `unauthorized`; entire session row unchanged, including idle expiry |
| Touch waits while still valid (1) | `ok`; idle expiry advances from the post-wait time, capped by absolute expiry |
| Switch waits across idle expiry on a session row or generation row (2) | `unauthorized`; context, CSRF, and other session fields remain unchanged |
| Switch waits on a row while still valid (1) | `ok`; context/CSRF rotate and idle expiry uses the post-wait time |
| Refresh publication waits on generation past claim deadline (1) | `unauthorized`; `refresh_uncertain`, old credentials remain unpublished, new credentials have a durable local revocation intent, resolve denies access |
| Refresh publication with a live claim after generation wait (1) | `ok`; new credentials become active, claim clears, authorization succeeds, no revocation intent |
| Entry completion waits on generation past claim or entry deadline (2) | `unauthorized` without `session_created`; created session is revoked, entry becomes uncertain and clears credentials, durable local revocation exists, resolve denies access |
| Entry completion while valid after generation wait (1) | `ok` with `session_created`; active session, completed entry with cleared credentials, authorization succeeds, no revocation intent |

Refresh tests first create a session without membership, then restore membership before claiming refresh. This exercises the actual null-organization bootstrap branch that acquires a generation guard.

## Coordination and cleanup

The expiry cases use the existing separate admin and API PostgreSQL connections. The admin acquires the intended row/generation lock, the API starts the unchanged function with `send_query_params`, and the admin polls `pg_stat_activity` until the API is waiting on a lock owned by the admin backend, checked with `pg_blocking_pids`. Each poll clears the statistics snapshot. Observation is bounded to one second; failure to reach the lock fails the test.

Session-row expiry is assigned only after observing the lock wait, with a known deadline 100 milliseconds ahead. Generation-wait expiry is set to two seconds ahead before starting the call; reaching the generation wait proves the initial checks passed. The API query start must precede the deadline. The only deliberate delay is PostgreSQL `pg_sleep` until that database timestamp, followed by a database-clock assertion; there are no scheduling sleeps. Test-local statement and lock timeouts are eight and six seconds. Nonexpired controls also prove they waited on the intended lock.

An `ensure` block releases the blocker and drains the asynchronous API results before shared fixture cleanup. The current shared helper retains its session-scoped fixture advisory lock, checks `BE02_TASK_DATABASE_NAME`, and rolls back the generation-test transaction before cleaning the base fixture. It was read but not modified by this worker.

## Validation boundary and remaining work

Static inspection covered parameter binding, fixture ownership, exact generation expectations, row/generation wait paths, result draining, and compatibility with the current shared helper. No Ruby command, syntax check, test runner, database connection, Docker command, or SSH command was executed by this worker. No runtime pass, mutation-test result, or measured execution duration is claimed.

The coordinator must run these two files and the existing BE02 suite inside its disposable container database after applying the combined SQL changes. The expiry tests rely on the coordinator-owned wall-clock fixes in `session_status`, `touch_session`, `switch_organization`, `create_session`, `publish_refresh`, and `complete_entry`. Migration/rollback execution and independent adversarial verification remain with the coordinator. HTTP cookie-header behavior is outside these database tests; they assert that late entry publication returns no creation signal and leaves no resolvable session.

The prior schema review remains frozen in `be02-review-db-schema.md` (SHA-256 below). Its original two confirmed defects across 309 reviewed lines remain the historical density of 6.47 defects/KLOC; this implementation handoff does not claim a new review density or close those findings through execution evidence.

## Exact handoff hashes

Line counts are physical file lines, including comments and blanks. The three owned code files total 393 lines; this is an implementation inventory, not independent review coverage.

| File | Lines | SHA-256 |
| --- | ---: | --- |
| `apps/server/db/be02/generations.sql` | 43 | `c3155d5d3f334fde296adfb88825a3f6459dda3dbd606122b320712494499498` |
| `apps/server/test/be_02/session_expiry_race_test.rb` | 230 | `8666614868adc23c6d635e0f79bab4bb0ea09314c4aae79fc2d43ea9eecb450e` |
| `apps/server/test/be_02/authorization_generation_test.rb` | 120 | `8f9340e1759338dc0c98d0eb1b78cdcf05845d76e1a902053ac231bfd12c1647` |
| Frozen `docs/completion/be02-review-db-schema.md` | 106 | `b0f723a0289d9631664deeacbdced70e48fe72cfd5487146d3f4f62c5fb5d125` |

Only the three owned code files and this new handoff report were written. No lifecycle SQL, helper, shared state, frozen review, dependency, or commit was changed by this worker.
