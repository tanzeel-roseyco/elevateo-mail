# claude-fable-5-1: independent BE02 Auth sessions RLS opinion

<!-- AIDEV-NOTE: Preserve the returned opinion; the linked Astra decision governs adaptations and rejected snippets. -->

This is an independently returned design opinion, not an implementation or application test report. The response below is retained verbatim, including suggestions adapted or rejected in [the Astra MAX synthesis](../../../../docs/completion/be02-auth-rls-decision.md).

- Task/dispatch: `task_c52cc4cbb85c` / `ctx_8d307b627ccb`.
- Requested and observed canonical model: `claude-fable-5-1` (structured `modelUsage`, not self-description).
- Fresh execution/session ID: `0bcd9f5d-2e1e-4356-a174-d329da92098a`; process exit `0`, result `success`, `is_error=false`.
- Coordinator base: `d2de43b438ad9fb5f003d3e808a6181dbd827632`; application base: `5785eba47f3709debb2815c8d86608f7e62d02f3`. Working-tree source hashes govern the actual packet.
- Common packet SHA-256: `0f05e36cd730420a9d93cc10be75f0bb407fa34041d960b6fda455e17f5b11b3`.
- Individual input SHA-256: `f285f86ff4a513e53f11fc3ef3deb3b4749429814a43730e5d4c885f3382a854`.
- Raw result SHA-256: `eed0d8c08bb9c8baf529c283fa49bade3b125e08062f5659a2582a086a204dbc`.
- Started/finished UTC: `2026-10-12T22:44:35.165614+00:00` / `2026-10-12T22:48:00.667443+00:00`.
- Claude CLI 2.1.296, safe-mode print route, tools disabled, no session persistence, no fallback; existing authorized account only.
- Raw inputs/JSON/stderr remain ignored under `ops/local/be02-auth-rls-ctx_8d307b627ccb/`; no authentication material or raw environment logs are published.
- Limits: supplied frozen source and sanitized numbered failure evidence only; no tools, Docker, SSH, application execution, native checks, Obsidian connection, or access to other opinions.

---

I will deliver the single BE02 Auth-sessions RLS design opinion from the frozen packet, with no tools, runtime checks or external actions.

## Verdict and recommendation

**Verdict: change, with one prerequisite blocker.** The named candidate, an owner-only permissive SELECT policy `elevateo_private_session_select` on `auth.sessions` with `USING (true)` for `elevateo_session_owner`, is the correct smallest fix. The blocker is not the policy itself but the evidence gap: the guard fixture creates `auth.sessions` without RLS, so the 74 passing guards (evidence E1, 014-privilege-guards.log:75) never exercised the condition that failed on the real stack (E2, 017-auth-grants.log:3). The fixture must enable RLS before any guard pass counts as Auth compatibility proof.

**Demonstrated facts.** The current administrator phase raises on any `relrowsecurity=true` (E3, `ops/db/bootstrap-auth-grants.sql:18-20`). The pinned Auth tag enables RLS on sessions by migration (E4, research note on 20240612123726). `elevateo_session_owner` is NOLOGIN, NOINHERIT, NOBYPASSRLS and is not table owner by the bootstrap's own prerequisite check (E3, lines 8-12; E5, `ops/db/bootstrap.sql:77`). Every read of `auth.sessions` goes through `app_auth.auth_deadline` (E6, `apps/server/db/be02/helpers.sql:20-26`), which is plain SQL STABLE, not SECURITY DEFINER, and is reached only from SECURITY DEFINER facades owned by `elevateo_session_owner` because the migration creates the parts under `SET LOCAL ROLE elevateo_session_owner` (E7, `20261013000001_create_private_sessions.rb:27-29`) and the allowlist grants API/worker nothing but facades (E8, `apps/server/db/be02/grants.sql:14-38`). So the `current_user` during the `auth.sessions` read is always `elevateo_session_owner`, and RLS evaluates policies by `current_user`, not `session_user`. With RLS on and no applicable policy, PostgreSQL returns zero rows to a non-owner non-bypass role, so `auth_deadline` yields NULL and every facade returns `unauthorized`. That is fail-closed but makes the product unusable; it is a correctness regression, not a security hole.

