# REV850 independent review: Leonie gateway bootstrap packet A

Exact source commit `3fd0dcb835b591e4979541316da1e6a4addb55e0` in `completion-leonie-ops820`; that worktree had advanced to `306258f775e30b04947209292aa8a1c720a44d15`, so every source read used `git show 3fd0dcb:<path>`. Reviewer runtime: Codex `gpt-6-sol`, dispatch `ctx_253a764b2c00`, task `task_3808ed415333`. Static review only; Felix ran no Docker, application test, role fixture, or benchmark.

## Exact bounded coverage

| Source at 3fd0dcb | Lines | Unique LOC | SHA-256 |
| --- | ---: | ---: | --- |
| `ops/ops820/bootstrap-gateway.sql` | 1–36 | 36 | `5c21a289d0980ba773686bb78d0b3e6deaa485d83cdfe6edabcb1135b41d1934` |
| `ops/ops820/gateway-bootstrap-smoke.sql` | 1–17 | 17 | `013bb5e1843e3c98138feca956014451a4af8af92f07813b03e4cc10da06b967` |
| `ops/ops820/gateway-helper-smoke.sql` | 1–33 | 33 | `98638a536bf51274accc5b349262eb07e61eea280bc51689cd761e2f02dff457` |
| `ops/ops820/gateway_negative_createrole.sql` | 1–3 | 3 | `20c6bdfbbd3f5a4ea95bbc70288c96843099a3ce7192f5ea36ec758a3c773072` |
| `ops/ops820/gateway_negative_membership.sql` | 1–4 | 4 | `cd423b3b6ed36532c9a7184870e4a1ebacac0881d2e755fd2281a7e69d438e39` |
| `ops/ops820/source-runner.sh` | 1–59 | 59 | `a14d861116f6517baafd3c0a6327c7907eb7642a0f981c1008644760eaf4ab5e` |

One 152-line source read, under the 180/read and 350 total limits. **1 confirmed static test-oracle defect / 152 unique LOC = 6.58 defects per 1,000 LOC.** Excluded from packet A: `full-runner.sh`, `gateway_runtime_env.py`, config/env generation, Sabine's helper migration, ClamAV files/tests, restore runner, and all later commits. Documentation diff was read as context, not counted as source. Direct API/Auth/private denial runtime and migrator privileges are not established by this packet.

## Finding

**MEDIUM — helper-only post-migration smoke can accept direct private-schema grants.** `bootstrap-gateway.sql` checks `app_auth`, `app_drafts_private` and `app_send_private` schema privileges before migrations (lines 22–27). `source-runner.sh` runs Rails migration at 41–54 and then `gateway-helper-smoke.sql` at 55–58. That post-migration smoke checks `app`/`app_auth` and the dedicated helper (helper-smoke lines 5–32), but does not recheck `app_drafts_private`, `app_send_private`, other private schemas, or direct private function execution. A migration or grant drift that gives the gateway direct private access after bootstrap can therefore pass this helper-only check. This is a verified gap in the smoke oracle, not evidence that such a grant already exists. **Fix:** after migrations enumerate effective schema/table/function grants outside the one `app_attachment_gateway.private_binding` helper and fail on direct private/Auth access; run gateway-login negative calls under Soren's disposable roles. Leonie and root received immediate messages `msg_80db43a83431` and `msg_fc20543ce0d0`.

## Other rubric checks and limitations

The bootstrap requires the named privileged session, creates only the gateway LOGIN if absent, rejects privileged attributes, membership edges, database CREATE and selected schema/table drift, rotates its password and sets a narrow search path. The source runner checks disposable project/path inputs and 64-hex password, uses a pinned image and local network, runs the existing bootstrap prerequisites, creates the gateway before migration, and runs pre/post smoke. These operations have a clear current purpose and no unbounded application loop or repeated hot-path query. No broad role membership or API key grant appears in this packet. The SQL password interpolation is quoted by psql, and the runner checks its exact fixture format; executing the SQL outside this runner was not reviewed as a supported workflow.

The two short negative scripts attempt `CREATEROLE` and API membership, but `source-runner.sh` does not execute them; Leonie's docs assign them to restore rehearsal outside this bounded packet. `gateway-bootstrap-smoke.sql` validates role attributes, membership, database CREATE, app/Auth schema and app/Auth table rights. `gateway-helper-smoke.sql` validates exactly one helper in its dedicated schema, expected owner/SECURITY DEFINER/fixed search path, and no PUBLIC/API/worker execute. This is useful happy and failure coverage but not a runtime result. The NOCREATEROLE migrator role and Sabine helper function remain external dependencies. Null/empty password is rejected by the runner; duplicate role creation is guarded, and password rotation is idempotent. Names and why-comments are clear; formatting belongs to lint. No measured duration, memory or actual privilege outcome is claimed.

**Soren-only fleet request:** on exact integrated SHA, run bootstrap twice, source migrations, post-migration effective privilege enumeration and gateway-login direct private/Auth SELECT/function denial, plus the negative `CREATEROLE` and membership fixtures in their intended restore harness. Record actual role attributes, exact fixture SHA, cleanup and execution result. No live database or credentials.
