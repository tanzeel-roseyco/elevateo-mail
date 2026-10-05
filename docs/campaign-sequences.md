# Campaign sequences

A sequence creates one to three immutable campaign drafts for one opted-in recipient and one mailbox. Every step needs separate review and approval through the existing send-review flow. Creation never sends or approves anything.

Schedules are explicit UTC instants, strictly increasing, within 30 days of creation. They are earliest-send times, not guarantees. Approval expiry is calculated from the later of approval time and the scheduled time. Each approved step reserves its recipient against the existing rolling 24-hour quota. A step cannot dispatch until its predecessor has an accepted receipt. Unknown outcomes stop progress until reconciled; they are never retried as new sends.

## Current availability

Durable fake-provider sequences work by default. Resend sequences require the operator-controlled pilot gate described below; it remains off in this repository. Database guards independently check fresh receiving-channel proof at approval and dispatch. The API returns a boolean `liveActivationAvailable` describing configured availability, not live acceptance or the authenticity of stored drafts. Existing campaign stops, unsubscribe suppression, campaign pause and mailbox permission checks still apply independently at dispatch.

## HTTP contract

- `POST /v1/campaigns/:id/sequences`: `{idempotencyKey,mailboxId,recipient,steps:[{subject,body,scheduledAt}]}`. Returns 201 `{sequence,liveActivationAvailable:boolean}`.
- `GET /v1/campaigns/:id/sequences?after=...&limit=10`: returns `{items,next,liveActivationAvailable:boolean}`. Limit 1–25; opaque sequence-ID cursor.
- `POST /v1/campaigns/:id/sequences/:sequenceId/cancel` with `{}`: returns `{sequence,liveActivationAvailable:boolean}`. Cancels only draft/pending steps; in-flight, accepted and unknown outcomes remain auditable.

A sequence is `{id,mailboxId,recipient,steps:[{id,revision,status,scheduledAt}]}`. Step IDs are ordinary send-intent IDs; existing content and review endpoints provide their immutable subject/body. List responses deliberately omit message bodies. All access is owner-scoped. An identical canonical create retry returns the same sequence, including after its dates have passed; changed content using the same key returns `idempotency_conflict`.

Creation is one D1 transaction, including ordinary send intents and unsubscribe tokens. No separate scheduler is introduced. Existing relay queries skip blocked predecessors and disabled real-provider sequences so they cannot crowd out eligible ordinary sends. Cancelling an earlier step leaves later drafts visible but permanently blocked by the predecessor rule; cancel the whole sequence to clear them.

Tests cover concurrent retry identity, transaction boundaries, input limits, owner separation, approval/quota, unknown reconciliation, suppression/reply stops and real-provider activation refusal. No credentials or live transport are used.

## Explicit Resend sequence pilot gate

`RESEND_SEQUENCES_ENABLED` defaults to `false`. After credentialed receipt and sending acceptance, the operator may set it to `true` alongside the existing live-sending gates and `RESEND_REPLY_ENDPOINTS`. No browser can enable this deployment switch. Keep it false until the exact receiving subdomain is configured and delivery/stop behavior is verified. Never change root MX records.

The endpoint map binds an opaque endpoint ID to owner, credential ID, approved receiving domain and webhook secret (see `resend-replies.md`). Secrets belong in deployment secret storage, never frontend configuration. New drafts bind a hash of all binding values; replacing a secret, endpoint or domain requires recreating drafts. Legacy drafts without a channel fingerprint cannot activate.

`liveActivationAvailable` means the deployment pilot switch is on and this owner has a configured receiving channel. It is not proof that every mailbox can send or that DNS has been accepted: approval and dispatch independently require that intent's exact current channel, current sender credentials, explicit content approval, quota, consent and accepted predecessor. Gmail remains manual-only. Fake sequences work unchanged when the switch is off.

Each SQL transition receives and consumes a fresh server-derived proof. Approval does not leave a reusable dispatch permit. Disabling or removing configuration blocks pending sends; ordinary cancellation can release reservations. Already in-flight calls cannot be recalled, and unknown outcomes never advance the sequence.

Deployment example (ordinary non-secret variable):

```json
{ "RESEND_SEQUENCES_ENABLED": "false" }
```

Store `RESEND_REPLY_ENDPOINTS` through the deployment secret mechanism. To pilot after acceptance, explicitly change only the switch to `"true"`; keep `LIVE_SENDING`, provider, connection and pause gates configured separately. Reverting to `"false"` blocks subsequent dispatch transitions. Never copy webhook secrets into this example or a client bundle.

The relay rotates deferred pending jobs by `updated_at,id`; missing or changed channel configuration cannot permanently monopolize its bounded batch. Deferred jobs remain visible for cancellation. When selected by the relay, expired approvals are cancelled before transport; switching the pilot off excludes real sequence jobs, so operators should cancel waiting sequences to release reservations.
