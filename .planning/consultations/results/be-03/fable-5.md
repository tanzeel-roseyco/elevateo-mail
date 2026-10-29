# BE03 opinion provenance: fable-5

- Requested and observed model: `claude-fable-5`; observed in `modelUsage.claude-fable-5.canonicalModel`.
- Session: `697cf19a-463c-4cc9-8d2d-73df5cde97fa`; exit `0`; JSON `result/success`, `is_error=false`.
- Common packet: `e73bb1beeda205a2a952324f8b0a2a54c384e743de56bc7933e1609fd6044444`; bases and source ranges in [source manifest](source-manifest.json).
- Full prompt hash: `273c2d86255982446925f9b39fcbe417339e1c2169e506db5a39aacadeade7fb`.
- Fresh isolated tools-disabled process; no other opinion supplied. Raw prompts/envelopes remain ignored.
- The following is the actual opinion text. Its proposals and factual gaps are adjudicated in [decisions](decisions.md); it is not implementation approval.

---

# BE03 independent opinion — maintainability and smallest coherent implementation

Runtime note: I am responding as the requested `claude-fable-5` session. This is a design-only opinion; no file was edited, no test run, no agent started. Where I cite source it is the supplied packet (paths/sections quoted); everything else is labeled design judgment. All proposed tests below are NOT RUN.

Per the task-specific brief, I answer the six BE03 questions, not the five historical planning tasks.

---

## Q1. Smallest approval transaction — Verdict: support, with one schema change (prerequisite)

**Proposed minimal transaction.** One `POST /v1/drafts/{draft_id}/send-approvals` (additive, versioned; see Q2) runs a single SECURITY DEFINER function in the BE02 style, inside one `READ COMMITTED` transaction, after the only Auth HTTP call:

1. `app_auth.begin_protected_write(digest, user, auth_session, {actor})` — reuse the existing guard exactly (`be02_writes/guard.sql:1-53`). No new session mechanism.
2. Lock ordering reusing BE02 conventions: advisory lock `draft-id:<draft>` (same key as `save.sql:36`), then `SELECT * FROM app.drafts ... FOR UPDATE`.
3. Capability check: current explicit `approve_send = true` membership row for this actor/mailbox, rechecked inside the transaction after locks (mirrors `change_mailbox_membership` recheck-after-wait pattern, `be02_memberships/mutation.sql:24-28`). Shared-read, compose, or role-by-address grant nothing; a connector grant never reaches this function because only the session-cookie write path can call it (D02/D08).
4. Consume-once: `UPDATE app.drafts SET state='consumed' WHERE id=$1 AND state='editable' AND version=$expected`. Zero rows updated ⇒ `draft_consumed` or `draft_conflict` by inspection; never approve stale content.
5. In the same transaction, insert exactly four rows:
   - `app_send.snapshots(send_id, organization_id, mailbox_id, draft_id, draft_version, subject, recipients, body_text, reply_to_thread_id, content_digest, created_at)` — immutable copy of the consumed version's bytes, not a pointer. Copying costs ≤~70 KiB per send at BE02 limits and removes any coupling between later draft compaction/deletion and retry payloads.
   - `app_send.intents(organization_id, draft_id) PRIMARY KEY, send_id UNIQUE, approved_by, approval_operation_id, created_at` — **the primary key on `(organization_id, draft_id)` is the one-intent-per-draft invariant** (brief: "one intent per draft is stronger than one per version"). Uniqueness on version alone is explicitly insufficient (docs/contracts-and-reliability.md "Version uniqueness alone is insufficient").
   - `app_send.jobs(send_id PK, state 'queued', due_at, lease_owner NULL, lease_expires_at NULL, fence_generation bigint NOT NULL DEFAULT 0, attempt_count 0, first_attempt_at NULL, retry_deadline_at NULL)`.
   - `app_send.audit(audit_id, send_id, actor_id, action 'approved', recorded_at)` — metadata only; no body/addresses per STANDARDS §4.

