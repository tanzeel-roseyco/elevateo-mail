# BE03 opinion provenance: opus-5-5

- Requested and observed model: `claude-opus-5-5`; observed in `modelUsage.claude-opus-5-5.canonicalModel`.
- Session: `5a5e8c1c-aa79-45d3-9b3f-fdc3da6a08c7`; exit `0`; JSON `result/success`, `is_error=false`.
- Common packet: `e73bb1beeda205a2a952324f8b0a2a54c384e743de56bc7933e1609fd6044444`; bases and source ranges in [source manifest](source-manifest.json).
- Full prompt hash: `ca060e5bbc4baef3018be87046ab27b7666c261df374603f57af80ea848514e1`.
- Fresh isolated tools-disabled process; no other opinion supplied. Raw prompts/envelopes remain ignored.
- The following is the actual opinion text. Its proposals and factual gaps are adjudicated in [decisions](decisions.md); it is not implementation approval.

---

# BE03 independent opinion: reviewed intent and fenced dispatch

Requested runtime: `claude-opus-5-5`. The coordinator records actual identity separately. Every test below is proposed and **NOT RUN**. Evidence is limited to the common packet. Focus: human review semantics, concurrency and operational usability.

## Overall verdict

**Change, then support.** The ADR0002 and `contracts-and-reliability.md` shape is sound: consume once, an atomic snapshot/job/audit, a lease generation, a dispatch boundary and preserved `unknown`. It has four gaps:

1. **Human review binding.** Nothing proves the bytes a human saw are the bytes frozen.
2. **Sender identity.** There is no sender identity source in BE02.
3. **Approver revocation ordering.** Revoking the approver between approval and dispatch has no defined result.
4. **Unproven retry horizon.** The "23-hour" retry horizon is treated as usable before BE04 evidence exists.

**Prerequisite blockers:**

- Root acceptance of BE02.
- A mailbox sending-identity source (gap: BE02 has no mailbox address/sender table in the supplied source).

**Optional improvement:** an ops summary endpoint.

## 1. Approval transaction (Q1)

**Recommendation.** Add a two-step human review:

1. `GET /v1/drafts/{draft_id}/send-review?mailbox_id=` renders the exact send payload. It returns a `review_digest`.
2. `POST /v1/drafts/{draft_id}/approval` must echo that digest.

The server recomputes the digest from current draft bytes and current derived identity. A mismatch returns `409 review_stale`. This is the only mechanism that ties "what the human saw" to "what is frozen." Model output or an MCP grant cannot reach it, because the route requires a session cookie, CSRF and Origin. Connector grants are not sessions.

**ApprovalInput** (closed object, all fields required):
`mailbox_id, approval_id (uuid), expected_version (ResourceVersion ≥1), review_digest (64 lowercase hex)`.

**Transaction.** Use READ COMMITTED, which `begin_protected_write` requires. Steps in order:

1. `app_auth.begin_protected_write(digest, user, auth, '{}')`. This locks the session, then the actor generation guard.
2. `pg_advisory_xact_lock('send-approval:'||org||':'||actor||':'||approval_id)`.
3. `pg_advisory_xact_lock('draft-id:'||draft_id)`. This uses the same key as `save_draft`, so save and approval serialize. The order is ledger-key lock, then draft lock, matching `save.sql`.
4. Recheck `draft_scope`, current `compose` and **`approve_send`** on the mailbox. Missing capability returns the generic 404, per C/D precedence.
5. **Ledger first:** look up `(org, actor, approval_id)`.
   - If found with the same binding and digest, return the original result.
   - If found with a different binding, return `409 operation_mismatch`.
6. `SELECT … FROM app.drafts WHERE id=$1 FOR UPDATE`.
7. Branch on draft state:
   - **Consumed:** look up `send_intents WHERE draft_id`. If `draft_version = expected_version` and `review_digest` matches, record the ledger row pointing at that intent and return it. This makes different keys converge. Otherwise return `409 draft_consumed`.
   - **Editable:** `expected_version ≠ version` returns `409 draft_conflict`. A recomputed digest ≠ input returns `409 review_stale`. A readiness failure returns `422 send_not_ready` with issue codes only.
