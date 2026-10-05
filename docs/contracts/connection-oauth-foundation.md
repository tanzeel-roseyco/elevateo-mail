# Connection OAuth foundation

Historical foundation description below. The integrated branch now includes Google transport, callback routes, session-guarded mailbox admission, refresh handling, browser connection controls and bounded scheduled read-only sync. See [configuration](../gmail-configuration.md) and [background sync](../gmail-background-sync.md). Google verification, upstream revocation, native integration and production acceptance remain outstanding. All optional live integrations remain disabled by default.

`ConnectionOAuth.begin(owner, sessionTokenHash, now, reconnectId?)` requires an existing unexpired app session.
It returns an authorization URL and ten-minute expiry. The start route must use existing same-origin CSRF
authentication. Only trusted server configuration supplies provider, HTTPS authorization endpoint, issuer,
exact HTTPS callback, client ID and scope list. Starting again replaces that session/provider's previous attempt.

`complete(owner, sessionTokenHash, callbackURL, now)` requires the same authenticated app session, exact
callback, unique strict query parameters, provider issuer, state and exactly one code/error. State is consumed
atomically before exchange; uncertainty requires a new authorization flow. The adapter exchanges using S256
PKCE and the configured callback, and must obtain a verified stable subject from the provider. It returns
`{subject, credential:{accessToken,refreshToken?,expiresAt,scopes}}`. Tokens are never returned to the browser.
The callback route needs a deliberate top-level OAuth return authentication strategy: do not weaken global
cross-site cookie checks to mount it. Existing general cookie authentication rejects cross-site requests.

The default callback policy requires an exact issuer parameter. Trusted `callbackPolicy: "google"` accepts
Google's callback metadata and omitted issuer only with the fixed Google authorization endpoint and issuer;
if issuer is present it must match. The policy is sealed into state and requests offline access.
Google grants without a refresh token fail with `oauth_offline_grant_required` for new or revoked connections.
An active same-subject reconnect may retain its previous refresh token only at the originally captured revision;
a concurrent revoke/refresh still fails the final compare-and-swap. Upstream token validity cannot be inferred
from its presence; provider refresh failures must later require reconnection. No arbitrary provider compatibility is claimed.
No ID token is interpreted and no application identity/session is minted. Production login is separate work.

`CredentialVault` stores AES-256-GCM ciphertext with random IVs and owner/provider/subject/ID associated data.
Inject a `SecretBox` with nonextractable keys; the active key encrypts, retained older keys decrypt during
rotation. Replacing credentials uses their current revision. Revocation erases ciphertext and advances the
revision. Reconnect requires an explicit existing connection and verified matching provider subject; a
concurrent revoke invalidates the pending reconnect. Local revocation does not claim upstream token revocation.
These records are not yet linked to mailbox inventory; production admission caps and provider revocation
must be integrated before exposing connection creation. Vault methods are trusted backend services, not public RPC.

OAuth persistence includes an exact owner/session-hash/expiry predicate in the final credential INSERT or UPDATE.
Revocation during encryption therefore prevents persistence. The expiry comparison is sampled after encryption,
using the supplied request time plus monotonic elapsed time; fixture clocks do not depend on the host wall clock.
The optional vault session guard is required by OAuth; trusted background credential refresh uses its revision guard.
Failed guarded writes retain the existing connection conflict errors and require a fresh authenticated flow.

Credential-free tests use fake exchange transport and real D1. Required later work: concrete adapter timeout
and bounded response parsing, provider error/refresh/revoke handling, mailbox transaction/admission coupling,
callback route, production login, encrypted key configuration, OAuth registration/verification and native integration.

Design sources: [OAuth security BCP](https://www.rfc-editor.org/rfc/rfc9700.html),
[PKCE S256](https://www.rfc-editor.org/rfc/rfc7636.html). No external credentials were used.
