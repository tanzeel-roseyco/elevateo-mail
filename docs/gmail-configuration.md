# Gmail runtime configuration

`createGmailRuntime` composes the credential vault, Google connection authorization, token refresh provider and bounded read provider. It does not start synchronization or attach routes by itself. Gmail stays disabled when `GMAIL_ENABLED` is missing or `false`; enabling it requires every field below. Invalid configuration returns a redacted `gmail_configuration_invalid` error.

Credentials remain the final integration step. Configure these only as server bindings:

- `GMAIL_ENABLED`: `true` when the operator is ready to enable the reviewed integration.
- `GMAIL_CLIENT_ID` and `GMAIL_CLIENT_SECRET`: the Google OAuth application credentials.
- `GMAIL_REDIRECT_URI`: the exact HTTPS application URL ending in `/connections/gmail/callback`, also registered with Google. No query, fragment or user information.
- `GMAIL_ENCRYPTION_KEY`: 32 random bytes encoded as canonical unpadded base64url. Store securely and back it up; replacing it makes existing grants unreadable. Use a separate key from app login. Key rotation needs a deliberate migration, not a random key at startup.

Authorization, token, identity and Gmail endpoints are fixed in code. The default connection requests `openid` and Gmail read-only, with offline access. Optional explicit send authorization adds Gmail send scope; it does not enable sending by itself or grant DNS access or recipient consent. App sign-in and mailbox connection are separate flows. The trusted Google subject is obtained server-side; browser input never selects an identity. Ownership and credential revisions remain enforced by the vault and sync runner.

Browser callback wiring and bounded scheduled sync are implemented. Google verification, deployment and live-provider acceptance remain outstanding. Fixture tests validate composition without credentials or external requests.

## Explicit manual sending

`GMAIL_SENDING_ENABLED=true` exposes a separate OAuth elevation for an existing connection. Begin uses `{reconnectId, purpose:"send"}`; completion still accepts only `{callbackUrl}`. The server selects one of its two fixed OAuth profiles using the encrypted, owner/session-bound state. No browser-supplied scope or callback purpose is trusted.

`GET /v1/mailboxes/:id/gmail-sending` returns `{enabled, authorized, available, connectionId}`. `POST` with `{enabled:true}` requires the current grant's send scope and a connected, verified mailbox. `{enabled:false}` works without decrypting credentials or loading provider configuration. Both mutations require the active owner session. Authorization and mailbox enabling are separate actions.

Actual dispatch additionally requires `LIVE_SENDING=enabled`, `PROVIDER_MODE=gmail` (or `mixed`), and all selected provider gates. Gmail-only mode does not require a Resend key or unsubscribe origin. Mixed mode requires both providers' release configuration. Default dispatch remains paused. Gmail supports reviewed manual intents only; campaigns remain unavailable for this provider.

The immutable intent records the credential grant epoch and mailbox permission generation. Reconnect, revoke, or disable/re-enable invalidates older approvals. Normal token refresh preserves the grant epoch, while the dispatch claim checks the exact resolved token revision atomically, preventing a token rotation race from sending. An uncertain provider outcome is never retried automatically. No credentials or live-send acceptance evidence are included in this implementation.

## Current sending scope

Gmail supports personal, manually reviewed messages and threaded replies only. Campaign draft creation is rejected with `gmail_manual_only`, and the Gmail send resolver independently requires manual intent kind. Marketing campaigns use Resend; Gmail campaign reply correlation is therefore outside the current transport contract. Do not infer campaign support from the presence of Gmail inbox synchronization.