8. Insert snapshot, intent, job, audit and ledger row. Then `UPDATE drafts SET state='consumed', updated_at=now` with **no version increment**, so the approved version stays visible. Commit.

The response is `202 SendIntentResponse`.

Existing BE02 behavior is unchanged: `save_draft` already returns `draft_consumed` for consumed drafts. Old save replays still return their original result, because ledger lookup precedes the state check.

**Failure scenario.** A user edits in tab A while tab B shows a stale review at v4. A saves v5 and B clicks approve with v4: the result is `draft_conflict`. A saves v5 *identical* bytes and B approves v4: still conflict, because the version differs. That is correct even though the content matches.

**Simpler alternative.** Approve by version alone, without a digest. The tradeoff is that sender/suppression/reply derivation can change between view and approve without the human seeing it. I reject this.

## 2. Contracts, review payload and readiness (Q2)

Contract version: `1.0.0-send.1`, additive over `1.0.0-collaboration.1`. All objects are closed.

**SendReview** fields:
`context_id, authorization_version, draft_id, mailbox_id, draft_version, review_digest, sender{display_name,address}, recipients[{display_name,address}], subject, body_text, reply{thread_id, in_reply_to_present:boolean}|null, purpose:"correspondence", attachments:[] , attachments_supported:false, recipient_checks[{index, status:"ok"|"suppressed"|"invalid"}], ready:boolean, issues[code]`.

- **Purpose** is a single enum value. Marketing/consent purposes are a later contract and are rejected now.
- **Attachments.** An explicit empty array plus `attachments_supported:false` tells the UI to say "No attachments", not to hide the field.
- **Suppression.** Show per-recipient index status, not the reason or evidence. That avoids leaking suppression lists across mailboxes beyond the recipient the author typed.

**Review digest.** SHA-256 over this canonical array:
`[mailbox_id,draft_id,draft_version,[sender_name,sender_addr],[[n,a]...],subject,body_text,reply_thread_id,purpose]`.
Use the same canonicalization rules as BE02 C §5: no normalization, and no trimming of approved text.

**Unsent-draft vs send-readiness validation.** Unsent-draft validation stays BE02's: empty fields are allowed. Send readiness additionally requires:

- 1..50 recipients, each with a non-null, syntactically valid address and no CR/LF/NUL in display names.
- No duplicate address. Compare on case-folded domain only; the local part is exact.
- Subject 1..998 code points with no CR/LF.
- body_text containing at least one non-White_Space character.
- A configured, enabled sender identity for the mailbox (`sender_unconfigured`).
- A currently readable reply thread when non-null.
- No suppressed recipient.
- Serialized snapshot ≤ a bounded size (proposed 256 KiB; evidence gap until BE04 confirms provider limits).

Readiness issues are codes only. The UI maps codes to field-local messages and focuses the first failing field.

**Other routes:**

- `GET /v1/send-intents/{id}?mailbox_id=` returns an `{id, draft_id, draft_version, state, cancellable:boolean, approved_at, dispatch_authorized_at|null, provider_outcome:"none"|"accepted"|"rejected"|"unknown", simulated:boolean, updated_at}` projection. It requires mailbox read. Approver identity is shown as a UUID attribution only.
- `POST /v1/send-intents/{id}/cancellation` takes body `{mailbox_id, cancellation_id}`. It returns `200` with state `cancelled`, or `409 send_dispatch_started`. A repeat of the same id is idempotent, keyed in the same ledger family.

**Who approves.** Drafts are actor-owned, so only the author can see and approve. Team "second-person review" needs shared drafts. I defer that explicitly rather than have BE03 silently make drafts team-visible.

**Upgrade/rollback lane:**

- Migration `20261014…_create_send_intents` follows the existing pattern (`tables policies functions grants`).
- `down` must refuse (`RAISE`) when any `send_intents` row exists. Down is development-only and destructive.
- The operational rollback is a server flag that returns `503 temporarily_unavailable` on approval. It keeps tables and the worker reconciler running, so in-flight intents are never orphaned.

