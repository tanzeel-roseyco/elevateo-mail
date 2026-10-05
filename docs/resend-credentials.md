# Resend static credential foundation

`ResendCredentials` stores bounded non-whitespace ASCII API keys encrypted with the existing AES-GCM `SecretBox`. Ciphertext binds to owner, connection ID and a Resend-specific purpose. Metadata never includes a key. Only the server-only `readForServer` method returns plaintext for the server provider adapter; never return it in HTTP responses or logs.

Create, replace and revoke require an active owner session at the database write. Replace/revoke require the expected revision. Revocation leaves a tombstone; replacement cannot resurrect it. Ten records per owner (including tombstones) bound this foundation's storage. Repeated disconnect/setup will eventually require a separately designed explicit reconnect flow; there is no deletion or silent resurrection API.

Server-side admission reads Resend domain status and sending capability, matches the sender domain exactly, and binds the owned mailbox to the credential revision. Admission leaves sending disabled. Rotation and revocation atomically disconnect associated senders and clear send permission. Existing draft bindings do not silently rotate. API-key permissions must permit reading domain details; a sending-only key cannot supply this verification. Production sending still requires separate authorization, unsubscribe issuance, signed delivery events and live dispatch composition. No DNS writes are implemented.

Migration 0015 is additive. Its documented rollback destroys credentials and requires explicit confirmation. Tests use generated encryption keys and synthetic credentials only; Docker validation is performed by the integrating agent.

## HTTP composition

`createResendRuntime(db, env, fetcher?)` defaults off. `RESEND_CONNECTIONS_ENABLED=true` requires `RESEND_ENCRYPTION_KEY`, a canonical unpadded base64url encoding of a random 32-byte AES key, supplied through server secrets. Keep that key stable: changing it without a migration makes existing ciphertext unreadable. This flag enables connection management and read-only domain verification, not email sending.

Call `resendRoute(request, pathname, authenticatedSession, db, runtime, now)` only after the worker's normal authentication, CSRF and account-binding checks. It returns `null` for other paths. Do not expose these handlers before authentication. It rechecks the active session and passes a monotonic clock to database commit guards. Apply the usual safe API error serialization; never log request bodies, API keys or ciphertext.

| Method and path | Request | Response |
| --- | --- | --- |
| GET `/v1/resend/status` | none | `{enabled}` |
| GET `/v1/resend/connections` | none | `{connections:[{id,revision,revoked}]}`; at most ten |
| POST `/v1/resend/connections` | `{apiKey}` | Metadata, HTTP 201 |
| GET `/v1/resend/connections/:id` | none | Metadata |
| POST `/v1/resend/connections/:id/replace` | `{revision,apiKey}` | Updated metadata |
| POST `/v1/resend/connections/:id/revoke` | `{revision}` | Tombstone metadata |
| POST `/v1/resend/connections/:id/sender` | `{address,domainId}` | Owned mailbox `{id,address}`; sending disabled |

Bodies are strict JSON with bounded reads; query parameters are rejected. `revoked` is numeric 0/1. Responses use `Cache-Control: no-store` and contain no secrets. Disabled management returns `resend_disabled` (503); missing session returns 401; stale revision returns `connection_changed` (409); unverified sender returns `resend_sender_unverified` (409). Domain reads can require a full-access Resend key, which is more sensitive than a sending-only key. Metadata listing never decrypts stored keys.

The Worker and private Connections UI compose these routes/configuration behind the disabled-by-default gate. Tests cover synthetic provider verification with real fixture D1 and encryption. No real credentials or external sends are used.


Metadata listing and revision-checked revocation remain available when Resend connections are disabled or encryption configuration is invalid. Creating or replacing a key and verifying a sender require valid enabled configuration. Revocation disconnects bound senders atomically without decrypting the key.
