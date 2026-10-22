# Self-hosted infrastructure and design assessment — 2026-10-23

Assessment completed read-only apart from this document. Production construction is user-authorized;
this packet does not activate mail, deploy, change DNS, or certify production readiness.
Inspection observed fleet UTC 2026-10-22T21:54:38Z (2026-10-23 Sydney).
Repository HEAD observed: `cdfe21018edbe3a7faf148f9dea0db3efd4d8187`.

## Evidence and present readiness

SSH as `tanzeel@fleet-02` succeeded without sudo. Docker read access works, server 29.6.2.
No credentials, environment values, message contents, database rows or private keys were read.
No host application tests, builds, downloads, API mail calls, purchases or mutations occurred.

| Observed fact | Operational implication |
| --- | --- |
| Root filesystem 468,702,478,336 bytes; available 69,897,666,560 bytes; 85% used | Approximately 65.1 GiB available is shared capacity, not reserved mailbox storage. |
| RAM 63,338 MiB total, 24,469 MiB available; swap 23,939/31,726 MiB used | Existing pressure and contention require measured limits; no 120-user capacity claim. |
| 293 running containers; 359 total; 81 images | Shared host has substantial unrelated workloads. Preserve them. |
| Docker images 103.7 GB, volumes 16.81 GB, build cache 3.335 GB | Reclaimable reporting does not establish task ownership; no prune authorized or performed. |
| `kc-family-home-traefik` publishes 80/443 on IPv4 and IPv6 | Mox cannot independently bind these host ports; do not replace/restart this proxy. |
| SSH 2222 public; several loopback application ports; no listeners on 25/465/587/993 | Mail listeners are not deployed. Absence of listeners does not prove firewall reachability. |
| Coolify sentinel present; no container literally named `coolify-proxy` | Coolify management endpoint/account identity cannot be inferred from naming. |
| `hcloud` and `coolify` executables absent from local and remote PATH | No authenticated CLI identity metadata available. No hidden credentials searched. |
| Pinned `r.xmox.nl/mox@sha256:831c6f11b3c2ee1633077052e6d4b7ae53f73972adf4bf08be0a740121d24cc7` image inspect fails | Historical test image is not presently available by its pin. No pull attempted. |

Protected running services include Elevateo live/test DB, Auth, REST, Storage and Mailpit,
Elevateo previews and staging, other Elevateo projects, Paraguay/Hong Kong/Meridiana stacks,
and the shared Traefik service. Names containing `live` do not establish application launch.
Container environments, mounts and configuration secrets were deliberately not dumped.
Two early remote format commands lost quoted pipe separators through SSH shell parsing;
their inventory outputs were discarded and replaced with single-field queries above.

Read README, state, documentation, standards, launch handoff, Mox pilot README and mailserver
readiness/runtime documentation. The latest launch handoff says not deployed, mailbox provisioning
unresolved and application schema/membership initialization pending. Historical Mox passes cover
isolated synthetic runtime, not live DNS, production anti-relay policy or 120 real mailboxes.

## Exact architecture boundary

Rails/PostgreSQL remain authoritative for tenant membership, mailbox ownership, consent,
suppression, send budgets, durable attempts and inbox cursors. Mox owns SMTP/IMAP accounts,
message persistence, queueing and mail protocol policy. Supabase Auth remains identity, not
automatic membership. Provisioning must bind one actual Mox account and credential version to
each application mailbox; 120 aliases sharing one login fail the requested isolation.