## 3. Schema and invariants

```sql
app.send_intents(
  id uuid PK, organization_id, mailbox_id, draft_id uuid NOT NULL UNIQUE,   -- one intent per draft
  draft_version int NOT NULL CHECK (draft_version >= 1),
  approved_by uuid NOT NULL, approved_at timestamptz NOT NULL,
  review_digest text NOT NULL CHECK (review_digest ~ '^[0-9a-f]{64}$'),
  elevateo_send_id uuid NOT NULL UNIQUE,                                   -- generated in approval txn
  state text NOT NULL CHECK (state IN ('queued','cancelled','blocked','dispatching',
        'accepted','rejected','unknown','needs_review')),
  block_reason text CHECK ((state='blocked') = (block_reason IS NOT NULL)),
  first_attempt_at timestamptz, horizon_expires_at timestamptz,
  CHECK ((first_attempt_at IS NULL) = (horizon_expires_at IS NULL)),
  CHECK (state NOT IN ('dispatching','accepted','rejected','unknown') OR first_attempt_at IS NOT NULL),
  FOREIGN KEY (organization_id, mailbox_id, draft_id) REFERENCES app.drafts(organization_id, mailbox_id, id) ON DELETE RESTRICT)
app.send_snapshots(intent_id PK FK, sender jsonb, recipients jsonb, subject, body_text,
  reply_thread_id, in_reply_to text, references text[], snapshot_digest text NOT NULL)
  -- no UPDATE/DELETE grant to any role; trigger rejects UPDATE
app.send_jobs(intent_id PK FK, lease_generation bigint NOT NULL DEFAULT 0, lease_owner uuid,
  lease_expires_at timestamptz, next_attempt_at timestamptz NOT NULL, attempts int NOT NULL DEFAULT 0
  CHECK (attempts BETWEEN 0 AND 3))
app.send_attempts(intent_id, attempt_no, lease_generation, authorized_at, PRIMARY KEY(intent_id, attempt_no))
app.provider_observations(id PK, intent_id, attempt_no, lease_generation, observed_at, kind, provider_ref_digest,
  processed_at)  -- append-only
app_send_private.approvals(organization_id, actor_id, approval_id, mailbox_id, draft_id, review_digest,
  intent_id, outcome, recorded_at, PK(organization_id, actor_id, approval_id))  -- permanent tombstones
```

`ON DELETE RESTRICT` on the draft FK matters: BE02's mailbox `ON DELETE CASCADE` must not erase send history. **Mailbox deletion with intents must be blocked.** Flag this BE02 interaction to Astra: the drafts FK cascades from mailboxes, so a mailbox delete would need RESTRICT to stop at intents. Audit rows contain IDs, digests and state transitions only.

## 4. Claim, fencing and dispatch boundary (Q3)

**Claim transaction** (worker role, READ COMMITTED, short):

```sql
SELECT j.intent_id FROM app.send_jobs j JOIN app.send_intents i ON i.id=j.intent_id
 WHERE i.state IN ('queued','unknown') AND j.next_attempt_at <= now()
   AND (j.lease_expires_at IS NULL OR j.lease_expires_at < now())
 ORDER BY j.next_attempt_at, j.intent_id LIMIT 1 FOR UPDATE OF j SKIP LOCKED;
UPDATE app.send_jobs SET lease_generation=lease_generation+1, lease_owner=$w,
  lease_expires_at=now()+interval '60 s' WHERE intent_id=$1 RETURNING lease_generation;
```

SKIP LOCKED is used **only** here. Per the PostgreSQL docs, it does not give a consistent view, so no decision is taken from it beyond "I may own this row."

Before any dispatch transaction, the worker reads the external hold control. Unreadable or held means no dispatch, which fails closed.

**Dispatch-authorization transaction.** Lock order is compatible with BE02: guards first, then business rows.

