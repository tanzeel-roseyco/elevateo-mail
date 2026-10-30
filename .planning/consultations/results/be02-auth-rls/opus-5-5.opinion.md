# claude-opus-5-5: independent BE02 Auth sessions RLS opinion

<!-- AIDEV-NOTE: Preserve the returned opinion; the linked Astra decision governs adaptations and rejected snippets. -->

This is an independently returned design opinion, not an implementation or application test report. The response below is retained verbatim, including suggestions adapted or rejected in [the Astra MAX synthesis](../../../../docs/completion/be02-auth-rls-decision.md).

- Task/dispatch: `task_c52cc4cbb85c` / `ctx_8d307b627ccb`.
- Requested and observed canonical model: `claude-opus-5-5` (structured `modelUsage`, not self-description).
- Fresh execution/session ID: `17c0cbde-a0af-4dba-951f-54e2ad188dfe`; process exit `0`, result `success`, `is_error=false`.
- Coordinator base: `d2de43b438ad9fb5f003d3e808a6181dbd827632`; application base: `5785eba47f3709debb2815c8d86608f7e62d02f3`. Working-tree source hashes govern the actual packet.
- Common packet SHA-256: `0f05e36cd730420a9d93cc10be75f0bb407fa34041d960b6fda455e17f5b11b3`.
- Individual input SHA-256: `6bd67c51b0d40bb468021bcc7ab1cf567e60c62d17eba39692f80635d0bd94b4`.
- Raw result SHA-256: `f06d7db3a1eb24810418c5dc7931f401d56bc9ad8673fde7e4e068c801d7ced3`.
- Started/finished UTC: `2026-10-12T22:44:35.165277+00:00` / `2026-10-12T22:46:02.055770+00:00`.
- Claude CLI 2.1.296, safe-mode print route, tools disabled, no session persistence, no fallback; existing authorized account only.
- Raw inputs/JSON/stderr remain ignored under `ops/local/be02-auth-rls-ctx_8d307b627ccb/`; no authentication material or raw environment logs are published.
- Limits: supplied frozen source and sanitized numbered failure evidence only; no tools, Docker, SSH, application execution, native checks, Obsidian connection, or access to other opinions.

---

# BE02 Auth sessions RLS compatibility: independent opinion

This is a design opinion only. Nothing below was executed. Every test listed is proposed and NOT RUN.

## 1. Verdict

**Change, then support. The blocker is a prerequisite.**

Adopt the candidate policy, with tightened validation:

```sql
CREATE POLICY elevateo_private_session_select ON auth.sessions
  AS PERMISSIVE FOR SELECT TO elevateo_session_owner USING (true);
```

Put it in `ops/db/bootstrap-auth-grants.sql`, inside a fail-closed, lock-first, create-only-if-absent block. It replaces the current blanket rejection at lines 18-20.

Reject the per-user and per-session GUC predicates for this slice. The R1 null-safe assertion repair is in scope and is also a prerequisite.

The blocker is real. The 017 log fails exactly at the RLS rejection [017:3]. The guard fixture never enables RLS on `auth.sessions` [fixture.sql:5-12]. The only RLS case asserts rejection [auth.sh:32-33]. The 74 passes [014:75] therefore prove nothing about real Auth compatibility. Upstream v2.196.0 enables RLS on sessions deliberately (research note 1). That makes RLS-on the expected state, not drift.

## 2. Recommendation: why `USING (true)` and not a GUC predicate

**Ordering evidence.** Several facades read `auth.sessions` before any verified-user GUC exists:

- `create_session` calls `auth_deadline` at entry.sql:13 and only sets the GUC at :15.
- `session_status` calls `auth_deadline` at helpers.sql:48, before `has_membership` sets the GUC at :31.
- `resolve_session`, `authorize_session`, `touch_session`, `claim_refresh`, `publish_refresh` and `verify_entry` all reach `auth_deadline` through `session_status` or directly. None has set a GUC by then.

A GUC predicate such as `user_id = current_setting('app_auth.verified_user_id')::uuid` would make every one of those reads return zero rows. Zero rows means a NULL deadline, which every login and resolve treats as unauthorized.

Making the predicate work would require reordering identity setup in helpers, entry, read, refresh and pending. The brief forbids those behavior changes without proven necessity. It would also need a per-session GUC that `has_membership` does not set today. That adds a new trust surface.

