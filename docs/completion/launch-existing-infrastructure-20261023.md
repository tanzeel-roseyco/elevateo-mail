# Existing infrastructure launch discovery — 2026-10-23

Discovery only, dispatch `ctx_37cca08a4329`, task `task_25b8bc442d33`. No production configuration, DNS, account, database, deployment or mail changes were made. No secrets were read into this report, and no application tests/builds ran. Read-only SSH, Docker metadata, Railway CLI and public DNS queries establish the observations below; capacity is a snapshot, not reserved capacity. Platform clock at the final probe: **2026-10-23 02:13:33 UTC**.

## Existing administrator handover

The device already has a working owner SSH path to the separate Hetzner platform. Local `.ssh/config` and `C:/Users/Tanzeel/Code and projects/X Outreach Systems (HIGHLY REDACTED & CONFIDENTIAL)/infra/HETZNER-ACCESS.md` document project **14785030** and the 2026-10-19 personnel handover. The protected handover directory is `C:/Users/Tanzeel/.hermes/secrets/hetzner-handover-2026-10-19`; its filenames were enumerated, but private keys and credential files were not printed.

| Target | Verified access and capacity | Scope / constraint |
| --- | --- | --- |
| `hetzner-platform`, 178.104.121.181 | `ssh -o BatchMode=yes -o ConnectTimeout=12 hetzner-platform` succeeds as root; hostname `platform-fleet02`; server ID 134171732. RAM 24032 MiB total, 10817 MiB available; root disk 154 GiB total, 56 GiB available. | Separate from fleet-02 despite its hostname. Actual Coolify management stack is here. Shared workloads must be preserved. |
| `fleet-02`, 188.40.237.70:2222 | Known fleet key succeeds as tanzeel, UID1001, Docker group. RAM 63338 MiB total, 25229 MiB available; swap 25331/31726 MiB used; root disk 437 GiB total, 65 GiB available, 85% used. | `sudo -n true` requires a password. Existing live/test Elevateo services are running. `/data/coolify` is not readable by this user. |
| `hetzner-ci`, 46.225.50.22 | SSH alias and owner key path documented; server ID137850920. | Not contacted; no capacity claim. |
| `hetzner-preview`, 100.85.184.20 | Private alias via platform jump host documented; server ID167551600. | Not contacted; no capacity claim. |

The handover explicitly records revocation of both Hetzner API tokens on 2026-10-19. Existing root SSH administration works without an API token; creating infrastructure or a new token is outside this discovery. The unrelated `fleet-01` / Arnis system was deliberately not contacted.

## Coolify and fleet composition

Platform Docker metadata confirms `coolify`, `coolify-db`, `coolify-redis`, `coolify-realtime`, `coolify-proxy` and `coolify-sentinel`, alongside shared application/Supabase/identity workloads. `docker port coolify` maps container8080 to host8000 on IPv4/IPv6. A read-only request to `http://127.0.0.1:8000` returned HTTP302. This establishes a running dashboard endpoint, **not an authenticated Coolify browser/API session**. No Coolify password, API token, database contents or `.env` was accessed.

For a later owner browser session, a local-only tunnel is concrete and does not alter the remote deployment:

```powershell
ssh -N -L 127.0.0.1:18000:127.0.0.1:8000 hetzner-platform
# Open http://127.0.0.1:18000 in the owner browser; resolve its existing login/redirect there.
```

Fleet has the existing `elevateo-mail-live_private` network and running live/test database, Auth, REST, Storage and Mailpit services. Shared Traefik occupies80/443. No listeners on25/465/587/993 or launch transport2223 were observed; SSH2222 remains occupied by existing host access. Coolify sentinel on fleet is not the Coolify management application. Do not replace shared proxy bindings, repurpose2222, or infer an empty host from unused mail ports.

## Railway and DNS evidence

`railway whoami --json` confirms an existing authenticated **Team Account, team@elevateoco.com**. That identity is not proof of Tanzeel Ahmad's application administrator identity. Explicit project-scoped inspection succeeds even though this checkout has no linked Railway project:

| Resource | Observed value |
| --- | --- |
| Project | Elevateo Mail, `d829ba11-e7fb-4afe-9050-3ee888b5b58f` |
| Production environment | `e2cdc305-5dbd-49b4-8457-f147930cf22e` |
| Existing web service | `a0c1e1a9-83d3-4377-8864-7fcfcd6babe3` |
| Access | `canAccess: true` |
| Deployment/source/domain state | No active/latest deployment; source image/repo null; domains empty; volumes empty |

Public DNS: elevateoco.com NS are `brenna.ns.cloudflare.com` and `lex.ns.cloudflare.com`. **mail.elevateoco.com currently CNAMEs to `cname.vercel-dns-016.com`**. Apex MX remains Google's five ASPMX/ALT records. A Railway cutover therefore replaces an existing subdomain record; it is not an unused hostname. DNS provider identification is established; authenticated zone-edit permission and the current record's owner/purpose are not established. No Cloudflare proxy, Access or Tunnel is required or authorized by this plan.

## Exact next commands and activation dependencies

