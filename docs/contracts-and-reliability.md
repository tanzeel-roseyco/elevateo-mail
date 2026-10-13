# API contracts and failure recovery

Status: design specification; none of these endpoints or jobs are implemented.

2026-10-13 stack reconciliation: these are **Rails domain contracts** under [ADR 0002](decisions/0002-rails-laravel-presentation.md). Laravel Blade/Livewire calls them through an allowlisted presentation adapter with encrypted server-side per-user Supabase session material; it does not own mailbox tables, permissions or sending jobs. The browser cookie authorizes the Laravel session, while Rails verifies the forwarded individual user's current session and mailbox access. Native and MCP sessions remain separate. No API/BFF service identity substitutes for the user.

## API conventions

Use `/v1`, strict boundary schemas, bounded page sizes, opaque keyset cursors and stable error codes. Every resource query includes verified organization **and mailbox** scope. A missing or inaccessible object returns a non-enumerating response; authentication failures remain 401. Request IDs correlate logs without including email bodies, tokens or sensitive headers.

| Proposed route | Required ability | Contract |
| --- | --- | --- |
| `GET /v1/mailboxes` | authenticated membership | Only mailboxes currently visible to the user |
| `GET /v1/mailboxes/:id/threads?cursor=...` | mailbox read | Stable cursor, bounded result count, team status and per-user read state |
| `GET /v1/threads/:id` | mailbox read | Authorized thread and safe content representation |
| `GET /v1/attachments/:id/download` | current session/grant + mailbox read | Authenticated bounded stream after scan/quarantine check; Storage signed URLs stay server-side |
| `POST /v1/mailboxes/:id/drafts` | draft write | Validated envelope/body; version 1 |
| `PATCH /v1/drafts/:id` | draft write | Expected version/If-Match; stale write returns 409/412 |
| `POST /v1/drafts/:id/send` | human send + mailbox send | Immutable version and request idempotency key; returns 202 plus job ID |
| `GET /v1/send-jobs/:id` | mailbox read | Authoritative queued/accepted/unknown/delivery facts |
| `POST /v1/send-jobs/:id/cancel` | human send | Cancels only before dispatch authorization; returns conflict if too late |
| `POST /v1/webhooks/resend` | valid provider signature | Raw-body verification, durable insert, then 2xx; no user cookie |
| `POST /v1/connector-grants/:id/revoke` | grant owner/admin | Immediate grant revocation and audited event |

`202` means the job is durably queued, not delivered. A duplicate idempotency key with the same immutable payload returns the same job. The same key with a different payload returns conflict. Hashes and keys are scoped to organization + mailbox + actor/action where appropriate. Also enforce database uniqueness for `(organization_id, mailbox_id, draft_id, approved_version)`: two devices using different request keys still receive the same logical send. An intentional resend requires a new explicitly approved intent/version. Retain application-level send identity independently of provider key expiry, including tombstones needed to prevent replay after retention cleanup.

Laravel enforces CSRF, session rotation/expiry, fixed Rails origin and bounded deadlines, forwards stable mutation identities and preserves error/unknown states. Never retry a timed-out write with a new identity. Livewire properties/action parameters are untrusted, and hiding an action is not authorization. No-store protects authenticated HTML/API responses; stale pages cannot establish current access. Browser attachments stream through Laravel to the authenticated Rails proxy without exposing Storage URLs or bypassing revocation checks. Laravel's session role cannot access mail tables.

## Example send command

Illustrative JSON, not a supported API today:

```json
{
  "draft_id": "draft-uuid",
  "expected_version": 4,
  "client_request_id": "unique-user-action-uuid"
}
```

