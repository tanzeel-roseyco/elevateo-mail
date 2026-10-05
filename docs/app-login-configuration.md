# Application login configuration

Application sign-in is separate from connecting a Gmail mailbox. The server composition is disabled unless `APP_LOGIN_ENABLED` is exactly `true`. No credentials are needed for fixture tests. The Worker exposes sign-in status and routes; configuration remains disabled until the final credential stage.

Configure these server-side fields only at the final credential stage:

- `APP_LOGIN_ENABLED`: `true` when approved for activation; otherwise omit or use `false`.
- `APP_LOGIN_ISSUER`: exactly `https://accounts.google.com`.
- `APP_LOGIN_AUTHORIZATION_URL`: exactly `https://accounts.google.com/o/oauth2/v2/auth`.
- `APP_LOGIN_CLIENT_ID`: the Google OAuth web client ID.
- `APP_LOGIN_CLIENT_SECRET`: its secret, stored in the server secret manager.
- `APP_LOGIN_REDIRECT_URI`: the deployed HTTPS origin followed by `/login/callback`, also registered with Google. No query or fragment.
- `APP_LOGIN_APPROVED_SUBJECTS`: a JSON array of 1–10 distinct trusted Google subject IDs. Email addresses are not an identity mapping.
- `APP_LOGIN_ENCRYPTION_KEY`: a securely generated 32-byte AES key encoded as canonical unpadded base64url, stored in the server secret manager. Never use a fixture key.

Do not put these fields in frontend environment variables, logs, screenshots or source control. Invalid enabled configuration returns a generic configuration error without values. Changing the key invalidates pending sign-in attempts; existing sessions remain governed by their existing expiry. Google tokens used for sign-in are discarded after verifying the subject and are not mailbox grants.