1. `SELECT … FROM app_auth.authorization_generations WHERE (org, approved_by) FOR SHARE`. Membership changes take these `FOR UPDATE`, so they serialize.
2. `SELECT … FROM app.send_jobs WHERE intent_id=$1 FOR UPDATE` (no skip), then the intent row `FOR UPDATE`. Cancellation uses the same order: session → actor guard → job → intent.
3. Require `lease_generation = mine`, `lease_expires_at > now() + call_timeout + margin`, and state `queued`/`unknown`.
4. Recheck, in this order:
   - mailbox enabled
   - approver still an org member with `approve_send` (else `blocked/approver_revoked`)
   - suppression for every snapshot recipient (else `blocked/suppressed`)
   - provider policy permits this attempt (see §5)
5. Set `first_attempt_at` if null and `horizon_expires_at` from policy. Insert the attempt row, set state `dispatching` and `attempts+1`. Commit.

Cancellation after this commit returns `send_dispatch_started`.

**Dissent.** Blocking on approver revocation is stricter than `contracts-and-reliability.md`, which only lists access/disabled/suppression. I recommend it because "a person who can no longer send should not have mail leave in their name minutes later" is what users expect. The cost: a blocked intent cannot be resumed. The user must clone a new draft and re-review, consistent with "resend needs new draft."

## 5. Persistence, crash windows and the external world (Q4/Q5)

`elevateo_send_id` is generated in the approval transaction. `first_attempt_at` is persisted in the authorization commit, before any I/O. No transaction spans `submit()`.

| Window | Durable state | Recovery |
|---|---|---|
| After approval, before claim | queued | Normal claim |
| After claim, before authorization | queued, lease set | Lease expires; reclaim with gen+1 |
| After authorization, before I/O | dispatching, attempt row | Treat as **possibly submitted**; reconciler moves to `unknown` after lease expiry |
| During I/O / timeout | dispatching | `unknown` |
| Response received, commit fails | dispatching | Observation lost unless BE04 ledger/webhook supplies it; `unknown` |
| Stale worker returns late with acceptance | gen mismatch | Insert `provider_observations` only (allowed for any generation with matching attempt row); a fresh reconciler holding a current lease applies it |

The stale-write rule: the result transaction locks the job and compares generation. On a mismatch it **only** appends the observation. A projection update requires a current generation, and only a reconciler applies observations, monotonically: `accepted` never downgrades.

**What a DB fence cannot prevent.** A worker paused after its authorization commit (GC, laptop sleep, VM freeze) can resume and transmit after a newer owner has also transmitted. Mitigations:

- Only one owner can ever hold `dispatching` for an attempt.
- The worker refuses to call when its local monotonic clock exceeds the lease deadline minus margin.
- The same idempotency key is used across attempts.

None of these is a guarantee. Exactly-once delivery is not claimed.

**Provider policy seam:**

```ruby
ProviderPolicy = Struct(:retry_window_seconds (Integer|nil), :evidence_ref (String|nil))
```

The BE03 default is `retry_window_seconds = nil`. This means **zero automatic retries after any uncertain outcome**: `unknown` moves to `needs_review` once the reconciler has no authenticated observation. BE04 may supply a positive window only with dated Resend evidence and its own consultation. Even then, horizon = `first_attempt_at + window - (lease + timeout + skew)`, rechecked inside every authorization transaction.

Startup never resets `dispatching`. No code path rotates `elevateo_send_id`, rebuilds a snapshot or clears `first_attempt_at`. A CHECK plus an immutable-column trigger enforce this.

Provider acceptance is shown as "Accepted by provider", never "Delivered". The hold control and the BE04 acceptance ledger live outside the app backup. A missing ledger on restore means every non-terminal intent goes to `needs_review`.

## 6. Operational usability

- **Status copy** (UI, without motion that implies progress):
  - queued: "Queued — you can still cancel"
  - dispatching: "Sending started — cancellation no longer possible"
  - unknown: "Outcome uncertain — do not resend; we are checking"
  - needs_review: "Needs a person to decide"
  - Simulated runs carry a persistent "Simulated transport" badge.
