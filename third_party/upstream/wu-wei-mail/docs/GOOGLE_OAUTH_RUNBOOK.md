# Google OAuth Runbook (Google-Only Setup)

This runbook configures Wu Wei Mail for Google OAuth only (no Microsoft OAuth).

## 1. Google Cloud Console

1. Create/select a Google Cloud project.
2. Enable `Gmail API`.
3. Configure OAuth consent screen:
   1. User type: `External` (or `Internal` for Workspace-only).
   2. Add scopes:
      1. `https://www.googleapis.com/auth/gmail.send`
      2. `https://www.googleapis.com/auth/gmail.readonly`
      3. `https://www.googleapis.com/auth/userinfo.email`
      4. `https://www.googleapis.com/auth/userinfo.profile`
4. Create OAuth Client ID:
   1. Type: `Web application`
   2. Add redirect URI:
      1. Local: `http://localhost:8000/api/oauth/google/callback`
      2. Production: `https://<your-api-domain>/api/oauth/google/callback`

## 2. Backend Environment

Set these in `backend/.env`:

```env
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=http://localhost:8000/api/oauth/google/callback
```

For Google-only mode, keep Microsoft values empty:

```env
MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=
MICROSOFT_REDIRECT_URI=
```

## 3. Verify Provider Gating

Start backend and check:

```bash
curl http://localhost:8000/api/oauth/providers
```

Expected for Google-only setup:

```json
{
  "google": { "enabled": true },
  "microsoft": { "enabled": false }
}
```

## 4. End-to-End Test

1. Start backend (`uvicorn app.main:app --reload --port 8000`).
2. Start frontend (`npm run dev` in `frontend/`).
3. Login and open `/accounts`.
4. Click `Add Account` -> `Connect with Google`.
5. Complete Google consent.
6. Confirm redirect back to `/accounts?connected=google`.
7. Confirm account appears in list with provider `google`.
8. Click `Test` on the account card and confirm success.

## 5. Common Failures

- `redirect_uri_mismatch`:
  - `GOOGLE_REDIRECT_URI` must exactly match Google Console redirect URI (scheme, host, port, path).
- `Google OAuth not configured`:
  - One or more of `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` is missing.
- Consent screen blocked:
  - Add your test user under OAuth consent screen while app is in testing mode.