**Why `USING (true)` rather than a GUC predicate.** The accepted D03 boundary already granted four-column SELECT over the whole table with no row filter in mind (E9, `decisions.md:45`). The policy restores exactly that accepted scope; it does not widen it. The row restriction that matters is the function argument predicate `s.id = p_session AND s.user_id = p_user` in E6, bound by the facade ACL and Rails attestation. A per-user or per-session GUC predicate would fail on the current identity ordering: `create_session` calls `auth_deadline` at E10 (`entry.sql:13`) before `set_config` at line 15, and `session_status` calls `auth_deadline` at E6 line 48 before `has_membership` sets the GUC at line 31. Every create, resolve, authorize and refresh path would return `unauthorized` until helper ordering changed, which the brief forbids without demonstrated necessity. A per-session GUC would also need a second custom parameter and a second parameter ACL grant of the kind at E5 lines 55-74, a new trust surface requiring a renewed gate. Finally, a GUC predicate buys nothing adversarially: API SQL can set any custom GUC (E11, `private-grants.sql:62-66` proves this is allowed), but API SQL cannot reach `auth.sessions` at all without the facade. A compromised API that calls `create_session` with an attacker-chosen `p_user` and `p_auth_session` is equally successful under either policy; its only obstacle is guessing a live 122-bit session UUID for that user. The accepted attestation boundary is what stops that, and neither policy shape changes it.

**Proposed admin-phase change, bounded to `bootstrap-auth-grants.sql`.** Replace lines 18-20 with: lock, read, validate, create-if-absent, postcheck, all inside the existing transaction.

```sql
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
LOCK TABLE auth.sessions IN ACCESS EXCLUSIVE MODE;
DO $$
DECLARE n int; qual text;
BEGIN
  IF (SELECT relrowsecurity FROM pg_class WHERE oid = 'auth.sessions'::regclass)
       IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'pinned Auth enables sessions RLS; disabled RLS is a regression, not a bypass';
  END IF;
  IF (SELECT relowner = 'elevateo_session_owner'::regrole FROM pg_class
       WHERE oid = 'auth.sessions'::regclass) IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'private owner must not own auth.sessions';
  END IF;
  -- Any other policy that can apply to our role, permissive or restrictive, blocks.
  SELECT count(*) INTO n FROM pg_policy p
    WHERE p.polrelid = 'auth.sessions'::regclass
      AND p.polname <> 'elevateo_private_session_select'
      AND EXISTS (SELECT 1 FROM unnest(p.polroles) r
                  WHERE r = 0 OR pg_has_role('elevateo_session_owner', r, 'USAGE'));
  IF n IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'foreign policy applicable to private owner on auth.sessions; investigate';
  END IF;
  SELECT count(*) INTO n FROM pg_policy
    WHERE polrelid = 'auth.sessions'::regclass AND polname = 'elevateo_private_session_select';
  IF n = 0 THEN
    CREATE POLICY elevateo_private_session_select ON auth.sessions
      AS PERMISSIVE FOR SELECT TO elevateo_session_owner USING (true);
  ELSIF n IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'duplicate private policy rows';
  END IF;
  -- Postcheck: exact shape; same-name drift is never repaired.
  SELECT count(*) INTO n FROM pg_policy p
    WHERE p.polrelid = 'auth.sessions'::regclass
      AND p.polname = 'elevateo_private_session_select'
      AND p.polcmd = 'r' AND p.polpermissive
      AND p.polroles = ARRAY['elevateo_session_owner'::regrole::oid]
      AND pg_get_expr(p.polqual, p.polrelid) IS NOT DISTINCT FROM 'true'
      AND p.polwithcheck IS NULL;
  IF n IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'private session policy shape mismatch; no auto-repair';
  END IF;
END $$;
```

The idempotent rerun takes the same lock, finds `n = 1`, skips CREATE and passes the postcheck; the policy OID is never dropped or recreated. Two concurrent bootstraps serialize on the lock; the second sees the committed policy and no-ops, or aborts cleanly on `lock_timeout` with nothing partial. CREATE POLICY itself takes AccessExclusiveLock (E12, policy.c research note), so taking the lock first merely moves it ahead of validation and closes the read-then-create TOCTOU on this table. Unrelated vendor policies are untouched because the block issues no DROP and a policy `TO` one specific role has no effect on any other role's row visibility. Role-level drift such as `ALTER ROLE ... BYPASSRLS` or a new membership edge is cluster-wide and not covered by a table lock; the transaction already rechecks role attributes at entry (E3 lines 8-12), and the postcheck should repeat the `rolbypassrls` and `pg_has_role` assertions from E5 lines 126-140 at its end so both halves see one catalog snapshot. No continuous protection against a superuser is claimed.

