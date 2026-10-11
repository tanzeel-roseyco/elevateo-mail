# BE-01-R1: independent opinion (requested runtime `claude-opus-5-5`)

This is an analytical design opinion on the frozen packet. No code was run, no tests were executed, and Obsidian was not used. API and privilege semantics that need runtime proof are marked **[unverified]**. All proposed tests are **not run**.

## 1. Are the findings substantiated?

| ID | Verdict | Basis |
|---|---|---|
| R1-T1 | **Substantiated, P1** | `tenancy.rb:27` uses `requires_new`. Under an ambient transaction this creates a savepoint. A savepoint release does not end `set_config(...,true)`, which lasts until the outer transaction ends (PG17 SET docs). The marker is cleared at :35 while the claims stay live. |
| R1-T2 | **Substantiated, P2** | `tenancy.rb:21-24` compares only the principal and then yields whatever `connection:` was passed in. |
| R1-T3 | **Substantiated, P1** | Claims change through `raw_connection`, which bypasses query-cache invalidation (pinned 8.1.4 source cited). |
| R1-M1 | **Substantiated, P2 binding-design** | `bootstrap.sql:24` re-grants `elevateo_app_read` on every run, so a migration-lane revoke is silently undone. |
| R1-S1 | **Substantiated** | `compose.yaml:8` (`x-server.env_file`) is inherited by api, worker and migrate. `bootstrap` also loads the whole file at :54. |
| R1-S2 | **Substantiated** | `generate-secrets.rb:42` opens the file with `TRUNC` before writing. A crash leaves an empty or partial file, and a concurrent run is last-writer-wins. |
| R1-E1/E2/E3 | **Substantiated** | `egress-check.sh` lines 18 and 21 treat any non-zero result as denial. Line 13 probes a private IP on another bridge. Lines 7–8 use static names and unconditional cleanup. |
| R1-H1 | **Confirmed as a standards/acceptance gap, not a runtime failure** | The `worker` service (lines 183–190) has no `healthcheck`. The Dockerfile has no `HEALTHCHECK`. `bin/worker` writes a heartbeat file that nothing reads. Its comment says it "verifies its restricted DB login", but the code never connects. That is a comment/behaviour mismatch, not a new defect. |

**Two candidate observations need a packet-refresh decision.** I do not count them as new findings.
- **(a) Lazy transactions.** Rails defers `BEGIN` until the first query that goes through Active Record. I believe `raw_connection` materializes pending transactions in 8.x, but this is **[unverified]**. If it does not, the `set_config` would run in autocommit and be discarded. That fails closed but is broken. The repair below routes the call through the adapter, which removes the question either way. V03 should assert `txid_current_if_assigned()`/`now()` equality, or read back `current_setting`, inside the block.
- **(b) Missing services.** `scripts/dev` calls `seed` and `check` services that do not exist in `compose.yaml`. R1 needs a test service anyway. The repair should add only the test profile and record that gap.

## 2. R1-A: transaction, connection, cache and membership

### Tenancy wrapper (smallest safe design)

```text
with_context(principal, connection:)
  marker = Thread.current[KEY]   # {principal, connection, txn}
  if marker
    reject unless marker.principal == principal
    reject unless marker.connection.equal?(connection)
    reject unless connection.current_transaction.equal?(marker.txn) or marker.txn still open in chain   # [unverified API: open?]
    return yield(connection)
  end
  reject if connection.transaction_open?          # ambient/unrelated txn → error before any SET
  connection.clear_query_cache
  connection.uncached do
    connection.transaction do                      # real outer transaction, not a savepoint
      connection.select_value(sanitized set_config(...,true) with binds)   # via adapter, materializes txn
      Thread.current[KEY] = Marker(principal, connection, connection.current_transaction)
      yield(connection)
    ensure
      Thread.current[KEY] = nil
    end
  end
ensure
  connection.clear_query_cache   # only if this call owned the boundary
```

Why each piece is there:

- **Reject ambient transactions; do not save and restore settings.** Save/restore would need to handle an aborted outer transaction (where `set_config` raises), callbacks that run after inner commit, and savepoints rolled back by the caller. No caller in this foundation needs any of that. The API request path opens no transaction before the wrapper.
- **Legitimate nesting.** Nesting is allowed only for the same thread, principal, connection object and still-open owned transaction. The caller may open savepoints inside the block. Claims are never set inside a savepoint, so rolling one back cannot drop them.
- **Fibers.** `Thread.current[]` is fiber-local. A fiber sharing the thread's leased connection sees no marker, then sees an open transaction and is rejected. That fails safe. Keep the store fiber-local to match it, and add no propagation.
- **Query cache.** `uncached` prevents new entries inside the block. Clearing on entry removes rows cached by earlier unwrapped reads. Clearing on exit (in `ensure`, so it also runs on exception and rollback) removes anything the caller cached around the boundary. `uncached` restores the caller's previous enabled state by itself.
  - The 8.1 `uncached(dirties:)` keyword and pool-level cache store are **[unverified exact signature]**. Pin them against the cited 8.1.4 source.
  - Because nothing is cached inside, nothing authorized can be "restored". This is the property V04 must check.
- **Strongest objection.** `clear_query_cache` on exit also discards the caller's harmless cache entries. That is a performance cost, not a safety issue, and it is acceptable.
- **Simpler alternative.** Disable the query cache globally for the API (`config.active_record.query_cache`/middleware off). That is simpler but removes a guard from future unprotected paths. Keep the block-level design and optionally add the global setting as defence in depth.

### Membership authority under PostgreSQL 17

Since PG16, granting role membership requires `ADMIN OPTION` on that role (or superuser), and `pg_auth_members` records the grantor. `REVOKE` without `GRANTED BY` only removes grants whose grantor is the current role. This is **[unverified against the supabase image]**: specifically, whether `supabase_admin` is the superuser recorded as grantor.

Design:
1. **Bootstrap** keeps creating logins and schemas. It grants narrow migration authority once:
   `GRANT elevateo_app_read TO elevateo_owner WITH ADMIN OPTION, INHERIT FALSE, SET FALSE;`
   It removes the `GRANT elevateo_app_read TO elevateo_api` line. It idempotently revokes only the legacy grant it made itself:
   `REVOKE elevateo_app_read FROM elevateo_api GRANTED BY <bootstrap superuser>`, guarded by a `pg_auth_members` lookup on the grantor.
2. **New additive migration**, running as `elevateo_owner` via the migrator's `SET role`:
   - `up`: `GRANT elevateo_app_read TO elevateo_api` (grantor recorded as `elevateo_owner`).
   - `down`: `REVOKE ... GRANTED BY elevateo_owner`.
   - `down` does not restore the bootstrap grant, preserves rows, and touches nothing in Auth or Storage.
3. **Retained volumes.** Bootstrap then migrate leaves a short window where API has no read access. The local profile fails closed during that window, which is acceptable. No `CREATEROLE` and no superuser for the migrator. Runtime logins still cannot reach owner or migrator.
4. **B01-03 conformance.** This conforms to B01-03 ("bootstrap installs prerequisites; migrations own membership"). The ADMIN-option grant is the narrow migration authority. No refinement of B01-03 is needed.

Failure cases V06 must exercise:
- Rerun bootstrap after a `down`: API must still have no membership.
- The migration fails part way.
- The legacy grantor is something other than expected: fail loudly and do not revoke blindly.

## 3. R1-B: credential isolation, crash-safe generation, worker health

### Secret matrix

Remove `env_file` from `x-server` and from `bootstrap`. Use explicit `${VAR:?}` mappings; the interpolation-only `--env-file` stays.

| Process | Gets |
|---|---|
| db | POSTGRES_PASSWORD |
| bootstrap (tools) | POSTGRES_PASSWORD, MIGRATOR/API/WORKER_DB_PASSWORD |
| auth | POSTGRES_PASSWORD (upstream shared admin password: residual risk), JWT_SECRET |
| rest | POSTGRES_PASSWORD, JWT_SECRET |
| storage | POSTGRES_PASSWORD, JWT_SECRET, ANON_KEY, SERVICE_ROLE_KEY |
| migrate (tools) | MIGRATOR_DB_PASSWORD, SECRET_KEY_BASE |
| api | API_DB_PASSWORD, SECRET_KEY_BASE |
| worker | WORKER_DB_PASSWORD, SECRET_KEY_BASE |
| fixtures (tools, new) | POSTGRES_PASSWORD only; never the test runner |
| test (tools, new) | API_DB_PASSWORD, SECRET_KEY_BASE |

