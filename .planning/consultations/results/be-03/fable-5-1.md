# BE03 opinion provenance: fable-5-1

- Requested and observed model: `claude-fable-5-1`; observed in `modelUsage.claude-fable-5-1.canonicalModel`.
- Session: `3b8d23c4-e57a-43de-8e05-c8b69026b704`; exit `0`; JSON `result/success`, `is_error=false`.
- Common packet: `e73bb1beeda205a2a952324f8b0a2a54c384e743de56bc7933e1609fd6044444`; bases and source ranges in [source manifest](source-manifest.json).
- Full prompt hash: `7549e7db74bffdc7cf688da7338c1ac818b9ed921de97a374e84f7319a783772`.
- Fresh isolated tools-disabled process; no other opinion supplied. Raw prompts/envelopes remain ignored.
- The following is the actual opinion text. Its proposals and factual gaps are adjudicated in [decisions](decisions.md); it is not implementation approval.

---

I'll answer BE03 directly from the supplied packet with no tool use. Runtime identity is the coordinator's record, not something this text can attest.

## Verdicts by section

**Transaction and schema: change, prerequisite blocker.** The single approval transaction is feasible inside BE02's protected-write seam, but the brief's convergence rule needs a stronger key than one intent per version. The blocker is a restore case described below, where a restored intent with no persisted first attempt would submit with an aged idempotency key and duplicate an already accepted send. A restore marker check in the claim function is required before any BE03 implementation dispatch.

**Approval and canonicalization: change, optional improvement.** Freezing the draft version is sufficient to freeze reviewed content, but it does not freeze the sender address, suppression state or purpose the human saw. Bind a review digest to the approval request so a changed sender or consent fact between review and approval fails closed.

**Authorization: support with one labeled limitation.** Evidence: `scope.sql` lines 4-11 restrict draft visibility to the author with `compose`. Under the frozen C contract an approver who is not the author receives generic 404. The only possible approver in this slice is therefore the author holding `approve_send`. That is correct for the frozen bytes but it means "human review" here is self-approval, not a second reviewer. Do not describe it as four-eyes review.

**Worker and reconciliation: support with changes to the stale-worker path.** `SKIP LOCKED` claims plus a monotonic fence are right. The missing piece is a worker-local wall-clock guard before HTTP and a separate observations table that stale writers may append to but never project from.

**Restore and retry: change, prerequisite blocker.** Shared with the first section. The retry horizon anchored on `first_attempt_at` is correct for live operation and wrong after a restore that predates that anchor.

**Implementation and test scope: support.** Three slices, one migration lane, a deterministic local failure driver distinct from the BE04 simulator. All proposed tests below are NOT RUN.

## Schemas, invariants and failure sequences

**Q1, smallest approval transaction.** It runs inside `SessionWrites#transaction` at `session_writes.rb` lines 13-58, so the session row and sorted generation guards are already locked by `begin_protected_write` at `guard.sql` lines 22-33. A new definer `app.approve_draft(p_session_digest, p_mailbox, p_draft, p_operation, p_expected, p_review_digest)` executes under `elevateo_api` with the same `assert_protected_write` call used by `save_draft` at `save.sql` line 17. The ordered body is:

1. `assert_protected_write` for the actor, mapping statuses exactly as `save.sql` lines 18-23. Then `draft_scope` as line 32.
2. Explicit `approve_send` check against `app.mailbox_memberships` for actor and mailbox. Absence returns `not_available`, consistent with the C precedence table for a missing capability.
3. `pg_advisory_xact_lock('draft-id:' || p_draft)` exactly as `save.sql` line 36, so a concurrent save and a concurrent approval serialize. Then `SELECT ... FOR UPDATE` on the draft.
4. Approval ledger lookup on `(organization_id, actor_id, operation_id)` before version checks, mirroring `save.sql` lines 41-53. Same binding and digest return the original result. Different binding or digest return `operation_mismatch`.
5. Convergence. If the draft is `consumed` and the existing intent's `approved_version` equals `p_expected`, return that intent with 200 and record the new operation as `converged` pointing to the intent. If versions differ, `draft_consumed`. If editable and version mismatch, `draft_conflict`.
6. Send-readiness evaluation. Recompute the review digest and compare. Mismatch returns `review_stale`. Readiness failure returns `send_not_ready`.
7. Insert snapshot, intent, job, audit event and ledger row. Update the draft to `consumed` with version unchanged, so BE02 fixtures that fix only the reserved state remain valid.

