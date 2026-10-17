# BE03 — bounded implementation contract

Prepared 2026-10-13 by the actual Astra MAX design worker after [three independent opinions and synthesis](../../.planning/consultations/results/be-03/decisions.md). **Design selection only: BE02 is under review, real Docker acceptance is not established, and root has not opened BE03 implementation.** No application code, application tests, transport, migration or deployment was executed by this dispatch.

<!-- AIDEV-NOTE: This additive send contract preserves BE02 C/D; root must accept BE02 before assigning implementation. -->

## 1. Boundary and selected behavior

One Rails authority and one PostgreSQL migration lane own human approval, immutable reviewed content, one durable send intent/job and approval audit, claims, cancellation, observations and reconciliation. Approval consumes an author-owned draft exactly once. Two approval keys for the same version converge on the same send ID; a resend requires an explicitly created and reviewed new draft. No state-reset or automatic clone exists.

BE03 provides a **no-network LocalFailureDriver** for deterministic evidence and a minimal submission seam. Actual Resend integration, provider wire materialization, Express simulator, authenticated webhooks, retrieval and the durable external acceptance ledger belong to BE04. Native clients, AI adapters, mobile, motion, DNS, signing, warmup and live sends are excluded. Provider acceptance is never called delivery. Every BE03 driver result is visibly `simulated:true`.

Reuse the accepted BE02 identity/session/draft-operation/approval-domain rules. Do not change frozen [C/D](be02-cd-contract.md) endpoints, schemas, existing enum values, fixtures, error precedence, save digest or seven-day save-detail semantics. C/D `consumed` becomes reachable without incrementing draft content version. Historical role-name prose does not grant capabilities.

## 2. Additive HTTP contract: `1.0.0-send.1`

Add four routes to the existing `/v1` authority. Use **new** `Send*` schemas and `SendError`; do not widen the existing closed `CollaborationError`. Global OpenAPI metadata/paths may gain additions, but every existing C/D path operation, referenced schema and fixture must compare structurally identical to the frozen baseline. Keep C/D consumers pinned to their previous declared contract until generated clients accept additions.

| Method / route | Closed input | Success and authority |
| --- | --- | --- |
| GET `/v1/drafts/{draft_id}/send-review` | Query: exactly `mailbox_id` | 200 SendReview. Current cookie-bound author + compose + approve_send; no connector presenter. Consistent protected-read snapshot. |
| POST `/v1/drafts/{draft_id}/send-approvals` | JSON: exactly `mailbox_id`, `operation_id`, `expected_version`, `review_digest`, `correspondence_confirmed` | 202 ApprovalResult for new approval and successful replay/convergence. Last boolean must be literal true. Human session, Origin, CSRF, context and authorization proofs. |
| GET `/v1/send-intents/{send_id}` | Query: exactly `mailbox_id` | 200 SendStatus. Original author + current compose/read access; snapshot/body not exposed. No new team-draft visibility. |
| POST `/v1/send-intents/{send_id}/cancellation` | JSON: exactly `mailbox_id` | 200 CancellationResult for cancel/stop-request replay; author + compose + approve_send. No cancellation operation UUID is needed for one idempotent latch. |

`send_id` **is** the stable `elevateo_send_id` UUID; do not allocate a second intent/job identity. UUID, UTF-8, strict JSON, duplicate keys/query aliases, closed fields, media type, forbidden encoding, integer and response serialization rules are reused from C/D. No input from a connector or model can be reinterpreted as the human session. A session proves the authorized browser flow, not physical human attention or resistance to a compromised browser.

New writes accept at most 4 KiB. `expected_version` is a JSON integer 1..2,147,483,647; `review_digest` is 64 lowercase hex characters. GET review has a 2 MiB serialized response budget; other send responses have 16 KiB. Reuse BE02's 10-second request deadline, cache/security headers, REPEATABLE READ READ ONLY protected reads and READ COMMITTED protected writes; reject serialization overflow before commit. No unbounded arrays/pagination are added.

The exact response shapes below are closed objects; every listed field is required, with explicit nullability. UUIDs use C/D canonical spelling; timestamps use its UTC timestamp representation; arrays preserve order.

- `SendReview`: `context_id`, `authorization_version`, `draft_id`, `mailbox_id`, `draft_version`, `sender:{display_name:null,address:string|null}`, `to:[{display_name:string|null,address:string|null}]`, `subject`, `body_text`, `reply_to_thread_id:uuid|null`, `purpose:"correspondence"`, `consent_basis:"human_attestation_required"`, `attachments:[]`, `attachments_supported:false`, `policy_revision:string`, `recipient_checks:[{index:integer,status:"ok"|"invalid"|"duplicate"|"suppressed"}]`, `ready:boolean`, `issues:[{code:ReadinessCode,recipient_index:integer|null}]`, `review_digest:string|null`, `simulated:true`. The decimal policy revision is a server identifier, not client authority. A non-ready review has null digest and still renders the bounded unsent draft.
- `ApprovalResult`: `context_id`, `authorization_version`, `send_id`, `draft_id`, `approved_version`, `review_digest`, `approved_at`, `simulated:true`. Operation ID is already known to the caller; no current job state is embedded in the immutable approval outcome. Current context/proof metadata is freshly issued after authorization on every response, not replayed from an old session.
- `SendStatus`: `context_id`, `authorization_version`, `send_id`, `mailbox_id`, `draft_id`, `approved_version`, `approved_at`, `state:SendState`, `attempts:integer`, `first_possible_at:timestamp|null`, `retry_deadline_at:timestamp|null`, `cancel_requested:boolean`, `cancellable:boolean`, `hold_reason:HoldReason|null`, `updated_at`, `simulated:true`. `cancellable` means **known not to have crossed dispatch authorization**: nonterminal, first_possible_at null and readable matching external epoch. A restored null timestamp alone is insufficient.
- `CancellationResult`: `context_id`, `authorization_version`, `send_id`, `result:"cancelled"|"stop_requested"`, `state:SendState`, `cancel_requested:true`, `simulated:true`. A repeat returns the same latch result under current authorization; the state can become accepted meanwhile. A first cancellation against accepted/rejected is 409 `send_terminal`. Already-cancelled repeats return 200.
- `SendError`: exactly `{code,message,request_id}`, with message <=256 and request_id 1..128 characters and a 4 KiB serialized budget. Its independent code/status union is `request_invalid`/400, `unauthenticated`/401, `not_available`/404, `context_changed`/409, `rate_limited`/429, `temporarily_unavailable`/503, `internal_error`/500; plus `review_stale`, `send_not_ready`, `draft_consumed`, `draft_conflict`, `operation_mismatch`, `send_terminal`/409 and `dispatch_held`/503. The 404 message remains `This item is unavailable.` Readiness details occur only in SendReview, not extra error fields; never include addresses, policy reasons, tokens or transport responses in errors.