- **Storage credential for API.** The B01-05 Storage adapter does not exist at this base, so API gets **no** `SERVICE_ROLE_KEY` now. Add it in Checkpoint B only together with the adapter.
- **Config validator.** `Config` already looks up only the caller's own role password, so no change to `config.rb` is required.
- **Fixture insertion.** Under FORCE RLS with no INSERT policy, even the owner cannot insert rows. Fixture insertion therefore must use a separately identified privileged tools service. That is invariant 3; state it explicitly.
- **V07 inspection.** Inspect with `docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}'`, piped through a filter that prints only the part before `=`. Do this for api, worker and test, and assert that none of the forbidden key names appear.

### Generator

- **Complete, valid file: no-op.** Parse the file. If every key is present, well-formed (hex lengths, JWT shape), and ANON/SERVICE verify against JWT_SECRET via HMAC, exit 0 without opening the file for writing and without calling `chown`.
- **Existing but incomplete or invalid file: fail with a named key and no value.** Do not regenerate, because the DB-bound passwords may already be baked into retained volumes.
- **Absent file: create it.**
  1. Write `.<name>.<pid>.<rand>.tmp` with mode 0600 in the same directory.
  2. `fsync` the file, then close it.
  3. `File.link(tmp, path)`. The hard link fails atomically with EEXIST, so concurrent runs cannot clobber each other and no separate lock is needed.
  4. `fsync` the directory where supported.
  5. Unlink the temp file in `ensure`.
  6. If the link is unsupported (EPERM/ENOTSUP on a Docker Desktop bind mount; **[unverified]**), fail clearly. Never fall back to a clobbering `rename`.
- **Durability limits.** Stated honestly: on Linux ext4 this gives crash-atomic creation. On Windows hosts through Docker Desktop's file-sharing layer, `fsync` and link semantics are not guaranteed. Record that as residual risk.

### Worker liveness

Add a heartbeat health check:
- The worker writes the timestamp atomically: write `/tmp/worker.alive.tmp`, then `rename`.
- Compose health check:
  `["CMD","ruby","-e","exit((Time.now.to_i - Integer(File.read('/tmp/worker.alive'))) <= 5 ? 0 : 1) rescue exit 1"]`
  with interval 5s, timeout 3s, retries 3, start_period 30s.
- This proves the idle loop is advancing. It does not prove dependency readiness, and it never calls HTTP.
- Negative fixtures:
  - `docker pause` or `kill -STOP` the worker: it must become unhealthy.
  - Stop the worker: it must not be reported running.
- Optionally add `hold=true` to the heartbeat. Do not add a DB connection to the probe.

## 4. R1-C: egress regression that can fail

**Probe without depending on target images.** Run a pinned-Ruby sidecar inside each target's network namespace:
`docker run --rm --network container:<target-id> --label elevateo.egress.run=$RUN $RUBY ruby probe.rb ...`
This removes the missing-`wget` and missing-tool class of failures and tests exactly the target's network stack. It needs no Docker socket inside runtime services and no host networking.

**Resolve targets by label.** Use `com.docker.compose.project=elevateo-local` plus `com.docker.compose.service=<svc>`. Require exactly one match with `State.Running=true`. Anything else is a **SETUP_ERROR**.

**Classify outcomes.** `probe.rb` exits with one of:
- `0` CONNECTED
- `20` NO_ROUTE (ENETUNREACH or EHOSTUNREACH)
- `21` TIMEOUT
- `30` other

Only NO_ROUTE counts as expected denial for an internal network, because an internal network has no default route. TIMEOUT or other results are failures. Before probing outward, each namespace must first pass an in-network success control, such as `db:5432` TCP connect, which proves the probe works there. As an independent structural assertion, also read `/proc/net/route` in the sidecar and require that no default route exists.

**Make the fixture an external route, not a sibling bridge.** Create a unique non-internal fixture network `E`. Run the fixture server on `E` with its port published on `E`'s gateway IP: `-p <E_gw>:<port>:8080`.
- A container on any non-internal bridge reaches that address through its default route, the host, and DNAT. The unrestricted control proves this.
- A container on an `internal: true` network has no route to it.
- This is the same path real Internet egress would take, but nothing leaves the host.
- Linux iptables/DNAT behaviour is **[unverified on Docker Desktop for Windows]**. Run the check on the Linux engine. Record any Windows-host result separately.