Proposed private-schema tables, following the `app_drafts_private` pattern at `tables.sql` lines 2-3:

| Table | Key columns and checks |
| --- | --- |
| `app_send_private.snapshots` | `intent_id` PK, `organization_id, mailbox_id, draft_id, approved_version`, frozen `subject, recipients jsonb, body_text, reply_to_thread_id, sender_address_id`, `content_digest` 64 hex |
| `app_send_private.intents` | `id` PK, `elevateo_send_id uuid NOT NULL UNIQUE`, `organization_id, mailbox_id, draft_id`, `approved_by uuid`, `approved_at`, `review_digest`, `UNIQUE (organization_id, mailbox_id, draft_id)`, FK to drafts composite |
| `app_send_private.jobs` | `intent_id` PK, `state` enum, `lease_owner uuid`, `lease_expires_at`, `fence_generation bigint NOT NULL DEFAULT 0`, `attempts int`, `first_attempt_at`, `retry_horizon_at`, `next_attempt_at`, `dispatch_authorized_at`, `cancelled_at`, `reconciled_at` |
| `app_send_private.attempts` | `(intent_id, attempt_no)` PK, `fence_generation`, `started_at`, `deadline_at`, `outcome` enum, no response bodies |
| `app_send_private.observations` | `id` PK, `intent_id`, `elevateo_send_id`, `source` enum, `provider_event_id text`, `observed_fence`, `kind`, `projected boolean`, `UNIQUE (source, provider_event_id)` |
| `app_send_private.approval_operations` | `(organization_id, actor_id, operation_id)` PK, `draft_id, expected_version, review_digest, outcome, intent_id, recorded_at, detail_expires_at`, same 604800 second compaction as `tables.sql` line 36 |

The one-intent-per-draft uniqueness, not per version, is the invariant that makes two approvals with different operation IDs converge. The unique index converts any race that escapes the advisory lock into a constraint error rather than a second intent.

State enum and legal transitions:

```text
queued -> cancelled            human cancel before dispatch_authorized_at
queued -> dispatching          claim + dispatch authorization
dispatching -> accepted        fenced result write or fresh reconciler
dispatching -> rejected        definitive provider rejection, fenced
dispatching -> unknown         timeout or ambiguous, fenced
unknown -> dispatching         same key, same bytes, now < retry_horizon_at, attempts < max
unknown -> accepted            fresh reconciler with authenticated observation
unknown -> needs_review        now >= retry_horizon_at, or attempts exhausted
needs_review -> accepted       reconciler with authenticated observation only
```

No transition writes `queued` from any other state. No startup routine touches `dispatching`.

**Q2, contracts and what the human sees.** Version the additive contract as `1.0.0-send.1`. Paths: `GET /v1/drafts/{draft_id}/review?mailbox_id=`, `POST /v1/drafts/{draft_id}/approvals`, `GET /v1/send-intents/{intent_id}?mailbox_id=`, `POST /v1/send-intents/{intent_id}/cancel`. New closed codes added to `CollaborationError`: `review_stale`, `send_not_ready`, `dispatch_started`, `dispatch_held`. All existing C/D codes, paths and fixtures stay byte-identical.

