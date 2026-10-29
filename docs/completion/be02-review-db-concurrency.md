# BE-02 database concurrency review

Review date: 2026-10-13. Reviewer: dispatched Codex adversarial reviewer.
Task: `task_092fd31c9882`; dispatch: `ctx_f7f2e557f4a4`.

<!-- AIDEV-NOTE: Findings apply only to the hashed SQL snapshot; execution and corrections belong to the coordinator. -->

Status: bounded static review complete; changes required in the reviewed snapshot.
Two confirmed P1 defects; **2 / 249 x 1,000 = 8.03 defects/KLOC**.
Questions and unverified test coverage are excluded from this count.
No product edits, tests, Docker actions, commits, or shared-document edits were performed.
The coordinator accepted DB-CONC-01 and reported that it is correcting post-lock
expiry handling. This report does not review or certify those subsequent corrections.

## Coverage and evidence boundary

| Assignment | File | Exact lines | Unique LOC | SHA-256 of file bytes |
| --- | --- | --- | ---: | --- |
| Slice 1 | `apps/server/db/be02/entry.sql` | 1-71, entire file | 71 | `ce3d90535aa4aaa1fbb0edcc59ba0dedd4d2b8f58d20d053a0bb1beb729be671` |
| Slice 1 | `apps/server/db/be02/refresh.sql` | 1-91, entire file | 91 | `a71de77e9ddd677ab3495532bd16eaf764e6b7798e87ca2156f34bd0123aaebd` |
| Slice 2 | `apps/server/db/be02/revocation.sql` | 1-87, entire file | 87 | `6f35e1a45c9967372679b19feefc9e60a8f1a21b67424944ade4f2d08154015f` |

Slice 1: 162 lines. Slice 2: 87 lines. Total: **249 unique physical source lines**,
including comments and blank lines, without double counting. No other implementation
or test file was read. Each slice is below 200 lines; the task total is below 400.

A final hash-only check found that all three source files changed during coordinator
repairs. The reviewed hashes above remain the evidence boundary; changed source was
not read or re-reviewed. Completion-time hashes, for distinguishing the versions:

- `entry.sql`: `9f967a4ac741618971823d0080be6cf52d34110772c654c37acb4c920f3b214b`
- `refresh.sql`: `e1156f456dc773f3fbda2529ac0b85493a9fb4ec51fbc3b9c1b9379b6ee3ad7f`
- `revocation.sql`: `d0b69ad8a5f8ebd7a7a09560a55877269c1894267d8dd280afcbd3bd5d5a4885`

Requirements read: `.planning/STANDARDS.md`,
`docs/completion/be02-session-database-interface.md`, and the full review rubric
in this dispatch. The dispatch supplied the historical rubric despite the standards
file's older note that it was unavailable. Formatting was excluded as instructed.

The global-logout requirement is explicitly the committed session set at its initial
sorted lock query. A separately authenticated login after that cutoff is permitted;
HTTP/Auth and PostgreSQL do not form one atomic transaction. This review does not
treat that accepted boundary as a defect.

## Confirmed defects

### DB-CONC-01 — P1: Refresh can publish after its claim expires during a generation-lock wait

Evidence: `refresh.sql:47-48` checks policy, state, and the ten-second deadline.
For a session whose organization is null, `refresh.sql:55-65` can then block on
generation insertion or `lock_authorization_generations`. The unconditional update
at `refresh.sql:67-71` sets the session active, clears its claim, and publishes
credentials without another claim-deadline check after that wait.

Reproduction schedule for a coordinator-owned PostgreSQL regression:

1. Create an organization-null session and claim its refresh. Make an organization
   membership available before publication.
2. Another transaction, operating through a different local session for the same
   user, holds the selected organization's generation guard.
3. Invoke publication while its ten-second deadline is still live. It passes the
   check at line 48, locks its own session row, and waits on the generation guard.
4. Release the guard after the refresh deadline. Keep membership valid. Publication
   proceeds to the active-state update and returns `ok` instead of `unauthorized`.

The reconciler cannot close this window: `revocation.sql:46-47` skips the session
row while publication holds it. This violates the documented live-claim publication
rule and terminal treatment of expired claims. This is a static interleaving proof,
not an executed reproduction.

Correction: after all potentially blocking generation guards, revalidate the claim
deadline and current session policy immediately before changing credentials. Route
failure through the existing terminal/revocation-intent path so the returned access
credential remains durably available for disposal. Preserve the row lock and the
existing identity/claim/generation comparisons.

