# Production setup, in order

Jeison implements these steps with Tanzeel; Callum decides and approves the changes. Start with the [handoff gates and unanswered decisions](README.md). This is an operator procedure, not authorization to run it. Commands use a POSIX shell from the repository root and a reviewed release checkout. Do not use fleet hosts. Local rehearsals use `export DOCKER_CONTEXT=desktop-linux`; select the approved production engine explicitly in the company operating procedure rather than inheriting a default context.

The sources are [compose.yaml](../../ops/production/compose.yaml), [deploy.sh](../../ops/production/deploy.sh), [deployment.py](../../ops/production/deployment.py), [environment example](../../.env.production.example), [credentials checklist](../credentials-last.md) and [completion operations](../../ops/production/completion/README.md). Deploy is forward-only. It does not roll migrations back on failure or delete volumes. Never use `down -v` as recovery.

## 1. Select the release and prepare the host

After Callum approves the host and release, check `git rev-parse HEAD`, `docker version`, `docker compose version`, `python3 --version` and `command -v age age-keygen sftp`. Expected: accepted commit, reachable intended Linux engine, Compose v2, Python 3.12+ and recovery tools. Host installation commands depend on the company OS/provider and are **TO CONFIRM with Jeison and the infrastructure administrator**; the repo does not contain a universal host bootstrap.

Provide persistent storage for `db-data`, `db-config`, `storage-data`, `mox-config`, `mox-data`, `mox-tls`. Mox and `mox-readiness` use Linux host networking and a static public IPv4. Keep database, auth, REST, storage and attachment gateway private. API, auth browser proxy and MCP publish loopback ports 4709, 4712 and 4713 respectively. Compose does not deploy the static web site or its public HTTPS edge.

Expected: approved network diagram and capacity/backup plan before installation. Rollback: cancel provisioning before use; retain any persistent data and revoke only newly granted access. Deletion or provider teardown needs its own approval.

## 2. Build and supply immutable images and secrets

Use the accepted build definitions and verification in [verification](verification.md). Publish approved images to the company registry only after Callum's approval; the registry command and owner are TO CONFIRM. Deployment requires repository-qualified `@sha256:` image references, not local image IDs copied from an old receipt.

Build the production operations image with `docker build -f ops/production/Dockerfile -t elevateo-production-operations .`; server and MCP builds are in verification. Expected: three successful source builds, subsequently recorded as registry digests. The test operations image in verification adds recovery/test tooling and is not the production operations build. Rollback before publication: discard only task-owned disposable images under the local cleanup rules. Keep previously approved registry artifacts for recovery.

Inject [the environment inventory](environment.md) from the company secret manager. `.env.production.example` is a schema, not a file automatically sourced by deploy.sh. Do not put populated files, rendered Compose output or tokens in evidence. Set an absolute private operations-lock path shared by deploy and recovery. Eight database role passwords must be distinct; JWTs must match the signing secret and their required roles. Independent session and attachment HMAC keys are required.

Command: `sh ops/production/deploy.sh --dry-run` after steps 3–4 supply all required inputs. Expected: validated inputs and a held deployment plan without Docker/provider calls. Without credentials this deliberately fails. There is no `deploy.sh config --quiet` command. Rollback: withdraw unused credentials through their issuing authority; changing an environment password does not rotate an existing database role.

## 3. Configure Authentik and approve identities

The existing platform is described as `hetzner-platform`; its named administrator is TO CONFIRM with Tanzeel. After the identity gate, create/review the OIDC application, approved group UUID, directory-read token, client ID and secret. The issuer must be the application issuer, not the root Authentik URL. The Compose origin is `https://mail.elevateoco.com`; a different company origin needs coordinated source/config changes.

The upstream redirect is `https://mail.elevateoco.com/auth/v1/callback`; the application callback is `https://mail.elevateoco.com/v1/auth/sso/callback`. Deployment runs `configure-auth` against private GoTrue. The custom provider is `custom:authentik`; do not expose GoTrue admin/token APIs through the browser proxy. Keep request methods, bodies and cookies intact and remove untrusted forwarding headers at the edge. See [auth configuration](../../ops/production/authentik/configure_provider.py).

Command at deployment: `docker compose -p elevateo-production -f ops/production/compose.yaml run --rm configure-auth`. It is already executed by deploy.sh; do not run it twice as a separate routine. Expected: configured provider, then a live allowed/denied-user and revocation test after the edge is approved. The repo supplies no company Authentik provisioning CLI. Rollback: restore the previous application/provider configuration and revoke newly created client credentials; keep SSO unavailable rather than enabling an unreviewed fallback.

