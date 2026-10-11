**Runtime identity:** claude-fable-5-1, fresh session, tools disabled, evidence packet only. No tests run.

## 1. Findings: what the supplied source substantiates

- **R1-T1, confirmed.** `tenancy.rb:27` uses `requires_new: true`. Inside an ambient transaction this is a savepoint; `set_config(..., true)` lives until the *outer* transaction ends, while the marker clears at line 35. Failure sequence: caller opens transaction, calls `with_context(A)`, block exits, then runs an unwrapped SELECT on the same connection before commit. RLS still sees A.
- **R1-T2, confirmed.** Lines 21-24 compare only the principal and yield whatever `connection:` was passed. A second pool connection has no transaction and no claims, so the yielded block reads nothing or, worse, reads under stale session state.
- **R1-T3, confirmed mechanism.** `raw_connection.exec_params` is invisible to the ActiveRecord query cache. With the cache enabled (the controller executor enables it), `Org.where(id: x).to_a` under A, then the identical statement under B or unwrapped, returns A's cached rows without reaching PostgreSQL.
- **R1-M1, confirmed.** `bootstrap.sql:24` grants `elevateo_app_read TO elevateo_api` on every run, and the migration's policies and grants target `elevateo_app_read`, so bootstrap and migration jointly own runtime authority. This conflicts with B01-03 as written.
- **R1-S1, confirmed from `compose.yaml` x-server anchor.** `env_file: ./ops/local/.env` is inherited by api, worker and migrate; bootstrap also loads it. Every generated key reaches API and worker.
- **R1-S2, confirmed.** `generate-secrets.rb:42` opens with `TRUNC` before writing; a crash between truncate and close leaves an empty file that `Config` will then reject, and the retained database still expects the old passwords.
- **R1-E1/E2/E3, confirmed.** Lines 18 and 21 treat any `docker exec` failure as denial. The fixture lives on its own bridge, so Docker's inter-bridge isolation, not `internal: true`, produces "unreachable". Static names plus an unconditional trap can remove a foreign container named `be01-egress-server`.
- **R1-H1, confirmed as a gap.** `compose.yaml` worker has no `healthcheck`; the Dockerfile has no `HEALTHCHECK`; `bin/worker` already writes `/tmp/worker.alive` each second, so a probe is cheap.

All ten stand on the packet. None is a hypothesis.

## 2. R1-A smallest repair

**Transaction authority.** At entry, if `connection.transaction_open?` raise `ContextError`. Otherwise open the real transaction with plain `connection.transaction` (no savepoint). Record a frame `{principal, connection.object_id, connection.current_transaction}` in `Thread.current`. Nested call: accept only if principal equals, connection is the same object, and `current_transaction` is the same recorded object and still open; otherwise raise before yielding. This distinguishes legitimate same-principal nesting (same request, same pinned connection) from the two-connection and replaced-transaction cases. Save/restore of previous settings is not worth it: no caller in this foundation nests a different principal legitimately, and restoration would need to handle aborted transactions, after-rollback callbacks and partial failures. Reject instead.

**Cache authority.** Wrap the yield in `connection.uncached`, and call the pool-level query cache clear at entry and in `ensure` at exit. `uncached` restores the caller's prior cache-enabled flag by itself. Exception and rollback paths hit the same `ensure`. A nested call does not clear again (it runs inside the outer uncached block). I have not verified in pinned 8.1.4 source whether the clear method lives on the connection or the pool; the repair author must confirm and the synthesis should freeze the exact call. Do not rely on Rails' write-triggered invalidation.

**Failure case to regress:** cache enabled via the executor, A reads organizations, exception propagates from the block, B reads the same statement. Expect B's rows only and expect `current_setting('app.user_id', true)` to be NULL after the block.

## 3. R1-M1 grantor and migration

PostgreSQL 16+ records a grantor on every role membership and lets a non-superuser revoke only grants it holds ADMIN OPTION over, with the implicit `GRANTED BY` being the current user. I label this semantics **unverified against the exact 17 documentation** but it governs the design. Consequence: a migration running as `elevateo_owner` cannot revoke bootstrap's grant made by `supabase_admin`, so moving membership without touching bootstrap is impossible.

Smallest safe design:

1. **Bootstrap keeps prerequisites only.** Remove line 24. Add `GRANT elevateo_app_read TO elevateo_owner WITH ADMIN OPTION, INHERIT FALSE, SET FALSE` so the owner can administer membership without inheriting read rights. Add a one-time `REVOKE elevateo_app_read FROM elevateo_api` so re-running bootstrap on an initialized volume removes the old superuser-granted edge. No CREATEROLE, no superuser, no BYPASSRLS.
2. **New additive migration** `20261012000002_grant_runtime_read.rb`: `up` executes `GRANT elevateo_app_read TO elevateo_api`; `down` revokes it. Grantor is `elevateo_owner` in both directions, so `down` works.
3. Document that after bootstrap-rerun and before migrate the API has no read access. That window is acceptable locally and is the point: bootstrap can no longer silently restore revoked runtime authority.

This refines B01-03's wording ("bootstrap establishes login/ownership prerequisites") by adding "and narrowly scoped admin option on application group roles". State that refinement explicitly for Astra MAX; it is not a weakening.

