Consultation only. No tools, files, agents or network were used. Runtime: claude-fable-5-1, run as a fresh session on the supplied packet at base 103baeb0. I did not read any other opinion.

## Verdict on BE-01

**Change before dispatch.** The brief is sound in direction and scope. Three items are prerequisite blockers, the rest are improvements.

Blockers:

1. **Fail-closed default for the restricted role is unspecified.** The brief tests that claims do not leak across a pool, but not that a forgotten context wrapper denies everything. Without default-deny RLS, one unwrapped read is a silent cross-mailbox leak.
2. **Storage ownership is contradictory.** "Private Storage is real" plus "foreign-principal download denied" implies policies on storage.objects, while the brief forbids writing into Supabase-owned schemas. Pick a model (recommendation below) before Devin guesses.
3. **Runtime mail egress is asserted, not enforced.** Config validation of an SMTP hostname is bypassable by any later code path. Network-level isolation is the enforceable control.

Evidence the brief itself labels as pending and that must precede dispatch: three fresh opinions, Devin write scope and branch, and a real stop control. The create schema has no budget field and the balance is small, so dispatch stays pending until a recorded ceiling and usage checks exist.

## Recommendations with rationale and affected contracts

**R1. Default-deny RLS plus a single context wrapper.** Every application table gets `ENABLE` and `FORCE ROW LEVEL SECURITY`. Policies read a transaction-local setting and treat empty string as denial, because `current_setting(name, true)` returns empty text, not NULL, when unset. All data access from the API goes through one wrapper that opens a transaction, validates the claims object, and issues `SET LOCAL`. Add a meta-test that fails if the test connection role has `rolbypassrls` or owns any application table. Affects the role design in BE-01 item 3 and item 5, and the D-02 pooled-connection decision. Evidence: brief item 5 and D-02 describe transaction-local context but neither states default deny.

**R2. Rails is the only Storage principal.** Keep one private bucket with no anon or authenticated policies at all. Rails holds the Storage credential server-side and proxies uploads and downloads after its own authorization. Then "foreign-principal denied" is proven by direct Storage calls with anonymous and user JWTs both failing, and the authorized path succeeding only through Rails. This resolves blocker 2 without writing policies into the storage schema and matches D-01. Record that the API process holds a Storage-privileged credential while its database role stays restricted. Tradeoff: large uploads stream through Rails; acceptable for ten staff, revisit in BE-05.

**R3. Enforce no-live by network topology, not strings.** Place postgres, auth, storage, API, worker and Mailpit on a Compose network marked internal, with no default route out. Image pulls and bundle installs happen in build stages on a separate network. Keep the SMTP allowlist check as a second layer. Mailpit relay must be absent from its configuration, and GoTrue external providers disabled. Affects item 6 and D-06.

**R4. Minimal component set, named.** Run only the official postgres image, GoTrue, storage-api and Mailpit. Omit Kong, PostgREST, Studio, Realtime, Functions, analytics and Supavisor locally. Not running PostgREST plus revoking all grants for `anon`, `authenticated` and `service_role` on the application schema is the simplest way to satisfy "deny Data API access." Document each omitted component and its production consequence for OPS-01. Dependency caveat: storage-api needs imgproxy only for transforms, so confirm it starts without it against the pinned release. This is a hypothesis pending the separate pin audit.

**R5. Identity references without cross-schema coupling.** Store the Supabase user ID as a plain UUID column with no foreign key into `auth.users`. A hard FK ties Rails migrations to Auth internals and makes Auth restores order-dependent. Rails owns membership lifecycle.

**R6. Session shape that BE-02 does not have to rip out.** BE-01 verifies signature, issuer, audience and expiry and requires a `session_id` claim to be present. Supabase documents that a valid JWT can outlive sign-out, so BE-01 records revocation as unimplemented and exposes no protected business routes. This avoids an "artificial auth stub" while leaving the interface stable.

**R7. Outbound hold lives outside the database from day one.** Even though BE-01 dispatches nothing, create the hold as a runtime input (environment or ops file) defaulting to held. D-05 requires that restoring an old database cannot release dispatch. Deciding its location in BE-01 prevents BE-03 from putting it in a table.