PostgreSQL row locks can wait until the conflicting transaction releases them;
this makes the intervening wait material. See [PostgreSQL row locking](https://www.postgresql.org/docs/current/explicit-locking.html#LOCKING-ROWS).

Sent immediately to the coordinator as escalation `msg_513b2a4a73ef`.

### DB-CONC-02 — P1: A switch blocked past idle expiry can revive the expired session

Evidence: `entry.sql:47` can wait for a session row; both status checks at
`entry.sql:48` and `entry.sql:56` run after that wait. The coordinator's prose-only
helper summary confirms that `session_status` compares local absolute/idle expiry
and Auth lifetime against `statement_timestamp()`. That timestamp is still the
start of the outer SQL statement. The update at `entry.sql:67-69` renews idle expiry
to the same statement-start time plus 30 minutes.

Reproduction schedule: give a valid session an idle deadline slightly in the future
while its absolute/Auth deadline is much later. Transaction A locks the session row
without changing it. Transaction B starts a valid organization switch before idle
expiry, with the correct expected context/generation, and blocks at line 47. Release
A after idle expiry but before B's start time plus 30 minutes. Both status checks
still treat B's statement-start time as current, so B rotates context/CSRF and
extends idle expiry despite the intervening expiration.

This revives the local session instead of denying it. Fresh Auth HTTP checks on
later requests do not repair the violation: Auth can remain valid while the local
idle lifetime should have ended, and the stored idle deadline has now been extended.
The same stale-clock dependency affects global-logout authorization after its sorted
row-lock wait (`revocation.sql:16-23`) and the refresh status callers; these are
instances of this one clock defect, not additional counted findings.

Correction: use current wall-clock expiry checks at the point the required guards
have been acquired and immediately before a write that extends or uses session
authority. Keep the database-snapshot policy for Auth catalog visibility separate
from elapsed-time checks. Preserve read-only authorization support when changing
the shared helper; no helper implementation was inspected in this review.

The fixed statement timestamp and advancing wall clock are documented in
[PostgreSQL current-time semantics](https://www.postgresql.org/docs/17/functions-datetime.html#FUNCTIONS-DATETIME-CURRENT).
This is confirmed by the assigned callers plus the coordinator's helper summary;
the interleaving has not been executed by this worker. Sent as escalation
`msg_cb2053becbf0`; the coordinator already owns the clock correction.

## In-scope checks completed

| Area | Static assessment |
| --- | --- |
| Creation/fixation | `entry.sql:7-22` validates through helpers, rejects missing identity/context, and performs a plain session insert. It does not replace an existing cookie row on collision; uniqueness enforcement is supplied by the documented schema contract. |
| Organization switching | `entry.sql:47-65` serializes the session, orders current/target generation guards, rechecks status, compares expected context/generation, checks target membership, and requires both context and CSRF rotation. Its expiry check has DB-CONC-02. |
| Refresh contention/CAS | `refresh.sql:8-24` locks the row, returns contention for a live claim, and terminalizes an expired claim without returning its refresh token again. `refresh.sql:37-53` binds publication to identity, claim, generation, state, and deadline, subject to DB-CONC-01. |
| Failed refresh | `refresh.sql:84-90` requires the exact refreshing claim and generation before setting terminal uncertainty and queuing disposal. A revoked row cannot be made active by this path. |
| Local/global logout | `revocation.sql:10-30` captures a sorted locked set, checks global authority afterward, preserves prior global scope, and changes local state plus intent in one transaction. Local missing-cookie logout remains idempotent; global missing-cookie logout denies. |
| Worker boundaries | `revocation.sql:38-44` validates claim/limit and caps rate-bucket cleanup at 100. Claims cap work at 1-20; an empty claim result is `[]` at lines 66-69. |
| Worker ownership | `revocation.sql:57-68` claims with row locks and `SKIP LOCKED`; `revocation.sql:79-85` rejects missing, replaced, non-claimed, and expired acknowledgements. Worker claim UUID freshness is a caller responsibility unless otherwise enforced. |
| Eight attempts | `revocation.sql:52-65` terminalizes expired eighth claims and never selects attempts >=8 for another claim. `revocation.sql:82-84` marks an acknowledged eighth failure terminal and applies bounded backoff to earlier failures. |
| Boundaries/security | Visible external scalars have explicit validation or named validation-helper calls; no dynamic SQL or secret logging appears. Functions pin the search path. Actual role grants, encryption, Auth attestation, and helper/RLS behavior are outside these slices. |
| Maintainability/performance | Functions retain distinct lifecycle responsibilities, shared validation/metadata/queue helpers, and useful intent comments. No speculative restructuring is requested. Global logout's work scales with the captured session set, as its all-session contract requires; no measured performance finding is claimed. |
| Documentation | The interface documents claims, deadlines, logout cut, limits, and unexecuted integration tests. Both confirmed findings violate the documented time boundaries. |

## Helper-interface evidence and remaining question

The coordinator supplied the following prose-only evidence through the dispatch's
blocking `ask` reply. It is attributed evidence, not an additional source review:

- `session_status` rejects absent, revoked, uncertain, mismatched/null-identity, and
  locally expired sessions; missing selected membership yields not_found. It uses
  statement time for expiry. Refreshing state is contention unless explicitly
  allowed; an expired ordinary refresh is unauthorized.
- `auth_deadline` binds Auth session ID/user and takes the earlier of creation plus
  12 hours and not_after. It requires finite creation no later than statement time.
  `check_credentials` enforces ciphertext lengths 1-16384 and finite future access
  expiry against statement time.
- `queue_revocation` is unique on cookie digest, credential generation, and scope.
  Equal ciphertext is a no-op in every state. Changed ciphertext resets pending,
  clears the claim, resets attempts to zero, and schedules it at statement time,
  including when the old intent was claimed/completed/failed. This protects the
  visible finish path from acknowledging a replaced credential under an old claim.
- Session checks pair claim/deadline nullness and require a claim while refreshing.
  Intent attempts are constrained to 0-8; intent claim-pair/state consistency has no
  corresponding table CHECK. Visible state writers keep those fields consistent;
  this review found no concrete reachable violation to count as a defect.

One question remains uncounted: is database publication retry after an ambiguous
successful commit forbidden or supported? Replaying a successful `publish_refresh`
hits `refresh.sql:42-45` because success cleared the claim. It queues revocation of
the supplied credential, which may still be the session's active credential. The
dispatch's late-response disposal rule may intentionally accept this fail-closed
outcome. The caller's retry contract must make that behavior deliberate; without a
retry requirement, it is not asserted to be an implementation bug.

## Tests and remaining verification

**Executed tests: zero.** This worker was expressly prohibited from host tests and
Docker. The supplied interface describes 14 authored database integration tests and
marks them unexecuted; their source and assertions were outside this assignment.
The coordinator confirms existing coverage for two refresh claimants, a pre-expired
claim, a late result after logout, a wrong worker claim, successful/failed completion,
backoff, and an explicitly failed eighth attempt. It confirms missing tests for
lock-wait expiry, duplicate successful publication, stale completion after credential
replacement, and an abandoned eighth claim. The following matrix combines these
confirmed gaps with regression/evidence requests; no test pass is inferred:

| Scenario | Required assertion |
| --- | --- |
| DB-CONC-01 generation-lock wait | Publication that passes its first check but acquires the generation guard after deadline returns unauthorized, remains terminal, and persists the newly returned credential for disposal. |
| Session expiry during row/generation waits | Switching/refresh must not renew idle expiry after it has elapsed; check absolute/Auth expiry at the same boundary. |
| Creation collision and null/boundary values | Duplicate digest leaves the existing session untouched; invalid identity/CSRF/ciphertext/claim/limit values fail deliberately. |
| Refresh competition and terminal state | Exactly one claimant obtains the token; losers get contention; expiry or failure cannot reissue that token. Wrong binding/claim/generation never publishes. |
| Logout overlap | Both sides of the documented login cutoff are exercised; refresh completion after local/global logout cannot reactivate a captured session. |
| Revocation replacement and stale acknowledgements | A newly returned credential is not lost behind an earlier claimed/completed/failed intent; a superseded worker cannot finish the new work. |
| Worker crash/retry limits | Attempts 1-7 reclaim after lease expiry; eighth acknowledged failure and eighth abandoned lease become failed; no ninth claim; late or wrong acknowledgements return not_found. |
| Empty/maximum batches | Empty queue returns an array; limits 1 and 20 work; 0, 21 and null fail; competing workers do not simultaneously own one intent. |

The coordinator owns corrections, container execution, consolidation into
`code-reviews.md`, and any broader authorization or application review.