Prefer a dedicated mail host/public IP, leaving fleet application services and proxy unchanged.
This costs another host and operational surface but bounds disk exhaustion, reputation, restart
and exposed-protocol blast radius. It requires explicit target/account identification; no purchase
or server creation is authorized to this reviewer. Mox upstream recommends a dedicated VM and
documents Docker as a less preferred deployment; using Coolify containers is a conscious deviation
requiring pinned builds, direct mail ports, durable storage and tested certificate renewal.
[Mox installation](https://www.xmox.nl/install/).

If reusing fleet is selected, reserve storage and memory, use a dedicated network and private
admin endpoint, and explicitly integrate certificates with the existing proxy owner. Never expose
Docker socket or production DB to Mox. Expose only SMTP 25 for receiving, submission 587 with
required STARTTLS/auth, and IMAPS 993 as needed. Public admin is unnecessary. Web HTTPS
termination alone does not secure IMAP/SMTP: Mox needs valid matching certificates and renewal.
Use no Cloudflare proxy, Access, Workers or tunnel.

## Workspace and domain safety

Verified documentary names: application `mail.elevateoco.com`; existing brief includes
`boltloop.co`. Roseyco/Flooda/Bluepillar domain FQDNs remain unresolved. No live DNS query or
DNS-provider identity verification occurred; these names are not proof of DNS ownership/state.
Do not reuse `mail.elevateoco.com` as Mox's host name while it is the application's OAuth origin.
Use a separately selected mail host name and dedicated recipient subdomain/domain after ownership
verification. A subdomain has its own recipient namespace; it does not deliver root-domain mailboxes.

Preserve existing Workspace MX and routing verbatim. Adding Mox as an alternate root-domain MX
is unsafe: priority is failover, not per-recipient split delivery, and a healthy Google server may
reject unknown recipients without trying Mox. Split delivery would require a separately authorized
Workspace routing change and is outside this packet. New mail-subdomain MX, DKIM selectors, SPF,
DMARC and PTR can be staged without replacing Workspace records; DNS edits still belong to root.
Do not publish a second SPF record or overwrite existing policy. Verify parent/subdomain DMARC
inheritance, SPF/DKIM alignment, forward-confirmed PTR and IPv6 parity before release.

## Relay, TLS and recipient isolation gates

Production must run Mox `serve`, never `localserve` (fixture catchall/loopback is not production).
Require explicit recipient enumeration, no global catchall, authenticated submission, account-bound
MAIL FROM authorization and separate per-mailbox credentials. App membership denial and Mox
credential denial must both work; application checks alone cannot prevent direct SMTP abuse.
Keep outbound application dispatch held and server queue held until independent gates pass.

Required private-container evidence on the exact new production configuration: unauthenticated
external-to-external relay denied; unknown local RCPT denied before DATA; account A cannot submit
as B or read B; wrong password and expired/foreign hostname certificates denied; valid authenticated
owned-sender submission accepted; credential revocation blocks new sessions; admin unreachable
from public interface; restart preserves mailbox UIDs/messages. Inbound SMTP opportunistic STARTTLS
differs from submission's mandatory TLS; do not require all internet senders to authenticate.

Hetzner Cloud documents outbound 25/465 default blocking and 587 availability. Actual fleet service
class/account exemption is unknown; do not infer Cloud policy applies identically to this machine.
No external SMTP socket probes or mail were sent. Root must obtain provider restriction/exception
metadata before direct-to-MX delivery. A permitted 587 relay is a distinct reviewed provider path
with fees, terms and reputation implications, not a silent workaround.
[Hetzner FAQ](https://docs.hetzner.com/cloud/servers/faq/).

## 120-mailbox capacity and recovery simulation

Quotas are an unresolved product choice. Illustrative complete capacity budgets, assuming 15%
metadata, 10 GiB queue/operational reserve and 20% free space (not measured guarantees):

| Per-mailbox quota | Mail data | Provisioned minimum `(data × 1.15 + 10) / 0.8` |
| --- | --- | --- |
| 250 MiB | 29.30 GiB | 54.61 GiB |
| 1 GiB | 120 GiB | 185 GiB |
| 5 GiB | 600 GiB | 875 GiB |

The smallest scenario leaves little shared fleet headroom and excludes application DB/storage,
local backup staging and concurrent growth. A 1 GiB quota already exceeds present free space.
Choose storage/retention and monitor bytes, inodes, queue age, backup age and disk growth; stop
admission safely before exhaustion. Historical synthetic account counts do not measure concurrency.

Use Mox's supported backup command with encrypted off-host copies plus separately protected
configuration, signing keys and recovery credentials. A local hardlink backup protects consistency,
not host failure. Restore to an isolated no-egress destination and verify data before promotion;
restore the matching Rails DB, Storage and credential bindings/cursors without replaying unknown
sends. Mox documents stopping before data replacement and `verifydata` validation.
[Mox commands](https://www.xmox.nl/commands/).
Coolify instance backup protects its control plane; it is not proof that arbitrary mail volumes
or all application data are recoverable. Add volume-aware off-host recovery explicitly.
[Coolify instance backup](https://coolify.io/docs/core/backup-and-recovery/instance-backup),
[persistent storage](https://next.coolify.io/docs/services/configuration/persistent-storage).

| Simulated failure/tradeoff | Required response / consequence |
| --- | --- |
| Fleet disk fills during incoming DATA | Reserve queue headroom, explicit temporary failure, alert; never accept mail without durable persistence. Dedicated disk bounds collateral damage. |
| SMTP final acknowledgment lost | Persist unknown; reconcile, do not automatically retry. Prevent duplicate outbound mail. |
| Proxy renewal succeeds but Mox certificate expires | Independent SMTP/IMAP expiry probes and atomic certificate replacement/reload; web health is insufficient. |
| Restore mail but not app cursor/credentials | Verify UIDVALIDITY/replay dedupe and account/version binding; keep dispatch held until cross-system reconciliation. |
| Single mail host destroyed | Off-host restore drill establishes measured RPO/RTO; replicas on the same host do not solve this failure. |
| Direct IMAP login bypasses app membership | Revoke Mox credentials alongside app authorization; explicitly handle already established sessions. |
| 120 new accounts share one IP | Account count does not create reputation or external warmup network; consent and aggregate limits remain enforced. |

Obsidian connection unavailable: no Obsidian tool was exposed in this session. These simulations
are recorded here; no claim of vault synchronization or external simulation is made.

## Bounded source review

Reviewed ONLY `apps/server/lib/elevateo/send_worker/mox_smtp_transport.rb` lines 1–78,
78 physical LOC total, SHA256 `ec4d62d53413b93c6950b37689d7b05394d242e75e8fb21612b809cc3c855879`.
Applied supplied correctness/security/design rubric; formatting delegated to normal lint workflow.
No actionable defect in its stated fixture-only purpose: **0 defects, 0/KLOC**. Coverage is not
transitive approval of called code/tests; no tests were executed. Constructor rejects non-test
profiles; recipient is fixed `seed000@seed.test`; TLS verifies peer/hostname; organization/mailbox
binding is checked; post-DATA exceptions become unknown; observation never authorizes replay.
This adapter cannot serve arbitrary production mailboxes as written. That is a documented scope
boundary, not a defect to bypass by deleting guards. Newly changed source needs separate review.

## Actionable release blockers

1. Identify actual authorized Coolify endpoint/account, Hetzner project/host class and target IP;
   obtain outbound-25 entitlement and firewall facts through metadata-only authorized access.
2. Select exact owned recipient domains/subdomains and host FQDN; capture unchanged Workspace
   routing baseline. Existing root-domain mailbox requests conflict with a no-routing-change rule
   unless those domains already route to this stack; do not silently choose split delivery.
3. Root selects dedicated host versus shared-proxy integration, approved quotas/retention and
   off-host recovery objectives; present shared fleet space cannot support 120 × 1 GiB.
4. Obtain immutable production Mox artifact/provenance and production configuration; fixture pin
   is absent locally and fixture-only adapter is not an activation implementation.
5. Provision 120 distinct credential-isolated accounts with verified app ownership; then complete
   exact-config anti-relay/TLS/recipient tests and populated off-host restore drill in fleet Docker.
6. Complete preservation-first app schema/tenant bootstrap and exact transport integration,
   then separate live acceptance under root authority. Current status: **not production ready**.

No Docker resources were created or deleted, so task cleanup is not applicable. Existing services,
volumes, caches and images were retained. Only this owned assessment file changed; no commits.
