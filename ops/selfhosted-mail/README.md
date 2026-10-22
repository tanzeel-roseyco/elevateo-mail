# Self-hosted Mox deployment (held until activation)

This package reuses the existing Mox digest, not a second mail stack. No DNS,
provider or external mail requests are made by generation. Domains and logins
start disabled. This is deployment source, not evidence that 120 accounts exist
or that production application mail works. Linux amd64 and Docker Compose v2,
Python 3.12+, OpenSSL and a dedicated host are prerequisites; no Python packages.

## Host and Coolify

Deploy `compose.yaml` as a Coolify Docker Compose resource on the dedicated
Hetzner host. Host networking deliberately bypasses Coolify's HTTP proxy to
preserve SMTP client IPs. Do not deploy on a shared host already binding mail
ports. Set private `MAIL_ROOT=/absolute/operator/chosen/path` and a stable
`COMPOSE_PROJECT_NAME` matching Coolify's actual resource project for every CLI
command. Never use commands from a different project/context against live data.
No app HTTP routing or Google Workspace service is replaced.

Bind-mount config/data/TLS; these survive resource recreation. Monitor the quota
budget and free disk; 80 GiB is only sufficient for the 250 MiB/account example
budget, not a provider recommendation. Reserve 2 GiB RAM for Mox plus host,
backup and security services. Start with a clean private directory on encrypted
storage. Mox starts privileged, binds low ports and drops to UID 1000; preserve
its ownership and do not force a Compose user or disable its permission repair.

Firewall: public inbound TCP 25,465,587,993; administration SSH only from trusted
networks. No public admin, metrics, webmail or plaintext IMAP listeners. Runtime
needs outbound DNS UDP/TCP53, HTTPS443 and SMTP25, and accurate host time. Keep
outbound SMTP denied at host/provider firewall until final activation. Hetzner
port25 approval/reachability is a separate prerequisite. Avoid IPv6 publishing
until IPv6 listeners, routes, reverse DNS and policy are independently verified.

## Explicit 120-account inputs

Reuse the coordinator's `mailbox-provisioning-plan.csv` (12 people, ten unique
localparts each). Do not copy names into new identities or invent domains.
`import_plan.py APPROVED_CSV PRIVATE_SETTINGS NEW_MANIFEST` requires all CSV
rows unassigned/unprovisioned, and private settings with these exact fields:

* `hostname`: exact verified lowercase FQDN under an approved mail domain.
* `public_ipv4`: host's assigned globally routable IPv4, string.
* `verified_domains`: explicit approved sending/receiving domains or subdomains.
* `workspace_domains`: existing Workspace domains, disjoint from hosted domains.
* `quota_mib`: integer 50..10240; `disk_gib`: integer 40..4096.
* `outbound_hold`: true.
* `assignments`: object mapping every one of the 120 CSV localparts to its exact
  approved domain. No default domain or wildcard is accepted.

The resulting manifest replaces assignments with 120 full `accounts`. Operator
verification includes brand authorization and DNS control; a syntax validator
cannot establish ownership. Keep settings/manifest private outside Git. Empty,
unassigned, duplicate, unknown-domain and insufficient-capacity inputs fail.

On the target Linux host, generate with `python3 generate.py MANIFEST NEW_ROOT`,
then `python3 keys.py NEW_ROOT`. Credentials are independent 256-bit random
values in owner-only files, never argv or console output. DKIM RSA keys are
PKCS8 and published atomically without replacing existing keys; failures require
inspection, never rerun over live state. Install a trusted fullchain and matching key as `tls/fullchain.pem` and
`tls/privkey.pem` (key0600). Obtain/renew externally using the operator's existing
certificate mechanism; Mox does not claim port443. Renew atomically and restart
Mox before expiry. Do not mount the Docker socket or DNS credentials into Mox.

Run `bash preflight.sh` with MAIL_ROOT exported: validates private paths, system-trusted TLS chain, server purpose/name,
14-day expiry, matching key and Mox config. Then inspect rendered Compose and
start the held service with `docker compose -f compose.yaml up -d`. Run
`python3 provision.py ROOT ABSOLUTE_COMPOSE_PATH` with the identical Coolify
project environment. All credentials are validated before the first mutation;
on a failure some passwords may already be set, but logins remain disabled.
Retry the same private inputs. Never paste credentials into Coolify logs.

## Activation gates (operator evidence required)

Verify assigned IP, free listener ports, persistent mount backup coverage, OS
patching, trusted TLS, firewall and disk space before startup. Verify DNS A,
host PTR matching hostname and forward-confirmation; publish MX only for each
explicit mail domain/subdomain, never the Workspace apex. Publish SPF for the
exact sending IP, DKIM selector `mail2026` from each generated public key and
DMARC with monitored reporting and a staged policy. Existing records must be
reconciled, not blindly overwritten. Keep Workspace MX/routing intact.

After independent source review and controlled acceptance, remove the exact
domain Disabled and account LoginDisabled settings, permit outbound25 and
restart/reload using the pinned Mox command documentation. That is activation,
not part of this implementation. Verify authenticated submission, IMAP access,
unauthenticated relay rejection, tenant separation, invalid passwords, quota,
TLS expiry alerts and restore before permitting campaigns. No acceptance sends
were authorized or executed here. 120 local accounts are not an external
warmup network; reputation/rate ramp and unsubscribe/bounce handling are gates.

