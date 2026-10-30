# claude-fable-5: independent BE02 Auth sessions RLS opinion

<!-- AIDEV-NOTE: Preserve the returned opinion; the linked Astra decision governs adaptations and rejected snippets. -->

This is an independently returned design opinion, not an implementation or application test report. The response below is retained verbatim, including suggestions adapted or rejected in [the Astra MAX synthesis](../../../../docs/completion/be02-auth-rls-decision.md).

- Task/dispatch: `task_c52cc4cbb85c` / `ctx_8d307b627ccb`.
- Requested and observed canonical model: `claude-fable-5` (structured `modelUsage`, not self-description).
- Fresh execution/session ID: `df91151b-af57-4ded-96f6-9cdce854725d`; process exit `0`, result `success`, `is_error=false`.
- Coordinator base: `d2de43b438ad9fb5f003d3e808a6181dbd827632`; application base: `5785eba47f3709debb2815c8d86608f7e62d02f3`. Working-tree source hashes govern the actual packet.
- Common packet SHA-256: `0f05e36cd730420a9d93cc10be75f0bb407fa34041d960b6fda455e17f5b11b3`.
- Individual input SHA-256: `dc5f4575a126172f3fdb6271f768a2c5af07d770958fc75c2446f480d1019b68`.
- Raw result SHA-256: `c5806a54b9270a27ba206d2fcc9fb9c67982be65ca0d3d581be3c1cea999e964`.
- Started/finished UTC: `2026-10-12T22:44:35.164949+00:00` / `2026-10-12T22:47:06.879513+00:00`.
- Claude CLI 2.1.296, safe-mode print route, tools disabled, no session persistence, no fallback; existing authorized account only.
- Raw inputs/JSON/stderr remain ignored under `ops/local/be02-auth-rls-ctx_8d307b627ccb/`; no authentication material or raw environment logs are published.
- Limits: supplied frozen source and sanitized numbered failure evidence only; no tools, Docker, SSH, application execution, native checks, Obsidian connection, or access to other opinions.

---

# BE02 consultation opinion — Auth sessions RLS compatibility (task_c52cc4cbb85c)

Runtime note: this session runs as `claude-fable-5`, matching the requested runtime; the coordinator records structured identity separately. Tools were not used; nothing below was executed. Obsidian is unavailable; all tradeoff scenarios are analytical.

**Evidence index used below:**
E1 `ops/db/bootstrap-auth-grants.sql:8-21,53-60`; E2 `ops/db/bootstrap.sql:55-79,126-140`; E3 `apps/server/db/be02/helpers.sql:20-56` (`auth_deadline`, `session_status`); E4 `apps/server/db/be02/entry.sql:7-15` (create_session calls `auth_deadline` at line 13 before `set_config` at 15); E5 `apps/server/db/be02/read.sql:2-29`; E6 `apps/server/db/be02/refresh.sql:9-11,51-52`; E7 `ops/tests/be02-guards/fixture.sql:5-14` (fixture `auth.sessions` has no RLS); E8 `ops/tests/be02-guards/auth.sh:32-33,38-58`; E9 `ops/tests/be02-guards/private-grants.sql:43-51`; E10 `docs/completion/review-be02-private-parameter.md` finding R1; E11 evidence logs `014-privilege-guards.log` (74 passes, no RLS fixture) and `017-auth-grants.log` (rejection at the RLS guard); E12 packet research notes (Auth v2.196.0 migration enabling sessions RLS; PG17 CREATE POLICY/row-security semantics; `policy.c` AccessExclusiveLock); E13 `apps/server/db/be02/grants.sql:3-61`; E14 `ops/tests/be02-guards/run.sh`.

## 1. Verdict

**Change, with one prerequisite blocker.** Accept the named candidate — `CREATE POLICY elevateo_private_session_select ON auth.sessions AS PERMISSIVE FOR SELECT TO elevateo_session_owner USING (true)` — as the smallest secure policy, created and validated inside `bootstrap-auth-grants.sql` in place of the current flat rejection (E1:18-20). Reject per-user/per-session GUC predicates. The blocker is that today's guard evidence is not RLS compatibility proof: the fixture never enables sessions RLS (E7, E11), and the grants phase rejects the pinned-real condition (`relrowsecurity=true`, E12, E11-017). Until the fixture mirrors the pinned Auth state and the grants script passes against it with a positive non-bypass row read, no A-slice acceptance claim about Auth compatibility is valid.

## 2. Recommendation, rationale and design

### 2.1 Why owner-only `USING (true)` and not a GUC predicate