## 4. Prepare mailbox assignments and Mox inputs

Prepare an absolute, nonsymlink CSV file with exactly `organization_id,user_id,mailbox_id,address`. Limits: 1–1,000 rows and 131,072 bytes; canonical nonzero UUIDs, unique mailbox IDs and unique lowercase addresses. Provide Mox hostname/public IPv4, mail domains, excluded workspace domains, and matching PEM TLS chain/key through the specified base64 environment inputs. Obtain a certificate only after its gate. Do not include workspace domains intended to stay on another mail system.

Command: `python3 ops/production/completion/provision.py --csv "$ELEVATEO_APPROVED_ASSIGNMENTS" --dry-run`. Expected: validation, not new users. Provisioning requires existing active verified organization members; an assignment CSV is not enrollment authority. [Tenant initialization](../../ops/production/initialize/README.md) requires an approved gate and verified Authentik subject; `tenant.sql` currently restricts identity email to the company domain. Its legacy target assumptions must be reconciled before a fresh-host enrollment. This is a rollout blocker, not a reason to bypass identity checks.

After the provisioning gate, set `ELEVATEO_PROVISIONING_ENABLED=true` for deployment to apply assignments. Its default is false: deployment only validates the CSV and creates no assignments. Rollback before apply: correct the CSV and rerun validation. After approved provisioning, revoke the specific access through the reviewed application/identity process; do not delete identities or reset send ledgers to undo a mistake. No verified automatic mailbox-deprovision rollback is provided.

## 5. Deploy the held stack, database and migrations

After the production-deploy gate and a backup of any existing installation:

```sh
sh ops/production/deploy.sh --dry-run
sh ops/production/deploy.sh
docker compose -p elevateo-production -f ops/production/compose.yaml ps
```

If mode is Resend, include `-f ops/production/compose.resend.yaml` in manual Compose inspection/recovery commands. Deploy itself chooses this overlay and rejects arbitrary Compose overrides.

The script validates configuration, starts `db auth rest storage mailpit`, runs the database bootstrap SQL for ownership, send, auth and gateway roles, runs `migrate` (`bundle exec rails db:migrate`), `configure-auth` and `configure-storage`, stops Mox for initialization, initializes Mox volumes, validates/provisions assignments, then starts the full project. Application processes are `launch-api`, `launch-worker`, `email-finder-worker`, `attachment-gateway`, `mailbox-mcp`, `auth-browser-proxy`, `mox-readiness` and `mox`. One-shot services may exit successfully; they are not perpetual daemons.

Expected: successful exit and healthy long-running services. Verify the API using the same internal readiness check as Compose:

```sh
docker compose -p elevateo-production -f ops/production/compose.yaml exec -T launch-api ruby -rnet/http -e "r=Net::HTTP.start('127.0.0.1',3000){|h| h.get('/ready',{'Host'=>'api'})}; exit(r.code=='200' ? 0 : 1)"
```

Expected: exit zero. A green health check is not proof of SSO, mailbox access or delivery. Deploy always stops Mox and reruns initialization; initialization rejects activated or modified configuration, including changed TLS material. Repeating this bootstrap after activation can leave Mox stopped. A reviewed post-activation update/rotation procedure is a rollout blocker. Rollback: stop the affected service, retain volumes and capture redacted errors. Only restore a previous image through a procedure proven compatible with both schema and activated Mox state. Otherwise use isolated recovery and seek cutover approval. Do not blindly run `db:rollback` against production data.

## 6. Private attachment storage and MCP

Deploy's `configure-storage` creates the attachment bucket if absent and rejects an existing public bucket. The gateway uses a restricted database role, private storage service token and shared HMAC key. The browser must use authorized API routes, not a storage service token. `mailbox-mcp` calls `launch-api` and validates its configured HTTP host; connector grants are mailbox-scoped and revocable. See [Compose](../../ops/production/compose.yaml) and [MCP README](../../apps/mailbox-mcp/README.md).

Command: `docker compose -p elevateo-production -f ops/production/compose.yaml ps attachment-gateway mailbox-mcp`. Expected: healthy, followed by authorized download, cross-mailbox denial, revoked-grant denial and private-bucket checks in the release tests. MCP health alone does not prove a connector works. Rollback: remove new public routing/revoke grants after approval and stop affected services; preserve private objects and database records.

## 7. Publish web/auth/API routes, then validate SSO

Follow [client release](clients.md) for the static web build. The company edge/provider and its exact deployment/rollback commands are **TO CONFIRM with Jeison and Callum**. Compose alone cannot complete this step. Show Callum the route map and TLS evidence before publishing it. The browser proxy is intentionally narrow; never publish private database/REST/storage/admin endpoints as a convenience.

