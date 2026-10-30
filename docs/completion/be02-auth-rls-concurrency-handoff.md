# BE02 Auth RLS concurrency handoff

Status: source frozen for root review and disposable Docker execution; all authored execution checks **NOT_RUN**. This continuation implements the concurrency requirement already accepted in consultation packet `0f05e36cd730420a9d93cc10be75f0bb407fa34041d960b6fda455e17f5b11b3`; it does not change the accepted production policy or timeouts. No Docker, SSH, host application tests, shell/parser checks, new agents, commits, or live activation were performed by this worker.

The worker read `docs/completion/be02-auth-rls-repair.md`, the coordinator's `C:/Users/Tanzeel/Code and projects/Elevateo Mail - Local Completion/docs/completion/be02-auth-rls-decision.md`, applicable project standards/research, actual helpers, runner/service, and AIDEV anchors. The decision document SHA-256 is `dc55258802eaaadb1ab4e2cf8107d3bb76baf74658fe3344e46101d8fda74570`. Root owns independent review, runtime evidence, README/state/ledger synchronization, and release decisions.

## Changed-source manifest

Paths are relative to `C:/Users/Tanzeel/Code and projects/Elevateo Mail - BE02 Codex`. Hashes are SHA-256 of the actual LF source bytes, obtained through read-only file inspection.

| Path | Lines | SHA-256 | Change |
| --- | ---: | --- | --- |
| `ops/tests/be02-guards/auth-rls-concurrency.sh` | 124 | `e837055f0f76f4588e26d1dddd7fa7bffcf5e546b29fcb864faebef730bbc58a` | New entrypoint, environment guards, three schedules, watchdog, EXIT cleanup |
| `ops/tests/be02-guards/auth-rls-concurrency-processes.sh` | 156 | `766c8dd1bbba7e5886e0b5ae14151bd571e2bb97a398d9b10d76edb2d98fcbae` | New private process/session, positive barrier, bounded wait helpers |
| `ops/tests/be02-guards/auth-rls-concurrency-catalog.sh` | 75 | `b9d31ec5d9c6fa5f63ee389aabcf6f9224c4257e58e44f8ed32ecbf5c9f98065` | New private catalog snapshot, preflight, exact fixture cleanup helpers |
| `ops/tests/be02-guards/auth-rls-visibility.sql` | 49 | `073e97ace4f79cd084e67adf1ecb73622ecaabc640fa076186c29731ff9ba9aa` | Coordinator-authorized parentheses around two SQL CASE expressions in one PL/pgSQL IF; assertions retained |
| `ops/tests/be02/run.py` | 154 | `3c465d5364ac709d8891eaccf87fea81c9765c3ca191e2cc5c2dfb8d37234bb6` | Only three added lines: explicit post-grants compose invocation with 120-second timeout |
| `docs/completion/be02-auth-rls-concurrency-handoff.md` | This report | Supplied in completion message to avoid a self-referential hash | Evidence handoff |

The production `ops/db/bootstrap-auth-grants.sql` remains 147 lines, SHA-256 `2f63d116e2b23af69d7abd0452893509231e39658d298a9ad207e75a8a96fcd6`. The probe checks that same hash before and after the schedules and executes this file directly with `psql -f` in each fresh admin connection. It neither copies/rewrites production SQL nor changes its 5-second lock timeout, 15-second statement timeout, role attributes, ownership, policy, or grant boundary.

Other accepted repair bytes remain unchanged: `auth.sh` = `69f66bc0264109f65f31126e97115985e92028eebb8252ef51be1543e454e1ff`; `private-grants.sql` = `d911e107c5aa12be9be315e63d5bd6c4483a78475c2552dafc6c57e2d54a035f`; `run.sh` = `83b948bde7b357466d8b668c86bd1d64e5ee4f6001433c5fd5d0ad551189567d`; `auth-rls-setup.sql` = `d129fd361f2198b714efcbb87ef332c95df3101898c55cf086479d25fa9c91ba`; `auth-rls-runtime-denial.sql` = `6fa43fefc27e3798e6dfacf4fa768034e81fd5b94a83b0cd73c0eda284246322`; `auth-rls-sessions.sql` = `98074b3c694cc5231e9694d76d08abd035bf6abbe075a5aaa4e498b3ea35b2e2`. These filenames are under `ops/tests/be02-guards/`. Prior repair report remains `66979430af83bd4d4fc9922d95d5775acd2602e43042f71a4d3e1403d32fcfbf`.