`ReviewPayload` is exactly `context_id, authorization_version, draft_id, mailbox_id, version, sender, to, subject, body_text, reply_to_thread_id, purpose, recipient_policy, attachments, attachments_supported, sendable, readiness_reasons, review_digest`. `sender` is `{address_id, address, display_name}` derived from the mailbox, never from the request. `recipient_policy` is a per-recipient array of `{address, suppressed, consent}` evaluated at review time. `attachments` is always `[]` and `attachments_supported` is always `false` in this slice, so absence is explicit rather than implied. `purpose` is the single literal `correspondence`. The review digest is SHA-256 over an ordered array `[mailbox_id, draft_id, version, sender address, [[display_name, address]...], subject, body_text, reply_to_thread_id, purpose, [[address, suppressed, consent]...]]` using the exact canonical rules of the C contract section 5.

`ApprovalInput` is exactly `mailbox_id, operation_id, expected_version, review_digest`. `ApprovalResult` is `intent_id, elevateo_send_id, operation_id, approved_version, state, approved_at`. `SendIntentStatus` is `context_id, authorization_version, intent_id, mailbox_id, draft_id, state, attempts, first_attempt_at, retry_horizon_at, dispatch_authorized_at, last_observed_at, cancellable`. No content in status. Mailbox readers see status; `approve_send` holders may cancel.

Unsent-draft validation stays BE02's: empty subject, empty body and incomplete addresses are valid unsent content per C section 4. Send-readiness adds: at least one recipient with a non-null address, every address syntactically bounded and parseable, a resolvable active sender address on the mailbox, no suppressed recipient, mailbox not disabled, and the reply thread still readable when non-null. Readiness never mutates the draft.

Human-only approval is enforced at the database, not the controller. `assert_protected_write` at `assertions.sql` lines 8-14 requires the private transaction marker set only by the cookie-bound guard. A future connector presenter that lacks a session row cannot set that marker, so it cannot execute `approve_draft` regardless of API code. That is the structural guarantee that model output and read/draft grants cannot impersonate approval.

Upgrade and rollback lane: one migration creating the private schema, tables, functions and grants in the same shape as `20261013000004_create_app_drafts_operations.rb`. Down is explicitly destructive and must refuse when any intent row exists, because dropping an intent with an issued `elevateo_send_id` erases the only replay tombstone.

**Q3, claims, leases, fences and dispatch authorization.** Worker functions execute as `elevateo_worker` through definer entrypoints and must not read `app.user_id` or `app.org_id`. The BE02 tenancy wrapper's context reset protects pooled connections for the API; worker connections never set those parameters at all. Isolation is READ COMMITTED, matching the explicit requirement at `guard.sql` lines 19-21.

```sql
-- claim: worker takes only the job row; humans take session, generations, then job
WITH candidate AS (
  SELECT intent_id FROM app_send_private.jobs
  WHERE state IN ('queued','unknown') AND next_attempt_at <= clock_timestamp()
    AND (lease_expires_at IS NULL OR lease_expires_at <= clock_timestamp())
    AND (retry_horizon_at IS NULL OR retry_horizon_at > clock_timestamp())
    AND (reconciled_at IS NOT NULL OR created_at > app_send_private.restore_marker())
  ORDER BY next_attempt_at, intent_id LIMIT 1 FOR UPDATE SKIP LOCKED)
UPDATE app_send_private.jobs j SET lease_owner = $1, lease_expires_at = clock_timestamp() + $2,
  fence_generation = fence_generation + 1
FROM candidate WHERE j.intent_id = candidate.intent_id
RETURNING j.intent_id, j.fence_generation, j.lease_expires_at;
```

Dispatch authorization is a second short transaction. It locks the job row `FOR UPDATE`, verifies `fence_generation = held` and `lease_expires_at > clock_timestamp()` by database clock, then checks in order: `cancelled_at IS NULL`, mailbox not disabled, approver still holds `approve_send` in the current membership row, no recipient suppressed. Any failure writes `cancelled` or `needs_review` with an audit row and no provider call. Success writes `dispatch_authorized_at`, sets `first_attempt_at` if null, sets `retry_horizon_at = first_attempt_at + policy horizon`, inserts the attempt row and commits. Only after commit does HTTP begin.

