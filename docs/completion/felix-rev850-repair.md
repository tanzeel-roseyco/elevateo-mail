# REV850 independent repair rereview: Leonie gateway role packet A

Reviewed Leonie repair commits `424fdb6187504de3edab2213959b1432752dc9fa` and final `a7c3dfff446af24f66ce607aeffd4fded6215e25` in `completion-leonie-ops820`. All numbered source reads used `git show` at the **final** SHA; the worktree had already advanced to `5f52dc83577f16d75850350dfd19257c466c5e83`. Reviewer runtime identity: Codex `gpt-6-sol`, task `task_47e006b2692e`, dispatch `ctx_b9fa8d9e7b35`. Static review only: no Felix Docker, application test, actual role login, benchmark, or live operation.

## Exact source coverage

| Final-SHA source | Lines | Unique LOC | SHA-256 |
| --- | ---: | ---: | --- |
| `ops/ops820/bootstrap-gateway.sql` | 1–38 | 38 | `e5375f64648761769a1f81a81146adeec681d51d561735902603867c435fca35` |
| `ops/ops820/gateway-bootstrap-smoke.sql` | 1–19 | 19 | `a9a133502fb64439fcdbe4d3e8a0db0ee8d996991f82c9673e355e72db9153bd` |
| `ops/ops820/gateway-helper-smoke.sql` | 1–41 | 41 | `e1d5d7b007b3651231e35eb5d4a6d130f36d63d124412f818c95bddd614addae` |
| `ops/ops820/gateway-runtime-smoke.sql` | 1–59 | 59 | `2b497a92d7b231b8963548266068b35fcfa344f3376aeb013bea03429442a436` |
| `ops/ops820/source-runner.sh` | 1–63 | 63 | `2557d74b4220cb104b238ce1f95b4e8759bedd8a6acfd0fec8a30a86bdbee736` |
| `ops/ops820/full-runner.sh` | 1–90 | 90 | `715648a5abec958a5244175ae8d0e970358c9e096baf00f449ec42428b0976e7` |

Reads: 157 and 153 source lines, both at most 180; **310 unique versioned LOC** total, below 350. Excluded: Sabine's helper and migration, Leonie's env/config/ClamAV code, restore-rehearsal and negative fixtures, all later changes. The full runner was bounded context; its external restore wrapper was not reviewed. Formatting is left to lint.

## Disposition and density

**Prior REV850 finding statically closed.** `gateway-helper-smoke.sql` now checks effective USAGE/CREATE over `app`, every `app_*` schema other than the dedicated gateway, `auth`, and `storage` **after migrations** (lines 9–14). It also rejects explicit gateway EXECUTE on other functions in those schemas (34–37) while preserving exactly one dedicated helper, its fixed search path, definer owner, no PUBLIC/API/worker execution, and `elevateo_owner`'s `app_auth.authorize_session` EXECUTE (5–40). `source-runner.sh` executes that smoke after migration and separately runs `gateway-runtime-smoke.sql` with the restricted gateway environment (55–62). This repairs the post-migration oracle gap reported against `3fd0dcb`; no broad schema denial is imposed on the helper's owner by these gateway checks.

**New confirmed static defects: 0 / 310 LOC = 0.00 per 1,000 LOC.** This is a source conclusion, not actual PostgreSQL privilege or helper correctness evidence. Leonie/root were notified of source closure in `msg_4b75a0e71b28` and `msg_bd2700422fd9`.

## Remaining rubric checks and limits

Bootstrap still enforces restricted LOGIN attributes, no membership, no database CREATE, selected direct schema/table denial, and idempotent password rotation; the final repair adds `auth`/`storage` schema checks before migration. The restricted-login probe checks `session_user`/`current_user`, calls the intended helper with missing session evidence and expects zero rows, then requires denial for direct attachment/Auth/draft/send/Supabase Auth/Storage access (runtime-smoke 5–58). The denial blocks catch only SQLSTATE `insufficient_privilege`, so an unexpectedly successful direct call cannot pass through the probe's own exception. No API key, live provider, or unbounded loop appears in these reviewed files. Runner inputs remain guarded by disposable project prefix, absolute paths, 64-hex password and pinned image; no measured cost exists.

The helper's validation and nested Auth behavior remain external to this packet. The source checks that `elevateo_owner` has function EXECUTE, but actual helper success and required schema rights require the Soren role fixture. The full runner itself does not show a gateway post-restore invocation; the excluded restore wrapper may supply it, so no absence finding is asserted. Direct SQL role behavior, fixtures, empty/null/max handling inside the helper, and actual negative outcomes are **NOT_RUN / NOT_REVIEWED** here. No benchmark or memory number is inferred.

**Soren fleet request:** on the final integrated SHA run restricted gateway login with source runner's post-migration helper smoke and runtime negative calls, repeat bootstrap, and inject one direct private schema/function grant in a disposable clone to prove the smoke fails. Verify the helper owner's nested Auth grant still permits the authorized call and report exact SHA, role identities, observed SQLSTATEs, cleanup, and timings only if executed. No production credentials or databases.
