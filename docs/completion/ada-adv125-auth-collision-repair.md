# ADV125 — outreach authorization identifier repair

Reviewed Elara 240ff718ef484a642646421a06713e393be6426f, source-only. Integration 2166daa and actual Docker/runtime result were not independently inspected. No tests, builds, application edits or live services executed.

## Coverage and result

145 unique versioned source LOC: repaired apps/server/db/sec802/access.sql lines299–318 (20) and363–388 (26); repaired apps/server/test/be_02/organization_access_policy_test.rb lines83–144 (62); parent access.sql diff context299–316 (18),364–370 (7),374–385 (12). Current-version diff overlap counted once. Each bounded snippet/diff read stayed below180 LOC; assignment below350. Confirmed new defects:0; density0/145 =0 defects/KLOC. Documentation, inherited fixture/proof implementations, complete migrations and runtime identities are excluded.

## Write helper

The declaration, role SELECT target, allowlist comparison and returned role all use business_role. assert_protected_write remains before the role query; organization and actor still come from its successful proof. The existing owner/admin/sales_manager/sales allowlist and explicit NULL denial remain. The rename changes no grants, RLS policy, guard or scope. An absent role row therefore still fails closed. This review establishes preserved call structure, not fresh independent verification of the underlying protected-write implementation.

## Read helper

resolve_session remains first, with unsuccessful status returned. Proof organization/user must still equal current app context; the same business-role allowlist and NULL denial remain. The helper remains STABLE SECURITY DEFINER with pg_catalog search_path. Revoked/stale sessions still depend on the unchanged resolve_session implementation; their effective behavior is not newly proven by this packet. No new broad permission or bypass was introduced.

## Regression

The sales fixture now checks both read_result and write_result in one protected scope, with diagnostic business membership/role and function-owner information. Separate assertions check returned sales role, owner write and auditor denial on both read/write. These assertions cannot accept the previous not_found outcome as success. The reviewed excerpt does not add owner-read, stale-generation or revoked-session regressions; do not describe those as newly exercised. Inherited scope/fixture behavior and actual database role are outside fresh coverage. Soren must run the exact focused regression under the intended real API login, followed by existing revoked/stale/cross-context coverage.

## Parser evidence and design decision

PostgreSQL documents CURRENT_ROLE as equivalent to current_user, with special SQL syntax; current_user is the effective permission identity and changes inside SECURITY DEFINER. This supports the source diagnosis that an unqualified current_role expression can resolve database identity instead of the intended business-role local. Exact execution of this repaired PL/pgSQL remains runtime proof pending. [PostgreSQL17 system information functions](https://www.postgresql.org/docs/17/functions-info.html).

Use the narrow business_role rename. It states the domain distinction clearly and preserves the security contract; grant widening, proof relaxation or a replacement authorization abstraction would not address this identifier collision. Comments explain the reason for the rename. No hot-path query or extra loop was added. Existing role query duplication across the two intentionally different read/write proof paths does not justify a new abstraction for this repair.

## Tradeoff simulations

Sales actor, valid current proof: old special expression can compare elevateo_owner against business-role strings and deny both paths; repaired local compares sales and permits the intended paths. Auditor with equally valid proof remains denied because auditor is absent from the unchanged allowlist. Missing membership yields NULL and remains denied. A revoked session should stop at the unchanged proof helper before role evaluation; a rename cannot legitimately revive it. Cross-context read remains denied before role lookup, while protected write still requires its guard. These are static predictions, not runtime observations.

The focused repair should discriminate the parser hypothesis before further generic witnesses. If it fails, resume branch-specific proof diagnosis; do not broaden grants to make the test pass. Completion gate: exact focused sales/owner/auditor results under actual API role, plus retained revocation/context failure tests in Soren's Docker run. Static review does not certify runtime authorization or publication readiness.