Precedence: bounded syntax -> current Auth/session -> context/authorization proof -> target scope/capability -> ledger semantics -> version/readiness. Revocation is 401, stale context/generation proof 409, foreign/missing/wrong-mailbox/missing-capability 404 with the existing generic message, malformed proof 400, unavailable Auth 503. Authorization is checked **before** exposing a prior operation. Do not use a send replay as an authorization bypass.

`ReadinessCode` is exactly `draft_consumed`, `recipient_required`, `recipient_invalid`, `recipient_duplicate`, `recipient_suppressed`, `sender_unconfigured`, `sender_invalid`, `mailbox_disabled`, `reply_unavailable`, `header_invalid`, `snapshot_too_large`, `purpose_unavailable`. `HoldReason` is exactly `session_invalid`, `authorization_changed`, `capability_revoked`, `mailbox_disabled`, `suppressed`, `policy_changed`, `restore_unreconciled`, `control_unavailable`, `auth_unavailable`, `uncertain`, `retry_expired`, `attempt_limit`, `evidence_conflict`, `counter_exhausted`. A missing provider profile produces held/no-dispatch behavior, never a default live route.

## 3. Reviewed bytes, recipients and consent

Use a new canonical domain and version while reusing BE02's scalar JSON encoding rules. Canonical UTF-8 bytes are the compact array:

```text
["elevateo.send.snapshot.v1", organization_id, mailbox_id, draft_id, draft_version,
 [null, sender_address], [[display_name, recipient_address], ...], subject, body_text,
 reply_to_thread_id, "correspondence", "human_correspondence_attestation", [], policy_revision_string]
```

The SHA-256 hex digest of these bytes is `review_digest`. No key sorting, whitespace formatting, Unicode normalization, trimming, newline rewriting or opportunistic HTML conversion. Preserve recipient order, exact local-part case, display-name null versus empty, and all valid subject/body scalars. Preserve direct UTF-8/U+2028/U+2029/slashes and C/D's exact quote/backslash/control escaping. A review digest is issued by the server; clients only echo it. No extra signed-receipt system, approval secret or review-session table is required.

Canonicalize the address **domain only** to lowercase before rendering review; never change the underlying draft. Permit an ASCII dot-atom local part with no leading/trailing/consecutive dots, 1..64 octets; an ASCII DNS-style domain with nonempty labels 1..63, alphanumeric edges and internal hyphens, total address <=254 octets. Require at least one domain separator; reject whitespace, controls, angle/comma syntax, comments, literals, quoted local parts and non-ASCII addresses in this first send contract. This deliberately limited product grammar is not a claim to implement all email RFC addresses. Unsupported forms remain saveable unsent drafts and visibly fail readiness. Do not guess or silently drop them.

Require 1..100 recipients; every address is non-null and valid. Duplicate means equal exact local part plus case-folded domain; reject duplicates rather than silently de-duplicate. Subject remains <=998 code points and cannot contain CR/LF or other C0/DEL header controls. Display names remain nullable/empty and <=256 code points but reject C0/DEL controls. Body preserves the existing 65,536-code-point limit and allowed text, including empty body; the review visibly shows empty content. A canonical snapshot is <=1 MiB. Do not impose Opus's unexplained 50-recipient/256-KiB cutoffs or silently weaken BE02 saves.

Sender address comes from `app.mailboxes.address`, observed in the foundation migration during synthesis-only inspection; `display_address` is metadata and grants no alias. Sender display name is null in v1. Policy row must explicitly enable local dispatch for that mailbox; absent/disabled is not ready. The existing loose mailbox regex is not send validation. Recheck sender and policy revision at approval; their changes invalidate the digest. No new sender-address table, verified-domain claim or production mailbox connection is added.

Purpose is only individual correspondence; the explicit approval checkbox attests that purpose. It is **not** evidence of recipient marketing opt-in or a legal conclusion. Marketing/campaign inputs and attachments/cc/bcc/custom headers are unsupported. Suppression always blocks regardless of the attestation; missing policy is a failure. Expose only recipient index/status, never suppression rationale or list membership for arbitrary queries. In v1 a reply ID is frozen application thread context, not fabricated RFC In-Reply-To/References headers. BE04 must establish frozen header materialization and any renewed human review before claiming actual reply threading.

## 4. Normative PostgreSQL schema

