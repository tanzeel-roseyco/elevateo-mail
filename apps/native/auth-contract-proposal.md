# Historical native auth proposal — superseded for first release

Root selected an online-only exact HTTPS WebView with existing HttpOnly cookie auth for first release. This earlier versioned native-token design is retained only as a historical proposal; it is not active, implemented, or required for this release. Native enrollment remains disabled until server implementation, registered redirect, device binding, target-OS secure-store behavior and fleet/native tests are accepted.

## Requested server decisions

1. Register a separate public desktop client ID and a precise callback URI; Android needs its own registered HTTPS App Link/client registration. Bind authorization code to PKCE S256, redirect URI, client ID and issuer. Define whether the identity provider includes the RFC 9207 `iss` callback parameter; the current native parser requires it.
2. Define a versioned native exchange route callable by the *native Rust side only*. It accepts authorization code plus verifier and device instance proof, returns scoped access material and a rotatable refresh credential, and attests actor, organization, session/device ID, expiration and authorization version. It must reject code replay, wrong verifier/redirect/client/issuer and revoked/invitation-invalid identities.
3. Define refresh and revocation/logout routes for a per-device session. Rotate refresh credentials atomically; ambiguous refresh outcomes need a recoverable server identity, not a fabricated success. Logout must fence local content immediately, remove protected local material, request server revocation, and report `pending` if the server outcome cannot be confirmed.
4. Define native API transport independent of browser cookies/CSRF. The current React gateway uses relative paths and browser session semantics. A native adapter must call HTTPS through a narrow Rust command surface that returns validated typed application data, or use a tightly bounded short-lived access-token policy approved by Sabine. No refresh token getter, generic fetch, arbitrary URL, shell or filesystem IPC.
5. Define approved API origin and client application origin/CORS policy. Public HTTPS origin validation alone is not authorization. Production config must reject placeholders and cleartext; no service-role/provider/SMTP secret or signing key is bundled.

## Historical source note

The former `oauth.rs` and `session_store.rs` draft modules were removed from the first-release shell in commit 625bef1. The active shell uses an exact first-party HTTPS WebView and the existing server's HttpOnly cookie/session flow. This proposal is retained as an unapproved future alternative only.

## Failure simulations for review

- If the process dies after server refresh rotation and before the new refresh credential is stored, retrying the old credential must have a defined server recovery or terminal sign-in path. The client cannot declare the session refreshed from a timeout.
- If a callback from an older login arrives after a newer login starts, state mismatch burns the current pending operation. This is an availability tradeoff that prevents adopting code from the wrong operation.
- If the OS secure store is locked or invalidated, protected UI remains hidden and the user must reauthenticate; the app cannot fall back to renderer storage.
