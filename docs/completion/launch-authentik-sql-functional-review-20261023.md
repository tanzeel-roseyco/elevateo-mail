# Authentik SQL functional security review — 2026-10-23

Read-only review by dispatch `ctx_f8b88a4c04fd`, task `task_f8439095b6a3`. Implementation and infrastructure were not modified. No application tests, database commands, provider calls or live sends were executed. Verdict: **changes requested; runtime and integration acceptance unverified**.

## Frozen coverage and accounting

| Packet | Complete range | Physical LOC | SHA-256 |
| --- | --- | ---: | --- |
| `ops/production/initialize/tenant.sql` | 1–100 | 100 | `c024e10f4fce34a459d4edc51cd71310edefbc675f884e250ffd82c7906020d3` |
| `ops/production/launch-controls/enrollment.sql` | 1–115 | 115 | `eaf70c96f02eda9f31571e0018d09f8380f31c86a7173d2cd1c5b02b31ff8697` |

Two bounded packets, 215 unique physical source lines total; no other implementation source read. Project README, state, documentation and standards were consulted for requirements. Two findings: one HIGH security race and one MEDIUM operational failure. Density: tenant 0/100 = **0 defects/KLOC**; enrollment 2/115 = **17.39 defects/KLOC**; combined 2/215 = **9.30 defects/KLOC**. These counts concern this frozen packet only and do not establish whole-system correctness.

## F1 — HIGH: session admission is not serialized with session revocation

Location: enrollment.sql 73–83, especially 77–79; writes 107–109.

The function locks the user and identity rows, policy and membership table, but only reads `auth.sessions` with `EXISTS`. That read does not lock the qualifying session row. A concurrent session deletion or `not_after` update can therefore commit after that check while this transaction continues and commits new membership/access. Identity locks protect user ban/deletion, but do not themselves protect a session row from deletion or expiry updates.

Reproduction to add in isolated fleet PostgreSQL: create an enabled valid policy, pinned active owner, valid company identity and fresh session for a previously unenrolled user. Connection A calls enrollment and is paused after the session check and before membership insertion (a task-only test barrier/trigger can provide that pause). Connection B deletes that exact session, or moves its `not_after` into the past, and commits. Resume A: absent additional unseen revocation synchronization, the current SQL can return `ok` and commit membership after revocation committed. Assert both transaction ordering and resulting rows, not just the JSON result.

Recommended fix: lock the qualifying session row before admission and revalidate its predicates after acquiring the lock, with deliberate lock ordering and failure handling. Coordinate that ordering with all actual revocation paths. A two-connection regression must prove revocation winning the lock prevents admission and admission winning the lock has explicitly defined ordering.

Evidence limit: the missing session lock is visible in this packet; whether every production revoker instead acquires the same authorization-generation or user lock is unseen. If those external guarantees exclude this interleaving, demonstrate them through a separate bounded coupling review and executable race evidence before closing F1. No production exploit was executed or claimed.

## F2 — MEDIUM: reinstall fails before the documented disable/preservation behavior

Location: enrollment.sql 10, 23–26, 49–57.

`CREATE ROLE elevateo_enrollment_owner` is unconditional. A second execution after successful installation raises duplicate-object at line 10, with `ON_ERROR_STOP` preventing lines 23–26 from running. Unconditional policy and function creation would also conflict if the role creation alone were repaired. Consequently the comment promising reinstallation preserves tombstones and disables enrollment does not describe an executable reinstall path. In particular, rerunning this script against an enabled policy does not disable it.

Reproduction: install once in the isolated schema, enable a valid policy as operator, then rerun the same file. Expect duplicate-role failure and rollback with the previous enabled policy unchanged. Do not treat the failed rerun as a successful safety disable.

Recommended fix: either implement an explicit, reviewed reinstall path that verifies existing role attributes/ownership/grants and safely replaces existing policies/function while preserving tombstones, or document installation as strictly one-shot and supply a separate verified disable/upgrade operation. Do not blindly accept a preexisting role by name. Test initial install, exact reinstall, adversarial preexisting objects and rollback on failure.

## Security and functional checklist

