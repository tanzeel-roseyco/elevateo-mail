# Google OAuth transport

`backend/providers/googleOAuth.ts` implements the existing connection exchange port and a refresh method. It is not wired to routes or enabled in production.

The constructor binds a server-owned client ID, client secret and HTTPS redirect URI. Token requests use only Google's fixed token endpoint; identity comes from its fixed userinfo endpoint, never callback email fields or unverified ID-token claims. Include `openid` in requested scopes. HTTP uses the shared ten-second abort, 64 KiB streamed-response cap and redirect rejection. Error messages never include provider response bodies or tokens. No automatic exchange retries occur.

Refresh preserves the prior refresh token and scopes when Google omits them, checks the returned subject against the stored subject, and reports `oauth_invalid_grant` explicitly. The caller must use CredentialVault.replace with the originally captured revision; this adapter does not persist credentials. A failed refresh must not automatically revoke a newer grant. Feed the resulting stored revision into Gmail sync's credential fence.

Remaining gates: typed deployment configuration wiring, authenticated connection routes, refresh coordination/CAS integration, Google consent verification and scope approval, live acceptance checks and operational recovery. Initial offline grants can still require user consent; Google's testing-mode refresh-token lifetime can be seven days for Gmail scopes. Credentials stay last. This transport does not establish an application login session.

Injected-fetch tests cover exchange, client/redirect binding, refresh preservation, subject mismatch, invalid grants, malformed/oversized responses and error redaction. Docker validation is pending with the parent task; no host tests were run.

Official references checked 6 October 2026:
- [Google server OAuth flow, refresh and offline access](https://developers.google.com/identity/protocols/oauth2/web-server)
- [Google UserInfo endpoint and stable subject](https://developers.google.com/identity/openid-connect/reference)
- [OAuth testing-mode token lifetime](https://developers.google.com/identity/protocols/oauth2)
