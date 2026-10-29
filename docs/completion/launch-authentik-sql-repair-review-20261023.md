# Authentik SQL repair review — 2026-10-23

Task `task_0f29898fb21d`, dispatch `ctx_4e5ce8a9e33a`. Read-only source review; only this report was written. No tests, application execution, Docker jobs, provider calls or production mutations were performed. Verdict: **repair is structurally sound within the reviewed SQL; one LOW regression-test weakness remains, and runtime acceptance is unverified**.

## Frozen coverage

Hashes were captured before source inspection. Counts include blank/comment lines; the actual files are smaller than the dispatch's approximate counts.

| File | Reviewed lines | Physical LOC | Whole-file SHA-256 |
| --- | --- | ---: | --- |
| `ops/production/launch-controls/enrollment.sql` | 1–118, complete | 118 | `9f2dae8b7e7011bf9afa6630aad66c8fcf21b1865353d0f225a16c698bdb61b2` |
| `ops/production/launch-controls/remove.sql` | 1–18, complete | 18 | `58181360e2ce08dde2dc2836eff0a647b773b40f133c98988b0c3d23453e92fc` |
| `ops/production/launch-controls/test_enrollment.py` | 175–216 only | 42 | `7f7687737a920c1e5e0df5ca0cca6ca8b0a7f93aa0e4888a76538088630be6b6` |

One bounded packet, **178 unique physical source lines**, below 200. The Python file has 217 lines; its whole-file hash identifies the containing revision, not review of the other 175 lines. Requirements came from project instructions, `.planning/STANDARDS.md` and the README/state/documentation context. The prior functional-review report was consulted as historical context; its findings are not counted again.

Fresh findings: **one LOW, zero MEDIUM/HIGH; 1/178 × 1000 = 5.62 defects/KLOC**. By reviewed file: enrollment 0/118 = 0/KLOC; remove 0/18 = 0/KLOC; test slice 1/42 = 23.81/KLOC. These are bounded review counts, not application quality or runtime metrics.

## R1 — LOW: race regression can pass without exercising lock contention

Location: `test_enrollment.py` 175–194, especially 181 and 184–191.

The test waits until the revoker reports `PgSleep`, then calls enrollment synchronously. The revoker automatically commits after two seconds, without waiting for proof that enrollment has reached the conflicting session lock. A scheduler pause or slow enrollment startup can consume that interval. Enrollment then observes an already committed deletion/expiry and correctly returns unauthorized even if the repaired session `FOR SHARE` is absent. Thus the assertions do not establish that this execution exercised serialization.

Reproduction recipe for a future isolated fleet test, **not executed here**: remove only the enrollment session-lock statement in a disposable source copy, and insert a delay longer than two seconds immediately before line 191. Both mutation variants can then meet the current unauthorized/zero-membership assertions because revocation committed before enrollment's session read. An explicit handshake should make the revoker hold its transaction until an independently running enrollment connection is observed blocked on that revoker's lock; release it only after observing that condition. Retain bounded timeouts and child-process cleanup, and assert commit/result/row state. A separate admission-first case should verify the intended opposite ordering rather than infer it from the revocation-first case.

This is a test-oracle defect, not evidence that the repaired SQL permits revoked admission. The fixed sleep ordinarily creates overlap; it does not guarantee it.

## Repair assessment

- **Session race:** enrollment 71–82 takes a session row `FOR SHARE` before rechecking user/session/expiry predicates. A concurrent DELETE or UPDATE of `not_after` conflicts with that row lock. If the revoker already holds it, enrollment waits and then revalidates; if enrollment owns it first, revocation must wait through enrollment's transaction end. This addresses the original unlocked-session interleaving at source level. Natural wall-clock expiry after validation is separate from a concurrent expiry UPDATE.
- **Privileges:** session SELECT is limited to the four referenced columns and the added UPDATE privilege is limited to `id`, supplying the privilege required for a locking SELECT without granting UPDATE of `not_after` or DELETE. The owner is NOLOGIN/NOINHERIT, the function uses a fixed `pg_catalog` search path and qualified objects, PUBLIC execution is revoked and API execution is explicit. Existing role memberships, inherited/public grants, external RLS and helper behavior are outside coverage; whole-database least privilege is not established.
- **Install atomicity:** fail-fast psql mode and BEGIN/COMMIT wrap role creation, grants, objects, policy disabling and function installation. A duplicate role aborts this one-shot attempt before it changes existing policy/tombstones. Other statement failures also prevent commit. Tests 207–213 explicitly expect failed repetition to leave the previously enabled policy and tombstone intact. Failure is therefore not a disable operation, consistent with the clarified one-shot contract.
- **Remove-first behavior:** remove is privileged and transactional. It disables the policy, removes the function and named policies, revokes/drops role-owned privileges/objects using DROP OWNED, then drops the role. It intentionally lacks IF EXISTS: repeated/partial-state removal fails rather than claiming success. Failure rolls back the disable too; operators must not interpret failed removal as a successful disable. Successful removal retains the two admin-created launch tables and their rows, and does not delete application memberships/access.
- **Retention/reinstall:** no enrollment table FK can cascade membership removal into erased tombstones. The installer preserves existing tombstones and disables the retained policy. Tests 196–205 assert admission, successful removal, retained tombstone, denied function call, reinstall and disabled admission with the tombstone still present. They do not directly assert every retained policy field or existing membership/access row; source shows no explicit deletion of those rows. DROP OWNED is safe for the intended dedicated role only; unrelated objects later assigned to it would broaden removal effects and must not be assumed preserved.
- **Inputs/state:** null UUID/session arguments are denied; missing/disabled policy and blank owner subject fail closed. Missing/unconfirmed/banned/deleted users, absent/expired sessions and invalid company identities are denied. Fixed associate insertion avoids owner escalation. Enrollment history and generation fences remain present. No new abstractions, loops in production SQL or unrelated state rewrites were introduced by this repair.
- **Maintainability/performance:** comments now explain one-shot installation and the session-lock purpose. Global membership locking and identity/generation lock order are existing tradeoffs, not new measured performance findings. Row locking increases revocation/admission contention intentionally; runtime timeouts/deadlocks must be observed under actual caller transactions. No standalone design simulation or Obsidian write was performed; this is a bounded repair review, not a new architecture decision.

## Limits and next evidence

The test setup, helper implementations and remaining tests were not read. Their connection roles, autocommit, subprocess cleanup and schema fidelity cannot be certified. The slice contains revocation-first DELETE/expiry variants, removal/reinstall and repeated-install assertions; it does not show admission-first serialization, injected mid-install/remove failure, null/identity-denial tests or hostile preexisting-object tests. Absence from this slice does not establish absence from the suite.

PostgreSQL version/schema, real API-role execution, definer owner visibility, authorization-generation helper locks, other revocation paths, actual lock waits and failure cleanup remain fleet runtime/coupling evidence requirements. No previous suite total is adopted as proof for these hashes. No release or production acceptance is granted. Central `code-reviews.md` integration remains coordinator-owned because this assignment authorizes only this report.

R1 was routed directly to auth dispatch `ctx_0c4f8e19305e` in `msg_675e30e99a29` and to the coordinator in `msg_46c9e8681f9c`. Durable enqueue is not evidence of receipt acceptance or a completed fix.