**Negative control.** Create two disposable networks with identical options, `N_int` (`--internal`) and `N_open`. Put a sleeper container on each, and run the same `check()` function against both, plus against the real runtime services.
- `check()` against `N_open` must return FAIL. That proves sensitivity to removed confinement.
- Additionally assert that the real `elevateo-local_runtime` network has `Internal=true`.
- This is cheaper and safer than standing up a second full Compose project with new volumes.
- The full Compose override variant (`internal: false` under a unique project name) is optional extra evidence.

**Ownership.**
- Script basics: `set -eu`. Set `RUN=be01egr-<epoch>-<pid>-<rand>`.
- Name collisions: check `docker inspect` on every intended name before creation. A collision aborts without touching the existing resource.
- Recording IDs: record an ID only from successful `create`/`run -d` output.
- Cleanup trap (EXIT, INT, TERM):
  - Iterate the recorded IDs in reverse dependency order: containers first, then networks.
  - Before removing each one, re-verify that its `elevateo.egress.run` label equals `$RUN`.
  - Never remove volumes. Never touch the Compose project.

## 5. Minimal harness and commands (proposed, not run)

Add `test` and `fixtures` services under the `tools` profile, plus the files below:
- `apps/server/test/tenancy_test.rb` (V02–V05: cache-enabled `ActiveRecord::Base.cache {}` A→B and A→unwrapped, pool size 1 and 3)
- `test/role_migration_test.rb` (V06)
- `ops/tests/compose-env-test.sh` (V07)
- `ops/tests/secrets-test.sh` (V08: fault injection through an env hook such as `ELEVATEO_SECRETS_FAULT=before_link`, honoured only in a test container)
- `ops/tests/egress-check.sh` (V09/V10)
- `ops/tests/worker-health.sh` (V11)

Commands:

```
scripts/dev bootstrap && scripts/dev migrate
docker compose --env-file ops/local/.env --profile tools run --rm fixtures
docker compose --env-file ops/local/.env --profile tools run --rm test bin/rails test
sh ops/tests/compose-env-test.sh; sh ops/tests/secrets-test.sh
sh ops/tests/egress-check.sh; sh ops/tests/egress-check.sh --negative-control  # must exit non-zero
sh ops/tests/worker-health.sh
```

V01 base reproductions use a disposable Compose project name at `5a9d83a`, so persistent volumes are never shared with the repair runs.

## 6. Scope split

Use **one task, one branch, one draft PR, and three ordered commits**:
1. Tenancy and membership (A).
2. Secrets, generator and worker health (B).
3. Egress (C).

Separate tasks would add three consultation gates without reducing risk. Escalate commit 1's membership change back to the design gate if the grantor revoke behaves differently from the PG17 semantics above.

The task contains no C++, Qt, graphics or motion work. I propose none, and nothing here justifies it. On the platform boundary: the `.sh` checks need WSL or Git Bash on Windows, and `scripts/dev.ps1` has no egress counterpart. Record the Windows invocation as pending rather than duplicating the logic.

## 7. Acceptance gaps and residual uncertainty

- The exact 8.1.4 signatures for `uncached`, `current_transaction` and lazy-transaction materialization.
- The grantor recorded by the Supabase image's bootstrap superuser.
- Hard-link support on Windows-host bind mounts.
- DNAT-to-gateway behaviour on Docker Desktop.
- The Auth/Storage shared `POSTGRES_PASSWORD`, which is upstream design and out of scope.
- The repair does not make BE-01 pass. A06–A16 remain open.

## Top three recommendations

1. Make the wrapper own a real outer transaction. Reject ambient transactions, bind the marker to the connection and transaction, set claims through the adapter, and clear plus disable the query cache around the block.
2. Move runtime membership to an owner-granted migration using an ADMIN-OPTION grant from bootstrap, and have bootstrap revoke only its own legacy grant. Make the secret generator a create-only, link-based installer that is a no-op on a valid file.
3. Probe egress from sidecars in each target's network namespace, accept only `NO_ROUTE` as denial, use a gateway-published fixture, and require a paired internal/open negative control.

**Hard contradiction:** none with B01-01…08. The `seed`/`check` wrapper gap and the lazy-transaction question need the coordinator's refresh decision.