**It would add no authority anyway.** Ordinary custom GUCs are forgeable by any session [review §PG assumptions; private-grants.sql:62-63]. The real boundary is that only `elevateo_session_owner` holds the four-column SELECT, and that role:

- is NOLOGIN NOINHERIT NOBYPASSRLS [bootstrap.sql:77];
- is reachable only through the migrator's SET path [bootstrap.sql:135-138];
- is never reachable from runtime roles [bootstrap.sql:126-134; membership.sh:59-75].

Runtime reads happen only inside SECURITY DEFINER facades with `search_path = pg_catalog` and qualified names. Those facades are bound by the explicit `id = p_session AND user_id = p_user` filter in `auth_deadline` [helpers.sql:23]. A GUC predicate would duplicate that filter with a weaker input.

**What `USING (true)` does not do.** It does not authenticate caller-supplied `p_user` or `p_auth_session`. A compromised API that holds a valid cookie digest and arbitrary UUIDs is still limited by `session_status` binding the stored row identity [helpers.sql:45]. `create_session` relies on the accepted Rails/Auth attestation boundary [entry.sql:1]. That is unchanged, already accepted residual risk, and the policy neither widens nor narrows it. The extra policy exposure is one bit: a deadline for a guessed `(user, session)` UUID pair. That is no change from today's ACL-only design.

**Affected contract.** BE02-D03 restricted predicate [decisions.md:45]. This is not a new trust boundary: it adds no runtime definer, no new grant and no new columns.

## 3. Proposed implementation

The paths are `ops/db/bootstrap-auth-grants.sql` plus guard tests only. Below is pseudocode and SQL, NOT RUN.

```sql
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '15s';
-- identity check unchanged (lines 5-7)
SELECT pg_advisory_xact_lock(hashtext('elevateo.bootstrap-auth-grants'));
LOCK TABLE auth.sessions IN ACCESS EXCLUSIVE MODE;   -- taken before any validation; no later lock upgrade
```

Why this order:

- The advisory lock serializes a duplicate concurrent bootstrap.
- Taking ACCESS EXCLUSIVE up front matches the lock CREATE POLICY needs [policy.c research note]. That avoids a lock-upgrade deadlock against Auth readers and freezes policy DDL on this table between validation and creation.
- Expect a brief stall of Auth's own queries. A timeout aborts the whole transaction; the operator retries. There is no partial state.

**Validation**, as one DO block after the existing column and type checks:

1. **RLS must be on.** `relrowsecurity IS DISTINCT FROM true` raises "pinned profile regression: Auth sessions RLS disabled". Never ENABLE or DISABLE it. A disabled table means Auth changed or an operator intervened. Either needs investigation, and silently enabling RLS could break vendor access.
2. **Capture flags.** Record `relforcerowsecurity` and `relowner` into variables for the postcheck. Do not assert a specific FORCE value or owner name: no supplied runtime catalog shows them. Do assert:
   - `relowner` is not any `elevateo_*` role;
   - `NOT pg_has_role('elevateo_session_owner', relowner, 'MEMBER')`;
   - the namespace owner is not an `elevateo_*` role.

   Because session_owner is not the table owner, FORCE is irrelevant to it. RLS applies either way.
3. **Same name, wrong shape.** If a policy named `elevateo_private_session_select` exists on `auth.sessions` and any of the following hold, raise and never ALTER, DROP or recreate:

   ```
   polcmd IS DISTINCT FROM 'r'
   OR polpermissive IS DISTINCT FROM true
   OR polroles IS DISTINCT FROM ARRAY['elevateo_session_owner'::regrole::oid]
   OR pg_get_expr(polqual, polrelid) IS DISTINCT FROM 'true'
   OR polwithcheck IS NOT NULL
   ```

   The `IS DISTINCT FROM` comparisons handle NULLs safely. A NULL `polqual` fails this check instead of passing it.
