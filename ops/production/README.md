# Production assembly

## Email finder worker

The `email-finder-worker` service reuses the server image and private database. Its environment is declared in [compose.yaml](compose.yaml), not a worker environment file. `ELEVATEO_FINDER_PUBLIC_IP` enables the supplied-IP PTR and port-25 startup checks; it does not configure routing or bind the worker to that IP. Jeison must prove separate public egress from Mox before Callum approves external probes. See [finder operations](../../docs/email-finder.md).

The checked-in assembly is a single `elevateo-production` project. An earlier Railway/fleet transport overlay is superseded. This manifest does not deploy a web static host, reverse proxy for the application, SSH transport overlay, DNS or certificate issuance. Company edge ownership and routing must be confirmed before deployment. The public origin is currently fixed to `https://mail.elevateoco.com` in Compose and Auth configuration; changing company domains requires a reviewed configuration change, not only new secrets.

The current entrypoint is `sh ops/production/deploy.sh [--dry-run]`. It reads environment only, validates credentials and approved assignments before Docker, uses immutable images, then starts the project-owned Supabase database/Auth/PostgREST/Storage, API, revocation worker, attachment gateway, mailbox MCP, Mox and restricted OAuth proxy. Resend mode adds the provider event worker. It never builds images, changes cloud/DNS/MX, or submits mail. Sending stays held and CSV provisioning is dry-run unless explicitly enabled.

See [credentials-last](../../docs/credentials-last.md) and the single root [.env.production.example](../../.env.production.example). Final local Docker gates, encrypted restore drill and deploy dry-run passed; see the [verification receipt](../../docs/completion/backend-20261030-receipt.md). No deployment is claimed. This replaces the historical fleet/external-network launcher. Existing `initialize/` and `launch-controls/` scripts remain explicit operator tools; deployment does not invent tenant memberships or authorize a user by email alone.

## Data and authority

All six persistent volumes belong to `elevateo-production`; no external data network is assumed. Database, REST, Storage and mailbox credentials remain private. API and MCP publish only loopback ports 4709 and 4713; OAuth proxy uses loopback 4712 and exposes only authorize/callback. Mox requires the approved Linux host IPv4 and host networking, with held domains/logins. An existing trusted edge must route the public application origin; edge/DNS/TLS changes are outside this task.

Authentik replaces Google. GoTrue's private custom-provider administration registers `custom:authentik`; the API rechecks active directory/group membership and local authorization. The actual app callback is `/v1/auth/sso/callback`, while Authentik returns to `/auth/v1/callback`. Proxy requests must preserve cookies/method/body and strip user-supplied forwarding headers. Do not expose Auth admin/token routes through the browser proxy.

Runtime credentials are split: API database password and webhook verification; worker database password and provider API credential; gateway private object credential and restricted DB role; MCP receives no database or provider key. Environment settings are never copied into application logs. The operations image performs one-shot provider registration with the Auth service credential; normal API containers never receive it.

The one-shot `configure-storage` service creates the selected attachment bucket when absent and reads it back as private. Repeated deployment leaves an existing private bucket unchanged; a public or conflicting bucket fails deployment. No manual bucket creation is required.

Preflight parses the supplied TLS certificate chain and private key and verifies that they match before writing Mox volumes. The `mox-readiness` service shares host networking with Mox and checks live IMAPS certificate/hostname validation and SMTP/submission greetings without authentication or mail submission. Gateway readiness checks the initialized application's unsigned-request denial; proxy readiness uses a loopback-only health route to private Auth. An isolated restore definition must preserve the snapshot's exact service-name/image roster, including `mox` and `mox-readiness`, while removing host networking and published ports and using only internal networks. Omitting either service fails the manifest comparison. A compatible full-production restore definition has not been verified; completing and testing it is a go-live blocker.

## Operations

The deployment wrapper refuses empty required values and released outbound hold. It is forward-only: a failed stage retains named volumes for investigation, never silently rolls back data or prunes volumes. Stop affected services before correcting persistent configuration. Existing database password changes require a separate reviewed rotation, not a new environment value.

[Completion operations](completion/README.md) describe approved CSV provisioning, six-volume cold backup, encrypted off-host transfer and isolated restore. Restore revokes stale sessions/grants and quarantines unfinished sends. A successful backup upload is insufficient without restore verification. Native bridge integration and its separate isolated runtime image are documented in [the bridge README](../../apps/native/src-tauri/src/agents/README.md).

For the takeover sequence and approval gates, use [the handoff](../../docs/handoff/README.md). Jeison implements infrastructure work; Jeison and Tanzeel maintain it together. Callum decides updates, reviews evidence and approves production or outward-facing actions. Fleet-01 is read-only and off limits; no fleet access is authorized by this document. Local verification uses Docker Desktop (`DOCKER_CONTEXT=desktop-linux`).

Every deployment stops `mox` before running the initializer. Activation or TLS/configuration changes can make the existing files differ from the generated held configuration, causing initialization to fail before the final service start and leaving Mox stopped. Jeison and Tanzeel must develop and verify a post-activation update/rotation procedure, including recovery from that stop, before Callum approves such an update. Do not reuse initial deployment as an assumed safe live update command.
