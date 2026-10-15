# Mox activation and inexpensive acceptance plan

This is a held preparation packet, not an enabled deployment. Do not change the application's
`remote_held` contract or bypass its outbound hold to follow this plan. Every executable test runs
in Docker on fleet-02; the eventual native Hetzner service is a separate deployment decision.

## Account and cost plan

`ops/mailserver/plan.example.json` reserves 12 team accounts, 500 outreach accounts and 200 seed
accounts. The twelve people requested are Allan, Callum, Tanzeel, Hazem, Jeison, Lachlan, Thomas,
Emil, Roy, Ben, Matthew and Adria. `memberNNN` entries are reservations: names do not infer email
addresses or grant application permissions. Final local-parts and Matthew's full name remain unset.
Existing application role policy remains authoritative, including Allan/Callum administrator ranks.

Each outreach/seed reservation has a 50 MiB message quota; team reservations have 250 MiB. These
are intentionally small pilot limits, not normal full-history personal mailboxes. Combined quotas
are 38,000 MiB (37.11 GiB). Add 15% metadata and 10 GiB OS/queue reserve, then retain 20% disk free.
This fits the 80 GB candidate and rejects 40 GB. Backups are additional: no local backup capacity
is included. Account histories, attachments and retention determine actual growth; raise quotas
only after recalculating disk and backup cost. Never silently delete customer mail to fit a budget.

The planned 500 outreach messages/day and 200 diagnostic messages/day are projections. Mox's
30 outgoing / 10 first-time-recipient daily limits are per account, not a fleet-wide budget.
All generated accounts have login disabled, all domains are disabled, and listeners are loopback.
Aggregate mailbox/domain/IP/destination budget enforcement is an application activation blocker.
At two workers and 5 seconds/operation, 700 operations require roughly 29 minutes; at 15 seconds,
88 minutes. This is scheduling arithmetic, not a measured public-provider throughput promise.

## Native staging procedure

1. Use a current supported Linux image, a dedicated `mox` account and native upstream service.
   Preserve the upstream systemd hardening; apply `ops/mailserver/resources.conf` as a drop-in.
   Its limits are initial guardrails; measure production RSS, queue latency and OOM events before
   tightening them. Avoid a second groupware stack, per-mailbox processes, antivirus daemons and
   per-message AI calls in this low-cost pilot. Attachment download/type controls stay in the app.
2. Fetch the pinned Mox release for the actual CPU architecture. The tested binary is Linux/amd64;
   do not reuse its hash or an amd64 price assumption for ARM. Verify release provenance and digest.
   Keep the previous binary/config ready for rollback; follow upstream migration guidance.
3. Run `plan.py plan.example.json NEW_PRIVATE_DIRECTORY` in a fleet-02 container. Substitute only
   approved hostname/domain/quotas in the input JSON. Duplicate keys, unknown fields, invalid names,
   oversized plans, unsafe capacities and an existing output directory are rejected.
4. Place the generated configuration under `/home/mox/config`, data under `/home/mox/data`, owner
   `mox`, directories private and secrets readable only as needed. The generated static config names
   `tls.crt` / `tls.key` but contains no key material. Passwords, TLS and DKIM keys are generated at
   activation and stored outside Git; mailbox credentials need tenant-owned versioned references.
5. Run `mox config test` against the actual config and validate the systemd unit on the target OS.
   Native systemd/cgroup acceptance is still required: the container test validates Mox configuration
   and protocol behavior, not systemd boot or restart. Do not expose the staging listeners publicly.
6. Install monitoring and off-host encrypted backups before enabling delivery. Alert at 70% disk,
   investigate at 80%, stop new application sends at 85%; preserve inbound mail/queue where possible.
   Measure the filesystem holding mail and its queue. Inbound traffic can still fill it after outbound sends pause; monitor both. A full disk must produce a visible degraded state. Never retry an ambiguous SMTP acknowledgment.

## Credentials, infrastructure and DNS for activation

Required access: scoped Hetzner project/API or SSH access; DNS-zone edit access for the chosen
domains; an off-host encrypted backup destination; operator recovery access; application signing,
database/auth/storage secrets; tenant mailbox credentials and DKIM private keys. Inject through
the secret store, not chats, screenshots, source files or frontend bundles.

Public prerequisites are more than credentials: the final server IP, permitted outbound TCP 25,
inbound TCP 25, validated TLS and actual delivery proof. Hetzner blocks outbound 25/465 by default;
eligibility for unblocking is account-dependent and approval is not guaranteed. An external relay
on 587 is a possible fallback with separate cost, terms and SPF alignment; it is not free ownership.