## Application connection boundary

Use existing mailbox SMTP/IMAP adapters, not application notification SMTP or
Mailpit. Each mailbox needs host=verified hostname, SMTP587 with mandatory
STARTTLS (or465 implicit TLS), IMAP993 implicit TLS, full address username,
certificate/hostname verification and its unique password. Store credentials
server-side through the existing tenant-scoped secret abstraction; never in
frontend builds or tracked environment files. Existing held test-reference
credential resolution is not production secret storage.

`export_bundle.py ABSOLUTE_PRIVATE_ROOT BINDINGS_BASENAME NEW_BUNDLE_BASENAME`
exports the backend's private `format_version: 1` Bundle. Supply an owner-only JSON
file directly in the generated root with exactly `format_version` and `entries`.
Each entry contains actual application `account_id`, `organization_id`, `mailbox_id`
UUIDs, `credential_version` (active positive integer), `credential_ref` (`secret:`
reference), `username`, `protocol`, `host`, `port` and `tls_mode`. Supply paired
`smtp`/587/`starttls_required` and `imap`/993/`verified_tls` entries for each selected
account, sharing the full identity/version/reference tuple. Host must equal the
approved manifest hostname and username must be its exact generated full address.
There are no inferred identities, default tenant IDs, test references or plaintext
TLS modes. Endpoint metadata is validated and omitted from the backend Bundle;
the eight exported fields are the five identity fields, username, protocol and
password. Passwords are read privately from the matching generated account file.
All entries validate before a mode0600 atomic exclusive publication; existing
output is never overwritten. Keep the Bundle outside Git and frontend builds.

Mount that file privately into the existing backend secret adapter according to
its deployment configuration. Actual application binding metadata was unavailable
in this task: no production Bundle was manufactured and connection stays held.
For rotation, revoke or advance the actual SQL binding version first so old
lookups fail closed, disable the affected Mox login while changing its password,
update the private generated credential, then export a NEW Bundle using the
actual updated SQL metadata. Deploy the complete new file atomically and restart
adapter workers before re-enabling the affected account; verify both protocols.
For revocation, revoke the SQL binding, disable/reset the Mox account credential,
remove its entries from the next complete Bundle and restart workers. Removing a
file alone does not erase credentials already loaded into worker memory or end
existing Mox sessions; terminate those sessions through operator-controlled
service restart when immediate revocation is required. Preserve other accounts.
Do not repoint `ops/production/compose.yaml` Mailpit globally to an account:
notification transport and user mailbox transport are different integrations.

## Isolated runtime acceptance

`run-runtime.sh` runs only on fleet-02 under the shared Docker lease using an
already installed pinned image and reviewed Mox binary. It uses production
`serve`, synthetic accounts, test-only CA/activation, loopback DNS and a
network-none disposable container with no published ports or production mounts.
The fixture changes only listener IP and activation holds in generated config.
It verifies real A SMTP587 STARTTLS delivery to B's verified-TLS IMAP993 inbox,
tenant isolation, invalid credentials, relay denial, chain/name rejection,
populated backup/verifydata and message survival after restart and isolated restore.
Unknown local RCPT is accepted with250 by upstream design; DATA returns550 and
the message is not persisted. This is final rejection, not RCPT-time rejection.
`check-source.sh` uses pinned offline wheels only inside disposable Docker tmpfs.
See `docs/completion/selfhosted-mail-runtime-20261023.md` for exact source hashes,
failed iterations, final results and remaining production activation gates.

## Backup, restore and operations

`bash snapshot.sh` uses Mox's consistent live backup into a uniquely named
private data/tmp directory. It is plaintext and may contain hardlinks: never
edit a snapshot, never use it as the running data directory. Snapshot creation
is not an offsite backup. Encrypt and copy offhost with the organization's
existing audited backup tool; include config, data, TLS renewal configuration,
manifest, DKIM keys and credential escrow. Keep encryption recovery keys in a
separate vault, not on the mail host. Define retention/RPO/RTO and prove restore.

Restore only into a NEW isolated directory/host with outbound denied: decrypt
the snapshot, preserve numeric ownership/modes, verify its data with the pinned
`mox verifydata SNAPSHOT/data` while all mail processes are stopped, copy its
config/data into the new root, restore trusted TLS separately, then run
preflight. Compare account counts and mailbox content privately. Switch traffic
only after operator approval; keep original disks intact for rollback. Never
run verifydata against live data. No automated destructive restore is supplied.

Health: inspect Compose process state and bounded redacted logs; probe SMTP25
banner, STARTTLS587 and TLS993 from approved monitoring, verifying the hostname
and trust chain. A running container alone is insufficient. Alert on queue age,
delivery failures, disk/inodes, certificate expiry, authentication anomalies,
backup age and restore failures. Do not expose admin/metrics publicly. Freeze
and investigate abnormal volume rather than lifting limits automatically.

The historical image pin is reproducible, not proof of current security support.
Before activation review upstream release/Go security updates, scan the image,
and stage a reviewed digest update with parser/restore regression evidence.
No automatic `latest` pull is permitted.

Sources: [Mox install](https://www.xmox.nl/install/),
[commands](https://www.xmox.nl/commands/), [configuration](https://www.xmox.nl/config/),
[backup/restore FAQ](https://www.xmox.nl/faq/).