The only code path reading `auth.sessions` is `app_auth.auth_deadline(p_user, p_session)` (E3:20-26), executing as `elevateo_session_owner` via SECURITY DEFINER entrypoints, already restricted to the four-column SELECT grant (E1:54). Row filtering is done by the function's own bound predicate (`id = p_session AND user_id = p_user`) on arguments attested by the trusted Rails/Auth boundary. The policy's only legitimate job is to make RLS pass for that one NOLOGIN, NOBYPASSRLS owner role; it is not the identity boundary.

A GUC predicate (e.g. `USING (user_id = NULLIF(current_setting('app_auth.verified_user_id', true),'')::uuid)`) fails on two grounds:

1. **Call ordering.** `create_session` calls `auth_deadline` (E4:13) *before* setting the verified-user GUC (E4:15); `session_status` likewise calls `auth_deadline` (E3:48) before `has_membership` establishes identity (E3:50), and `resolve/authorize/claim_refresh` enter `session_status` with no GUC set (E5, E6). A GUC-filtered policy would return NULL deadlines on every legitimate first call, i.e., deny all sessions, unless the reviewed entry/read/refresh code is reordered — outside the bounded mandate ("keep helpers/entry/read/refresh/grants behavior unchanged").
2. **False security.** Ordinary custom GUCs are PGC_USERSET; the parameter ACL in bootstrap (E2:55-74) gates only function `SET` clauses, not session-level `set_config`, as the private-parameter review itself establishes (E10 context). Compromised API SQL can set any GUC value. The real authority is that `elevateo_api`/`elevateo_worker` have **no** SELECT on `auth.sessions` at all (E1:40-42 drift guard), cannot SET ROLE to the owner (E2:126-140), and can reach the data only through the enumerated facade (E13). A GUC predicate would add review surface implying a per-user guarantee it cannot deliver. `USING (true)` is honest: it says "this role, via these functions, may read these four columns of any row," which is exactly the accepted D03 boundary.

Dissent preserved: a per-session predicate *would* add defense if a future definer function on this owner forgot its own binding predicate. I weight that below the cost of misleading semantics plus mandatory code reordering; the grants allowlist plus guard suite is the right place to catch such a function.

### 2.2 Bootstrap integration (exact proposed shape, NOT RUN)

Replace E1:18-20 with, inside the existing single transaction:

```sql
SET LOCAL lock_timeout = '5s';
LOCK TABLE auth.sessions IN ACCESS EXCLUSIVE MODE;  -- validate/create under one lock; policy DDL itself takes AEL (E12)

DO $$
DECLARE pol pg_policy%ROWTYPE;
BEGIN
  IF (SELECT relrowsecurity FROM pg_class WHERE oid='auth.sessions'::regclass)
       IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'auth.sessions RLS disabled: pinned Auth v2.196.0 enables it; profile regression, investigate — do not enable here';
  END IF;
  SELECT * INTO pol FROM pg_policy
    WHERE polrelid='auth.sessions'::regclass AND polname='elevateo_private_session_select';
  IF FOUND THEN
    IF pol.polcmd IS DISTINCT FROM 'r'
      OR pol.polpermissive IS DISTINCT FROM TRUE
      OR pol.polroles IS DISTINCT FROM ARRAY['elevateo_session_owner'::regrole::oid]
      OR pg_get_expr(pol.polqual, pol.polrelid) IS DISTINCT FROM 'true'
      OR pol.polwithcheck IS NOT NULL
    THEN RAISE EXCEPTION 'same-name policy drift; no auto-repair'; END IF;
  ELSE
    CREATE POLICY elevateo_private_session_select ON auth.sessions
      AS PERMISSIVE FOR SELECT TO elevateo_session_owner USING (true);
  END IF;
  -- Fail-closed extra-policy scan: block anything else applicable to our role or PUBLIC.
  IF EXISTS (SELECT 1 FROM pg_policy p
    WHERE p.polrelid='auth.sessions'::regclass
      AND p.polname <> 'elevateo_private_session_select'
      AND (p.polroles = ARRAY[0::oid]  -- PUBLIC
        OR EXISTS (SELECT 1 FROM unnest(p.polroles) r
             WHERE pg_has_role('elevateo_session_owner', r, 'MEMBER')))
      AND (NOT p.polpermissive OR p.polcmd IN ('r','*')))
  THEN RAISE EXCEPTION 'extra policy applicable to private owner; investigate'; END IF;
END $$;
```

Design decisions inside that block:

- **`relrowsecurity=false` is a regression, not a repair target.** The pinned Auth migration enables it (E12); false means wrong image or migration drift. Silently `ENABLE`-ing would hide the drift; silently proceeding without a policy check would pass today and break on the real image. Fail with a diagnostic naming the pinned expectation.
- **NULL cannot satisfy anything**: every comparison is `IS DISTINCT FROM`, and the drift scan is existence-based, per the R1 lesson (E10).
- **Idempotency preserves the policy OID**: rerun finds the identical policy and validates in place; there is no DROP/CREATE path, so no auto-repair drift and no window where RLS-enabled-with-no-policy denies a concurrent reader. Record the OID in evidence before/after the second run.
- **Extra-policy disposition (justified):** block *restrictive* SELECT/ALL policies applicable to our role (they would AND-away rows and silently break `auth_deadline` — fail-closed as an availability outage, but an undiagnosed one) and block *additional permissive* policies applicable to our role or PUBLIC (over-grant signal). Preserve, untouched and unflagged, vendor policies scoped to other roles (`supabase_auth_admin` etc.): asserting zero other policies would break on routine Auth upgrades, which is the wrong maintenance posture. Do not DROP anything not ours.
- **Ownership/flags:** assert the script performs no `ALTER TABLE ... OWNER`, no FORCE toggle; postcheck that `relrowsecurity`, `relforcerowsecurity`, table owner and schema owner equal their pre-block captured values (capture, don't assert a specific owner name — the supplied logs contain no runtime owner evidence, so inventing `supabase_auth_admin` as a hard assertion is exactly the fixture-vs-reality trap that produced this task). The existing drift loop (E1:24-51) already guarantees our roles own nothing in `auth`.
- **Concurrency scope:** the ACCESS EXCLUSIVE lock closes the read-validate-create TOCTOU and serializes duplicate concurrent bootstraps (second blocks, then validates the now-present policy). It does **not** protect role memberships, parameter ACLs, or grants, which are cluster-wide; the honest operational claim is "safe given the already-stated administrator-exclusive bootstrap window, no concurrent admin migration." No protection against a concurrent superuser is claimed. `lock_timeout` plus `ON_ERROR_STOP` makes lock contention a visible failure, and single-table/single-lock ordering avoids self-inflicted deadlock.

Rails migrations run as `elevateo_migrator`→`elevateo_owner`, which owns neither `auth.sessions` nor any auth-schema object (E1:24-51, E2), so they cannot perform Auth policy DDL — the separation holds without new grants. The migration-level policies on `app.*` (`20261013000001`) are unaffected.

### 2.3 Semantics preserved

`USING (true)` returns the full table to the owner's snapshot; `auth_deadline`'s own predicate still yields NULL for missing/foreign rows → `session_status` returns `unauthorized` (E3:49), preserving missing-row invalidation, `not_after`, and the `created_at + 12h` LEAST bound. Deliberately **no temporal filter in the policy**: writers sample `clock_timestamp()` after their final lock wait (E5:38, E4:33, E6:67) and a policy-time `now()` filter would evaluate at snapshot/plan-dependent moments, creating a second, divergent clock. Under REPEATABLE READ a pre-established snapshot may legitimately show a since-shortened `not_after` for one in-flight response (E12 MVCC note); this design makes no stronger revocation claim, matching accepted D05.

### 2.4 R1 repair (bounded)

In `private-grants.sql:43-51`, split the compound IF (E9) into four independent probes:

```sql
IF app_auth.has_membership('1111…','aaaa…') IS DISTINCT FROM TRUE  THEN RAISE …;
IF app_auth.has_membership('1111…','bbbb…') IS DISTINCT FROM FALSE THEN RAISE …;
IF app_auth.has_membership(NULL,  'aaaa…') IS DISTINCT FROM FALSE THEN RAISE …;
IF current_setting('app_auth.verified_user_id') IS DISTINCT FROM 'owner-sentinel' THEN RAISE …;
```

Add one intentional NULL-regression guard case: evaluate the *assertion shape itself* against `NULL::boolean` (a DO block whose expected outcome is the raised exception, wired through `run_case` with an `expected` string), proving the real assertion path fails on NULL rather than passing. Note honestly: current `has_membership` returns `EXISTS(...)` (E3:32), which is never NULL, so R1 is guard robustness, not a live leak. No broader test rewrite.

### 2.5 Exact minimal file changes

1. `ops/db/bootstrap-auth-grants.sql` — replace lines 18-20 with the lock + regression check + idempotent policy + drift scan + ownership/flag postchecks above; keep lines 53-60 grants/postcondition unchanged.
2. `ops/tests/be02-guards/fixture.sql` — after creating `auth.sessions` (line 8): `ALTER TABLE auth.sessions ENABLE ROW LEVEL SECURITY;` so the guard run exercises the real pinned condition.
3. `ops/tests/be02-guards/auth.sh` — replace the now-inverted `auth-unexpected-rls` case (E8:32-33) with: `auth-rls-disabled-regression` (fixture disables RLS → expect the regression error); same-name wrong-command (`FOR ALL`), wrong-role, `USING (false)`, WITH CHECK present, restrictive same-scope, extra PUBLIC policy, extra permissive-to-owner policy, inherited-role policy via a bridge role — each expecting the drift error and rollback; `auth-unrelated-policy-preserved` (vendor-style policy to another role survives and the run passes); extend `auth-exact-four-column-read` (E8:38-58) so the positive four-column SELECT as `elevateo_session_owner` now runs *with RLS enabled and the real policy*, against the seeded row (E7:13) — this is the actual-row, non-bypass positive check; and an OID-stability case running the grants body twice and comparing `pg_policy.oid`.
4. `ops/tests/be02-guards/private-grants.sql:43-51` — R1 repair plus the NULL-shape regression.
5. No changes to helpers/entry/read/refresh/grants SQL, the Rails migration, compose, or Ruby tests: `session_expiry_race_test.rb`'s `:auth` policy case (updating `not_after` as admin) already exercises the deadline path and will now run against RLS-true once root's real stack applies the repaired grants phase.

## 3. Strongest objection and simpler alternative

**Objection:** `USING (true)` means any future role that gains both SELECT on `auth.sessions` and membership reaching `elevateo_session_owner` reads every session's metadata — the policy contributes zero row filtering, so the entire burden sits on the role graph and grants guards. If a later migration carelessly grants membership, the blast radius is table-wide (four columns). Mitigation already in place: the bootstrap membership-graph guard enumerates every permitted edge and rejects unknowns (E2:24-52), `private-owner-parent` and runtime SET-denial cases cover it (membership.sh), and the auth drift loop rejects any new SELECT grant. **Simpler alternative:** none exists within the constraints — disabling RLS, BYPASSRLS, and owner elevation are all prohibited; the GUC predicate is more complex *and* weaker (§2.1). Tradeoff accepted: concentrate enforcement in auditable role/grant guards rather than a forgeable row predicate.

## 4. Acceptance checks (all proposed, NOT RUN) and uncertainties

Required evidence per the packet, to be run by root in Docker with recorded image/source hashes, exits and cleanup: real pinned PG 17.6 / Auth v2.196.0 init → Auth migrations (confirming `relrowsecurity=true` from the vendor migration, E12) → bootstrap + auth-grants **twice** (identical policy OID, all postchecks green) → Rails migration and the three Ruby suites; the RLS-enabled fixture positive-row check; every wrong-variant/drift/preservation case in §2.5(3) with rollback verified; four-column-exact read plus fifth-column/table/DML/sequence/grant-option/runtime denials (existing cases, now under RLS-true); hostile-GUC forgery cases (E9:56-106) rerun unchanged; the R1 NULL regression failing the real assertion path; lock-contention test (two concurrent grants phases, one waits, both end consistent) and a lock_timeout expiry case; facade lifecycle (create/resolve/authorize/refresh) plus missing/foreign/expired and NULL/infinite `not_after` rows through `auth_deadline`. No Docker/SSH is available to this worker and none was used; no credentials requested.

**Uncertainties:** (1) whether the pinned Auth migration also sets FORCE or adds its own sessions policies — I cited the enable-RLS migration but not a full policy inventory; the drift scan is written to tolerate other-role vendor policies, but the first real run must record what actually exists before the guard strings are finalized. (2) The real cluster's `auth.sessions` owner is unverified from supplied logs; the capture-and-compare postcheck is designed around that gap. (3) `pg_get_expr` rendering of `true` could theoretically differ across minor versions; if the first run shows a different canonical form, normalize the comparison, not the policy. (4) Guard-fixture RLS still differs from real Auth (no FORCE/vendor policies in the fixture); the fixture proves script logic, and only root's real-image run proves compatibility — do not let a green 74-case rerun be presented as the latter, which is precisely the inferential error this task corrects.

**Focus-prompt note on the Claude/Fable in-app adapter (advice only, no implementation or ownership-implies-code claim):** nothing in this SQL task changes AI-03. Before any product promise, the adapter still needs proof of a *supported* authentication route (Anthropic's documented restriction that third-party products cannot offer claude.ai login without approval), a pinned SDK/protocol version, fake-runtime lifecycle tests (stream, cancel, approval denial, crash/replay), runtime-enforced tool policy (no shell/file in mailbox mode), and strict separation from mailbox MCP grants — all currently unproven and correctly gated behind its own consultation.