**Why block on any applicable extra policy rather than only restrictive ones.** A restrictive policy would silently convert every login to `unauthorized`, an availability failure that looks like security. An extra permissive policy to PUBLIC or to our role indicates unknown administrative intent. Both have origins needing investigation, consistent with the existing bootstrap rule never to erase grants of unknown origin (E3 line 23). Policies naming only other roles, including whatever `supabase_auth_admin` or `authenticated` policies Auth may install, pass untouched and should be snapshot-compared before and after for preservation evidence.

**R1 repair.** In `private-grants.sql:45-51` compare the positive call with `IS DISTINCT FROM TRUE` and each negative with `IS DISTINCT FROM FALSE`, keeping the sentinel comparison. `EXISTS` cannot return NULL today, so R1 is latent, but the assertion must still fail on NULL. For the intentional NULL regression that exercises the real assertion path: inside a SAVEPOINT, `CREATE OR REPLACE FUNCTION app_auth.has_membership(uuid, uuid) RETURNS boolean LANGUAGE sql AS 'SELECT NULL::boolean'`, run the identical assertion block expecting it to raise, catch the exception and fail if none fires, then `ROLLBACK TO SAVEPOINT` and assert the real function's `prosrc` hash equals its pre-savepoint value. The stub exists only while the current role is `elevateo_session_owner` and never reaches the facade calls at line 72 onward.

## Objections, failure sequences and alternative

**Strongest objection: the lock contends with live Auth.** Unlike the guard runner, which runs before consumers (E13, `run.sh:2`), the real sequence has GoTrue already started and holding its migrations complete; it reads and writes `auth.sessions` as `supabase_auth_admin` during token refresh. ACCESS EXCLUSIVE blocks those for the transaction's duration, and a long-running Auth statement blocks the bootstrap until `lock_timeout`. Failure sequence: Auth refresh holds a row lock, bootstrap waits 5 s, aborts; operator reruns while a second operator also reruns; both serialize correctly, but if one operator instead disables RLS "to get past it", every later facade read widens to the owner's full table scope with no policy at all. Regression check: a guard case that runs `ALTER TABLE auth.sessions DISABLE ROW LEVEL SECURITY` in the fixture and expects the new regression error, replacing the current `auth-unexpected-rls` case (E14, `auth.sh:32-33`), plus a contention test where an admin session holds `SELECT ... FOR UPDATE` on a fixture row while bootstrap runs and must fail with `lock_timeout`, not hang or commit partially.

**Second objection: the guard fixture is the real defect.** `fixture.sql:5-8` must add `ALTER TABLE auth.sessions ENABLE ROW LEVEL SECURITY` so `auth-grants-fresh`, `auth-grants-idempotent`, `auth-exact-four-column-read` and the `named-default-acl-boundary` facade calls at E11 lines 72-90 run under RLS. The positive row check belongs in `auth.sh:38-54`: `SELECT count(*) FROM auth.sessions` as `elevateo_session_owner` must be `IS DISTINCT FROM 1` to raise, and `private_token` must still be denied. Do not FORCE RLS in the fixture unless the pinned migration is shown to do so; the supplied evidence does not establish it.

**Simpler alternative and its tradeoff.** Grant the policy without lock, read or postcheck, relying on `CREATE POLICY` failing on a duplicate name. Cheaper, but a same-name policy with a wrong command, `PUBLIC` role or restrictive flag would be accepted as idempotent success, and the lifecycle check in E3 would then pass while every login fails or over-reads. The thirty extra lines are the price of fail-closed validation.

**Temporal semantics unchanged.** No `not_after` or `created_at + 12h` filter belongs in the policy. `auth_deadline` already computes both, `session_status` compares against a post-lock `clock_timestamp()` in writers (E15, `read.sql:36-39`), and READ COMMITTED versus repeatable-read snapshot limits are documented in D05. The policy adds no revocation claim; an already-established repeatable-read snapshot still retains pre-revocation rows (E16, research note on transaction isolation), and nothing here promises post-HTTP atomicity.