Failure case: operator runs bootstrap only. API connects, reads return zero rows, nobody notices. Regression V06 should assert membership state at each stage, not just row counts.

## 4. R1-B service secret matrix

Delete `env_file` from the x-server anchor and from bootstrap. Keep `--env-file ops/local/.env` for Compose interpolation only. Explicit mappings:

| Service | Secrets received |
| --- | --- |
| db | POSTGRES_PASSWORD |
| bootstrap | PGPASSWORD, MIGRATOR/API/WORKER_DB_PASSWORD |
| auth | JWT_SECRET, POSTGRES_PASSWORD (in URL) |
| rest | JWT_SECRET, POSTGRES_PASSWORD |
| storage | ANON_KEY, SERVICE_ROLE_KEY, JWT_SECRET, POSTGRES_PASSWORD |
| api | API_DB_PASSWORD, SECRET_KEY_BASE |
| worker | WORKER_DB_PASSWORD, SECRET_KEY_BASE |
| migrate | MIGRATOR_DB_PASSWORD, SECRET_KEY_BASE |

`Config` already fetches only the password for its own role, so no validator change is needed. The B01-05 Storage credential is not in the base and should not be added now. SECRET_KEY_BASE is Rails signing material shared by three processes; that is a pre-existing choice, not a repair item.

**Generator.** Parse existing file. If every required key is present and non-empty, print "preserved" and exit without opening for write. Otherwise create `.env.tmp` in the same directory with `O_CREAT|O_EXCL`, mode 0600; this doubles as the mutual-exclusion lock. Write, `fsync`, close, chown, then `File.rename` over the target. On any failure, unlink only the tmp file the process created. A stale tmp from an interrupted run makes the next invocation fail clearly rather than rotate secrets. Invocation boundary: the script always runs inside the Linux container, so rename atomicity holds on Linux; on Docker Desktop Windows bind mounts rename works but chown and durability guarantees are weaker. State that in evidence rather than claiming full durability. Cross-container `flock` on bind mounts is unreliable, which is why `O_EXCL` is preferred.

## 5. R1-H1 worker liveness

Add a Compose healthcheck to the worker only, no Dockerfile change: run Ruby, read `/tmp/worker.alive`, exit 1 if older than 10 seconds or unreadable; `interval: 10s`, `timeout: 5s`. The existing heartbeat loop already stops on `SIGSTOP` or a hung process, so a stopped fixture fails within two intervals. It does not claim dependency readiness and never touches the database or creates jobs. Verify `/tmp` is writable as uid 10001 in the image before accepting.

## 6. R1-C egress fixture and negative control

Inter-bridge isolation is the trap. `internal: true` removes the default route and masquerade; a non-internal container can reach the host via its gateway. The discriminating fixture must therefore sit on the host-side route, not on another bridge.

Topology, all task-owned, Docker-only:

1. Create network `egress-<id>` (non-internal) and run the fixture listener on it, publishing its port only to the host's docker bridge gateway address (`-p <docker0-ip>:<port>:8080`). Not LAN-exposed.
2. **Local success control:** `docker exec` api connects to `db:5432`. Proves probe and container are working.
3. **Unrestricted control:** disposable container from the built server image on a fresh non-internal task network connects to `<docker0-ip>:<port>`. Must succeed.
4. **Confined targets:** api, worker, auth, mailpit, storage attempt the same address. Expect connection failure only after the probe executable is verified present. Inspect `NetworkSettings.Networks` to assert the only attachment is the runtime network and that it is internal.
5. **Negative control:** the unrestricted container also runs the same probe wrapper; the wrapper classifies "reachable" as violation. Since step 3 reaches, the check fails. That is the sensitivity proof. Also assert `docker network inspect` shows `Internal: true`; removing it is detectable without a second stack.

Ownership: generate `<id>` per invocation, label every resource, record returned IDs only after successful create, refuse if a same-name resource already exists, and clean in dependency order by ID only. Trap must consult the recorded ID list, never names.

**Uncertainty:** publishing to a specific gateway IP is Linux behaviour; on Docker Desktop Windows the VM holds docker0 and the host-side binding may differ. Linux evidence first; record Windows as pending.

## 7. Acceptance gaps and a smaller alternative

- V04 needs a test that enables the executor query cache; a bare test method does not.
- V06 must assert grantor identity in `pg_auth_members`, not only membership.
- V07 cannot prove absence of a future Storage key; record it as unverified for this slice.
- V09 Windows topology unverified.
- No test exists for Puma threads sharing a connection across requests; add a two-thread pool-size-two test that the frame is per thread and per connection.

Smaller alternative: leave R1-M1 membership in bootstrap and record it as an accepted B01-03 deviation. Tradeoff: bootstrap can silently restore revoked runtime access. I do not recommend it; the grant migration is about ten lines.

## 8. Sequencing

Four commits in one fix PR, in this order: (1) tenancy and tests, (2) compose mappings, generator and worker probe, (3) egress script and fixtures, (4) bootstrap plus grant migration. Commit 4 depends on the B01-03 refinement decision; the first three do not and should not wait. Each commit stays under 200 changed lines. One writer, Devin suspended. Two failed attempts on commit 4 return to the gate.