- **Authority:** tenant bootstrap requires actual/session `supabase_admin`, explicit approved role, UUID and receipt. Display name is only compared as organization metadata. No admin is inferred from email or a name. Runtime enrollment writes the fixed `associate` role, never owner/admin.
- **Owner identity:** bootstrap matches explicit Authentik subject, JSON boolean email verification, confirmed active Auth row, equal identity/user email and the company domain. Enrollment requires the configured owner UUID, owner role and exact configured subject plus the same verified company identity checks. The subject is pinned by comparison; database-level immutability of the policy field and authenticated operator attestation are outside this packet. Neither SQL file establishes a specific person's identity from a display name.
- **Boundaries/nulls:** enrollment explicitly rejects null UUID/session arguments and missing/disabled/empty-subject policy. Missing/malformed UUID/bootstrap values fail through psql interpolation/casts; ordinary text values are quoted with psql literal interpolation. Bootstrap name/receipt bounds and role allowlist are present. Blank/missing identity email/sub or non-boolean verification cannot satisfy admission predicates. Arbitrarily long identity text and query bounds rely on unseen Auth schema/ingress constraints.
- **Transactions:** both scripts use a transaction and fail-fast psql mode. Tenant user/identity locks extend through commit; organization/name/receipt conflicts raise rather than silently overwrite. Concurrent owner bootstraps using this script serialize through its advisory lock. Runtime policy locking serializes policy changes; sorted identity locks reduce ordering ambiguity. F1 remains open.
- **Cross-tenant/revocation:** runtime rejects membership in another organization, globally locks the membership table before that check, writes tombstones atomically with new grants, and rejects historical generations/tombstones before rejoining. Existing membership returns `ok` without an access-role check; whether this is correct depends on caller semantics and access revocation rules. Bootstrap's cross-tenant check precedes its membership writes without the same table lock; coordination with other provisioning writers is an external review requirement.
- **RLS/grants:** bootstrap checks forced RLS/ownership on four tables and restricts the runtime role roster. Runtime definer has a fixed `pg_catalog` search path and qualified object names; public execute is revoked and only API execute is granted explicitly. Its insert policy limits access to associate. Broader existing policies, role memberships, schema CREATE privileges, helper execution grants and forced-RLS visibility for authorization generations were not read and are not accepted by this review.
- **Complexity/performance:** queries are bounded by supplied user/organization identifiers in the intended schema. Global membership locking trades rare-admission throughput for cross-tenant serialization and can block unrelated tenants. Indexes, row counts, helper cost, deadlock ordering and runtime statement timeouts require schema/runtime evidence. No unnecessary abstractions or duplicated standalone service were introduced here.
- **Comments/docs/tests:** comments explain intended lock/security decisions, with F2's reinstall claim inaccurate. No tests were in the allowed packets; happy-path, denial, null, rollback, RLS and concurrency coverage cannot be confirmed from source here. Historical suite totals do not validate these frozen files.

## Separate bounded reviews and runtime evidence requested

Coordinator/auth owner should allocate separate review of `app_auth.lock_authorization_generations`, authorization-generation RLS, membership/access triggers and constraints, revocation lock ordering (including Auth sessions), caller provenance of `p_user`/`p_session`, operator gate subject attestation, and install/enable orchestration. Do not expand this review beyond its 215-line cap to infer those guarantees. Check owner access plus membership consistency, deleted/recreated owner scenarios, conflicting tombstones and cross-tenant provisioning races.

Fleet-only tests should cover valid owner/bootstrap/associate admission; malformed/null/unverified/out-of-domain identities; exact replay and role/receipt mismatch; owner removal/ban/subject change; user/session revocation races; two simultaneous first owners and cross-tenant admissions; tombstone/generation refusal; real API-role RLS/grant execution; reinstall/rollback. Source remains untested and no release acceptance is granted.

Actionable findings and coupling-review request were durably sent to auth dispatch `ctx_0c4f8e19305e` and coordinator `term_25872355-6176-4590-a3d8-9da0d4159760` (messages `msg_df92f200093c`, `msg_5e7ac90041cd`). Delivery enqueue does not prove recipient acceptance. Only this report is owned/modified; central review-ledger integration belongs to the coordinator.

## Closing source-drift checkpoint

Before settlement, enrollment.sql changed to SHA-256 `9f2dae8b7e7011bf9afa6630aad66c8fcf21b1865353d0f225a16c698bdb61b2`; tenant.sql still matched its reviewed hash. Auth message `msg_810c7e344437` reports a session `FOR SHARE` repair, accompanying grant, pending two-connection regression and a clarified one-shot/remove-first protocol. Those claims and the unseen `remove.sql`/test behavior were not independently reviewed here. F1/F2 remain findings against the original frozen hash, not assertions that the changed revision retains them. The original task's 215-LOC maximum is exhausted; request a fresh bounded repair/coupling assignment rather than infer acceptance from a larger replacement file or reported test. Coordinator follow-up `msg_81e193fd28e5` was read and its immediate-routing request had already been fulfilled.