Expected: HTTPS login via Authentik, approved membership only, secure session behavior, logout/revocation, mailbox isolation and attachment authorization in the running company app. Rollback: restore the previous approved edge/static artifact configuration and revoke sessions if needed. Do not direct real users at the new stack until these checks pass.

## 8. Mail activation, DNS/MX and optional Resend

Mox initialization leaves domains/accounts disabled, with no passwords or DKIM activation. Readiness checks only IMAPS certificate/hostname and SMTP/submission greetings. The code includes `ProductionMoxTransport` and `ProductionMoxProfile` (`mox-smtp-v1`), private credential bundles and system-root STARTTLS on port 587, separately from fixture adapters. Deployment accepts only held/Resend mode and does not assemble a production Mox inbound worker. Production routing, account wiring and outbound attachments are not certified by the local protocol tests. [Mail-server development](mail-server-development.md) explains that boundary.

There is no verified one-command production activation in this checkout. Jeison and the mail administrator must prepare the exact reviewed account/credential, signing and application-routing procedure with Tanzeel. Callum must approve it before execution. Likewise, DNS/MX/PTR/SPF/DKIM/DMARC commands depend on the actual provider and records, which are TO CONFIRM. Record existing values/TTLs before any change; preserve the old mailbox service during propagation. Expected: approved records resolve correctly, authenticated inbound mail reaches the intended mailbox, and only the specifically approved first send occurs. Rollback: restore recorded DNS/MX, disable new accounts/routes and hold outbound; allow for DNS caches and reconcile messages already accepted.

Optional Resend uses `ELEVATEO_OUTBOUND_MODE`, its three conditional credentials/settings and `compose.resend.yaml`; `resend-events` handles provider events. Domain verification and webhook publication each require approval. Even Resend mode stays held: Compose fixes `ELEVATEO_OUTBOUND_HOLD` true. Changing the shell variable to false is not an activation procedure. Rollback: return to held mode, remove approved external webhook routing and revoke unused provider credentials. Reconcile ambiguous provider outcomes before retrying.

## 9. Finder egress

Leave the finder public-IP setting empty until approved. Public discovery/UI can still work; SMTP probing is unavailable. Before enabling probing, the network administrator must supply a different public IP from Mox and actual routing/SNAT. Compose attaches the finder worker to the same egress network; the IP variable does not implement network separation.

After approval and network configuration, redeploy and run `docker compose -p elevateo-production -f ops/production/compose.yaml ps email-finder-worker`; inspect redacted worker diagnostics and the finder health UI. Expected: observed separate source IP, valid PTR and outbound port 25. Do not use real prospect probes as an unapproved test. Rollback: clear the setting and restart through the approved deployment procedure; preserve cache, pause and budget state. See [finder](../email-finder.md).

## 10. Backups and an isolated restore drill

Use [completion recovery](../../ops/production/completion/README.md), not historical fleet runbooks. Set the absolute Compose file list, project name, source revision, pinned helper image and shared lock. Inject backup credentials from the secret manager. After Callum approves the destination and downtime:

```sh
python3 ops/production/completion/recovery.py backup
```

Expected: all writers stop for a consistent cold snapshot of six volumes, then previously running services restart before encryption and SFTP upload/download hash verification. The cold archive stage incurs downtime proportional to data size. Rollback of a failed backup: verify service restart and diagnose the failure; retain the last good encrypted snapshot. Do not delete the source volumes.

Prepare a fresh isolated `elevateo-restore-*` project using identical revision/images, no existing volumes/containers, only internal networks and no published ports. Recovery compares the exact service-name/image roster with the snapshot, so retain `mox` and `mox-readiness` entries while replacing host networking with isolated internal networking. The repository has no verified full-production restore definition implementing that transformation. Jeison and Tanzeel must supply and test it before rollout; the local six-volume drill alone does not close this blocker. Set recovery identity separately from online backup credentials:

```sh
python3 ops/production/completion/recovery.py restore --snapshot /absolute/snapshot.tar.age
```

The path is an operator-supplied downloaded snapshot, not a file shipped by the repo. Expected: archive hashes/paths and restored bytes verified; only DB starts; sessions and connector grants revoked; unfinished sends held; RLS/roles verified; DB stops. No automatic cutover occurs. Rollback: leave the isolated target stopped and retain evidence. Production cutover needs a separate Callum sign-off, reconciliation of accepted/unknown sends, measured RPO/RTO and a reviewed endpoint switch. Off-host recovery on company infrastructure remains unverified until Jeison records this drill.
