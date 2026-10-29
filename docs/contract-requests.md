# Contract requests from the frontend-completion lane (2026-10-29)

The clients below were built against these proposed contracts through typed client-side ports. Until the backend adds each one to `contracts/v1` or `contracts/v2`, production builds leave the port unwired and the screen shows an explicit "not available yet" state. Demo and fixture builds use adapters labelled "Simulated". Nothing here is implemented on the server by this lane; the backend owns `apps/server`, `contracts` and `src-tauri/src/agents`.

Each request lists the client code that depends on it (search for `AIDEV-NOTE: contract-request`).

## 1. SSO status and start (web, Android shell, Mac shell)

`GET /v1/auth/sso/status` and `GET /v1/auth/sso/start` are used by the web client (`apps/web/src/data/ssoContract.ts`) as confirmed by the 2026-10-23 coordinator, but they are not in `contracts/v1/openapi.json`.

- Request: add both to contracts/v1 exactly as served. The provider enum should be `custom:authentik` only. The client already treats `google` as "SSO unavailable" (Google Cloud is prohibited).
- Shell dependency: the Tauri WebView allows top-level navigation to the HTTPS origin of the build-time `ELEVATEO_OIDC_ISSUER` only, so the issuer must be the same Authentik origin the `/start` redirect uses.

## 2. Native session exchange, bearer access, refresh and revocation (Mac, Windows, iOS)

contracts/v1 authenticates only with the HttpOnly `elevateo_session` cookie plus Origin/CSRF checks. Native clients follow RFC 8252: system browser, authorization code with S256 PKCE, and a loopback or custom-scheme redirect. They therefore need:

- `POST /v1/native/sessions`
  - Body: `{ code, code_verifier, redirect_uri, client_id }`.
  - Response: `{ access_token, token_type: "Bearer", expires_in, refresh_token }`.
  - Binds the code to the PKCE verifier, redirect URI, client and issuer, and rejects replay.
- `POST /v1/native/sessions/refresh`
  - Body: `{ refresh_token }`.
  - Response: same as above. Rotates the refresh token on every use.
- `DELETE /v1/native/sessions/current`: revokes this device's session, using the bearer token.
- Bearer acceptance: every v1/v2 data route, and `GET /v1/session`, accepts `Authorization: Bearer <access_token>` and returns the same `Session` body. That body supplies `context_id`, `authorization_version` and `csrf_token`. Each call checks the session against authoritative server state (DESK-05).
- Clients:
  - Mac: `apps/native/src-tauri/src/auth.rs` (`TokenExchange`, `ContractPendingExchange`).
  - Windows: `apps/windows/src/Elevateo.Client.Core/Auth/LoopbackAuthenticator.cs`.
  - iOS: `apps/ios/ElevateoCore/Sources/ElevateoCore/Auth/TokenExchangePort.swift`.
- Until this lands, native sign-in completes the browser step and then reports that the server exchange is not available. Desktop refresh tokens go in the OS keychain/credential store only, and access tokens stay in memory.

## 3. MCP connector grants (web Connections screen)

Client: `apps/web/src/data/connectorGrantsContract.ts` and `http/httpConnectorGrantsGateway.ts`.

- `GET /v2/me/connector-grants`
  - Response: `{ items: ConnectorGrant[] }`.
- `POST /v2/me/connector-grants`
  - Body: `{ client_name, client_kind: "claude"|"codex"|"other", expires_at: string|null, mailboxes: [{ mailbox_id, scopes: ("mailbox:read"|"draft:write")[] }] }`.
  - Response: `{ grant: ConnectorGrant, secret }`.
  - The secret is returned exactly once; the server stores only a one-way hash.
  - The server authorizes each mailbox against current membership and returns the authoritative `display_name`.
- `DELETE /v2/me/connector-grants/{grant_id}`
  - Response: `{ revoked: true }`.
- `DELETE /v2/me/connector-grants/{grant_id}/mailboxes/{mailbox_id}`
  - Response: the updated `ConnectorGrant`.
- `ConnectorGrant` shape: `{ id, client_name, client_kind, created_at, last_used_at: string|null, expires_at: string|null, mailboxes: [{ mailbox_id, display_name, scopes }] }`.
- Gating: a session capability flag (for example `connector_grants: true`) should decide whether the client wires the HTTP adapter.
- Limits: at most 20 connections per user and 50 mailboxes per connection, so the list is unpaged. The client derives its response budgets from these limits (about 1.7 MB for the list), so the server should declare the same limits and an `x-max-response-bytes` that is at least the client budget.

## 4. Delivery reports: bounces, suppressions, provider message id (web)

Client: `apps/web/src/data/deliveryReportsContract.ts` and `http/httpDeliveryReportsGateway.ts`.

- `GET /v2/mailboxes/{mailbox_id}/bounces?type&since&cursor&limit`
  - Response: `{ context_id, authorization_version, mailbox_id, items[], next_cursor }`.
  - Item: `{ id, send_id, thread_id|null, recipient, provider_event: "bounced"|"complained", bounce_type: "hard"|"soft"|null, reason (plain text, ≤2048), occurred_at }`.
  - `bounce_type` is null exactly when the event is a complaint.
  - The `type` filter takes `hard|soft|complaint`; `since` is an ISO lower bound on `occurred_at`.
- `GET /v2/organizations/{organization_id}/suppressions?q&cursor&limit`
  - Response: `{ context_id, authorization_version, organization_id, items[], next_cursor }`.
  - Item: `{ id, address, reason: "hard_bounce"|"complaint"|"manual"|"unsubscribe", since, source_send_id|null, removable }`.
- Paging: `limit` 1–50 (default 50), opaque `cursor`, `next_cursor` null on the last page. Client response budgets are derived from the schema maxima (about 725 KB for a bounce page, about 108 KB for a suppression page).
  - `q` is a case-insensitive address substring.
  - No removal write is requested; removal stays server-managed.
- `SendStatus.provider_message_id: string|null`: add it to the v1 `SendStatus` schema so the send-status page can show the Resend message id. It is not rendered today.

## 5. In-app agents bridge (Mac Tauri; Windows equivalent)

These belong to the backend agent in `apps/native/src-tauri/src/agents`. The client is `apps/web/src/features/assistant/bridge.ts`, plus `apps/windows/src/Elevateo.Client.Core/Agents/IAgentsBridge.cs`.

- Commands:
  - `agents_start { runtime: "codex"|"claude" } → { session_id }`
  - `agents_send { session_id, text }`
  - `agents_cancel { session_id }`
  - `agents_end { session_id }`
- Events on `agents://event`:
  - `{ type: "output_delta", session_id, text }`
  - `{ type: "completed"|"ended", session_id }`
  - `{ type: "error", session_id, message }`
  - All text is plain; the panel never renders HTML.
- `host_capabilities.assistant_bridge` flips to `true` when the commands exist.
- The permission surface is fixed to read, search and draft in granted mailboxes, with no send, shell or file access. Commands must reject callers that are not on the app origin; `host.rs` `require_first_party` shows the pattern.
