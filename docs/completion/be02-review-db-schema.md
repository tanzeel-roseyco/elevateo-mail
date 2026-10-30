# BE-02 database schema and read-path review

Result: **2 confirmed static defects (1 P1, 1 P2) across 309 unique physical source lines: 6.47 defects/KLOC**. One additional interface question is not counted as a defect. No application tests were run, and no product code was changed. Findings apply to the frozen hashes below; coordinator-owned corrections require separate verification.

<!-- AIDEV-NOTE: Frozen hashes define coverage; coordinator owns repairs, execution evidence, and the shared log. -->

## Scope and evidence

Task `task_ba7652883611`, dispatch `ctx_a3b628b22fad`. The full adversarial review rubric supplied with this dispatch was applied, together with `.planning/STANDARDS.md` and `docs/completion/be02-session-database-interface.md`. Formatting was excluded. No other implementation or test files were inspected; role/migration/caller details below came from the coordinator's interface summary.

Physical LOC includes comments and blank lines, consistently with the assignment. Slice 1 contains 194 lines and slice 2 contains 115 lines; neither exceeds 200 lines. All six files were hashed before review, and every assigned line was reviewed exactly within these ranges.

| Slice | Source path | Exact range | Unique LOC | SHA-256 of reviewed bytes |
| --- | --- | --- | ---: | --- |
| 1 | `apps/server/db/be02/tables.sql` | 1-76 | 76 | `9e6c0ce57fb67d285228e221a49463df86e0e5bbc6378cffe92c426f8b40dc19` |
| 1 | `apps/server/db/be02/helpers.sql` | 1-78 | 78 | `bdf1c432c86bedf8c9a67a8c25bdca0a52dce9e0bf983fa103171905d391af92` |
| 1 | `apps/server/db/be02/generations.sql` | 1-40 | 40 | `10ea0d49eeed5f53a0ae24ef419860b486c5c5a0691963897cc3c27193866ba1` |
| 2 | `apps/server/db/be02/read.sql` | 1-65 | 65 | `6eb45c848aeb364b984a9cab260c3ccdc18471f61a1e70de1d19c7234ec79f1b` |
| 2 | `apps/server/db/be02/triggers.sql` | 1-7 | 7 | `af6892033d65e6df13f2072b26826ee4a91c4fd02d472993ab6f4a573efd5073` |
| 2 | `apps/server/db/be02/down.sql` | 1-43 | 43 | `dbe583b6ef62ad194d9f5143e04ba148aec9b1a323ef688d35c0673b628e18ce` |

Defect attribution uses each finding's primary location once: slice 1 has 1 defect / 194 LOC = 5.15 defects/KLOC; slice 2 has 1 defect / 115 LOC = 8.70 defects/KLOC. Combined density is `2 / 309 * 1000 = 6.47`. Interface questions, unexecuted tests, and the separate bootstrap finding reported by another reviewer are excluded from these counts.

A final hash-only check observed concurrent coordinator changes in three assigned files. Their revised contents were not read, so they add no reviewed LOC and are not approved by this report. The other three hashes remained unchanged.

| Changed file | Observed later SHA-256, not reviewed |
| --- | --- |
| `apps/server/db/be02/helpers.sql` | `9b11cbfee7eb877dde3d2de025234c6691542f203359c1a0fbfaba095eed342c` |
| `apps/server/db/be02/read.sql` | `e81e13c42ae10c352486411547e6f392acd8db6fa40c5d6c8a30f9e4827d57d0` |
| `apps/server/db/be02/down.sql` | `9b8caf4c61a37481b15b58913c93f3385629e2a8c9b64084d60bdf149c315f20` |

## Confirmed defects

### DB-SCHEMA-01 — P1: a waiting touch can revive an expired idle session

Primary evidence: `read.sql:36-40`; supporting evidence: `helpers.sql:41-47`.