All new tables live in `app_send_private`, owned by a dedicated `elevateo_send_owner` NOLOGIN, NOINHERIT, NOBYPASSRLS role. Use existing identity UUID types; no second user or membership table. All columns below are NOT NULL unless `?` is shown. UTC times are `timestamptz` with `isfinite`; identifiers are UUID. No API/worker direct table DML or blanket SELECT. Every FK is RESTRICT unless stated; never cascade send history away.

| Relation | Exact logical columns, primary keys and constraints |
| --- | --- |
| `intents` | `send_id uuid PK`, `organization_id uuid`, `mailbox_id uuid`, `draft_id uuid UNIQUE`, `draft_version integer CHECK 1..2147483647`, `approved_by uuid`, `approved_at timestamptz`, `approval_session_digest text` (64 lower hex; private), `approval_auth_session_id uuid`, `approval_context_id uuid`, `approval_generation bigint CHECK >0`, `approval_policy_revision bigint CHECK >0`, `approval_epoch uuid`, `review_digest text` (64 lower hex), `snapshot_bytes bytea CHECK octet_length<=1048576`, `snapshot_format text CHECK ='elevateo.send.snapshot.v1'`, `simulated boolean CHECK =true`. UNIQUE `(organization_id,mailbox_id,draft_id,draft_version)`; composite FK `(organization_id,mailbox_id,draft_id)` -> `app.drafts`. |
| `approval_operations` | PK `(organization_id uuid,actor_id uuid,operation_id uuid)`; `mailbox_id uuid`, `draft_id uuid`, `expected_version integer CHECK >=1`, `request_digest text` (64 lower hex), `outcome text CHECK IN ('approved','conflict')`, `send_id uuid?` FK intents, `error_code text?`, `recorded_at timestamptz`. Approved iff send_id present/error null; conflict iff send null/allowed semantic code present. Immutable permanent binding, no expiring send identity. |
| `jobs` | `send_id uuid PK` FK intents, `state text` in SendState, `next_action text` in submit/reconcile/none, `next_check_at timestamptz?`, `lease_generation bigint CHECK >=0 DEFAULT 0`, `lease_id uuid?`, `lease_expires_at timestamptz?`, `attempt_count smallint CHECK 0..3 DEFAULT 0`, `preflight_failures smallint CHECK 0..3 DEFAULT 0`, `reconcile_count smallint CHECK 0..5 DEFAULT 0`, `first_possible_at timestamptz?`, `retry_deadline_at timestamptz?`, `policy_profile text CHECK IN ('none','synthetic-v1')`, `cancel_requested_at timestamptz?`, `accepted_at timestamptz?`, `accepted_receipt_ref text? CHECK length<=256`, `hold_reason text?` in HoldReason, `updated_at timestamptz`. Lease ID/expiry are both null or both present; next_action none iff next_check null except observation-triggered claims. |
| `attempts` | PK `(send_id uuid,attempt_no smallint CHECK 1..3)`, `attempt_id uuid UNIQUE`, `lease_generation bigint CHECK >0`, `authorized_at timestamptz`, `call_deadline_at timestamptz CHECK >authorized_at`, `capability_hash bytea CHECK octet_length=32`, `profile text CHECK IN ('none','synthetic-v1')`. FK send_id -> intents. Immutable; attempt numbers contiguous and equal job count, enforced by owner functions/deferred checks. No mutable response/body fields. |
| `observations` | `observation_id uuid PK`, `attempt_id uuid` FK attempts' unique ID, `kind text CHECK IN ('accepted','rejected','unknown')`, `source text CHECK ='local_failure_driver'`, `receipt_ref text? CHECK length<=256`, `evidence_digest bytea CHECK octet_length=32`, `received_at timestamptz`. UNIQUE `(attempt_id,kind)` caps three kinds per attempt. Accepted requires receipt_ref; other kinds require null receipt. Persist only normalized kind/digest/reference, never raw response. Immutable. |
| `audit_events` | PK `(send_id uuid,event_key text CHECK length<=80)`; `kind text` in approved/attempt_authorized/cancel_requested/held/observation_applied/observation_rejected, `actor_id uuid?`, `lease_generation bigint?`, `observation_id uuid? UNIQUE` FK observations, `from_state text?`, `to_state text?`, `reason_code text?`, `recorded_at timestamptz`. FK send_id -> intents. Event `approved` has event_key exactly `approved`; every intent has exactly one. Other deterministic keys prevent duplicate audits on retry. Append-only. |
| `organization_policy` | `organization_id uuid PK` FK app.organizations, `revision bigint CHECK >0`, `updated_at timestamptz`. One serialization guard for sender configuration, mailbox-send policy and suppression mutations in the organization. No mutable authorization roles here. |
| `mailbox_policy` | PK `(organization_id uuid,mailbox_id uuid)` composite FK app.mailboxes; `enabled boolean DEFAULT false`. Missing row means disabled. No transport/account/secret fields. |
| `recipient_suppressions` | PK `(organization_id uuid,canonical_address text CHECK octet_length<=254)`; FK organization_id -> organization_policy; `created_at timestamptz`. Private canonical address, no public list endpoint. Row presence means blocked. |

Intents contain the **immutable snapshot**, so a separate snapshot table with a second 1:1 identity is unnecessary. `snapshot_bytes` is the actual canonical UTF-8 domain payload; decode the bounded array for review/driver access. It is not yet provider wire JSON/MIME. Validate decoded fields against the locked draft/current derived sender/policy before inserting, and verify `encode(sha256(snapshot_bytes),'hex') = review_digest`. The trusted Rails serializer supplies canonical bytes, never browser-submitted message bytes; SQL independently validates field equality, types and bounds. Canonical-vector Docker tests enforce byte spelling across Ruby and SQL boundary validation.