4. **Other applicable policies.** Define applicable as: `polroles` contains 0 (PUBLIC), or contains a role for which `pg_has_role('elevateo_session_owner', r, 'MEMBER')` is true. Use MEMBER rather than USAGE as the conservative superset, since NOINHERIT semantics for policy matching should not be relied on. Then:
   - Block any applicable **restrictive** policy with `polcmd IN ('r','*')`. It would AND-filter rows, turning valid sessions into missing-row denials. That fails closed, but surfaces as a confusing mass logout.
   - Block any applicable **permissive** SELECT/ALL policy other than ours, including PUBLIC. It is harmless to read correctness today, but it is unexplained drift that targets our role.
   - Leave untouched any policy that does not apply to session_owner. These are vendor policies for `supabase_auth_admin`, `authenticated` and similar roles.

   **Justification.** Pinned v2.196.0 appears to enable RLS without policies, so the expected applicable set is empty. Blocking is cheap, and a false block is an investigable bootstrap error rather than a runtime surprise. I would downgrade the permissive-PUBLIC case to a warning only if a real catalog shows a vendor PUBLIC SELECT policy.
5. **Existing checks.** The privilege-drift loop [lines 24-51] stays unchanged.

**Create only if absent**, so a rerun preserves the policy OID:

```sql
IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='auth.sessions'::regclass
               AND polname='elevateo_private_session_select') THEN
  CREATE POLICY ... ;   -- exact text above
END IF;
```

The existing GRANT USAGE and the four-column GRANT stay.

**Postcheck.** Inside the same transaction:

- Re-run checks 3 and 4.
- Assert exactly one matching policy.
- Assert `relrowsecurity`, `relforcerowsecurity`, `relowner` and the namespace owner equal the captured values, using `IS DISTINCT FROM`.
- Run a row-visibility parity probe. The administrator role bypasses RLS:

```sql
SELECT count(*) INTO admin_n FROM auth.sessions;
SET LOCAL ROLE elevateo_session_owner;
SELECT count(*) INTO owner_n FROM (SELECT id FROM auth.sessions) s;  -- column-only read under RLS
RESET ROLE;
IF owner_n IS DISTINCT FROM admin_n THEN RAISE ...; END IF;
```

On a fresh volume this is 0 = 0. It is only meaningful with a seeded row; see acceptance.

**What the lock does not cover.** It does not protect role membership or ACL changes, which are cluster-wide. Superuser changes after commit are out of scope; no continuous protection is claimed. The operating rule is: no concurrent admin migration.

**Temporal behavior is unchanged.** No temporal RLS filter is added. `auth_deadline` keeps `LEAST(created_at+12h, not_after)`, missing-row invalidation and the finite and past `created_at` guards. Reads remain snapshot-bound under REPEATABLE READ: a `not_after` shortened after snapshot S is seen only by the next request [decisions.md:63]. Writers keep their post-lock `clock_timestamp()` checks. No stronger revocation claim follows.

**Lifecycle.** This is administrator phase two, after Auth migrations and before Rails migrations [bootstrap-auth-grants.sql:1].

- The Rails migrator, acting as `elevateo_owner`, cannot create or drop policies on `auth.sessions` because it is not the owner. Add a guard asserting `NOT pg_has_role('elevateo_migrator', relowner, 'USAGE, SET')`.
- `down.sql` stays unchanged.
- Uninstall is a separate administrator script: `DROP POLICY elevateo_private_session_select` plus REVOKE of the four columns and schema USAGE. It is never run automatically.
- Re-running Auth migrations that recreate the table would drop the policy. Bootstrap must rerun, and its validation detects absence.

## 4. R1 repair: null-safe owner assertion

Rewrite only private-grants.sql:43-52:

```sql
DO $$ DECLARE own boolean; foreign_ boolean; nullp boolean; BEGIN
  PERFORM set_config('app_auth.verified_user_id', 'owner-sentinel', true);
  own      := app_auth.has_membership('1111…', 'aaaa…');
  foreign_ := app_auth.has_membership('1111…', 'bbbb…');
  nullp    := app_auth.has_membership(NULL, 'aaaa…');
  IF own IS DISTINCT FROM TRUE OR foreign_ IS DISTINCT FROM FALSE OR nullp IS DISTINCT FROM FALSE
     OR current_setting('app_auth.verified_user_id') IS DISTINCT FROM 'owner-sentinel'
  THEN RAISE EXCEPTION 'owner helper identity or restoration failed'; END IF;
END $$;
```

Evaluating each call into its own variable guarantees that all three probes execute.

Add a regression that fails through the real assertion path. One `run_case` creates a NULL-returning replacement for `has_membership` inside the rolled-back case, then runs the same DO block and expects `owner helper identity or restoration failed`. Do not test a copied expression: the regression must exercise the actual block.