**Lifecycle.** The Rails migration and `down.sql` correctly never touch Auth; `elevateo_owner` cannot create or drop policies on a table it does not own, so Rails gains no Auth policy DDL. Teardown is a separate supabase_admin script in dependency order: `DROP POLICY IF EXISTS elevateo_private_session_select ON auth.sessions`, then `REVOKE` the four-column grant and schema USAGE, then any role drop. `pg_shdepend` records the role in `polroles`, so dropping `elevateo_session_owner` before the policy fails; document that order rather than discover it.

## Acceptance checks, uncertainty and cross-task notes

**Proposed evidence, all NOT RUN, ordered so each gate feeds the next:**

1. Fixture with RLS enabled; guard suite passes with the flipped `auth-rls-disabled` regression and positive one-row read; `private-grants.sql` facade calls succeed under RLS; R1 NULL regression raises and the real function hash is restored.
2. Wrong-shape variants, each expected to raise and roll back: same name with `FOR ALL`, `TO PUBLIC`, `AS RESTRICTIVE`, `USING (false)`, a `WITH CHECK` clause, an extra restrictive policy to PUBLIC, an extra permissive policy to a role `elevateo_session_owner` belongs to, a disabled-RLS table, and `elevateo_session_owner` as table owner. Unrelated policy to another role: preserved and unchanged in snapshot comparison.
3. Real pinned PG17.6 plus Auth v2.196.0 init, Auth migrations, bootstrap and auth-grants run twice with identical policy OID and `pg_policy` row before and after, then Rails migration and the existing `be_02` tests, where `test_roles_cannot_read_private_or_auth_tables_or_execute_helpers` (E17, `session_database_test.rb:7-22`) and the `:auth` expiry race (E18, `session_expiry_race_test.rb:19-31`) now exercise the real RLS-on table.
4. Fifth-column, table SELECT, DML, sequence, grant-option and runtime-role denials unchanged from `auth.sh`; role graph and PUBLIC default-ACL invariants unchanged from `membership.sh` and `grants.sql`.
5. Lock contention and concurrent rerun as above; a hostile `set_config('app_auth.verified_user_id', ...)` from API SQL still cannot read `auth.sessions` or reach the owner role.

**Uncertainty.** The actual runtime owner of `auth.sessions` and whether Auth installs its own policies or FORCE are not in the supplied logs; the predicates above assert only what the design requires and must be confirmed on the real catalog. Whether GoTrue tolerates a 5-second exclusive lock during refresh is untested. The `auth-exact-four-column-read` case currently revokes and re-grants within one transaction; under RLS the ordering of GRANT and CREATE POLICY in the same transaction is expected to be independent, but that is a hypothesis to confirm in gate 1.

**Orchestration and boundary notes for this packet.** The compose stack publishes no host ports, uses an internal network, disables Mailpit relay and points Auth SMTP only at Mailpit (E19, `compose.be02-test.yaml:112-155,209-211`), so no hidden send path is introduced by this change. All passwords enter through required environment variables and no secret values appear in the packet. The override naming Codex as implementer is consistent with the orchestration file; the fresh three-opinion gate plus actual Astra MAX synthesis precedes implementation, and root alone runs Docker, so the dependency order is feasible. No native IPC, agent ingestion or model-authentication claim is affected by this SQL slice.

**Top three cross-task recommendations.** First, make the fixture mirror the pinned catalog before trusting any guard count; a passing suite against a weaker fixture is the pattern that produced this failure. Second, keep every Auth-touching operation in the supabase_admin phase with lock, validate, create, postcheck, and treat drift as a stop, never auto-repair. Third, state lock scope honestly: table locks protect policies, not roles, and no bootstrap protects against a superuser.

**Hard contradiction.** The packet assumes "safe operational scope with no concurrent admin migration," but the real ordering requires Auth to have migrated and therefore to be running and refreshing sessions while the bootstrap takes an exclusive lock on its table. That is a live consumer, not a quiesced one, and the operational runbook must either stop Auth for the seconds the phase runs or accept bounded `lock_timeout` retries as the designed outcome.