**Approval-key convergence.** Different approval `operation_id`s for the same draft/version must converge on one send. The intent PK does this structurally: the second transaction hits the unique violation (or, with the draft row lock held, sees `state='consumed'`), then looks up the existing intent **for the same draft and content digest** and returns the same `send_id`/job. A differing digest or expected_version returns `operation_mismatch`/`draft_conflict`. Record the approval attempt in the BE02-style ledger shape (same `(actor,org,operation_id)` key discipline) so a retried approval replays its original result, consistent with the frozen C/D replay semantics (be02-cd-contract.md §5).

**Frozen-contract preservation.** `consumed` is already a reserved observable state (contract §1, §4); BE03 implements the transition without changing C/D shapes. One deliberate decision is needed: whether consumption increments `version`. The contract says the consumed fixture "does not prescribe a future BE-03 consumption version increment" (§4 rationale). **Recommendation: do not increment** — the snapshot records `draft_version` as approved; incrementing would create a version the save endpoint never produced and complicate `draft_conflict` metadata. Evidence gap: the fixture bytes themselves are omitted from the packet; confirm the consumed fixture's version value before freezing.

**Strongest failure scenario.** Approval commits, HTTP response lost. The client must not re-approve blindly: replaying the same approval operation_id returns the original result; a *different* key on the same draft converges via the intent PK. The dangerous path is a client that, seeing `draft_consumed`, clones the draft and approves the clone — that is a legitimate deliberate resend per ADR 0002, but UI must surface the existing queued job first. Acceptance check (NOT RUN): concurrent approvals with distinct operation_ids under real PostgreSQL yield exactly one intent/job and two identical responses.

**Simpler alternative considered:** reuse the C draft-operation ledger for approvals instead of a separate approval record. Rejected: the C ledger's 7-day detail expiry (`operations.sql:18-20`) is wrong for send identity, which must be durable past compaction; mixing lifetimes in one table invites a purge bug.

## Q2. Contracts, keys, upgrade lane — Verdict: support additive `1.0.0-send.1`

Additive amendment preserving all 22 paths/53 schemas byte-for-byte, same error precedence table (§2), same closed-input rules (§3):