`touch_session` obtains the session row with `FOR UPDATE`, calls `session_status`, then extends the idle deadline. Both the helper's local/Auth deadline comparisons and the extension use `statement_timestamp()`. That value remains fixed at the calling statement's start even if the row lock is acquired later. PostgreSQL distinguishes this from `clock_timestamp()`, which advances during statement execution. [PostgreSQL date/time documentation](https://www.postgresql.org/docs/current/functions-datetime.html#FUNCTIONS-DATETIME-CURRENT)

Static failure schedule, with valid identity, membership, Auth policy and an absolute deadline well in the future:

1. Connection A locks an active session without changing it; its idle deadline is E.
2. Connection B starts `touch_session` at E minus 100 ms and waits on A.
3. A releases its lock at E plus 100 ms, within the coordinator-described one-second lock timeout.
4. B reads the unchanged expired row but compares E with its pre-wait timestamp, passes authorization and sets a new idle deadline almost 30 minutes in the future.

This violates the interface's explicit guarantee that touch cannot revive expiry. It also permits an `ok` result when an absolute/Auth deadline is crossed while waiting, although those fixed deadlines still reject subsequent calls. This is a static concurrency proof, not an executed reproduction.

Correction: capture one wall-clock value after acquiring the session lock and use it for the mutating path's local/Auth deadline checks and idle extension. Preserve the documented fixed-snapshot behavior of protected read-only authorization. A positive general lock timeout does not close a race immediately adjacent to expiry.

Required regression: use two real PostgreSQL connections to hold/release the row across idle expiry and assert `unauthorized` with the stored idle deadline unchanged. Repeat for absolute expiry and Auth `not_after`, and retain a successful nonexpired touch case.

This finding was immediately sent through orchestration as `msg_af2d305111dc`. The coordinator accepted it and stated that a post-lock wall-clock check will be implemented; that correction was not reviewed here.

### DB-SCHEMA-02 — P2: membership reassignment bumps unrelated generation pairs

Evidence: `generations.sql:25-38`, especially `32-38`; trigger attachment: `triggers.sql:2-5`.

For membership tables, the trigger first identifies exact old/new `(organization_id, user_id)` pairs when creating tombstones. It then locks and increments rows using independent organization and user `IN` predicates. When both keys change, those predicates select a Cartesian product rather than the two affected pairs.

Concrete case: tombstones exist for `(A,U1)`, `(A,U2)`, `(B,U1)` and `(B,U2)`, and a membership moves from `(A,U1)` to `(B,U2)`. The trigger increments all four existing tombstones. The memberships represented by `(A,U2)` and `(B,U1)` did not change, yet their sessions receive a new authorization generation and can return `context_changed` from `read.sql:25-27`. The trigger also takes unnecessary locks on those pairs. The same issue applies to mailbox-membership updates that change both keys.

Correction: for membership events, use the exact distinct old/new pairs for both row locking and updating, as the insertion loop already does. Preserve the separate intentional organization-wide branch for mailbox events. If key reassignment is forbidden by the product, enforce that invariant explicitly rather than relying on it implicitly here.

Required regression: initialize all four generation rows, change both membership keys to an unused target membership pair, and assert only the old/new pairs advance. Also cover one-key changes, delete/re-add, and the intentional all-users mailbox branch. This behavior is established from the predicates; no runtime reproduction was executed.

## Review checklist and practical limits

| Area | Assessment from assigned code |
| --- | --- |
| Input boundaries, nulls and limits | Digest null/format validation and ciphertext byte bounds are explicit. Credentials reject null, nonfinite and already-expired timestamps. Organization list rejects null/0/51 limits, accepts 1..50 and fetches one bounded lookahead row. UUID/bigint parsing remains PostgreSQL's responsibility. |
| Missing session and identity binding | A missing row is rejected via null cookie digest. Null/mismatched identities and revoked/uncertain states fail closed. Membership rejection precedes context/version hints. |
| Null or removed membership | `has_membership` uses `EXISTS`; null organization yields false rather than a nullable authorization result. Read functions return `not_found` before emitting metadata or credentials. Coordinator confirms persisted no-org cookies and removed selected memberships deliberately return 404, with no implicit organization switch. Only explicit refresh may bootstrap an org-null session. |
| RLS and definer boundaries | Read entrypoints use `SECURITY DEFINER` with `search_path = pg_catalog`; application relations are schema-qualified. Membership/metadata helpers set a scoped verified-user setting from the bound session/identity. Effective grants and RLS policies reside outside this assignment; see coordinator evidence below. |
| Local and Auth expiry | Missing/nonfinite/future Auth creation is rejected; nullable `not_after` leaves the 12-hour creation cap. Local and Auth deadlines are checked on use. Mutating lock-wait expiry has defect DB-SCHEMA-01. |
| Snapshot behavior | Read entrypoints/helpers are `STABLE`; no table writes or row locks occur in the protected read functions. Touch is a separate volatile writer. PostgreSQL documents the calling-query snapshot behavior for stable functions. [PostgreSQL function volatility documentation](https://www.postgresql.org/docs/current/xfunc-volatility.html) |
| Tombstones and locking | Generations have no membership FK and survive removal/readdition. Triggers attach to both membership tables and mailboxes. Explicit guards and trigger locks sort by org/user; exact affected-pair selection has defect DB-SCHEMA-02. |
| State/data integrity | Session state, digest/ciphertext bounds, paired refresh claim fields and lifetime ordering have constraints. Revocation intents reference retained sessions and deduplicate by session/generation/scope. Remaining transition guarantees depend on lifecycle functions outside this assignment. |
| Pagination and empty lists | UUID ordering and lookahead produce a last-returned cursor only when more rows exist. No page rows produce `[]` and a null cursor. No unbounded application-side list loop was found. |
| Rollback | Explicit trigger/policy/function drops precede dependent table removal. Capability/display columns and BE-02 grants are removed; bootstrap roles and schema are retained. No broad `CASCADE` or schema drop is used. Executability and complete migration symmetry still need rollback/reapply evidence. |
| Maintainability and documentation | Helpers have bounded responsibilities; comments explain encryption ownership, snapshot coupling, tombstones, locking and rollback intent. No speculative abstraction or formatting changes are recommended. The interface records signatures, roles, lifetime policy and pending execution evidence. |

Coordinator-supplied interface evidence, not independent source inspection or real-role execution:

- Private owner is NOLOGIN/NOINHERIT/NOSUPERUSER/NOBYPASSRLS; only `elevateo_owner` is intended to set it. PUBLIC function/table/sequence access is revoked; API receives enumerated entrypoints, worker receives only the two revocation functions, and runtime roles have no private table SELECT.
- Private-owner reads of organizations and memberships use dedicated verified-user RLS policies; Auth access is limited to the four documented session columns. Another reviewer found an unexpected API-to-owner role edge was not checked during bootstrap, and the coordinator accepted that separate defect. It is not counted again here; overall role isolation cannot be signed off until that repair and real-role checks pass.
- Protected reads run REPEATABLE READ READ ONLY; local writes have their own READ COMMITTED transaction. SQL timeout is three seconds and lock timeout one second within a ten-second request deadline. DB-SCHEMA-01's example fits these bounds.
- Existing organization memberships are not seeded into the generation table during migration. `create_session` initializes its selected pair lazily; membership triggers can also create tombstones. This does not alone prove a defect because those memberships had no prior BE-02 session/version token.

## Unresolved interface question — not a confirmed defect

**Q1: initialization before switching to an existing, unseeded target organization.** The coordinator confirmed migration does not seed existing memberships and session creation initializes only the selected pair. Verify that the switch path initializes any missing target generation before locking/returning metadata. `helpers.sql:63-64` otherwise returns a null generation, and `generations.sql:6-8` cannot lock a nonexistent row. The switch implementation is outside this review; its behavior is not inferred or counted as defective.

## Test and acceptance gaps

The interface reports 14 authored database integration tests and zero executions; their source was outside this assignment, so neither case coverage nor assertions were independently reviewed. No Docker commands, host tests, SSH, paid models, subagents, commits or shared-document edits were performed. This report is the only file written by this worker.

Coordinator-owned acceptance evidence still needed:

1. Run the real-role Docker database suite after corrections, including happy paths and invalid/null identity, missing session, no membership, bounds and cross-tenant denials. Validate direct private helper/table access denial, API-versus-worker function separation, forbidden role escalation and verified-user setting isolation.
2. Add/confirm both defect regressions above. Verify delete/re-add tombstones, capability changes, mailbox changes and initialization for pre-existing membership pairs without inventing a numeric generation guarantee.
3. Prove protected reads observe a consistent snapshot across concurrent membership removal, while the next protected transaction observes revocation; confirm read-only calls remain read-only and touch runs separately.
4. Prove no-org creation/404, intentional refusal after selected-membership removal, explicit refresh bootstrap and bounded empty/paginated organization listing.
5. Roll back and reapply on a disposable database with the real owner roles. Check that BE-01 data, bootstrap roles, unrelated schema objects and existing API policies survive, while BE-02 functions/triggers/policies/columns disappear and then restore correctly.

These are execution/coverage requirements, not claims that the existing test suite lacks each case. No runtime, rollback, publication or full-system approval is asserted by this static review.
