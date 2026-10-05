# Resend receipt ingestion

`ingestResendEvent` is exposed through the optional public POST `/v1/resend/events/:endpointId` route. Sending and deployment remain disabled. The HTTP caller must stream-limit the raw body to 64 KiB and supply server-selected owner, credential ID and Svix webhook secret. Never select these from event JSON. Only subscribe this endpoint to sent, delivered, bounced and complained events.

The initial contract accepts application-created one-recipient campaigns, plain address From, no CC/BCC, and the `elevateo_intent_id` tag. This intentionally does not ingest arbitrary dashboard sends or broadcasts. The strict schema fails closed on unsupported fields; extend it deliberately when provider contracts change. No provider API calls are made.

Signature verification precedes parsing. D1 batches atomically commit the payload hash receipt, immutable provider-message correlation and effects. Replays with different bytes fail. A provider ID cannot be assigned to two intents within an owner/credential binding, nor can an intent acquire a second provider ID. Acceptance only resolves dispatching/unknown. Rejected/cancelled intents are never resurrected. Bounce/complaint suppression persists, turns off contact opt-in and cancels draft/pending work for that owner and recipient. Already in-flight mail cannot be recalled. Revocation does not discard late complaints.

Tests use independent Node HMAC signing and real local D1 through Docker. No live provider evidence exists. Add operational retention rules before enabling real sending. Do not delete correlations while late events are still possible.

## Campaign unsubscribe preparation

`new SendLedger(db, httpsOrigin)` optionally prepares a single-recipient Resend campaign with an unsubscribe footer before its immutable envelope is hashed and approved. The origin must be HTTPS with no path, credentials, query or fragment. Each new intent gets a random 32-byte bearer token; only its SHA-256 hash and owner/recipient binding are stored in `unsubscribe_tokens`. The plaintext token appears only in the immutable email envelope. Issuance and intent insertion share one transaction. Identical idempotent retries return the existing envelope, including after configuration changes.

An absent origin preserves credential-free simulation; it does not make the resulting campaign eligible for live sending. Before enabling any live resolver, require a configured origin and a token-backed footer bound to the same owner/recipient, and wire that origin through every creation/replacement route. Reject older unfooted campaign drafts instead of silently upgrading them. Current HTTP creation/replacement routes supply the configured origin; absent configuration still blocks live dispatch. The existing unsubscribe handler requires a confirmation POST; link-preview GET requests cannot suppress recipients. No additional migration is needed because the existing token table already owns this binding.

Official sources checked:
- https://github.com/resend/resend-openapi/blob/main/resend.yaml (outbound event schemas)
- https://www.resend.com/changelog/webhook-event-visibility (one recipient per event)
- https://resend.com/changelog/message-id-for-sent-emails (message ID and sent semantics)
- https://resend.com/docs/webhooks/verify-webhooks-requests (raw-body Svix verification)

Design tradeoff: synchronous bounded verification plus one atomic D1 batch avoids a queue and extra hosting cost. Historical immutable bindings, rather than current connection permissions, preserve late-event correctness. Obsidian was unavailable; this tradeoff was analysed directly against failure/race scenarios.

## Optional server configuration

Set RESEND_EVENT_ENDPOINTS only as a server secret: a JSON object mapping opaque endpoint IDs (24-128 ASCII letters, numbers, underscores or hyphens) to objects containing owner, credentialId and secret (the Svix whsec_ signing secret). The map accepts 1-100 endpoints and at most 90,000 characters. Each endpoint is permanently scoped to its owner and historical credential identity; do not repurpose IDs or secrets across users. Use distinct signing secrets per endpoint. Absence disables the route. Configuration is parsed only for this route, and malformed configuration returns a sanitized 503.

The route accepts POST only, rejects query parameters, stream-limits exact raw bytes to 64 KiB before verification, and returns no-store responses. There is no session-cookie dependency. Invalid signatures return 401; incorrect immutable correlation returns 409. Live sending remains disabled. Configure only the four supported event subscriptions; unsupported signed events are rejected deliberately. Endpoint IDs are routing identifiers, never substitutes for signature authentication.