Lock ordering is deadlock-free by construction. Humans acquire session, sorted generation guards, then the job row through `cancel_send_intent`. Workers acquire the job row only and read membership and suppression without locks. A revocation committed after the worker's read is the documented after-boundary case from `contracts-and-reliability.md` lines 56-57, not a bug.

**Q4, crash windows and stale observations.** `elevateo_send_id` is generated inside the approval transaction, so it exists before any claim. The windows:

| Window | What persisted | Behavior |
| --- | --- | --- |
| After claim, before authorization | lease, fence | Lease expires, reclaimed, no send happened |
| After authorization, before HTTP | `first_attempt_at`, horizon | Reclaimed, retry same key within horizon |
| During HTTP, no response | attempt row | `unknown` on reclaim; retry same key if before horizon |
| Response received, crash before commit | attempt row only | Provider holds the result; retry same key returns it, or an observation arrives through BE04 |
| Stale worker resumes after reclaim | old fence | Its result write matches zero rows; it must insert into `observations` with `observed_fence` and `projected=false` |

The fresh reconciler polls `observations WHERE projected=false`, locks the job row, and projects only when the observation's `elevateo_send_id` matches the intent and the source is authenticated. Projection never lowers a known `accepted`.

What the fence cannot prevent: a suspended worker whose lease expired can still emit an HTTP request after it wakes. Within the provider window the same key should deduplicate. Outside it, or if the provider's dedup fails, a duplicate send occurs and no database write can recall it. Required mitigation, design judgment: before opening the socket the worker checks its own clock against `lease_expires_at` minus the HTTP timeout, refuses if exceeded, and sets the HTTP timeout strictly shorter than the lease. This narrows the window to clock skew plus scheduler pause. It does not close it, and the design must say so.

**Q5, horizon expiry, provider policy seam and restore.** Provider policy is a typed Ruby value `SendProviderPolicy` with `idempotency_window_seconds`, `clock_skew_seconds`, `max_attempts`, `source_url`, `checked_on`. Horizon equals `window - skew - lease - http_timeout`. BE03 ships no production value. The local failure driver carries an explicit window such as 600 seconds with an injectable clock. The packet's primary research dates Resend's 24-hour window to 2026-10-13 and states it is not a lookup promise; the 23-hour figure in `contracts-and-reliability.md` line 60 remains an assumption. Absent policy evidence at boot, the worker refuses to claim and reports `dispatch_held`.

Prohibited recoveries, each enforced by a test: no new `elevateo_send_id` on an existing intent, no re-rendering from the draft at retry time because the worker reads only the snapshot, no writes to `first_attempt_at` after it is set, no automatic clone, and no UPDATE of `dispatching` rows by state at startup.

The restore failure sequence that drives my blocker:

1. Backup taken at T0 with intent X `queued`, `first_attempt_at` null.
2. At T1 the lost timeline dispatches X and the simulator ledger records acceptance.
3. At T0 plus 30 hours the database is restored. X is `queued` with no anchor.
4. Operator releases the external hold. The claim sees no horizon, no first attempt, submits with the same key.
5. The provider window has long expired. A second message is sent.

The external hold alone does not prevent this because the hold is released before anyone compares X against the external ledger. Required: the restore procedure writes a `restore_marker` row inside the restored database with the restore wall time and the backup's snapshot time. The claim function refuses any intent created before the marker unless `reconciled_at` is set. Reconciliation against the external acceptance ledger sets `reconciled_at` with outcome `accepted` or `needs_review`. Unresolved intents never dispatch. BE03 can only test this with the local failure driver's ledger; the full BE04 drill remains open.

**Approval failure sequence.** Device A loads review at version 4 and sees sender `support@`. The mailbox's sender address is changed to `billing@` by a manager. Device A approves with `expected_version 4`. Version matches, so without the review digest the message is sent from an address the human never saw. With the digest the approval returns `review_stale`. Regression: change the sender between review and approval and assert `review_stale` with no intent row.