## Placement and authored assertions

`ops/tests/be02/run.py:103` invokes the existing guards service immediately after actual Auth readiness and successful production grants, before the application image/migration phase:

```text
compose run --rm --no-deps --entrypoint bash guards /workspace/ops/tests/be02-guards/auth-rls-concurrency.sh
```

The existing compose service mounts `ops/db` and `ops/tests/be02-guards` read-only, supplies disposable PG credentials and `BE02_GUARDS_DISPOSABLE=1`, uses tmpfs, and connects through the internal network without published ports. The unchanged compose file SHA-256 is `0489257e5600f16db380e9d5241686e76563cb92b29b8f91768b8e6802284f5c`. Existing runner source hashing includes the new guard helpers automatically. Frozen runtime4 payloads were not changed.

Preflight requires Docker's marker, exact mounted source directory, `db:5432/postgres`, `supabase_admin`, nonempty password without displaying it, no ambient PGOPTIONS/hostaddr/service override, PostgreSQL `170006`, READ COMMITTED, activity tracking, no recovery, Auth migration catalog, upstream session-table owner and RLS enabled, exact accepted policy tuple, and absent Rails/private-session tables. Real Auth provenance additionally rests on root's pinned image inspection/readiness sequence; this probe cannot authenticate image provenance from SQL alone. [Pinned Auth RLS migration](https://raw.githubusercontent.com/supabase/auth/v2.196.0/migrations/20240612123726_enable_rls_update_grants.up.sql).

| ID | Schedule and decisive authored assertions | Execution |
| --- | --- | --- |
| RLS-CONC-01 | Hold ACCESS EXCLUSIVE on `auth.sessions`; start fresh first and second admin processes running the real grants file; observe both concurrently waiting on that relation with the holder in each blocker list; release with ROLLBACK; require both psql exits 0, initial READ COMMITTED/admin identity records, session/lock disappearance, and exact catalog equality | NOT_RUN |
| RLS-CONC-02 | Hold the same lock; positively observe the production script waiting; retain holder until psql exits 3 with exactly one `55P03: canceling statement due to lock timeout`; require 5..12 elapsed seconds and positive proof holder still owns lock; compare catalogs before and after holder ROLLBACK; require both sessions/locks gone | NOT_RUN |
| RLS-CONC-03 | Holder locks, creates one uniquely named extra SELECT policy for the private owner, captures its OID before commit, then reaches explicit marker; another connection confirms policy remains invisible; real grants process must be observed waiting; commit DDL; require psql exit 3 with exactly one `P0001: Auth additional session policy drift: <exact injected name>`; verify fixture tuple/OID and all remaining catalogs; drop only exact fixture and compare again | NOT_RUN |
| RLS-CONC-04 | Every terminal path runs EXIT cleanup; only captured child processes and exact server PID/start/app/database/user identities may be terminated; missing observations, timeouts, unexpected exits, changed fixture identity, cleanup failure, or catalog differences cannot pass | NOT_RUN |
| RLS-VIS-SYNTAX | Re-run existing three-row/four-column visibility checks under active RLS after the CASE-parenthesis repair, followed by existing denied-column/write/runtime-role and removed/expired-session checks | NOT_RUN |

Snapshots compare the complete Auth policy catalog tuples including OIDs, Auth relation owners/RLS/FORCE/ACLs, schema tuple, all Auth column ACLs, and default-privilege tuples. Only the exact injected policy is excluded while intentionally present; its OID, role array, command, permissive flag, false predicate, and absent WITH CHECK are checked separately. No stored session data is copied into evidence. A single accepted-policy row is required by preflight, and unchanged full policy snapshots preserve that row and every unrelated policy.

## Ordering, bounds, and cleanup

Barriers poll fresh control connections and require exact `pg_stat_activity` identities, `pg_locks` relation/mode/granted state, and `pg_blocking_pids` evidence. A holder also must be waiting on ClientRead after `SELECT 'holder-ready';`; idle-in-transaction alone is insufficient because it can occur between DDL statements. Each evidence line records only task labels, PIDs/application names, lock state/blockers, captured start times, SQLSTATE/reason, elapsed time, and a catalog digest. Raw psql logs remain private temporary files and are removed; no password, env dump, or arbitrary SQL text is printed. [Activity snapshots](https://www.postgresql.org/docs/17/monitoring-stats.html), [lock catalog](https://www.postgresql.org/docs/17/view-pg-locks.html), [hard and soft blockers](https://www.postgresql.org/docs/17/functions-info.html).

Bounds are explicit: control psql 4 seconds plus 1-second kill grace; control statements 2 seconds and lock waits 1 second; connection attempts 3 seconds; each observation barrier 3 seconds; child psql 25 seconds plus 2-second kill grace; parent child-completion wait 18 seconds; fixture-holder idle transaction limit 20 seconds; whole-work watchdog 75 seconds; runner 120 seconds including bounded cleanup. Control/holder limits affect their own connections only. The production script receives no timeout override. Polling sleeps merely pace fresh positive observations; they never establish success.

EXIT cleanup first cancels/reaps the watchdog, captures any just-connected named child, rejects changes to previously captured backend identities, terminates only captured child processes/server sessions, and verifies no captured server sessions remain. Process cleanup uses one shared 5-second grace plus at most 1 second per outstanding child (at most three). Builtin `wait` is called only after process-exit observation. Exact fixture cleanup locks the table in a READ COMMITTED transaction before reading the captured OID/tuple; a replacement or mutated fixture fails closed. The final catalog must equal baseline. Only enumerated files/FIFOs inside the unique `/tmp/be02-auth-rls.<token>` directory are removed, followed by that empty directory. SIGKILL/container loss cannot run a shell trap; root's independent disposable-cluster cleanup remains mandatory and an interrupted probe has no PASS evidence.

The two small sourced helpers keep the entrypoint readable and separate process control from catalog ownership; they are not standalone probes. The additional false SELECT policy does not broaden row access and triggers the already accepted drift rule, allowing decisive post-lock catalog visibility to be tested without replacing the production policy or its OID. No production design decision was changed. Resource-constrained hosts that cannot establish both waiters within the unchanged production 5-second limit fail this acceptance probe rather than receive a timing waiver.

## Authorized runtime4 syntax correction

Coordinator message `msg_f7535af5b2a9` authorized this isolated repair after runtime4 stopped in `auth-exact-four-column-read` at `auth-rls-visibility.sql:47`, reporting an unterminated expression near `observed.user_id IS DISTINCT FROM CASE WHEN ...`. Parentheses now delimit both CASE expressions from the enclosing PL/pgSQL IF's THEN. The three expected rows, real four-column values, hostile identity variants, and denial assertions are unchanged. Matching CASE/IF forms were inspected across the seven other accepted repair files; no corresponding edit was needed.

Old visibility SHA-256: `13fecf3856e30f63b7467bb903eac9291e6a648249270d18643fcebc6471af11`. Runtime4 evidence belongs to root at `ops/local/be02-runtime-stage-051855f2c2674850bed861f8a3634902/evidence`, especially `014-privilege-guards.log`; the root reported cleanup and independent absence proof passed. This worker did not rerun or claim validation of that fix.

## Compact independent-review manifest

Every pass below covers at most 200 source lines, and each assignment remains below 400. Independent review is **NOT_RUN**; defect count/density have not been measured and no clean-review claim is made. Root records findings and resolutions in its review ledger.

| Assignment | Separate review passes | Focus |
| --- | --- | --- |
| A: schedules/wiring | `auth-rls-concurrency.sh:1-124`; `ops/tests/be02/run.py:97-109` (13 lines) | Three schedules, untouched-file execution, no false PASS, placement, bounds |
| B: processes | `auth-rls-concurrency-processes.sh:1-156` | PID/start/application ownership, hard/soft waiters, SQLSTATE checks, bounded waits, cleanup failure paths |
| C: catalogs/syntax | `auth-rls-concurrency-catalog.sh:1-75`; `auth-rls-visibility.sql:1-49` | Exact catalog preservation, injected-policy ownership/race, fail-closed preflight, CASE syntax/assertion retention |
| D: design tradeoffs | Read-only `ops/db/bootstrap-auth-grants.sql:1-147`; separate `auth-rls-concurrency.sh:72-124` and `auth-rls-concurrency-catalog.sh:1-75` passes (275 lines total) | Accepted lock-before-catalog behavior, deterministic observation, role/policy/grant invariants, cleanup ownership |

Root must run Docker syntax checks and the full guard/runtime path against these exact hashes, retain sanitized schedule logs and source-hash evidence, and verify task-owned Docker cleanup on success or failure. Fixes must receive new hashes and rerun affected schedules plus the complete acceptance path; an unexecuted or ambiguous result stays NOT_RUN/FAILED. No new check in this handoff currently supports release or live deployment.