- **Cancel race.** The cancel button reflects `cancellable` from the last projection, but the server answer wins. On `send_dispatch_started` the UI replaces the button with explanatory text and moves focus to it.
- **Ops summary.** `GET /v1/ops/send-summary` (operator capability) returns counts per state, oldest queued age and oldest unknown age. It contains no addresses or bodies. This is optional, but it is what makes `unknown` visible instead of rotting.
- **Manual resolution of `needs_review`.** Record the actor, reason code and evidence reference. "Resend" is offered as "Create a new draft from this", with a visible duplicate-risk warning. It is never a state reset.

## 7. Bounded slices

| Slice | Files (proposed) | Depends |
|---|---|---|
| S1 schema/readiness/review GET | `db/be03_send/{tables,policies,review,grants}.sql`, `lib/elevateo/sends/review.rb`, contract additions | BE02 accepted, sender identity source |
| S2 approval txn + ledger | `be03_send/approve.sql`, `sends_controller.rb` | S1 |
| S3 status + cancellation | `be03_send/cancel.sql`, controller | S2 |
| S4 worker claim/authorize/result with local failure driver (visibly named `LocalFailureDriver`, not a simulator) | `app/workers/send_dispatcher.rb`, `be03_send/worker.sql` | S2 |
| S5 reconciler, observations, hold reader | `app/workers/send_reconciler.rb` | S4 |
| S6 Docker matrix | tests only | S1–S5 |

One writer per slice. S4 and S5 must not run in parallel against the same SQL file.

## 8. Adversarial tests and Docker matrix (all NOT RUN)

**Approval:**

1. Two keys approve the same draft/version/digest concurrently; assert one intent and both responses identical.
2. Approve v4 after save v5; assert `draft_conflict`.
3. Approval racing a save at a barrier; assert either save-then-conflict or approve-then-`draft_consumed`, never both succeeding.
4. Stale `review_digest`; assert `review_stale`.
5. MCP grant credential on the approval route; assert 401.
6. Missing `approve_send`; assert 404.
7. Old BE02 save operation replayed after consume; assert the original result.

**Dispatch:**

8. Two workers claim; assert one generation owner.
9. Membership revocation racing authorization; assert serialized via guard and either `blocked` or authorized-before-revoke.
10. Suppression at the final check; assert no driver call.
11. Cancel racing authorization; assert exactly one of cancelled/`dispatch_started`.

**Crash and staleness:**

12. Kill after authorization commit; assert `unknown` → `needs_review` with a nil window.
13. Driver accepts then times out; assert no second call with a nil window.
14. Stale generation returns acceptance; assert observation appended, projection unchanged, then fresh reconciler → `accepted`.
15. Restart with dispatching rows; assert untouched.
16. Hold unreadable; assert no dispatch.

**Hygiene:**

17. Down migration with intents present; assert refusal.
18. Logs/audit scanned for body/address substrings; assert absence.

**Docker matrix:** real PG17.6 plus Auth, API and worker containers, using deterministic barriers (advisory-lock or `pg_sleep` hooks in test-only builds). Report each case as pass/fail with sanitized logs.

## Top three cross-task recommendations

1. **Bind approval to a server-rendered `review_digest`.** Version-only approval does not prove what the human saw.
2. **Default the provider retry window to nil**, meaning no automatic post-uncertainty retry, until BE04 supplies dated evidence. The 23-hour figure is not a BE03 input.
3. **Take generation guards `FOR SHARE` in the dispatch-authorization transaction and block on approver revocation.** This gives revocation a defined, testable ordering against dispatch.

## Hard contradictions to resolve

- **Sender identity is undefined.** `contracts-and-reliability.md` says the server "derives sender identity from the authorized mailbox", but no supplied BE02 table holds a mailbox sending address. BE03 cannot pass readiness until one exists.
- **Mailbox deletion can erase send history.** BE02's `ON DELETE CASCADE` from mailboxes to drafts conflicts with durable send history. It must become RESTRICT once intents exist.
