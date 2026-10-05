# Connection management HTTP contract

The worker must authenticate every request with `authenticateSession` before invoking `connectionRoute(request, path, session, db, oauth?, now)`. This preserves cookie CSRF, origin and account-binding checks. The route additionally verifies the session remains active, and guards local mutations at the database write. Never accept a session hash or owner from browser JSON.

All bodies are strict JSON. Unknown fields and duplicate query parameters fail validation. Routes return null when unmatched for the worker's normal 404 handling. Errors use the existing worker error envelope.

| Request | Input | Success |
|---|---|---|
| GET `/v1/connections` | Optional `after` ID and `limit` integer 1–100, default 25 | `{items:[{id,provider,subject,revision,revoked}],next:{after}|null}` |
| POST `/v1/connections/:id/revoke` | `{}` | `{revoked:true}` |
| PATCH `/v1/connections/:id/mailboxes/:mailboxId/permissions` | `{aiRead:boolean,aiDraft:boolean}` | `{updated:true}` |
| POST `/v1/connections/oauth/begin` | `{reconnectId?:string}` | `{authorizationUrl,expiresAt}` |
| POST `/v1/connections/oauth/complete` | `{callbackUrl:string}` | `{connectionId}` |

Metadata includes both active and locally revoked entries, but never encrypted or plaintext tokens. Revocation atomically removes local tokens, advances their revision and disables the owner's mailbox matching the verified provider/subject, including all send and AI permissions. It does not revoke consent at the provider. Existing accepted mail cannot be recalled. Missing or foreign connections return `connection_not_found` (404).

Read and draft selection are independent booleans. The credential must be active, owner-matched and match the connected mailbox's provider and subject. Otherwise `connection_mailbox_not_found` (404). Selection cannot enable sending or reconnect anything. No new browser-supplied identity linking is introduced; creation of a verified mailbox from provider identity remains a separate adapter step.

OAuth uses a server-injected configured `ConnectionOAuth`. Without it both OAuth endpoints return `connection_oauth_disabled` (503). Browsers cannot provide provider configuration or token endpoints. Existing OAuth state, issuer, scope, session and replay validation still apply.

## Same-origin callback handoff

Register a same-origin frontend return page, not a cross-site API callback. After the provider redirects, that page captures the completed URL in memory, removes its query from browser history immediately, and POSTs `{callbackUrl}` to the completion endpoint with the existing CSRF and account headers. Do not log/store the URL or load third-party resources on the return page; use `Referrer-Policy: no-referrer`. The same-origin POST retains Strict-cookie protection. Do not weaken authentication to accept provider cross-site requests. A missing app session requires sign-in and restarting OAuth; callback codes cannot be replayed.

This module is credential-independent infrastructure. No live OAuth configuration, provider-side revocation, browser callback implementation or production verification is implied by its presence. Tests use real local D1 and an injected synthetic provider.
