# Production assembly

## Email finder worker

The `email-finder-worker` service reuses the production server image, private database
and protected worker environment file. Add nonsecret `ELEVATEO_FINDER_PUBLIC_IP` to
that file to enable its PTR/port-25 startup check. No new secret or service account is
required. Apply the reversible finder migration with the existing migrator before
starting it. See [finder operations](../../docs/email-finder.md) for limits, opt-outs,
Hetzner port-25 restrictions and PTR setup. This configuration is prepared only; it has
not been deployed and makes no live sends.

Prepared for the coordinator; no deployment or persistent mutation is performed by this change.
Railway owns the web/edge at `https://mail.elevateoco.com` behind application-level SSO.
Its restricted SSH local forward reaches `launch-api:3000` through the isolated transport overlay.
The private origin is `http://launch-api:3000` on
`elevateo-mail-live_private`. API, revocation worker and attachment gateway reuse the
existing private `db`, `auth`, `storage`, and `mailpit` services. No database port is published.
API port 4709 and the two-path Auth browser proxy port 4712 bind to fleet loopback; database ports remain private. No Cloudflare component, DNS change,
MX change or Google Workspace email routing change is included or authorized by this manifest.
The current entrypoint is `sh ops/production/deploy.sh [--dry-run]`. It reads environment only, validates credentials and approved assignments before Docker, uses immutable images, then starts the project-owned Supabase database/Auth/PostgREST/Storage, API, revocation worker, attachment gateway, mailbox MCP, Mox and restricted OAuth proxy. Resend mode adds the provider event worker. It never builds images, changes cloud/DNS/MX, or submits mail. Sending stays held and CSV provisioning is dry-run unless explicitly enabled.

See [credentials-last](../../docs/credentials-last.md) and the single root [.env.production.example](../../.env.production.example). Final local Docker gates, encrypted restore drill and deploy dry-run passed; see the [verification receipt](../../docs/completion/backend-20261030-receipt.md). No deployment is claimed. This replaces the historical fleet/external-network launcher. Existing `initialize/` and `launch-controls/` scripts remain explicit operator tools; deployment does not invent tenant memberships or authorize a user by email alone.

## Data and authority

All six persistent volumes belong to `elevateo-production`; no external data network is assumed. Database, REST, Storage and mailbox credentials remain private. API and MCP publish only loopback ports 4709 and 4713; OAuth proxy uses loopback 4712 and exposes only authorize/callback. Mox requires the approved Linux host IPv4 and host networking, with held domains/logins. An existing trusted edge must route the public application origin; edge/DNS/TLS changes are outside this task.

Authentik replaces Google. GoTrue's private custom-provider administration registers `custom:authentik`; the API rechecks active directory/group membership and local authorization. The actual app callback is `/v1/auth/sso/callback`, while Authentik returns to `/auth/v1/callback`. Proxy requests must preserve cookies/method/body and strip user-supplied forwarding headers. Do not expose Auth admin/token routes through the browser proxy.

Runtime credentials are split: API database password and webhook verification; worker database password and provider API credential; gateway private object credential and restricted DB role; MCP receives no database or provider key. Environment settings are never copied into application logs. The operations image performs one-shot provider registration with the Auth service credential; normal API containers never receive it.

The one-shot `configure-storage` service creates the selected attachment bucket when absent and reads it back as private. Repeated deployment leaves an existing private bucket unchanged; a public or conflicting bucket fails deployment. No manual bucket creation is required.

Preflight parses the supplied TLS certificate chain and private key and verifies that they match before writing Mox volumes. The `mox-readiness` service shares host networking with Mox and checks live IMAPS certificate/hostname validation and SMTP/submission greetings without authentication or mail submission. Gateway readiness checks the initialized application's unsigned-request denial; proxy readiness uses a loopback-only health route to private Auth. Isolated restore configurations must omit both Mox and `mox-readiness` host networking.

## Operations

The deployment wrapper refuses empty required values and released outbound hold. It is forward-only: a failed stage retains named volumes for investigation, never silently rolls back data or prunes volumes. Stop affected services before correcting persistent configuration. Existing database password changes require a separate reviewed rotation, not a new environment value.

[Completion operations](completion/README.md) describe approved CSV provisioning, six-volume cold backup, encrypted off-host transfer and isolated restore. Restore revokes stale sessions/grants and quarantines unfinished sends. A successful backup upload is insufficient without restore verification. Native bridge integration and its separate isolated runtime image are documented in `apps/native/src-tauri/src/agents/README.md`.

Local Docker builds/tests are reserved for the absolute final verification stage. No fleet host, live provider, deployment or public-network change is part of this implementation task.
