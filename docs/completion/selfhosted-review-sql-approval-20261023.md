# Bounded SQL approval review — 2026-10-23

Task `task_13e58924e0d5`, dispatch `ctx_0eb95c36a789`. Read-only source review; only this report written.

## Scope and immutable receipts

Read AGENTS.md, .planning/STANDARDS.md and README/state/documentation context before implementation review. Applied the full mandatory rubric supplied in the dispatch. No imported implementation or test sources were opened. SHA-256 values below describe entire files at inspection time; coverage is strictly the listed physical ranges, including blank/comment lines.

| Packet | File | Range | Lines | SHA-256 |
| --- | --- | --- | ---: | --- |
| A | apps/server/db/be03_send/production_mox/approval.sql | 1–103 | 103 | f2053aecf9ecc42a38dd954ae4b83eafe45b2435f31dd959d00820ecb4c69d51 |
| A | apps/server/db/be03_send/production_mox/reconcile.sql | 1–17 | 17 | e43583d9eae526ce632d4e34eea70142f80c4549f5d14affe77fd7b1820c8781 |
| A | apps/server/db/migrate/20261023000041_enable_production_mox_transport.rb | 1–61 | 61 | 054f0c1cd1cd5d83dd02b156a07e6c422e27d0b47b2bd15e38b66958b36bdb2d |
| B | apps/server/test/sends/production_mox_database_test.rb | 1–145 | 145 | b225bfd1561b3e6bc261d772925a6f20b816c00d3a571a6c53888c3c58f9f750 |

Packet A: 181 lines. Packet B: 145 lines. Combined unique physical coverage: 326 lines.

## Actionable finding

**SQL-APP-01 — LOW: NULL outbound mode escapes initial request validation.**

`approval.sql:9–12` checks `p_outbound_mode NOT IN (...)` without `p_outbound_mode IS NULL`. For otherwise valid arguments with a NULL mode, that disjunction evaluates to SQL NULL and PL/pgSQL does not enter the request-invalid branch. The function proceeds into authentication, draft binding, replay and business policy logic with an invalid transport discriminator. For example, a valid session/draft with no prior intent and a NULL epoch can reach `dispatch_held` at line 64 rather than `request_invalid`. This violates the boundary-validation requirement and makes the result depend on downstream state for a structurally invalid request.

Add `p_outbound_mode IS NULL` to the guard. Add restricted-API-role tests for NULL mode with a fresh operation and an existing operation; require `request_invalid` and no newly created intent/job/operation. The assigned test range hardcodes `mox` in its approval helper and has no such regression. Runtime behavior of helpers and eventual database constraints was not examined or executed.

Correction to initial notification: I withdrew the earlier replay-bypass interpretation immediately in separate coordinator/owner messages. `jsonb_build_array` preserves a NULL argument as JSON null; the digest is not proven SQL NULL. No replay bypass, authorization bypass or specific INSERT exception is claimed here.

## Checklist and evidence limits

| Review area | Static assessment |
| --- | --- |
| Purpose and compatibility | Production approval marks mox/resend intents non-simulated; reconcile routes mox unknown observations through the production source without a submit call. Imported observation/result helpers remain unverified. |
| Null, empty and maximum inputs | Finding above. Positive expected version, digest shape and 1 MiB supplied-snapshot limit are explicit. Snapshot shape, NULL bytes, empty recipients and attachment structure depend on unreviewed validators. Mox rejects nonempty attachments after validation. |
| Tenant permissions and external inputs | Session/draft binding guards and organization-scoped consent queries are explicit; SECURITY DEFINER functions pin search_path to pg_catalog. The test range includes restricted-role denial and a foreign-organization-domain denial case. Helper authorization, grants and schema source are outside scope; no whole-boundary approval. |
| State, replay and concurrency | Operation advisory locking, policy/draft ordering, current session rechecks and consent row locks are present. Cross-operation draft deduplication is visible. Null helper outcomes, concurrent revocation and lock semantics require real PostgreSQL tests. |
| Forward migration | Versioned migration uses SET LOCAL ROLE, restores role and revokes temporary CREATE. It does not disable the Rails migration transaction in the assigned source. Atomicity on mid-script failure and restored privilege fingerprints require fleet verification. Five loaded SQL inputs include three outside this assignment. |
| Rollback | Explicit exclusive locks and refusal on production domain/binding/attempt history are visible; original function sources and old constraints are restored. Exact prior-source matching, dependencies, function identities/grants, empty-database up/down/up and refusal atomicity cannot be certified from this packet. |
| Held defaults and final authority | This packet does not set an enabled global default. Test control explicitly opts out of holding. Assigned tests cover disabled domain, disabled budget, tenant mismatch and account-version final-fence denial. Actual authority/default definitions are outside scope. |
| Test integrity and failure coverage | Source includes acceptance provenance/no replay, unknown reconciliation/no resubmit, role denial, domain revocation, rotation, tenant mismatch, consent absence, disabled budget and evidence NULL failure. Tests are not execution evidence. Parent tests are deliberately undefined at lines 141–142; inherited coverage must not be counted for this subclass. Parent helpers and private helpers after line 145 were not inspected. No migration/rollback regression is visible within the assigned test range; this does not establish absence elsewhere. |
| Design, naming, duplication and complexity | Small migration and reconciliation adapter; no new abstraction/dependency justified by speculative needs. Approval is a longer orchestration function whose lock/authorization order explains cohesion. No actionable naming, duplication or nesting defect identified in scope. |
| Comments and documentation | Comments explain lock ordering, replay authorization, consent and provenance decisions. Documentation context preserves held/no-live limits. Whole-project documentation synchronization was not audited. |
| Performance | Indexed access plans and campaign-lead cardinality are unknown. Repeated snapshot parsing/canonicalization is visible, but no measured bottleneck established. Do not replace locked consent checks without preserving atomic withdrawal behavior. |
| Standards | Boundary-validation defect conflicts with standards section 4. Fleet PostgreSQL isolation/locking tests remain required by section 8. Formatting delegated to existing lint checks. |

## Counts, delivery and runtime limits

One actionable defect: LOW 1, MEDIUM/HIGH/CRITICAL 0. Packet A density: 1 / 181 × 1000 = **5.52 defects/KLOC**. Packet B: 0 / 145 = **0 defects/KLOC**. Combined: 1 / 326 × 1000 = **3.07 defects/KLOC**. Coverage gaps above are limitations, not additional counted defects; inherited status of the NULL-mode guard was not determined without opening earlier sources.

Findings and the explicit correction were durably sent to the coordinator and implementation dispatch `ctx_6594097677c5`. No tests, application execution, cloud/DNS calls, secrets access, nested workers, source edits or commits. No Docker resources were created, so cleanup is not applicable. Static review does not grant release authority or establish runtime/visual acceptance. A dedicated design reviewer and fleet runtime evidence belong to the coordinator's wider review, not this bounded assignment.
