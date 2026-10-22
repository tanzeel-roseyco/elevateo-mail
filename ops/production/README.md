# Held production backend

Prepared for the coordinator; no deployment or persistent mutation is performed by this change.
Railway owns the web/edge at `https://mail.elevateoco.com` behind application-level SSO.
Its restricted SSH local forward reaches `launch-api:3000` through the isolated transport overlay.
The private origin is `http://launch-api:3000` on
`elevateo-mail-live_private`. API, revocation worker and attachment gateway reuse the
existing private `db`, `auth`, `storage`, and `mailpit` services. No database port is published.
API port 4709 and the two-path Auth browser proxy port 4712 bind to fleet loopback; database ports remain private. No Cloudflare component, DNS change,
MX change or Google Workspace email routing change is included or authorized by this manifest.

## Proxy contract

Preserve method, body, query, cookies, Set-Cookie and response status. Set Host to
`mail.elevateoco.com`, X-Forwarded-Proto to `https`; strip client-supplied forwarding headers.
Proxy `/v1/*`, `/v2/*`, `/auth/accept`, `/health`, `/ready`. Keep `/webhooks/resend` and
`/v2/provider-events/resend` blocked during this held launch. Never forward arbitrary URLs.
Do not cache authenticated responses. Backend credentials and transport credentials must never
enter browser bundles. Browser origin and secure cookie policy remain exact.

## Protected configuration

Use separate absolute, mode-0600 API/worker/gateway env files outside the repository.
API: `API_DB_PASSWORD`, `SECRET_KEY_BASE` (at least 64 bytes),
`ELEVATEO_SESSION_KEY_BASE64` (32 decoded bytes), `ELEVATEO_ATTACHMENT_GATEWAY_HMAC_KEY_BASE64`
(32 decoded bytes), `ELEVATEO_AUTH_JWT_ISSUER`, `ELEVATEO_AUTH_JWT_AUDIENCE=authenticated`,
`ELEVATEO_AUTH_JWT_ALGORITHM=HS256`, `ELEVATEO_AUTH_PASSWORD_MINIMUM=12`.
Worker: same policy/key fields, replacing API_DB_PASSWORD with WORKER_DB_PASSWORD.
For the SSO launch, set `ELEVATEO_SSO_ENABLED=true`, `ELEVATEO_SSO_ONLY=true` and
`ELEVATEO_AUTH_PUBLIC_URL=https://mail.elevateoco.com/auth/v1`.
These default to disabled for existing local tests; SSO-only rejects password login, recovery and password invitation acceptance.
The public endpoint is browser redirect metadata, never the server Auth endpoint.
Issuer must match the existing Auth issuer exactly; inspect it privately, never copy signing keys.
Gateway: `ELEVATEO_ATTACHMENT_GATEWAY_DATABASE_URL` (existing least-privilege gateway role),
`ELEVATEO_ATTACHMENT_GATEWAY_HMAC_KEY_BASE64`, `ELEVATEO_DB_NAME=postgres`,
`ELEVATEO_STORAGE_URL=http://storage:5000`, `ELEVATEO_ATTACHMENT_BUCKET` (existing private bucket),
`ELEVATEO_ATTACHMENT_STORAGE_SERVICE_TOKEN`. Only this process receives Storage authority.
Do not include Resend keys, webhook secrets, admin/signing keys, or local HTTP bypass settings.
Runtime production mode rejects a released outbound hold, provider mode, role/process mismatch,
insecure cookies, another browser origin, a short Rails secret, and a nonprivate DB hostname.

## Coordinator commands and gates

Build from repository root using the existing pinned Dockerfile (local test recipes are unchanged):

```sh
docker build -f apps/server/Dockerfile -t elevateo-server:launch-reviewed apps/server
# Set ELEVATEO_PRODUCTION_IMAGE to sha256:<64 lowercase hex> or repository@sha256:<64 lowercase hex>.
# Export only paths: ELEVATEO_API_ENV_FILE, ELEVATEO_WORKER_ENV_FILE, ELEVATEO_GATEWAY_ENV_FILE.
sh ops/production/deploy.sh config --quiet
sh ops/production/deploy.sh up -d
sh ops/production/deploy.sh ps
```

The admission wrapper rejects missing, mutable-tag and malformed image references before Docker runs.
It supplies the manifest's internal admitted-image variable only after validation; use the wrapper
for every Compose command. These are deployment instructions, not authorization for this worker to execute them.
Before launch, prove the existing database has the reviewed schema, runtime grants and gateway
role. Do not run automatic migrations or initialize data from this manifest. Confirm existing
Auth callback/site settings support the public origin without widening its allowlist globally.
Root must validate actual login/read/search/draft/attachment/logout in the secured application,
including ready-state checks, empty/error paths and screenshots. A healthy process alone is
not acceptance. Outbound stays held; no provider API calls or external test mail are required.

Rollback: stop only this compose project's API/worker/gateway and return the edge to maintenance;
retain every database/storage volume and the existing Supabase project. No volume cleanup command
is part of this deployment. If an older gateway already owns the network alias, resolve ownership
before starting this manifest; never run two authorities under the same alias.

## Restricted SSH transport (coordinator provisions)

The coordinator-owned `ops/railway/transport.compose.yaml` overlay connects API and OAuth proxy
to a separate transport network. The SSH container joins only that network and permits TCP local
forwards to `launch-api:3000` and `oauth-proxy:8080`; it has no private data-network attachment.
Its dedicated read-only key directory, public port 2223, pinned transport image, host-key verification
and shell/password/remote/Unix-forwarding denial remain separate coordinator deployment gates.
The optional fleet loopback ports 4709/4712 are diagnostic endpoints, not the selected edge transport.

Railway forwards local 4710 to `launch-api:3000` and local 4711 to `oauth-proxy:8080` using the
restricted transport identity. Edge uses the latter only for `/auth/v1/authorize` and
`/auth/v1/callback`, stripping `/auth/v1`. The private pinned nginx bridge accepts only
`/authorize` and `/callback` (GET/HEAD), preserves query/cookies/redirects, suppresses OAuth
access logs, fixes forwarding headers and uses bounded upstream timeouts. Token, admin and other
Auth paths return 404. A lost forward fails closed, never selecting another upstream.
Transport secrets and independently verified host keys remain server-only coordinator settings.

The isolated fake-Auth Docker check is `sh ops/production/check-auth-proxy.sh`; run only under a
separate fleet lease. It creates no published ports, provider requests or persistent data. Its named
containers/network are removed on success and failure. See `auth-proxy-evidence.txt` for the receipt.

## Google identity setup

The separate SSO owner implements the existing Supabase Auth identity bridge; no frontend code
is changed here. Coordinator supplies a Google web OAuth client ID/secret to Supabase Auth only,
the Google redirect registration `https://mail.elevateoco.com/auth/v1/callback`, the exact application callback
`https://mail.elevateoco.com/v1/auth/sso/callback`, and invite-only existing identity mapping.
Request `openid` explicitly; GoTrue additionally defaults to `email profile` identity scopes.
Enable Google only and keep all other social providers disabled; verify this before launch alongside
application `ELEVATEO_SSO_ONLY=true`. Require verified identity and preserve the existing subject mapping;
do not grant access by an unchecked email or a broad email-domain match. State/nonce, PKCE,
single-use callback validation and session rotation belong to the SSO implementation and review.
Google's [OpenID Connect documentation](https://developers.google.com/identity/openid-connect/openid-connect)
defines token validation and the stable `sub` identifier. This needs no Gmail scopes or mail routing changes.
