# Application sign-in foundation

AppLogin is a server-only injected sign-in core. The separate HTTP route adapter is implemented but not registered in the worker; live Google remains disabled. Mailbox grants remain separate from app identity.

Configuration fixes HTTPS issuer, authorization endpoint, callback and client ID, with up to ten approved subjects. Identity uses verified issuer/subject, never email account linking. Existing users count toward the ten-user cap. Transactional deterministic identity ownership handles concurrent first sign-in; existing account triggers supply stable opaque account IDs.

Attempts last ten minutes: hashed state/browser nonce and encrypted PKCE verifier/config fingerprint. Completion consumes state before exchange, verifies the trusted adapter result against the allowlist, then issues a fresh random 24-hour session with only its hash stored. Cookie output is server-only metadata, never JSON or logs. Separate successful logins retain separate sessions.

The HTTP adapter requires exact same-origin POSTs and bounded JSON for begin/complete. Cookie output stays in Set-Cookie headers. Its no-store, no-referrer, restricted-CSP callback page clears the query and posts to the same origin so Strict cookies are available; it never interpolates callback values into HTML. JavaScript is required. Missing injected service returns 503. Public attempt storage admits at most 100 unexpired attempts transactionally and cleans expired attempts on begin.

Before enablement: worker registration, trusted Google identity adapter, typed key/config setup, edge abuse protection (the database cap bounds storage, not request CPU), and expired-session cleanup. No caller-selected return URLs. Credentials and real provider validation remain last.

Migration 0012 rollback drops only identity/login-state tables, retaining users/accounts/sessions. Injected Docker validation is pending with the parent task.