**Duplicate approval sequence.** Devices A and B approve version 4 with different operation IDs within the same second. The advisory lock serializes them. The second sees `consumed` with `approved_version 4` and returns the same `intent_id`. Both ledger rows exist, one `applied` and one `converged`. Replay of either returns its own original result.

**Inbound replay note.** Observations are keyed on `(source, provider_event_id)`. A replayed event inserts nothing and projects nothing. An event whose `elevateo_send_id` matches no intent is stored as orphaned, never attached by recipient or time heuristics.

## Acceptance checks, cross-task recommendations and contradictions

Every item below is a proposed test, NOT RUN, requiring real PostgreSQL in Docker.

- **Convergence:** two concurrent approvals, different operation IDs, same version, yield one intent and one `elevateo_send_id`. Different version yields `draft_consumed`.
- **Impersonation:** calling `approve_draft` from a connection without the write marker raises the `42501` guard error from `assertions.sql` line 14. A `compose`-only member gets `not_available`.
- **Cross-mailbox:** status GET with a readable but wrong `mailbox_id` returns 404. Snapshot body is unreadable through any API grant.
- **Pooled claims:** worker connection with stale `app.user_id` set manually still cannot read drafts or snapshots through worker grants.
- **Lease race:** two workers claim once; the loser's result write affects zero rows and lands in observations; reconciler projects the winner.
- **Stale projection:** advance the clock past lease expiry, reclaim, then let the stale worker report acceptance. Job shows acceptance only after the reconciler runs, with `projected=true`.
- **Horizon expiry:** fake clock past `retry_horizon_at` produces `needs_review` with zero new driver submissions.
- **Crash fixtures:** kill the worker after each of the five windows and assert the driver's submission count never exceeds one per intent.
- **Cancel race:** cancel committed before authorization yields no submission; cancel after yields `dispatch_started`.
- **Restore marker:** restore a copy with X queued and the driver ledger showing acceptance; release hold; assert `accepted` with no new submission, and a second intent without ledger evidence lands in `needs_review`.
- **Startup:** restart with `dispatching` rows and assert no state changes without a lease expiry.

Docker matrix: migrate up from BE02, migrate up twice, refused down with intents present, all failure fixtures above, and C/D fixtures unchanged under the send-versioned contract.

Implementation slices and ownership:

1. **BE03-A, approval and review.** Migration, `approve_draft`, review reader, approval controller, contract additions. Depends on accepted BE02 C/D bytes.
2. **BE03-B, queue and dispatch.** Jobs, attempts, claim and authorization functions, worker loop, policy seam, local failure driver. Depends on A.
3. **BE03-C, observations and restore.** Observations table, reconciler, restore marker, cancel endpoint. Depends on B. BE04 attaches real provider sources later.

Simpler alternative: drop the review digest and rely on version equality alone. It removes one digest computation and one error code. The cost is the sender and suppression drift case above, which I consider real because membership and mailbox administration already exist in D. I recommend keeping the digest.

Top three cross-task recommendations:

1. **Make the restore marker and reconciliation gate a hard precondition** of releasing the external hold, and carry that requirement into BE04 and OPS-01 acceptance.
2. **Keep `observations` as the only path for stale or late evidence** so BE04's webhook and retrieval sources plug into one reconciler rather than writing projections.
3. **State plainly that this slice is author self-approval** because of C's actor-owned drafts. A second-reviewer workflow would require a reviewed draft-sharing contract change and fresh opinions.

Hard contradiction: `documentation.md` lines 93-96 describe mailbox roles viewer, contributor and sender, while BE02-D06 and the brief require explicit `approve_send` capability with no role inference. The brief governs. Softer tension: `docs/end-goal.md` line 34 and `contracts-and-reliability.md` line 14 imply a human reviews then approves, while the frozen C contract makes non-author review impossible. Both cannot be true in this slice.

Evidence gaps: no suppression table, sender address table or mailbox disabled flag appears in the packet, so the readiness checks above assume BE03 introduces minimal versions of each. The actual Resend tag, key and lookup behavior remains BE04 evidence.
