# Deferred V2 security interfaces

These names are review proposals. They are absent from `openapi.json` and Rails routes until the owner implementations and fleet security checks exist.

## Native session broker

Proposed operations: `beginNativeAuthorization`, `exchangeNativeAuthorization`, `getNativeSession`, `logoutNativeSession` under `/v2/native/auth/*`. `begin` binds a fixed native client ID, allowlisted HTTPS App Link or verified custom scheme, RFC 7636 S256 challenge, server-generated nonce and short expiry to one pending authorization record. `exchange` consumes the code once under the same client, redirect and verifier, and returns an opaque native session handle to the native host broker only. The React renderer receives scoped capability/status, never a refresh token or Auth signing material. Logout revokes that handle and current server session generation. An unrecognized platform, redirect, repeated callback, wrong verifier, expired state or identity switch must fail closed. No browser cookie is copied into a local Tauri origin. Orion/Astrid must supply target OS secure-store and callback evidence; Rails auth owner must select concrete challenge/exchange storage and CSRF/session semantics before activation.

## Synthetic inbound ingress

Proposed operation: `ingestFakeInboundEvent` at `POST /v2/test/inbound/fake`, admitted only by the isolated test profile. HTTP authentication derives actor, organization and mailbox capability from the current server session. The request may contain a bounded provider event key and plaintext MIME fixture; it cannot carry `authorized_mailbox_ids`, arbitrary organization context or live provider credentials. Corin's store must atomically persist `(organization, mailbox, provider, event_id)` before the response reports `created` or `duplicate`. A missing or revoked mailbox capability, malformed provenance, HTML payload, cross-tenant replay or disabled profile returns a deliberate error without persistence. No provider delivery or live SMTP follows from this operation. Corin/SQL owner must supply the durable store and scoped adapter before Cassian versions an active route.

## Personal display-name preference (PREF-822)

A separate noncanonical OpenAPI draft is at `proposals/personal-preferences.openapi.json`. GET/PUT `/v2/me/preferences` derive organization and user from the authenticated current session; neither operation accepts a user or organization ID. The bounded value is `display_name: string|null` with at most 256 Unicode code points and a nonnegative revision; PUT supplies `expected_revision` and CSRF proof. Missing/current-org or cross-user context returns a generic 404, and stale revision returns 409. This is a proposal only: no canonical V2 operation, Rails registration, generated DTO or fleet acceptance is claimed. Theo owns the isolated migration/service/controller implementation and will supply exact response/error evidence before activation.
