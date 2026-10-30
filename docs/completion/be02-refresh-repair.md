# BE-02 authenticated publication and revocation repair

Task `task_739fc4918d58`, dispatch `ctx_828ebfd0bc79`.
Source authoring is complete for the five assigned paths; execution and independent review are **NOT RUN**.
This report is implementation evidence, not a runtime acceptance result.

## Change and caller evidence

`Sessions#refresh` and `SessionStore#call` issue one publication call and have no implicit publication retries.
Previously, a duplicate successful publication failed its cleared claim comparison and queued revocation of the returned Auth access credential while the local session remained active.

The authenticated claim/generation mismatch branch in `refresh.sql` now marks the locked local session `refresh_uncertain`, stamps revocation time if absent, and retains any existing revocation scope before queuing disposal in the same transaction.
An already `revoked` session stays revoked, including a prior global scope.
The response remains `unauthorized`; callers must authenticate again after this terminal rejection.
Wrong or absent user/Auth-session identity still returns before any session or queue mutation.
Stored access/refresh ciphertext, claim ownership and generation are not republished, reset or retried by the rejection.
The coordinator's final post-lock `clock_timestamp()` publication checks are preserved.

`revocation.sql` changes only two AIDEV comments documenting the existing eighth-lease terminal rule and the acknowledgement guard coupled to ciphertext replacement.
No SQL signature, response contract, helper implementation or retry policy changed.

## Authored regression coverage

All cases below are **NOT RUN**.

| File | Cases and intended assertions |
| --- | --- |
| `refresh_publication_test.rb` | Successful publish followed by duplicate and repeated duplicate: local denial, one disposal intent, no token/generation replacement. |
| `refresh_publication_test.rb` | Wrong/missing user or Auth-session identity with mismatched claim/generation: entire session row unchanged, no intent, original owner can still publish. |
| `refresh_publication_test.rb` | Matching identity with wrong claim; matching identity with wrong generation: terminal denial and genuine late owner cannot resurrect the session. |
| `refresh_publication_test.rb` | An older publication after a newer successful generation closes the current local session without overwriting newer ciphertext. |
| `refresh_publication_test.rb` | Authenticated rejected claim preserves prior global revocation, timestamp and session state. |
| `revocation_worker_test.rb` | Changed ciphertext replaces a claimed intent under the same ID, resets attempts/claim, rejects old success/failure acknowledgements, and permits the new worker to complete. |
| `revocation_worker_test.rb` | Equal ciphertext preserves live worker ownership and completed state. |
| `revocation_worker_test.rb` | Changed ciphertext rearms a completed intent and only its new claim can complete it. |
| `revocation_worker_test.rb` | Eight actual worker claims with fixture-controlled expiry: expired eighth acknowledgements rejected, failed state reached, no ninth claim, equal-ciphertext disposal cannot reset the exhausted budget. |

There are six publication tests and four worker tests.
Tests use the existing API/worker database logins and the helper worker's `revocation_intent_id` and `assert_claimed_intent` APIs, with an explicit fixture generation.
Lease expiry changes only the exact fixture intent; no sleeps or foreign queue selection are used.
The helper requires `BE02_TASK_DATABASE_NAME` to match its three connections and owns queue-isolation guards.
`ops/tests/be02/test-suites.sh` already discovers both files through `test/be_02/*_test.rb`.

## Execution and review handoff

| Check | Status |
| --- | --- |
| Ruby/SQL syntax and migration execution | **NOT RUN** |
| RuboCop lint | **NOT RUN** |
| Steep typecheck | **NOT RUN** |
| New regression suites and existing unit/integration suites | **NOT RUN** |
| Real Auth HTTP and worker integration | **NOT RUN** |
| Adversarial correctness/security review | **NOT RUN** |
| Dedicated design review and Obsidian tradeoff simulation | **NOT RUN** |

The coordinator owns isolated Docker execution and any resulting repairs, independent review, and the shared README/state/review-ledger updates.
One identified source defect was addressed: active local authority surviving authenticated disposal.
Independent review defect count and defect density are **NOT RUN**, not zero.
Suggested bounded review assignments are both SQL files together (190 physical lines), the publication tests (145 lines), and the worker tests (146 lines), each below 200 lines.
The explicit availability cost is reauthentication after duplicate/stale authenticated publication; no replay-success contract or additional token consumption was introduced.

No host application tests, Docker/SSH commands, commits, frontend/contract edits or paid agent/review invocations were performed by this worker.
Shared helper and expiry-race ownership remained with their assigned workers.

## Source fingerprints

SHA-256 values below identify the exact authored source bytes at handoff.
The report's own hash is sent separately through Orca to avoid a self-referential digest.

| Changed path | Physical lines | SHA-256 |
| --- | ---: | --- |
| `apps/server/db/be02/refresh.sql` | 101 | `74355cb47301123afef7b9d9e3981c4a71d1d983fdb7848e9db3dcaafea60ff0` |
| `apps/server/db/be02/revocation.sql` | 89 | `ed02dbff56c5d46acb477192172a0788a5e684509a49f13274d543c7f0fdb834` |
| `apps/server/test/be_02/refresh_publication_test.rb` | 145 | `229c6a1e398e64af64bce4e1aab7d220cd72e5203b4e6988812db5d2e5d366d3` |
| `apps/server/test/be_02/revocation_worker_test.rb` | 146 | `1585696533be1e5228893b5a15c0e994b6cfefcf6c498a8d34ca511c5cfc8f58` |
| `docs/completion/be02-refresh-repair.md` | Report | Sent through Orca with this report path. |