**R8. Narrow Devin's documentation writes.** The brief lets Devin edit README, state and planning docs that the coordinator also edits. That creates two writers on one file family. Give Devin one evidence file plus code paths; the coordinator folds results into shared docs.

**R9. Baseline measurement.** Record idle RAM, CPU and disk of the minimal set after bootstrap. It costs little and gives OPS-01 a comparison point.

## Strongest objection and failure sequence

The pool test as written can pass while a leak remains. Rails does not wrap plain reads in a transaction. If any request path sets context with session-level `SET`, or sets it outside the transaction block, the claims survive checkout.

Failure sequence (hypothesis, not demonstrated):

1. Request A opens a connection, sets user A context, raises a Ruby exception after the SET but before any commit.
2. The connection returns to the pool. With `SET LOCAL` outside a transaction, PostgreSQL only warns and applies nothing, so a later `SET` fallback or a plain `SET` would persist.
3. Request B, a read-only endpoint with no transaction wrapper, checks out the same connection and reads with A's claims.
4. If policies allow rows when context is non-empty, B sees A's private mailbox.

Proposed regression (not run): one-connection pool, user A sets context then raises; user B issues a plain read with no wrapper; assert zero rows and an explicit denial. Also assert that querying any application table with no context at all returns nothing under the restricted role.

Simpler alternative: skip RLS and rely on Rails scoping only. Tradeoff: one missed `where(organization_id:)` becomes a leak, and D-02 explicitly rejects this. Keep RLS, but with default deny.

## Acceptance checks and residual uncertainty

All proposed, none run:

- Restricted role with no context reads zero rows from every application table.
- Pool alternation across commit, exception and rollback never authorizes the next transaction; plain unwrapped read denied.
- Meta-test: test role lacks `rolbypassrls` and owns no tables; tests fail if run as superuser.
- Forged cross-organization foreign key rejected by composite constraint, tested as the restricted role.
- Direct Storage access with anonymous and user JWTs denied; Rails path succeeds; object survives restart.
- From the checks container, connecting to a mail provider hostname fails at the network layer.
- Mailpit holds a signup or invite message; configuring any other SMTP host fails bootstrap.
- Worker starts, reports health, and the hold reads as held after a database restore that contains a "released" marker.
- Repeat seed produces no duplicate memberships or mailboxes.

Residual uncertainty:

- GoTrue signing algorithm and whether asymmetric keys are available in the pinned release. With HS256, any service holding the shared secret can forge user tokens. Evidence gap for the pin audit.
- Whether storage-api starts without imgproxy and Kong in the pinned release.
- The Ruby type checker is a BE-01 decision. Criterion: one tool, scoped to configuration and domain modules, running in the Docker checks container. Do not block acceptance on coverage.
- Devin's ability to push a branch and open a draft PR is unproven. The read-only preflight proves read capability only.

## Top three cross-task recommendations

1. **Default-deny RLS with a fail-closed wrapper** is the single highest-value correctness decision. It converts future missed checks in BE-02 through BE-05 from leaks into denials.
2. **Rails as sole Storage principal and network-level egress denial** remove two whole policy surfaces that would otherwise need auditing in every later task.
3. **Settle dispatch preconditions in order:** three opinions, then write scope and branch, then a recorded cost ceiling with a supported stop action, then session creation. The brief's own evidence table shows all four pending.

## Hard contradictions

- Private Storage with per-principal denial versus "never hand-edit Supabase internal schemas." Resolved by R2.
- Devin allowed to edit README, state and planning docs versus "one writer per owned area." Resolved by R8.
- "No artificial auth stubs" versus revocation deferred to BE-02. Resolved by R6, provided BE-01 exposes no protected business routes.

Out of BE-01 scope and confirmed unaffected by this design: duplicate approvals, lease races, retry-window expiry, inbound replay, untrusted email reaching agents and native IPC. BE-01 should only establish the composite organization key pattern those later invariants depend on.