The owner-only mutation trigger rejects UPDATE/DELETE of intents, attempts, observations, audit and approval-operation bindings. Jobs additionally reject changing first_possible_at once set, increasing a stored retry deadline, reducing generations/attempt counts or reverting accepted. A deferred completeness trigger at commit verifies each intent has one job and one approved audit, exactly one immutable snapshot, and a consumed matching draft/version. RESTRICT on the new intent->draft FK blocks existing mailbox/draft cascade deletion; no old migration is rewritten. Approved session IDs/digests are retained as private historical bindings without a cascading FK; deletion of the live session safely prevents dispatch.

Indexes: job `(next_check_at,send_id)` for due work; partial job `(lease_expires_at,send_id)` for active leases; intents `(organization_id,mailbox_id,approved_by,send_id)` for scoped status; attempts' unique attempt ID; observation unique `(attempt_id,kind)`; audit unique observation ID for unprocessed-evidence checks. No outbox separate from the single jobs row is required.

## 5. Atomic approval and exact ordering

Use the existing `SessionWrites` flow: real Auth `/user` verification **before** the database transaction, cookie-bound session lock, sorted generation guards, READ COMMITTED, post-wait checks, bounded serialization before commit. New human function signature:

```sql
app.approve_draft_send(p_session_digest text, p_mailbox uuid, p_draft uuid,
  p_operation uuid, p_expected integer, p_review_digest text,
  p_snapshot_bytes bytea, p_epoch uuid) RETURNS jsonb
```

`p_snapshot_bytes` and epoch are server-only parameters, never request fields. SQL must call `app_auth.assert_protected_write` and derive actor/org from its bound session; GUCs alone grant nothing. Before checking replay, enforce current author/compose/approve_send and mailbox scope. Total lock order for this feature is:

```text
session row -> sorted (organization,user) generation rows
-> organization_policy row -> approval-operation advisory key (if approval)
-> BE02 draft-id advisory key -> draft row -> intent identity -> job row
```

Use the exact existing `hashtextextended('draft-id:' || uuid,0)` advisory namespace. Approval-key namespace is `send-approval:<org>:<actor>:<operation>`, acquired before draft as BE02 save does for its own operation namespace. No worker may hold a job lock and then acquire a session, generation or policy lock. The trusted migration/operator fixture capability is the only initial policy writer; it prelocks affected authorization generation rows in sorted order, then organization_policy, increments policy revision and changes sender/policy/suppression. This order also accommodates existing mailbox-update generation triggers; policy -> mailbox -> generation would invert the worker order. No API policy mutation route or direct runtime writes to those tables/mailbox address are added.

After locks, recheck scope and current session/generation. Compute the approval request binding SHA-256 of compact `['elevateo.approval.v1',mailbox,draft,expected,review_digest,true]`; it deliberately excludes operation_id so distinct keys can converge.

1. Existing same operation binding: return stored success/conflict under current authorization; different binding -> operation_mismatch. No current reply lookup or policy readiness may rewrite an old successful outcome.
2. Existing intent for this draft: require expected version and review digest equal the immutable intent. Insert only this new operation binding and return the same send ID/approved_at; no new job, approval audit, policy re-approval or submission. Mismatch -> durable draft_consumed conflict.
3. Editable draft: require current version=expected, recompute/send-validate from locked data, require current digest=review_digest. New semantic conflict (`draft_conflict`, `draft_consumed`, `review_stale`, `send_not_ready`) is a durable operation conflict; corrected user action gets a new operation ID. Auth/scope/malformed/transient errors do not allocate ledger rows.
4. Require a readable valid current external epoch (otherwise 503 dispatch_held); a held but readable control may accept approvals into the queue. Generate one send UUID and epoch-bound immutable intent/snapshot; insert queued job and `approved` audit; update draft state to consumed with version unchanged; insert successful operation binding. All commit together or none do. This control check follows successful historical replay/convergence, so later control failure does not rewrite old approval outcomes. Do not rescue a partial failure with a successful response.

The existing draft-save replay must still return its original editable outcome after consumption. Do not patch `save_draft`, its digest, or its ledger TTL to fit sending. Readiness checks never mutate unsent content. The response carries fresh request context metadata plus original approval identity, so lost-response retries do not imply fresh authorization to send.

## 6. Narrow database authority and worker session checks

Enable and FORCE RLS on private tables with owner-only policies. Revoke PUBLIC schema/function access, set fixed qualified search paths (`pg_catalog` plus explicitly trusted objects), revoke default function EXECUTE and grant exact signatures. Login API/worker roles cannot inherit/set-role to the owner. No broad grant on `app_auth`, `auth`, drafts or membership tables is added. Role checks use effective SQL role/capability, not client GUCs or role-name strings from HTTP.

| Caller | Allowed new capability | Explicitly denied |
| --- | --- | --- |
| `elevateo_api` | Protected read review/status facade; guarded approve/cancel facade | claim, dispatch, observations, raw snapshots/tables, policy writes |
| `elevateo_worker` | claim, bound dispatch-session read, authorize, record observation, reconcile/defer | approve/cancel, general Auth/session reads, raw table DML, membership mutation, connector impersonation |
| `elevateo_send_owner` | New private tables and narrowly granted BE02 scope/guard helpers | General Auth credentials; owner login/inheritance |
| existing `elevateo_session_owner` | Additive send-bound session helpers; existing Auth verification facade | Ownership of send tables or arbitrary provider operations |
| migration/fixture owner | Migrations and exact policy seed/mutation helpers | Reuse as normal API/worker connection |