The server derives sender identity from the authorized mailbox. It freezes recipients, subject, body, relevant headers and attachment digests/versions into the send snapshot. Do not let a worker re-render an edited draft, regenerate a time-dependent signature or read a replaced attachment while retrying the same identity. Persist an opaque `elevateo_send_id` in the immutable provider tags before the first call. Resend documents that tags appear in webhook events. Validate the signed event, provider account and unique job/tag association before recording its provider email ID. Keep the tag identical across attempts; an attempt counter would change the retry payload. If no matching event or saved provider ID exists, retrieve-by-ID cannot resolve the gap: use bounded same-key recovery or preserve uncertainty, never recipient/time heuristics. See [Resend tags](https://resend.com/docs/dashboard/emails/tags).

## Sending state machine

```mermaid
stateDiagram-v2
    [*] --> queued: durable approval transaction
    queued --> cancelled: before dispatch boundary
    queued --> dispatching: lease + final checks + recorded attempt
    dispatching --> accepted: provider acknowledges
    dispatching --> unknown: timeout or ambiguous failure
    dispatching --> rejected: definitive provider rejection
    unknown --> accepted: verified reconciliation
    unknown --> dispatching: same key and payload within safe window
    unknown --> needs_review: retry horizon exceeded
```

Delivery/bounce/complaint facts are separate from this dispatch state and may arrive before the API response is persisted. Preserve event history and merge facts; never downgrade a known acceptance because an earlier event arrived late. Store per-recipient delivery outcomes where supplied: a multi-recipient submission has one immutable envelope but does not prove delivery to every recipient. Avoid equating `opened` with verified human reading.

### Transaction boundaries

1. In a short transaction, validate membership, mailbox status, draft version, sender identity and permission/consent applicable to the message type. Insert snapshot + job + audit with the draft-version uniqueness rule above and stable send identity.
2. Worker claims a due row using row locking/`SKIP LOCKED`, lease expiry and increasing lease generation. Record the first possible provider-attempt time **before** network I/O. Commit.
3. Immediately before dispatch authorization, recheck current mailbox access/disabled state, suppression and cancellation in a transaction. Commit a dispatch boundary; the UI must explain cancellation is no longer guaranteed after this point. A later revocation cannot recall a message already crossing the external boundary.
4. Call the provider with a bounded timeout, the same immutable payload and stable idempotency key. Never keep a DB transaction open across the call.
5. Persist provider ID/result using a generation-checked update. Reconcile concurrent webhook evidence. A stale worker cannot overwrite a newer lease owner's database result.

Provider idempotency lasts **24 hours**. Use a shorter application retry horizon (proposed 23 hours from persisted first attempt), accounting for clock skew, provider timeout and lease duration. Recheck the deadline immediately before every external call. No new automatic request after this boundary; escalate unknown state. Exactly-once internet email is not guaranteed. Application uniqueness, fencing and provider idempotency reduce duplicate risk within defined limits. A suspended worker cannot be perfectly fenced at the provider using a database generation number; bound worker lifetime/timeouts and prefer uncertainty over duplicate sending.

## Failure matrix

| Fault | Expected behavior | Required test |
| --- | --- | --- |
| Two browser clicks | Same durable job returned | Concurrent same-key requests yield one job |
| Two workers claim | One lease owner at a time | Concurrent PostgreSQL transactions |
| Worker dies before provider I/O | Resume same identity; do not mark sent | Crash after intent commit |
| Provider accepts; response lost | Unknown, reconcile/retry same key in window | Fake provider accepts then times out |
| Worker dies after response before commit | Recover provider evidence, no fresh key | Acceptance persisted by webhook/retrieval |
| Unknown beyond safe window | Hold for review; no automatic resend | Advance fake clock past boundary |
| Suppression or mailbox disable before dispatch | Cancel/hold without provider call | Race at final dispatch check |
| Suppression after dispatch boundary | Stop future sends; report already-dispatching item honestly | No false recall guarantee |
| Duplicate/reordered webhook | One imported event effect; monotonic known facts | Replay same event and reorder sequence |
| DB unavailable during webhook | Non-2xx, provider retry; alert | Do not acknowledge unpersisted work |
| Body retrieval fails after webhook accepted | Persistent import job retries/backfills | Metadata survives API outage |
| Stale lease owner finishes | Cannot overwrite current result | Generation mismatch |
| App restarts with `dispatching` rows | Reconcile; never reset all rows blindly | Crash/restart fixture |

## Receiving and threading

Webhook signature verification must use the exact raw body with replay-time tolerance and an explicit payload limit. Deduplicate on `(provider account, provider delivery/event ID)` as documented by the provider. A transport retry identity and a logical email ID are distinct: also enforce the appropriate unique import key for an email delivered to a specific mailbox. Receiving the same email for two authorized company addresses can create two mailbox-visible records without granting either mailbox access to the other.

Persist event + import job atomically before acknowledging. Unknown recipients go to a restricted quarantine, not a newly created public mailbox. The worker fetches body/headers and fresh provider attachment URLs just in time, server-side only. Bound bytes, time, redirects and allowed download origins. Do not fetch links embedded in the email. Scan attachments before release through the authenticated application download proxy. Disable external image loads by default, sanitize HTML and display it in an isolated frame with a restrictive sandbox/CSP. Keep original content separately for authorized diagnostics; never inject it into the application DOM.

Match replies using References/In-Reply-To and stored RFC Message-IDs within the relevant mailbox. Validate header lengths and malformed values. Message-ID is untrusted external input and is not a globally authoritative primary key. Subject matching alone is insufficient; uncertain matches start a new thread or enter review. Prevent an external sender from joining private threads merely by guessing an ID; require compatible participants and mailbox routing.

## Outbox and reconciliation

A database outbox is the job/intent record committed with the domain change. It is not an additional network broker. Polling a modest indexed due-job table is adequate to pilot 10 users; the actual workload, not user count alone, determines capacity. Index pending rows by due time, and use bounded batches/backoff. Separate inbound imports from outbound sends so a large attachment cannot starve sending.

Run periodic reconciliation with provider list/retrieve endpoints, persisted cursors, overlapping windows and deduplication. Provider retention and API limits are external constraints; fetch promptly, monitor oldest incomplete item and alert well before the verified retention window. Manually resolving an unknown send requires evidence, actor, reason and audit. A decision to resend after ambiguity creates an explicit new send with a visible duplicate risk, never a silent state reset.

## Acceptance before live email

Demonstrate these failure cases with real PostgreSQL transactions and a deterministic fake provider. The local fake must model provider key expiry and ambiguous acceptance; a mock that always succeeds does not validate this design. Actual provider connection and sandbox/test events belong to final activation after checking for hidden sends. A controlled send/reply with owned addresses remains prohibited until the user explicitly changes the no-live-send instruction. [Cross-platform tests](cross-platform-testing.md) add browser/BFF/native verification without activating mail.

Primary reference: [Resend idempotency keys](https://resend.com/docs/dashboard/emails/idempotency-keys), checked 2026-10-11. Further provider constraints are in [mail delivery and hosting](mail-delivery-and-hosting.md).
