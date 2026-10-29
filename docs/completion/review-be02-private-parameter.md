# BE02 private-parameter repair: bounded adversarial review

**Result: one P2 regression-assertion defect; no concrete P0/P1 defect found in the assigned code. Reviewer runtime validation: NOT_RUN.** The parameter grant is consistent with PostgreSQL 17.6 function-creation requirements, and the reviewed probes correctly distinguish ordinary custom-GUC assignment from authorization. This is a static review of the ranges below, not approval of the complete application or an independent runtime pass.

Task `task_d3d65f849457`, dispatch `ctx_a6d00882efc2`; reviewed on 2026-10-13. Target: `C:/Users/Tanzeel/Code and projects/Elevateo Mail - BE02 Codex`, HEAD `5785eba47f3709debb2815c8d86608f7e62d02f3`. The reviewed working files include uncommitted changes; their byte hashes, rather than HEAD alone, identify the review baseline.

## Finding

### R1 — P2: owner membership assertion silently accepts a NULL result

**Location:** `ops/tests/be02-guards/private-grants.sql:45-51`, specifically the positive own-membership check at lines 45-46.

The guard requires `has_membership(user1, orgA)` to return true. If it instead returns SQL NULL while the foreign/null-principal checks return false and the sentinel is restored, the combined expression becomes `NOT NULL OR FALSE OR FALSE OR FALSE`, which evaluates to NULL. PL/pgSQL skips the exception because its IF condition is not true. Thus this new positive owner-binding assertion can report success without establishing the required membership result. The same nullable expression also fails to require explicit false results for its negative calls. [PostgreSQL IF semantics](https://www.postgresql.org/docs/17/plpgsql-control-structures.html#PLPGSQL-CONDITIONALS)

**Impact:** a false negative in the regression guard for a broken helper result. This is not evidence that the delivered helper currently returns NULL or that production isolation has been bypassed; helper implementations are outside this review's assigned ranges.

**Static reproduction, NOT_RUN:** substitute a NULL result for the first helper call and false for the remaining failure predicates. The following reduced assertion would complete without raising, despite the required own-membership success being absent:

```sql
DO $$ BEGIN
  IF NOT NULL::boolean OR false OR false OR false THEN
    RAISE EXCEPTION 'owner helper identity or restoration failed';
  END IF;
END $$;
```

**Bounded correction:** compare the positive result with `IS DISTINCT FROM TRUE` and each expected negative result with `IS DISTINCT FROM FALSE`. Preserve the null-safe sentinel comparison. Evaluate the three calls separately if necessary to ensure each intended probe executes. Validate the correction in the coordinator's Docker guard workflow, including an intentionally NULL positive-result assertion. No correction or reproduction was executed by this reviewer.

## Coverage and defect density

Counts are physical source lines, including comments and blank lines; repeated inspection is not counted again. Context documents, upstream reference material and an existing coordinator log are not additional application-code review coverage.

| Pass | Exact reviewed ranges | Physical lines | Nonblank lines | Defects | Defects / 1,000 physical lines |
| --- | --- | ---: | ---: | ---: | ---: |
| A | `ops/db/bootstrap.sql:55-76`; `ops/tests/be02-guards/membership.sh:1-118`; `ops/tests/be02-guards/fixture.sql:1-45` | 185 | 180 | 0 | 0.00 |
| B | `ops/tests/be02-guards/private-grants.sql:1-165` | 165 | 161 | 1 P2 | 6.06 |
| Total | Four bounded source ranges | **350** | **341** | **1** | **2.86** |

Each pass is below 200 lines; total unique source coverage is below 400. No other local implementation code was reviewed. In particular, the SQL loaded through `\ir`, the remainder of bootstrap, the guard runner and production RLS migrations were context dependencies, not reviewed code.

## Checklist and conclusions

| Area | Static assessment and evidence |
| --- | --- |
| Function creation | Bootstrap 65 grants only SET to the existing private owner. The guard loads actual SQL under `SET LOCAL ROLE elevateo_session_owner` (private-grants 3, 12-20), so the coordinator's run exercises the original failing creation path. No removal of function-entry settings or superuser promotion appears in the assigned change. |
| ACL validation | Bootstrap 57-63 rejects all exploded ACL entries except administrator self entries and non-delegable owner SET issued by the expected administrator. Lines 67-73 check effective owner privileges and forbidden runtime/migration privileges. The catalog predicate covers unrelated grantees too. |
| Idempotency and grantor | Missing ACL rows permit the narrow grant; an existing permitted grant survives the preflight and repeated GRANT. The 16 parameter cases in membership 90-118 cover hostile grantees/privileges and missing-owner repair. The administrator assumption is supported by the tagged image source, as explained below; it is not a portable assumption for arbitrary PostgreSQL clusters. |
| Role assumptions | Membership 53-75 uses session authorization for the permitted migrator path and denied API/worker paths. Private-grants 55-70 and 134-141 likewise set the session identity before testing SET ROLE. Ordinary current-user impersonation from a superuser session would not establish the same role denial. |
| Forged private setting | Private-grants 60-66 explicitly clears normal application context, forges the private GUC and requires the API membership query to stay empty. Worker 137-146 requires membership access to fail with insufficient privilege. These checks correctly allow the placeholder assignment itself to succeed. |
| Own and foreign fixtures | Fixture 13-26 creates a real-shaped Auth row for user1, orgA/user1 and orgB/user2, with separate UUIDs. FORCE RLS and role-specific policies at 28-43 prevent a one-user fixture from disguising foreign identity leakage. API results at private-grants 72-90 assert the exact own organization and reject a mismatched principal. |
| Restoration | Private-grants 75-100 checks the original forged value after successful create/read, unauthorized early return and a caught unique violation; direct membership access is checked again after the error. Owner sentinel coverage at 44-51 has R1's result-assertion weakness. Function-local restoration is consistent with PostgreSQL's documented SET behavior. |
| Happy and failure paths | Successful creation/listing, wrong binding, null digest, duplicate digest, denied private table/helper/Auth token access and denied cross-facade calls are represented. Error handlers catch specific expected SQLSTATE categories; the deliberately raised failure exceptions are not caught by those handlers. |
| Empty and maximum inputs | Empty resolve and worker queue results are asserted (109-111, 148-150); organization listing uses its documented maximum of 50 (80-81). Above-limit and multi-page behavior are not demonstrated by this two-organization fixture and were not inferred from it. Null helper-result coverage is R1. |
| Boundaries and secrets | Reviewed SQL uses fixed fixture identifiers and deliberate role grants; dynamic role identifiers in membership are formatted as identifiers. Auth token values are disposable literals. The documented trusted Rails/Auth principal-attestation boundary remains necessary; these tests do not prove safety for arbitrary callers choosing attested-principal arguments. |
| State and cleanup | Private-grants wraps defaults/objects/data in BEGIN/ROLLBACK and resets session identity between runtime roles. Actual runner cleanup and failure-path process handling were not audited here. Parameter ACLs and roles are cluster-wide, so a scratch database alone is not an isolation boundary. |
| Maintainability/performance | The repair is small, uses existing guard mechanisms and bounded role matrices, and introduces no new dependency or domain abstraction. No relevant hot-path performance regression is established from these ranges. Comments explain the GUC and session-identity traps. Formatting checks remain the linter/CI responsibility. |
| Standards/documentation | Applied the supplied adversarial rubric and project STANDARDS sections 3-6, 8-10. Read the repair and interface context plus applicable project instructions/state documentation. The repair document clearly states its original NOT_RUN status and correctly avoids claiming that parameter ACL absence prohibits ordinary custom-GUC SET. |

## PostgreSQL assumptions checked against primary sources

PostgreSQL 17.6's placeholder-validation branch requires superuser authority or ACL_SET when storing a function setting, while its ordinary custom placeholders use PGC_USERSET. Granting the private owner SET therefore addresses function creation; it does not make a session's ordinary private-GUC value trustworthy. [REL_17_6 guc.c](https://github.com/postgres/postgres/blob/REL_17_6/src/backend/utils/misc/guc.c#L6329-L6342)

Parameter ACLs use the bootstrap superuser as owner, and a superuser's grant is attributed to that owner. The Supabase `17.6.1.136` Dockerfile sets `POSTGRES_USER=supabase_admin`; this supports the hardcoded grantor for the intended fresh image initialization. A cluster initialized with another bootstrap name would not satisfy that assumption. The source tag supports this inference but does not itself attest to the digest's runtime catalog. [Parameter grant implementation](https://github.com/postgres/postgres/blob/REL_17_6/src/backend/catalog/aclchk.c#L2364-L2389), [grantor selection](https://github.com/postgres/postgres/blob/REL_17_6/src/backend/utils/adt/acl.c#L5047-L5052), [tagged Supabase Dockerfile](https://github.com/supabase/postgres/blob/17.6.1.136/Dockerfile-17#L154-L159)

SET SESSION AUTHORIZATION changes both session and current identity; SET ROLE permission checks use session identity. RESET SESSION AUTHORIZATION can restore the originally authenticated administrator, so these probes establish the exercised runtime privilege checks, not a new physically authenticated runtime connection. [Session authorization](https://www.postgresql.org/docs/17/sql-set-session-authorization.html), [SET ROLE](https://www.postgresql.org/docs/17/sql-set-role.html)

Function SET configuration restores the preceding value on return, including local changes to the same parameter. The guard's successful-return comparisons directly exercise that property; exception restoration is observed after a subtransaction rollback. [Function SET behavior](https://www.postgresql.org/docs/17/sql-createfunction.html)

## Validation provenance and remaining work

**Reviewer-executed runtime, Docker, SSH, host application tests, SQL reproduction, lint and typechecks: NOT_RUN.** No agents, purchases, commits, application edits or live services were started. Only this report was written. No dedicated design-review or Obsidian simulation was performed: the dispatch prohibits new agents and this review proposes no deep architecture tradeoff.

During review the coordinator reported that its third frozen A/B run passed all 74 guard cases. Static inspection of its existing `ops/local/be02-runtime-stage-f1fd9202222a4454843f5e657356c7aa/evidence/014-privilege-guards.log` confirms `ok named-default-acl-boundary` at line 74 and `PASS 74 BE02 guard cases` at line 75. Log SHA-256: `A8679FC1B14D814B85E01CBD940FA6EB87CDE6DA218FCA12485E4BC03A84DCD6`. This externally executed happy-path evidence does not test R1's NULL-result counterexample and is not a runtime run by this reviewer.

The coordinator also reported a later `bootstrap-auth-grants` failure because the pinned Auth sessions table has RLS enabled, with cleanup passed and another worker assigned. That later failure and repair are outside this review; they were not independently investigated. This review therefore does not certify end-to-end A/B completion.

Remaining bounded work: correct R1 and record a Docker regression result through the coordinator. The coordinator can incorporate this report's one defect and 2.86 defects/KLOC into `code-reviews.md`; that file was outside the authorized write scope.

## SHA-256 baseline

Hashes cover complete on-disk files, not just the reviewed ranges; they matched the supplied repair handoff at inspection. Later changes by other workers require their own review attribution.

| File in BE02 Codex | SHA-256 |
| --- | --- |
| `ops/db/bootstrap.sql` | `5A665CF865CF84246F38EC8819F6E64E6A49E14105768A46BA8B3BA1DF15A225` |
| `ops/tests/be02-guards/membership.sh` | `4B507C8A0B7B79284C7A2135C13C2B651E48B06F2DFD64BA87E8A050F15F1675` |
| `ops/tests/be02-guards/fixture.sql` | `48F1B6CBF9D6C31989D0204D92FD7E1CB7BFCFA253317B02DF111D5DBE5181D9` |
| `ops/tests/be02-guards/private-grants.sql` | `37480C9B5C2DD2D1F442D556F0E09C6E9F0CEF4DE9E0331F9BF761932C226C02` |
| `docs/completion/be02-private-parameter-repair.md` (context) | `F3E2BF454E06445D5F6174E5B8C6180519B5EAEE937CF0760C6A5074ECDBE4A0` |