Do not make the new owner a general reader/writer of BE02 drafts. Add three private SECURITY DEFINER bridge functions owned by existing `elevateo_owner`, granting EXECUTE only to `elevateo_send_owner`: `read_draft_binding(mailbox uuid,draft uuid) RETURNS jsonb`, `lock_draft_binding(session_digest text,mailbox uuid,draft uuid) RETURNS jsonb`, and `consume_draft(session_digest text,mailbox uuid,draft uuid,expected integer) RETURNS void`, all in `app_send_private`. They reuse current scope/capability predicates, require the draft actually exists, and return only the bounded author-owned draft/sender binding. BE02 draft_scope alone permits an absent draft for save creation, so it is insufficient here. The locking/consume variants assert the existing protected-write marker, use the shared draft advisory/row locks after higher guards, and consume only the expected editable version without changing content. Human callers cannot directly execute these bridges. Worker capability checks use a separate send-bound scope helper with immutable identity, never arbitrary GUC-authorized draft reads.

The queued intent is not perpetual permission. Before **each submission**, require live Auth identity, existing active approval session, matching user/auth-session/org/context, unexpired access/idle/absolute/Auth session, unchanged raw authorization generation, compose and approve_send. No worker refresh, session idle extension or positive Auth cache. Lost capability, generation change or expiry means needs_review; the old intent cannot be reapproved/reopened. This conservative rule can stop a queue on an unrelated generation bump and is intentionally documented.

Add, do not replace, two helpers under the existing session owner:

- `app_auth.send_dispatch_identity(send_id uuid, lease_id uuid, generation bigint) RETURNS jsonb`: first verify an unexpired matching job lease through a narrow owner-only send-binding reader. Return only that intent's bound identity and encrypted access token to the trusted Rails worker for Auth `/user`; never refresh token, CSRF or another session. No lock is held during the HTTP call. Current readable session alone is not authorization to submit.
- Owner-only `app_auth.lock_send_dispatch_session(send_id uuid, lease_id uuid, generation bigint, expected_user uuid, expected_auth_session uuid) RETURNS jsonb`: use the matching send/lease binding, lock its session and generation in BE02 order, then re-evaluate the existing session/Auth-schema checks and approved context/raw generation. The preliminary binding reader does not lock the job; final authorization locks/rechecks it after the higher guards. This helper never creates the human protected-write marker, extends idle time or refreshes. Only the send-owner final authorization function can call it, not the worker login directly.

The session owner receives only an owner-only binding reader returning private identity metadata from a matching send/lease. No generic scan privilege is exposed to the worker. These helpers are a review-sensitive additive bridge: Docker tests must exercise real roles and prove that guessing a send/lease, forging GUCs, passing a different Auth subject, replaying an expired lease, calling a helper without its permitted owner or bypassing HTTP authorization cannot dispatch. The Rails worker is the trusted Auth-response verifier, as the existing API service is; the database cannot independently prove that an arbitrary service process performed HTTP.

## 7. Claims, fences, cancellation and durable transitions

`SendState` is exactly `queued`, `dispatching`, `unknown`, `needs_review`, `cancelled`, `accepted`, `rejected`. There is no delivered, reset or retrying state. `next_action` separates scheduling from known outcome. All worker database transactions use READ COMMITTED with bounded statement/lock/transaction timeouts. Claim is a separate committed transaction holding **only job rows**; SKIP LOCKED is never used for approval, policy consistency or final authorization.

The claim's critical SQL shape, inside the definer after validating batch=1, is below. Submission eligibility uses trusted external-control state; recorded-evidence reconciliation remains eligible while outbound is held or control is unavailable.

```sql
WITH candidate AS (
  SELECT j.send_id FROM app_send_private.jobs j
  WHERE (j.lease_expires_at IS NULL OR j.lease_expires_at <= clock_timestamp())
    AND j.lease_generation < 9223372036854775807
    AND app_send_private.job_has_due_work(
      j.send_id, clock_timestamp(), p_control_epoch, p_outbound_held)
  ORDER BY j.next_check_at NULLS LAST, j.send_id
  LIMIT 1 FOR UPDATE OF j SKIP LOCKED
)
UPDATE app_send_private.jobs j
SET lease_generation = j.lease_generation + 1,
    lease_id = p_new_lease_id,
    lease_expires_at = clock_timestamp() + interval '60 seconds'
FROM candidate c WHERE j.send_id = c.send_id
RETURNING j.send_id, j.lease_id, j.lease_generation, j.lease_expires_at;
```

`job_has_due_work` means eligible queued submit due, bounded reconciliation due, expired dispatching requiring reconciliation, or an unapplied observation (including a late acceptance for needs_review). It is an owner-only bounded indexed lookup, not public arbitrary SQL. An expired dispatching claim converts it to unknown/reconcile in the same transaction; **never queued**. No attempt count/timestamp is changed by claiming. Before the increment path, a bounded locked exhaustion branch marks a due max-generation job needs_review/none with counter_exhausted, without wrapping or leaving a hot-loop candidate. The fixed 60-second local lease is a BE03 test/default design value, not a provider allowance; no heartbeat may make one submission live indefinitely.

Final `authorize_send_attempt(send_id,lease_id,generation,validated_auth_user,validated_auth_session,control_epoch)` locks session/generations -> organization policy -> immutable intent -> job, checks the current clock **after waits**, and checks:

1. Exact current lease/generation, enough remaining bounded call time (local call deadline <=10 seconds), current session/identity/context/generation/capabilities.
2. External control readable/unheld, current incarnation exactly matches approval_epoch; mailbox enabled, unchanged approval policy revision and no recipient suppressed. BE03 has no epoch-rebinding/reactivation path.
3. No cancellation latch, no terminal result; queued for first attempt, or explicitly permitted synthetic retry after reconciliation and proven prior invoker quiescence; count<3, all retry checks below.
4. Insert immutable attempt with random attempt capability hash and increment count, set first_possible_at only if null, set state dispatching, preserve stable send ID/snapshot, append authorization audit; commit. Return snapshot, attempt identity, plain one-time capability, lease/deadline. Only now may the no-network driver be invoked.

The first_possible_at is persisted **before any external submission would be possible**, including a crash immediately after commit but before the driver call. It is not set at claim and never reset. A null retry deadline with first_possible_at set is valid and means **no retry policy**, not infinite time. With synthetic policy, persist its deadline at this first authorization and never extend it. The driver/Auth call runs with no DB transaction open.

Cancellation uses the current human protected-write path and the same guard/business order. With first_possible_at null **and a readable matching external epoch**, it atomically latches cancel_requested_at and sets cancelled/none. After the boundary, or with missing/mismatched control that could conceal a lost timeline, it returns stop_requested, stops future submissions and retains uncertainty for reconciliation; it cannot label uncertain work cancelled. An already-cancelled latch replays cancelled; other latched outcomes replay stop_requested. Cancellation's deterministic audit key `cancel_requested` appears once. Recheck the latch at every subsequent authorization. Suppression or revocation committed before the guarded boundary prevents submission; committed after the boundary cannot recall an authorized/in-flight effect.

| From -> to | Allowed evidence / transition |
| --- | --- |
| queued/needs_review -> cancelled | Human cancel wins before first_possible_at and external epoch matches |
| queued -> needs_review | Permanent authorization/policy/control problem, retry budget exhausted or restore unresolved |
| queued -> dispatching | Final authorization/attempt commit |
| dispatching -> unknown | Ambiguous result, timeout, crash recovery or expired authorized lease |
| dispatching/unknown/needs_review -> accepted | Fresh fence applies authenticated matching acceptance evidence |
| rejected -> accepted | Later valid acceptance contradicts prior rejection; preserve accepted knowledge and audit evidence_conflict |
| dispatching -> rejected | Current first attempt has definitive non-acceptance; no earlier uncertain submission remains |
| unknown -> dispatching | Synthetic policy only, fresh authorization, same ID/bytes, quiescence and unexpired horizon |
| unknown -> needs_review | No retry policy, expired horizon, exhausted budget, cancellation/revocation or unresolved restore |
| accepted -> accepted | Duplicate or conflicting evidence cannot downgrade; conflict is audited without replacing original receipt |

No rejection on a later retry proves an earlier ambiguous attempt was not accepted. Such a case stays unknown/needs_review unless authenticated reconciliation resolves every possible attempt. Accepted receipt is monotonic; a conflicting second receipt is evidence_conflict, audited and held for operator investigation, not silently overwritten. No state transitions to queued from another state.

## 8. Observations, retry bounds and restore safety

`record_send_observation(attempt_id,attempt_capability,kind,receipt_ref,evidence_digest)` verifies the private capability hash and attempt binding, sanitizes kind/reference/size and appends evidence even if its lease is stale. It **never updates jobs**. Same attempt/kind/evidence replays are no-ops; different evidence for the same unique slot returns evidence_conflict without unlimited inserts. Maximum nine observation rows per send in this slice. Keep capabilities and references out of logs. Provider/webhook source types are not enabled until BE04 authenticates them.

The current worker or fresh reconciler calls `apply_send_observation(send_id,lease_id,generation,observation_id)`. Under a job lock, require exact generation **and lease ID and unexpired lease**, matching attempt/send/snapshot correlation and valid driver evidence. All job mutations use that compare-and-set predicate after locking; zero rows means stale, not success. Atomically append `observation_applied` or `observation_rejected` audit with unique observation ID and update the monotonic projection. This audit is the processed marker, so observations stay append-only without a mutable projected flag or a second queue table. A stale worker may finish by appending evidence; it never reacquires authority implicitly in its old completion path.

Normal BE03 profile is `none`: at most one authorized submission and no automatic retry after uncertainty. After the initial **pre-authorization** transient failure, schedule at most three retries at 1, 5 and 30 seconds; preflight_failures counts scheduled retries 0..3. A further failure at count 3 holds needs_review without incrementing. These checks do not increment attempt_count or first_possible_at. Reconciliation polls at most five times (1, 5, 30, 300, 900 seconds); absent evidence then needs_review. Later authenticated evidence can wake a fresh reconciler regardless of prior poll exhaustion; it cannot awaken submission. No infinite polling/hot loop or silent rescued exception.

Synthetic tests may use `synthetic-v1` with W=600 seconds, aggregate allowance=90 seconds, maximum three attempts and a controlled injectable clock/quiescence barrier. Deadline is first_possible_at+510 seconds. Require `database_now + bounded_remaining_call_budget < retry_deadline_at` and sufficient lease lifetime at final authorization; recheck local monotonic deadline immediately before invocation. Never claim these numbers are production defaults or guarantees. Exact provider account/key/tag identity, evidence-backed request lifetime, dedup start/retention semantics, max limits, wire-byte reuse and lookup/reconciliation remain BE04 work. No production 23-hour margin is selected.

Fencing protects database authority. A process suspended after its last check can later transmit despite lease expiry; a local clock check cannot close that interval. BE03 has no socket-sending code. Before a network implementation permits retries, BE04 must supply an egress/process-lifetime mechanism with bounded evidence or retain zero uncertainty retries; no fresh submission is admitted after uncertain expiry, and no automatic key rotation, payload rebuild, clone or startup reset is allowed.