- `POST /v1/drafts/{draft_id}/send-approvals` — body exactly `{mailbox_id, operation_id, expected_version, content_digest}`. The client-supplied `content_digest` is the Q1 canonical digest of what the human *saw*; server recomputes from the stored draft and rejects mismatch with 409 `operation_mismatch`. This is the cheapest "human approved these exact bytes" proof without resending 1 MiB.
- `GET /v1/drafts/{draft_id}/send-review?mailbox_id=` — the review payload: sender identity (derived from mailbox, never client-supplied), recipients, subject, plaintext body, reply thread id, purpose/consent status, suppression hits, and an explicit `attachments: []` constant (BE02 has no attachments; show the absence rather than omitting the field). Response includes `content_digest` and `version` so approval binds to it. **Unsent-draft validation** (what C enforces: lengths, address shape, empty allowed) is distinct from **send-readiness validation** (non-empty recipients, at least one resolvable address, consent/suppression clean, sender identity configured) — readiness failures are enumerated in the review response, and re-checked at approval and again at dispatch authorization; empty-recipient drafts remain saveable but unapprovable.
- `GET /v1/send-jobs/{send_id}?mailbox_id=` — status: `queued|cancelled|dispatching|accepted|unknown|rejected|needs_review`, attempt metadata, no body/recipients.
- `POST /v1/send-jobs/{send_id}/cancel` — succeeds only before the dispatch-authorization boundary; afterwards 409 (new code `dispatch_started`, additive to CollaborationError's closed enum via contract version bump).

All writes require Origin + CSRF + context/generation headers per §2; headers remain proofs, never grants. Model output and connector grants cannot impersonate approval because approval requires the session-cookie + CSRF + `begin_protected_write` path, which MCP grants structurally lack (D02: "future presenters must resolve to this authority"; connectors have no send tool).

**Upgrade/rollback lane:** one new migration in the existing single lane creating `app_send` schema + tables + definer functions + grants, exactly the BE02 file pattern (`20261013000004_create_app_drafts_operations.rb`). Down-migration removes `app_send` only and is explicitly destructive of send history — label it as BE02 does ("rollback is an explicit destructive migration only"). Contract rollback = serve `1.0.0-collaboration.1`; since BE03 is additive, old clients are unaffected.

**Objection/failure:** the client-supplied digest can drift from the server canonicalization (the C digest spec is exacting: §5 escaping rules). A buggy client gets permanent `operation_mismatch`. Mitigation: the review GET returns the server-computed digest; clients echo it rather than recomputing. Simpler alternative: drop the digest and bind approval to `expected_version` only — tradeoff: loses proof against a save racing between review and approval *within* the same version only if versions didn't change, which version binding already covers; the digest is defense in depth, keep it but server-issued.

## Q3. Queue claims, fencing, dispatch boundary — Verdict: support

Worker claim (short transaction, READ COMMITTED, no HTTP):

```sql
UPDATE app_send.jobs j SET lease_owner=$worker, lease_expires_at=now()+$lease,
  fence_generation=fence_generation+1,
  attempt_count=attempt_count+1,
  first_attempt_at=COALESCE(first_attempt_at, clock_timestamp()),
  retry_deadline_at=COALESCE(retry_deadline_at, clock_timestamp()+interval '23 hours'),
  state='dispatching'
FROM (SELECT send_id FROM app_send.jobs
      WHERE state IN ('queued','unknown') AND due_at<=now()
        AND (lease_expires_at IS NULL OR lease_expires_at<=now())
        AND (retry_deadline_at IS NULL OR retry_deadline_at>now())
      ORDER BY due_at LIMIT $batch FOR UPDATE SKIP LOCKED) c
WHERE j.send_id=c.send_id RETURNING ...;
```

SKIP LOCKED is exactly the documented queue-consumer use; the packet's primary research correctly notes it is not a consistent general view — fine here because each row is independently owned. Monotonic `fence_generation` is the fencing token: every later write (`finish_dispatch(send_id, generation, outcome)`) is `UPDATE ... WHERE send_id=$1 AND fence_generation=$2 AND lease_owner=$3`; zero rows means stale, and the stale worker instead inserts into an append-only `app_send.provider_observations(send_id, fence_generation, observed_at, kind, provider_message_ref)` — observations are never fenced away (Q4).

**Dispatch authorization boundary** (second short transaction, after claim, before provider I/O): recheck, in lock order consistent with BE02 (session guard not needed — worker acts on durable intent, not a session; take draft/job advisory lock, then sorted generation-guard reads, then job row):
1. cancellation (`state='cancelled'` wins — committed cancel before this boundary always sticks),
2. current mailbox existence/enabled state,
3. approver's `approve_send` revocation policy — **decision needed**: ADR direction is that revocation stops *new* requests; recommendation: a revoked approver's already-approved queued job is still dispatched unless the mailbox itself is disabled or the org removes the user, in which case hold to `needs_review`. Record whichever rule root picks as an explicit invariant; silent either-way is the bug.
4. suppression list against snapshot recipients,
5. retry deadline not passed.

Commit the boundary (`dispatch_authorized_at`), then call the submission seam outside any transaction. Cancellation after this commit returns `dispatch_started`; the UI must say cancellation is no longer guaranteed (contracts-and-reliability.md transaction boundary 3). Isolation: READ COMMITTED everywhere in the worker; no REPEATABLE READ, because the worker needs post-wait visibility of cancellations (same reasoning as `begin_protected_write`'s isolation assertion, `guard.sql:19-21`).

**Failure sequence (dissent-grade):** worker claims, passes the boundary, stalls (GC/VM pause) past lease expiry; a second worker claims with generation+1 and also submits. A DB fence cannot prevent this double submission — only the provider idempotency key can, and that is Q5's seam. This is the honest limit: "a suspended worker cannot be perfectly fenced at the provider" (contracts-and-reliability.md). Mitigations: lease ≥ 2× provider timeout, recheck `retry_deadline_at` and lease validity immediately before the external call, and stable key so the duplicate collapses within the provider window. Acceptance tests (NOT RUN): two concurrent claimers get disjoint rows; stale-generation finish writes 0 rows but its observation persists; cancel racing the boundary in both orders.

## Q4. Stable send identity and crash windows — Verdict: support

`elevateo_send_id` is minted in the Q1 approval transaction — strictly before any worker exists, therefore before any possible submission. `first_attempt_at` and `retry_deadline_at` are committed in the *claim* transaction, before I/O (boundary 2 in the reliability doc). Crash windows:

- **After approval, before claim:** job sits queued; restart resumes. No external effect possible.
- **After claim, before boundary:** lease expires; re-claim re-runs the boundary. `first_attempt_at` already set — conservative, correct (the horizon starts from the first *possible* attempt).
- **After boundary, before/during provider call; response lost:** state is `dispatching` with an uncertain external world. On lease expiry the row is visible as `unknown`-eligible; retry with the same key within the horizon (Q5) or hold.
- **After provider response, before commit:** the worker dies holding knowledge only the provider has. Recovery comes from BE04's acceptance ledger/webhook/reconciliation, keyed by `elevateo_send_id` carried in immutable provider tags — the tag must be identical across attempts (no attempt counter in the payload; reliability doc).
- **Stale worker returns late with a definitive provider acceptance:** fenced out of the projection, but its observation row is kept; a fresh generation-checked reconciler reads `provider_observations`, verifies account/tag association, and promotes `unknown → accepted`. Projections have one writer (current fence holder or reconciler); observations have many appenders. This is the precise split the brief demands: stale evidence retained, stale authority denied.
- **Late authenticated observation after app restore:** survives because observations also flow into BE04's external ledger outside the backup target.

**What the fence cannot prevent:** any effect already in flight at the provider — a message accepted milliseconds before revocation/cancel, a duplicate submission from the pause scenario above, or provider-internal retries. The fence governs *database authority*, nothing external. Label every UI state accordingly: `accepted` is provider acceptance, never delivery.

## Q5. Uncertainty horizon and provider-policy seam — Verdict: support; one explicit evidence gap

Hard invariants, enforced in SQL not worker code where possible:

- No fresh submission when `clock_timestamp() >= retry_deadline_at`: the claim query excludes such rows; a dispatch-boundary recheck catches rows claimed just before expiry. Expired-uncertain rows transition to `needs_review` with an audit row; resolution is human, evidenced, audited.
- **Forbidden recoveries, each a named negative test (NOT RUN):** key rotation on uncertainty; payload rebuild from the (possibly edited/cloned) draft instead of the snapshot; clock reset / `first_attempt_at` update; automatic clone-and-resend; startup `UPDATE jobs SET state='queued' WHERE state='dispatching'`. The last one deserves a literal grep-able test because it is the most tempting "fix."
- The idempotency key is derived deterministically from `elevateo_send_id` (e.g., the ID itself) and stored, never regenerated.

**Provider-policy seam (BE03-owned, typed, minimal):**

```ruby
SubmissionSeam#submit(snapshot:, send_id:, idempotency_key:, deadline:) 
  -> Accepted(provider_ref) | Rejected(code) | Unknown
SubmissionPolicy: retry_horizon_seconds, same_key_retry_allowed?(first_attempt_at, now)
```

BE03 ships only a **deterministic local failure driver** implementing this seam — in-process Ruby, injectable clock, scripted outcomes (accept, reject, accept-then-lose-response, hang-to-deadline). Make it visibly distinct from BE04's Express simulator: different class name (`FailureDriver`), no HTTP, test-profile only, and a log banner. Evidence gap, stated plainly: the 24-hour Resend window (checked 2026-10-13) governs *their* dedup check, says nothing about lookup-by-key, and the 23-hour margin is our assumption; the policy object ships with `retry_horizon_seconds` as configuration marked `UNVALIDATED — BE04 must supply account-scoped evidence`, and BE03 tests use synthetic horizons. Provider acceptance ≠ delivery is encoded in the type system: the seam has no "delivered" variant.

**Restore:** dispatch hold is an environment/control flag outside the restored database (`DISPATCH_HOLD`, default on after restore); the worker refuses claims while held. Fail closed when BE04's external ledger or policy evidence is missing: held rows become `needs_review`, never re-queued. BE03 can test the hold flag and the fail-closed path with the failure driver; the full restore drill is BE04's, not claimable here.

## Q6. Slices, ownership, tests, Docker matrix — Verdict: support this ordering

Bounded slices, each independently reviewable and Devin/Codex-implementable from its brief (my feasibility read: yes, *because* each slice has a frozen SQL-function surface in the BE02 house style — the BE02 sources show the implementer already executes this pattern; the risk is not capability but brief drift, so each slice brief must pin the exact function signatures):

- **S1 — schema + approval function** (~350 LoC SQL + migration): `app_send` tables, `app.approve_draft_send(...)` definer, grants (API EXECUTE on approve; worker EXECUTE on claim/finish only; no table SELECT for API/worker, mirroring `be02_drafts/grants.sql`), RLS enabled+forced, policies for the NOLOGIN owner only. Depends: BE02 accepted.
- **S2 — review/approval/cancel/status HTTP** (~300 LoC Ruby): controllers extending `WriteController`, contract `1.0.0-send.1`, fixtures. Depends: S1, coordinator-published contract.
- **S3 — worker claim/boundary/finish + seam + failure driver** (~400 LoC): claim SQL function, dispatch loop, `SubmissionSeam`, observations table writes. Depends: S1.
- **S4 — reconciler + horizon/needs_review + hold flag** (~250 LoC). Depends: S3.
- **S5 — adversarial concurrency/crash suite**: concurrent approvals; claim races; kill -9 at each labeled crash window (injectable kill points in the driver); stale-generation finish; clock-advance past horizon; cancel/boundary race both orders; restore-hold fail-closed. Depends: S1–S4.

File ownership: everything under `apps/server/db/be03_send/`, `apps/server/lib/elevateo/send/`, `apps/server/app/controllers/v1/send_*`; no edits to frozen BE02 SQL files — new functions only. One migration lane preserved.

**Docker acceptance matrix (all NOT RUN):** real pinned PG17.6 + Auth v2.196.0; S5 suite; privilege guards extended to `app_send` (API cannot SELECT jobs table, worker cannot EXECUTE approve); replay of all published C/D scenarios to prove non-regression; byte-budget checks on new responses.

**Task-ordering critique:** correct that BE03 precedes BE04, but S3's seam must be frozen *with* BE04's authors consulted on signature, or BE04 will force a seam change and re-review. Smallest end-to-end demonstrable slice for root: S1+S3 with the failure driver — approve → claim → boundary → driver-accept → accepted, plus the lost-response → unknown path — before any HTTP surface exists.

---

## Fable adapter note (my focus assignment) and top recommendations

The in-app Claude/Fable adapter (AI-03) intersects BE03 only at one invariant, which S1 should make structurally true: **no adapter-reachable code path can call `approve_draft_send`** — approval requires the cookie-bound protected-write marker that only the browser session flow can establish (`assertions.sql`). Before any product promise on the adapter itself: proof of a supported authentication route under current provider terms, a fake-runtime harness exercising spawn/stream/cancel/kill, and enforced tool allowlists — all absent from this packet (evidence gap); defer substantive AI-03 design to its own consultation, as the prior be02-auth-rls synthesis also ruled.

**Top three cross-cutting recommendations:**
1. Make one-intent-per-draft a primary key, not application logic; it is the keystone invariant and the cheapest to prove.
2. Treat the 23-hour horizon as unvalidated configuration with a named BE04 evidence obligation; ship synthetic-horizon tests now.
3. Separate fenced *projections* from append-only *observations* in schema, so "stale worker evidence retained, authority denied" is a table design rather than a code convention.

**Hard contradiction found: none** between the brief and the frozen C/D contract. One decision root must make explicitly (not a contradiction, an underdetermined point): whether draft consumption increments `version`, and whether approver revocation holds an already-queued job — both must be frozen in the S1 brief before implementation.

(~2,050 words.)