| DNS/control | Required value or decision |
| --- | --- |
| A | `mail.<chosen-domain>` points to the actual mail IPv4 |
| AAAA | Publish only after IPv6 route, PTR, TLS and delivery are tested |
| PTR / reverse DNS | Set at the server/IP provider; resolves back to the chosen mail hostname |
| MX | Each receiving domain points to the mail hostname, DNS-only |
| SPF TXT | One SPF record per sender domain authorizing the actual IP/relay; derive its final value |
| DKIM TXT | Publish public key from the server's generated selector; private key stays on server |
| DMARC TXT | Start with monitored reporting policy, align SPF/DKIM; tighten after evidence |
| TLS | Certificate for the public hostname with a tested renewal path |
| Client discovery | Optional autoconfig/autodiscover/SRV after core SMTP/IMAP acceptance |
| MTA-STS/TLS-RPT | Additional receiving transport policy/reporting after HTTPS and MX stability |

Do not replace the business domain's existing MX until migration, archive/rollback and all team
mailboxes are accepted. Separate outreach domains and, when affordable, outbound reputation from
personal/team mail. One shared-IP pilot is cheaper but shares a reputation failure domain.

## Inexpensive test matrix and gates

| Layer | Evidence required before activation | Cheap execution strategy |
| --- | --- | --- |
| Config | Exact schema, JSON duplicates, DNS injection, bounds, quotas, private permissions, no overwrite | Seven Python tests in existing pinned image |
| Prepared state | 712 definitions parse; correct password cannot bypass disabled account; disabled domain rejects recipient | Same network-none Mox container, synthetic cert |
| Protocol | TLS chain/hostname, STARTTLS/auth, sender authorization, unknown recipient, no open relay | Synthetic `.test` accounts only |
| Storage | Mailbox quota, SMTP size limit, sentinel/body equality, cross-account isolation, duplicate detection | Tiny payloads; no huge generated corpus |
| Recovery | Restart, Mox backup, verifydata, restore configuration/TLS/data, recover every sentinel | Container tmpfs and no public networking |
| App integration | Actual worker -> verified TLS SMTP -> Mox -> IMAP ingestion -> tenant inbox | Direct adapters pass; complete worker/database/inbox gate remains open |
| App failures | Revoked credentials, deleted tenant/session, RLS, suppression race, quota race, unknown acknowledgment, no replay | Deterministic service doubles plus isolated integration |
| Regression | Lint, typecheck, Vitest, backend suites, PostgreSQL/RLS, browser flows, audit | Reuse pinned images, one bounded lease at a time |
| Native clients | Android APK resource/admission/install/run; Windows/macOS packaging and real runtime acceptance | Fleet builds; platform runtime needed for each claim |
| Operations | systemd boot/restart, upgrade rollback, off-host restore, disk/queue alerts, final TLS renewal | Dedicated test target, no paid target created here |
| Live delivery | Owned/consenting Gmail/Outlook/other seeds, auth headers, placement, bounce/unsubscribe | Small approved staged canaries after credentials |

The existing 17-message/two-worker fixture does not certify 700 simultaneous users. Increase load
only when a specific bound needs evidence; do not run five browser frameworks to duplicate the
same assertion. Pin source, images and evidence; clean exact task-owned containers/tmpfs on every
outcome, preserve shared bases and persistent databases, and record free disk before/after.

## Warmup and operational ramp

Maintain a consent registry for seed addresses. Local seed accounts test plumbing and cannot
reproduce an external mailbox-provider network. Diagnose SPF/DKIM/DMARC, TLS, latency, bounce and
folder placement separately; no generated score may be presented as observed inbox placement.
Use genuine intended messages and owned/consenting diagnostics. Replies count against the same
limits as first messages. Pause on a policy failure, rising bounces or complaints; do not evade
provider limits by rotating identities. A fixed calendar cannot guarantee reputation recovery.

## Section review and remaining work

Cost: quotas dominate small-server sizing; budget is provisional until domains/backups/app hosting
are included. Design: one Mox process lowers baseline cost while shared IP/disk enlarge the failure
domain. Tests: offline assertions prove the listed scope only. Deployment: no service installed,
account activated, server purchased, DNS edited or real message sent by this packet. Application:
production composition, aggregate quotas, secret resolution and exact-source/native acceptance
remain work, not credential entry. This document must not be reported as credentials-only ready.
