# OAuth Setup Guide

Wu Wei Mail connects to Gmail and Outlook/Microsoft 365 mailboxes via OAuth 2.0 so it can send and receive email on behalf of your users. This guide walks through creating the necessary credentials for both providers.

If you are launching with Google only, use [Google OAuth Runbook](./GOOGLE_OAUTH_RUNBOOK.md).

## Table of Contents

- [Google OAuth (Gmail)](#google-oauth-gmail)
- [Microsoft OAuth (Outlook / Microsoft 365)](#microsoft-oauth-outlook--microsoft-365)
- [Environment Variables Summary](#environment-variables-summary)
- [Testing the Flow](#testing-the-flow)

---

## Google OAuth (Gmail)

### 1. Create a Google Cloud Project

1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Click **Select a project** in the top bar, then **New Project**.
3. Name it (e.g., "Wu Wei Mail") and click **Create**.
4. Make sure the new project is selected.

### 2. Enable the Gmail API

1. Navigate to **APIs & Services > Library**.
2. Search for **Gmail API** and click on it.
3. Click **Enable**.

### 3. Configure the OAuth Consent Screen

1. Navigate to **APIs & Services > OAuth consent screen**.
2. Choose **External** user type (or **Internal** if this is a Workspace-only app).
3. Fill in the required fields:
   - **App name**: Wu Wei Mail
   - **User support email**: your email
   - **Developer contact**: your email
4. Click **Save and Continue**.
5. On the **Scopes** step, click **Add or Remove Scopes** and add the following:

| Scope | Purpose |
| ----- | ------- |
| `https://www.googleapis.com/auth/gmail.send` | Send emails on behalf of the user |
| `https://www.googleapis.com/auth/gmail.readonly` | Read inbox for reply detection |
| `https://www.googleapis.com/auth/userinfo.email` | Get the user's email address |
| `https://www.googleapis.com/auth/userinfo.profile` | Get the user's display name |

6. Click **Save and Continue** through the remaining steps.

### 4. Create OAuth 2.0 Credentials

1. Navigate to **APIs & Services > Credentials**.
2. Click **Create Credentials > OAuth client ID**.
3. Application type: **Web application**.
4. Name: "Wu Wei Mail Backend".
5. Under **Authorized redirect URIs**, add:
   ```
   http://localhost:8000/api/oauth/google/callback
   ```
   For production, add your production URL with the same path.
6. Click **Create**.
7. Copy the **Client ID** and **Client Secret**.

### 5. Set Environment Variables

Add the following to your `backend/.env` file:

```env
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_REDIRECT_URI=http://localhost:8000/api/oauth/google/callback
```

---

## Microsoft OAuth (Outlook / Microsoft 365)

### 1. Register an Application in Azure AD

1. Go to the [Azure Portal](https://portal.azure.com/).
2. Navigate to **Azure Active Directory > App registrations**.
3. Click **New registration**.
4. Fill in:
   - **Name**: Wu Wei Mail
   - **Supported account types**: Choose "Accounts in any organizational directory and personal Microsoft accounts" for broadest compatibility.
   - **Redirect URI**: Select **Web** and enter:
     ```
     http://localhost:8000/api/oauth/microsoft/callback
     ```
5. Click **Register**.
6. Copy the **Application (client) ID** from the overview page.

### 2. Create a Client Secret

1. In your app registration, go to **Certificates & secrets**.
2. Click **New client secret**.
3. Description: "Wu Wei Mail Backend".
4. Expiry: Choose an appropriate duration (e.g., 24 months).
5. Click **Add**.
6. Copy the **Value** immediately (it will not be shown again).

### 3. Add API Permissions

1. In your app registration, go to **API permissions**.
2. Click **Add a permission > Microsoft Graph > Delegated permissions**.
3. Add the following permissions:

| Permission | Purpose |
| ---------- | ------- |
| `Mail.Send` | Send emails on behalf of the user |
| `Mail.Read` | Read inbox for reply detection |
| `User.Read` | Get the user's profile and email |
| `offline_access` | Obtain refresh tokens for long-lived access |

4. Click **Add permissions**.
5. If your organization requires it, click **Grant admin consent** (only needed for organizational accounts).

### 4. Set Environment Variables

Add the following to your `backend/.env` file:

```env
MICROSOFT_CLIENT_ID=your-azure-application-client-id
MICROSOFT_CLIENT_SECRET=your-azure-client-secret-value
MICROSOFT_REDIRECT_URI=http://localhost:8000/api/oauth/microsoft/callback
```

---

## Environment Variables Summary

| Variable | Provider | Example |
| -------- | -------- | ------- |
| `GOOGLE_CLIENT_ID` | Google | `123456789.apps.googleusercontent.com` |
| `GOOGLE_CLIENT_SECRET` | Google | `GOCSPX-...` |
| `GOOGLE_REDIRECT_URI` | Google | `http://localhost:8000/api/oauth/google/callback` |
| `MICROSOFT_CLIENT_ID` | Microsoft | `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` |
| `MICROSOFT_CLIENT_SECRET` | Microsoft | `abc123~...` |
| `MICROSOFT_REDIRECT_URI` | Microsoft | `http://localhost:8000/api/oauth/microsoft/callback` |

---

## Testing the Flow

1. Start the backend server: `uvicorn app.main:app --reload --port 8000`
2. Start the frontend: `npm run dev`
3. Log in to Wu Wei Mail and navigate to **Accounts**.
4. Click **Connect Google Account** or **Connect Microsoft Account**.
5. You will be redirected to the provider's consent screen.
6. After granting permission, you will be redirected back to the callback URL.
7. The account should now appear in your accounts list with an active status.

### Common Issues

- **redirect_uri_mismatch (Google)**: The redirect URI in your OAuth credentials must exactly match `GOOGLE_REDIRECT_URI`, including the protocol, host, port, and path.
- **AADSTS50011 (Microsoft)**: The redirect URI registered in Azure AD does not match. Double-check the URI under App registrations > Authentication.
- **Token refresh failures**: Ensure `offline_access` scope is included for Microsoft. Google refresh tokens are granted automatically when using `access_type=offline`.

### Production Redirect URIs

When deploying to production, update the redirect URIs in both the provider console and your `.env` file:

```env
GOOGLE_REDIRECT_URI=https://api.yourdomain.com/api/oauth/google/callback
MICROSOFT_REDIRECT_URI=https://api.yourdomain.com/api/oauth/microsoft/callback
```