These are a coordinator execution handoff, **not commands executed during discovery**. Run build/test work only in fleet Docker under the existing lease. Preserve the existing database/Auth/Storage and outbound hold. The deploy wrapper requires reviewed immutable image digests and protected configuration; do not substitute mutable build tags.

Read-only revalidation:

```powershell
ssh -o BatchMode=yes -o StrictHostKeyChecking=yes -i C:/Users/Tanzeel/.ssh/id_ed25519_fleet -p 2222 tanzeel@188.40.237.70
railway status --project d829ba11-e7fb-4afe-9050-3ee888b5b58f --environment production --json
railway domain list --project d829ba11-e7fb-4afe-9050-3ee888b5b58f --environment production --service web --json
```

From the reviewed fleet checkout, after root supplies protected production variables, exact immutable application/transport images and dedicated transport server keys:

```sh
sh ops/production/deploy.sh -f ops/railway/transport.compose.yaml config --quiet
sh ops/production/deploy.sh -f ops/railway/transport.compose.yaml up -d
sh ops/production/deploy.sh -f ops/railway/transport.compose.yaml ps
```

Required transport variables include `ELEVATEO_TRANSPORT_IMAGE` and `ELEVATEO_TRANSPORT_KEYS_DIR`; application variables are validated by the production composition. Never mount the Railway client's private key into the transport server. Pin the exact host-and-port known-host identity before distributing the Railway client settings. The Railway start script requires PORT, FLEET_SSH_PORT, FLEET_SSH_HOST, FLEET_FORWARD_USER, FLEET_FORWARD_KEY_BASE64 and FLEET_KNOWN_HOSTS_BASE64 through protected service variables; none was fetched or emitted here.

The existing Railway configuration is `ops/railway/railway.json`, selecting `ops/railway/Dockerfile`, `/ready`, health timeout120 and ON_FAILURE restart maximum3. Root must explicitly configure that file as the service configuration path before upload; the inspected `railway up` help provides no `--config` flag. Do not assume nested configuration auto-discovery. After configuration path/root and protected variables are confirmed:

```powershell
railway up --project d829ba11-e7fb-4afe-9050-3ee888b5b58f --environment production --service web --detach .
railway domain mail.elevateoco.com --project d829ba11-e7fb-4afe-9050-3ee888b5b58f --environment production --service web --json
```

Use the actual DNS target returned by Railway, then change only the approved mail subdomain record in the existing Cloudflare zone with proxy disabled. Preserve apex MX and Google Workspace. No generated domain target can be supplied yet because domain creation was intentionally not performed.

## Precise remaining blockers

1. **Production initialization:** the existing live database is not yet accepted as schema/tenant ready. `ops/production/initialize/README.md` requires exact live database/globals/Storage backups, isolated real-data restore and independent acceptance, plus separate protected schema/tenant gates. The previously removed rehearsal runner is not a currently available accepted operator image. Run `python3 ops/production/initialize/initialize.py schema` only inside a reviewed fleet operator container to obtain the offline source digest; `--apply` remains held until the documented gates are real. No reset or seed is appropriate.
2. **First administrator identity:** Tanzeel Ahmad must first have the approved existing Google Auth identity, confirmed email, actual nonzero Auth UUID and chosen organization UUID. The initializer does not create users or discover them by name/email. New tenant requires owner first; root must supply exact approved tenant name, owner UUID and receipt. Railway team login supplies none of those values.
3. **Google OAuth registration access:** bounded local handover/document searches found no identified Google Cloud OAuth project/client registration or demonstrated authenticated management session. No gcloud installation/profile was found in the checked standard location. This does not prove the account lacks access. Root must identify the owner browser's Google Cloud project and ability to manage its web OAuth client; register `https://mail.elevateoco.com/auth/v1/callback`, use the documented app callback `https://mail.elevateoco.com/v1/auth/sso/callback`, and provide the client configuration through the protected server settings. Google-only SSO uses openid/email/profile, not Gmail scopes; keep SSO_ONLY enabled.
4. **DNS management:** Cloudflare authority is proven by NS, but zone-edit authorization is not. Root must use an existing authenticated Cloudflare session/token with access to elevateoco.com and reconcile the current Vercel CNAME before the single-record cutover. No claim that DNS credentials are absent is made.
5. **Coolify dashboard login:** root SSH access and HTTP dashboard reachability are concrete. An authenticated dashboard/API session remains unverified; use the tunnel above and the existing owner handover rather than resetting accounts or searching secret stores. Coolify is an available alternative administration surface, not a reason to migrate the agreed Railway edge.
6. **Launch runtime:** dedicated restricted transport keys/pins, deployment config-path selection, accepted immutable images, service readiness and real browser SSO remain coordinator-owned work. External provider/mail/domain signups and mailbox/send flows belong to the other worker/root. No production acceptance or release follows from this discovery.

## Scope and hygiene

Read AGENTS.md, README current state, state.md, documentation.md, STANDARDS.md and the selfhosted production handoff before probes. Searches were bounded to relevant documentation/configuration filenames and administrator handover files; unrelated private content and environment values were not dumped. A broad filename listing was truncated and narrowed before document reads. No Docker resources were created, so there are no task-owned containers/images/cache to clean. Existing shared services, mounts, credentials and data were retained. Only this report was added; central state documents were not modified under this task's ownership boundary.