## 5. Strongest objection and the simpler alternative

**Objection.** `USING (true)` makes RLS a no-op for session_owner. A future bug in a definer facade could read any session's four columns, and a GUC predicate would have been defense in depth.

**Answer.** The four columns contain no tokens. The only principal holding the policy has no login and no runtime reachability. Defense in depth via a forgeable-in-principle GUC, set by the same definer code that would contain the bug, buys little and costs a cross-file reorder of the identity setup.

**Simpler alternative.** Plain `CREATE POLICY` with no catalog validation. The tradeoff: a silent restrictive vendor or operator policy would surface as a mass "session expired" at runtime instead of a bootstrap error.

**UX consequence, in my focus area.** If the policy is missing or filtered, every resolve returns `unauthorized`. Users are bounced to sign-in in a loop, while unsaved draft buffers survive. The bootstrap error is far better than that user-visible failure mode. The frontend should still show a distinct `503`/`unauthorized` copy and must not auto-retry login. No motion, C++ or native work is relevant to this task, and I propose none.

## 6. Acceptance checks (proposed, NOT RUN)

1. **Real pinned stack.** Pinned PG 17.6.1.136 with Auth v2.196.0. Run init, Auth migrations, then auth-grants twice. Assert the policy OID is identical across runs, the policy row is unchanged, `relrowsecurity` is true and the other flags and owner are unchanged. Then run Rails migrations and the BE02 Minitest suites.
2. **RLS-on guard fixture.** Add `ENABLE ROW LEVEL SECURITY`, with FORCE variants both on and off, to a new fixture. Seed one row. Assert that session_owner's four-column SELECT returns it and that parity matches.
3. **Drift negatives, each rolling back.**
   - Same-name policies: wrong cmd (ALL/UPDATE), wrong role (PUBLIC, api), expression `false`, an added WITH CHECK, RESTRICTIVE.
   - Extra applicable policies: a PUBLIC restrictive SELECT, a restrictive ALL to session_owner, a permissive PUBLIC SELECT, and a policy granted to a parent role. The parent-role case should fail earlier at the membership graph check.
   - RLS disabled: expect "regression".
   - Each case must assert the expected error text.
4. **Preservation.** A vendor policy for another role survives with an unchanged OID and expression.
5. **Unchanged denials.** Existing auth.sh cases remain, including the fifth column, table SELECT, DML, sequence, grant option and runtime-role cases. Replace `auth-unexpected-rls` with the positive RLS case. Keep `test_roles_cannot_read_private_or_auth_tables_or_execute_helpers`.
6. **Facade lifecycle under real Auth RLS.** Login, create, resolve, authorize, touch and refresh. Missing, foreign-user and expired rows must deny: `not_after` past, `created_at` + 12h, and a future `created_at`. A hostile forged GUC must change no outcome.
7. **Concurrency.** Two concurrent auth-grants runs: one waits on the advisory lock, then both succeed or one aborts cleanly with an unchanged OID. A held Auth row lock beyond lock_timeout produces a clean abort with no partial grant.
8. **R1.** The NULL regression fails the real block, and the happy path passes.
9. **Evidence.** Root records image digests, source hashes, exit codes, counts and cleanup.

## 7. Residual uncertainty

- I have no runtime catalog dump of vendor policies, the FORCE flag or the actual owner name on `auth.sessions`.
- PG17's exact policy role-matching semantics under NOINHERIT are uncertain, which is why I chose MEMBER as the superset.
- I am not certain how `pg_get_expr` renders `true`. Validate it against the real catalog.
- Whether the parity probe reads correctly under concurrent Auth inserts depends on the ACCESS EXCLUSIVE lock being held. It is.

## 8. Dissent and top three cross-task recommendations

**Dissent.** If any reviewer wants the GUC predicate, it should become a separate consulted task that reorders identity setup across all facades. It must not be folded into this repair.

**Top three:**

1. Lock first, validate fail-closed, create only if absent, and postcheck. Never auto-repair.
2. Replace the rejection-asserting guard with a real RLS-on positive and negative matrix. A green guard suite without it is false assurance.
3. Fix R1 with a regression that fails through the real assertion path, and treat every boolean guard as NULL-hostile.

**Hard contradiction.** The current bootstrap rejects the very RLS state the pinned upstream intends. No other contradiction found.