The minimal seam is typed `submit(immutable_snapshot_bytes,send_id,attempt_id,deadline) -> Accepted(receipt_ref) | Rejected(code) | Unknown(code)` with bounded enums and no delivery variant. LocalFailureDriver has scripted accept/reject/accept-then-timeout/pause outcomes, no network or credential dependencies, and is explicitly prohibited in a production profile. Driver memory/fixture evidence is not a durable external ledger. BE04 must freeze provider wire materialization once before its first I/O while preserving the reviewed meaning and stable send ID; a changing timestamp/attempt-number tag cannot be injected into retry payloads.

The outbound hold and **current dispatch incarnation** come from control state outside the app database backup target, default held on startup/restore/unreadable state. The trusted Rails control reader checks before selecting submission work and again immediately before final authorization. Hold/unreadable control must not block applying already recorded observations. An epoch passed to SQL is a trusted service assertion, not an HTTP capability. New approvals bind the current readable epoch. An old intent with a different epoch cannot submit in BE03 even after the global hold is released; there is no restore_verified_epoch bypass. Control transitions and restores require quiescing old invokers; a file read or SQL assertion does not revoke an already-authorized call.

On restore, create a new external epoch while held and classify every old nonterminal intent needs_review/restore_unreconciled without submission. If its attempt row survives, normal authenticated matching evidence can still project accepted under a fresh lease. If a restored queued row lost the attempt, BE03 cannot insert attempt-bound observations or claim reconstructed acceptance: even a fixture ledger reporting acceptance leaves it held for later external reconciliation. BE04 must add an authenticated evidence path correlated by stable send ID, snapshot digest and provider account that does not depend on a lost attempt row, plus the separately durable ledger and restore drill. Timestamp markers and ledger absence prove neither non-submission nor retry safety. Global release requires the operator's completed recovery procedure; per-intent mismatch remains effective. No full restore acceptance is claimed here.

## 9. Migration, slices and file ownership

Root must first announce BE02 acceptance against final source bytes and Docker results, check source drift against the consultation manifest and reserve the next single-lane migration slot. The frozen sibling ends at `20261013000006_create_mailbox_membership_writes.rb`; proposed slot is `20261013000007_create_send_intents.rb`. If root allocates another BE02 repair migration first, assign the next strictly greater ID and document the mapping; never rename an applied migration or edit 0001..0006. New migration loads small SQL files in tables -> constraints/policies -> functions -> grants order. Deployment ordering later is migrate -> API accepting approvals -> worker. No live deployment is authorized now.

Down is allowed only for a disposable empty schema and refuses when any intent exists. Operational rollback disables new approvals/submission, retains snapshots/tombstones and reconciliation capability. Do not drop the schema to roll back a server binary. No new dependency is planned; any proposed one needs a one-line necessity justification and review.

| Slice / owner | Files owned when root assigns implementation | Dependencies and deliverable |
| --- | --- | --- |
| S1 contract + persistence owner | `contracts/v1` additive Send schemas/fixtures/lock; `apps/server/db/migrate/20261013000007_create_send_intents.rb`; `db/be03_send/{tables,constraints,policies,grants}.sql`; new `test/sends/schema_*` | Accepted BE02; reserve migration slot. New tables/role boundary, old C/D byte-structural assertions and empty upgrade/refused-down tests. |
| S2 review + approval owner | `lib/elevateo/sends/{input,canonical,readiness,review,approval}.rb`; `db/be03_send/{scope,draft_bridge,approve}.sql`; `app/controllers/v1/send_reviews_controller.rb`, `send_approvals_controller.rb`; new approval/request tests | S1; reuse WriteController/SessionWrites APIs without rewriting them. First vertical slice: review -> approval -> one queued intent. Privileged draft bridge has its own review assignment. |
| S3 status + cancellation owner | `db/be03_send/{status,cancel,policy}.sql`; `lib/elevateo/sends/{status,cancellation}.rb`; `app/controllers/v1/send_intents_controller.rb`; new cancellation tests | S2; one idempotent stop latch, explicit outcomes and own-author scope. Policy helper is migration/fixture-only, no new public admin UI. |
| S4 dispatch owner | `db/be03_send/{claim,authorize,session_bridge}.sql`; `lib/elevateo/sends/{dispatch_session,control,dispatcher,submission_result,local_failure_driver}.rb`; new worker/role tests | S2+S3; claim/boundary/fencing/no-network driver; privileged session bridge reviewed separately. |
| S5 recovery owner | `db/be03_send/{observations,reconcile}.sql`; `lib/elevateo/sends/{observations,reconciler,retry_policy}.rb`; new recovery/restore-fixture tests | S4; stale evidence, monotonic projection, nil policy and external-control seam. |
| S6 acceptance owner | Docker-owned integration/barrier fixtures under `apps/server/test/sends/`; task-owned test orchestration; sanitized evidence docs | S1-S5; matrix below, adversarial review and handoff to BE04. No provider simulation claims from LocalFailureDriver. |

Shared touch points have **one designated integration owner**: route registrations, typed configuration registration, dependency/load registration, privilege-verifier allowlists, contract generation/lock, README/state/documentation and code-reviews.md. Root assigns that owner; two workers must not race shared files. SQL functions and typed input/results should stay <=200 lines per review assignment; split concerns rather than exceed the review cap. Every changed nontrivial module gets a short AIDEV-NOTE for its invariant/cross-file coupling; search/update existing anchors before edits. Strict Ruby type discipline follows the project's selected checks and existing typed boundary patterns; no untyped bag silently crosses a service boundary.

