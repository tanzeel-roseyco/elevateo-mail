# BE02 database test repairs

Task `task_9ce93c131d5a`, dispatch `ctx_23b2e1fa65e0`.
Implementation is delivered for D1/D2 and G1 from `be02-review-db-tests.md`.
**All execution checks: NOT RUN.** Root owns isolated Docker execution and independent review.

## Changes and boundaries

- **D1:** The helper requires `BE02_TASK_DATABASE_NAME`, verifies each actual login/database name,
  takes a session-scoped fixture advisory lock, and rejects preexisting sessions, revocation intents,
  pending entries or rate buckets before creating fixtures. Before every `claim_revocations` call,
  it verifies that the lock is still held and rejects foreign session, intent or rate-bucket inputs.
  Worker tests resolve the exact intent ID by cookie, generation, scope and user before claiming,
  then assert the returned ID/claim and stored cookie/user binding. No arbitrary first job or
  constant-ciphertext search determines which job is modified.
- **D2:** Connection initialization closes its local handle on failure; extra-connection collections
  exist before allocation starts. All refresh threads are joined before handles close, including
  assertion failures, and cleanup preserves the original failure while attempting every close.
  Existing fixture rollback order is retained, including rollback of a subclass's admin transaction.
- **G1:** The former two-order logout test is split into three independent cases. They cover login
  commit before the cut, after the cut but before logout commit, and after logout commit. Explicit
  logout transactions expose the missing middle order; assertions cover the initiating session,
  concurrent session, subsequent resolution and exact queued-intent count.
- **G2, bounded subset:** Both real runtime roles now assert denied reads of the two previously
  omitted private tables, `authorization_generations` and `rate_limits`. The full function-grant,
  membership-DML and two-tenant matrix remains outside this patch; no complete G2 claim is made.

No SQL, contracts, frontend, dependencies or runtime files were changed. The thirteen other existing
database cases remain; the new helper suite contains eight regressions and logout suite three cases,
for **24 test methods** in these three test files. This is source inventory, not executed coverage.

## Regression intent

`database_helper_test.rb` checks successful scoped connection cleanup, wrong-login cleanup,
timeout-initialization cleanup, second-connection failure, refresh-thread assertion cleanup,
competing fixture rejection, foreign queued-sentinel rejection without mutation, and lock loss.
The cleanup regressions use actual PG connections; controlled Ruby stubs inject failures around
those handles. The foreign sentinel temporarily relabels an explicitly owned committed fixture,
compares its entire intent row after rejection, and restores ownership in `ensure` for cleanup.

<!-- AIDEV-NOTE: Advisory ownership is cooperative; only the runner can guarantee the task DB has no live worker. -->

## Runner and peer integration

Root confirmed fresh project-only database/volumes and serial suites. The task Compose file now
supplies `BE02_TASK_DATABASE_NAME=postgres`; this report only inspected that root-owned change.
All three connection URLs must target that same isolated database. Application workers and other
fixture processes must remain stopped during these suites: the advisory lock coordinates this
harness and is not an authorization boundary against non-cooperating processes.

Existing `connect`, `invoke`, `create`, `authorize`, fixture variables and admin rollback behavior
are retained. Both database peers were notified of the guard and these optional helper interfaces:

- `with_api_connections(count) { |connections| ... }`
- `parallel_api_calls(count) { |connection, index| ... }`
- `revocation_intent_id(digest: @digest, generation: 0, scope: "local")`
- `assert_claimed_intent(intents, id:, claim:, digest: @digest)`

Expiry/generation dispatch `ctx_c4d798cc036d` retains its tests; refresh/worker dispatch
`ctx_828ebfd0bc79` uses the exact-intent helpers. Root owns runtime integration after the runtime
dispatch completed. No shared state/review ledger edits or commits were made by this worker.

## Exact source inventory for review

| Changed source | Entire-file range | SHA-256 |
| --- | --- | --- |
| `apps/server/test/be_02/database_test_helper.rb` | 1-199 | `c614ed0098555a7404d166f224949a591a4f74d64b0a54cb00b2bb085f140a2e` |
| `apps/server/test/be_02/session_database_test.rb` | 1-176 | `50496a45ab1c564536792e739bed61f78cada9eef10f74de48b0e5d96ea16a3e` |
| `apps/server/test/be_02/database_helper_test.rb` | 1-126 | `63bf13efe6421aa54e1593a1edc91895edc9c248490ea5f2fb0e5c591f200045` |
| `apps/server/test/be_02/session_logout_cut_test.rb` | 1-54 | `451641dbdd67c2841eb3e8dba9188888cb73994154ac0c0a80ada184e1eb28f2` |

Each source can be independently assigned below the 200-line review ceiling; total is 555 lines.
The fifth changed path is this report; its hash is supplied separately to avoid a self-referential hash.
The prior review recorded **2 defects / 296 reviewed lines = 6.76 defects/KLOC**. These repairs have
not received independent review: no new confirmed-defect count or post-repair density is asserted.

## Evidence still required

| Check | Status |
| --- | --- |
| Ruby syntax/lint | NOT RUN |
| Typecheck | NOT RUN |
| Unit/integration/database suites, including the new files | NOT RUN |
| Real pinned Auth schema compatibility and migration rollback/reapply | NOT RUN |
| Independent adversarial review and design review | NOT RUN |

No Docker, SSH or host application tests were run. Root should execute the four source files through
the isolated suite, capture results, review these exact hashes, and reconcile the shared state and
review ledger. Runtime acceptance and resolution of broader coverage gaps remain coordinator work.