Run-through demonstration after root gate: authenticated review -> approval -> queued -> claim -> final authorization -> local accepted; separately accept-then-timeout -> unknown -> stale observation -> fresh reconciler accepted. This is one Rails/PostgreSQL application and a local failure driver, not a second backend. No production or completed-BE03 label is permitted on this design artifact.

## 10. Docker acceptance matrix — all NOT RUN

Use the **accepted BE02 pinned Docker environment** (currently proposed PostgreSQL 17.6/Auth v2.196.0 in supplied evidence; root must confirm final pins), real migrations, actual API/worker roles and real Auth paths. Deterministic barriers require two or more real database connections/processes. No mocks replacing PostgreSQL isolation, RLS, Auth/session revocation or transaction outcomes. Test-only clocks/kill barriers must be unavailable to production roles/configuration. All checks below are future evidence requirements, not tests run by this dispatch.

| Group | Bounded cases and expected proof |
| --- | --- |
| Lint/type/boundary | Project lint/type checks; closed/duplicate JSON, invalid UTF-8/NUL, UUID/int overflow, unknown keys/purpose/attachments, oversized requests/responses; no secret/content logs. |
| C/D regression | Existing contract objects/fixtures unchanged; old successful save replay after consume; new save -> draft_consumed; actor/private-mailbox scope and generic errors; consumed max content version unchanged. |
| Canonical vectors | Unicode scalars, control escapes, U+2028/slash, null/empty display, CR/LF rejection, domain-only folding, local-case sensitivity, 0/1/100/101 recipients, duplicate addresses, max text and exact byte digest; changed sender/policy/version -> review_stale/conflict. |
| Atomic approval | Same key concurrent/replayed/lost response; different keys same draft/version; wrong digest/key reuse; concurrent save in both orders; fail after every insert/update before commit; assert counts snapshot=1,intent=1,job=1,approved audit=1 or all zero. |
| Auth and roles | Unauthenticated, missing CSRF/Origin, old context/generation, expired/revoked session, Auth unavailable, compose-only, foreign author/mailbox, connector token, forged GUCs/private marker, owner role inheritance, SQL helper permissions. Zero unintended inserts/content disclosure. |
| Claims | Two workers disjoint claims; unexpired lease unclaimable; expired queued reclaim safe; expired dispatching reconciliation only; maximum fence/count rejection; stale ID/gen/unexpired mismatch cannot mutate any job field. |
| Boundary races | Cancellation vs authorization both orders; suppression/disable vs authorization both orders under policy guard; session/org/mailbox revocation vs authorization both orders under session/generation; verify durable commit ordering and no DB transaction during Auth/driver I/O. |
| Crash windows | Kill after approval, after claim, after authorization-before-call, during accept-then-timeout, after response-before-observation, after observation-before-projection, after projection-before-ack. First_possible_at never resets; ambiguous cases remain unknown/reconcile. |
| Stale evidence | Old worker result changes zero projection rows but appends valid attempt evidence; invalid capability/foreign send/forged source rejected; fresh lease applies; duplicate/conflicting observations bounded; late accepted beats uncertainty without downgrade. |
| Retry | Normal profile uncertain -> no second invocation; preflight transient bounded; synthetic retry same ID/bytes, quiescence, max3, strict deadline equality and remaining-call budget; cancel/suppression/revocation before retry stops it; no automatic clones/key rotation/startup reset. Count invocations separately from synthetic accepted effects. |
| Restore contract | Restore old queued/no-anchor row while separate fixture ledger remembers acceptance: needs_review, no invocation, mismatch still blocks after global release. A surviving recorded attempt can accept valid late evidence while globally held. Missing attempt cannot fabricate authenticated acceptance or return cancelled; unreadable/stale control and absent ledger fail closed. This is a boundary fixture, not BE04 durable restore acceptance. |
| Migration/retention | Upgrade accepted BE02; second normal migration invocation no-op; role grants/forced RLS verified; down refuses nonempty; parent deletion restricted; send identity survives BE02 operation-detail compaction. |
| UI handoff | Actual later UI must display full recipients/sender/purpose/no-attachments, simulated badge, self-approval, empty/loading/error and accessible focus behavior; uncertain/cancel-late never suggests delivery or safe resend. Actual visual QA still required before publication. |

Every feature/regression needs happy path plus likely failure cases from this matrix. After implementation, adversarial Codex assignments cover all changed code at <=200 lines each, plus a separate deep-design reviewer using the user's full rubric; formatting goes to linters. Root/integration owner records coverage, defect count/density and repairs in code-reviews.md, then reruns only affected checks plus the required acceptance suite. Do not label these three design opinions as adversarial code coverage.

Disposable Docker resources must be task-owned, run with `--rm` where applicable and cleaned after required tests/preview on success or failure. Inspect mounts, preserve persistent Auth/database/uploads/credentials, remove only exact task-owned disposable volumes/images/cache, report space/retained workloads and Windows compaction blockers. This dispatch created no Docker resources and ran no cleanup commands.

## 11. Remaining evidence and root action

Root alone decides BE02 acceptance, reserves/assigns implementation and integrates these design documents with state files. All implementation, database migrations, automated Docker checks, application visual validation and review-derived repair remain outstanding. No paid purchase, provider connection, credential request, commit/push or production action occurred here.

BE04 must establish account-scoped provider identity and limits, stable key/tag mapping, immutable transport materialization, definite-versus-ambiguous rejection semantics, authenticated observations, evidence lookup, bounded request lifetime, separately durable acceptance ledger and real lost-timeline restore procedure. Current primary-provider evidence and its scope are recorded in [the synthesis](../../.planning/consultations/results/be-03/decisions.md); neither that documentation nor a LocalFailureDriver establishes production reliability.
