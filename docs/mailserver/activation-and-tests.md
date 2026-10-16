MAIL1029/1030: the standalone held attachment scanner now scans one claimed item at a time, uses bounded idle/error backoff and redacted logs, and handles TERM/INT between bounded I/O operations. Private Storage reads/writes have aggregate deadlines, reject truncated responses and never silently retry writes. Fleet-02 gate be02-d833c3471a1e41088072711a2c02ad06 passed 179 standard suites / 1,044 tests / 12,267 assertions; combined Mox, attachment HTTP, real scanner process, API and worker checks total 1,069 tests / 12,879 assertions, zero failures/errors/skips. Steep, RuboCop401 files, Mox fixture lint10, scanner fixture lint3 and frozen-source checks passed. Twelve dedicated suites remain deferred; earlier isolated runner checks passed108. Exact cleanup and21 independent absence checks passed; the task-acquired ClamAV image was removed and shared bases/persistent data retained. Host free bytes 254192549888 -> 254206836736 (shared delta +14286848, not attributable reclamation). Production endpoints/secrets, operational supervision, outbound attachments and app/native acceptance remain: NOT credentials-only ready. No spend, live credentials, external mail, DNS or production mutation. See docs/mailserver/attachment-scanner.md.

MAIL1028: the shipped IMAP worker now loads a bounded read-once private Storage token and persists MIME attachments through real Mox into private Supabase Storage. The combined fixture proves quarantine, clean/malware verdicts, exact clean download, revoked/foreign/unauthenticated denial, and replay without duplicate records. Receipt replay restores a rewound cursor while preserving immutable IDs, metadata and lease/revocation fences; migration up/down preserves function identities and grants. Fleet-02 gate be02-04eee19050f041d9a5500c614ef3b68c passed 176 standard suites / 1,026 tests / 12,090 assertions, Mox 17/306, attachment HTTP 1/45, HTTP1/33 and send-worker2/107: combined 1,047 tests / 12,581 assertions, zero failures/errors/skips. Steep, RuboCop394 files, fixture lint10 and frozen-source checks passed;12 dedicated suites remain deferred. Runner checks passed106 in isolated Docker. Exact cleanup plus21 independent absence checks passed, and the task-acquired scanner image was removed; shared bases/persistent data retained. Free bytes 254230732800 -> 254219816960 (shared delta -10915840, not attributable reclamation). Standalone scanner runtime, production endpoints/secrets, operations and app/native acceptance remain open: NOT credentials-only ready. No spend, live credentials, external mail, DNS or production mutation. See docs/mailserver/attachment-ingress.md.

MAIL1027: deterministically rejected MIME now receives a durable, lease-fenced rejection receipt and advances the IMAP cursor, allowing later valid mail through. Accepted/rejected receipt conflicts and races fail closed; replay validates epoch, UID, digest and reason. Fleet-02 gate be02-737b22692265418e864d6a3dabb49334 passed 172 standard suites / 1,003 tests / 11,753 assertions, Mox 16/253, HTTP1/33 and send-worker2/107: combined 1,022 tests / 12,146 assertions, zero failures/errors/skips. Steep, RuboCop388 files, fixture lint7 and frozen-source checks passed;12 dedicated suites remain deferred. Runner checks passed97 tests in isolated Docker. Exact cleanup plus17 independent absence checks passed; shared bases/persistent data retained. Free bytes 254308225024 -> 254406819840 (shared delta +98594816, not attributable reclamation). No spend, live credentials, external mail, DNS or production mutation. Whole-page oversize checks can still block the page; only deterministic MIME rejections are skipped. Private attachment/scanner composition, production endpoints/secrets, operations and app/native acceptance remain open: NOT credentials-only ready. See docs/mailserver/imap-rejection-recovery.md.

MAIL1026: IMAP ingestion now parses bounded MIME once, accepts plain/HTML alternatives, converts inert HTML to plaintext and preserves original attachment bytes. The first gate exposed double charset conversion; transfer decoding now precedes exactly one charset conversion, with Latin1/Windows1252/UTF8 and attachment-byte regressions. Fleet-02 gate be02-83b8e6910fa342619dedf86e14b44a19 passed 167 standard suites / 985 tests / 11,553 assertions, Mox 15/215, HTTP1/33 and send-worker2/107: combined 1,003 tests / 11,908 assertions, zero failures/errors/skips. Steep, RuboCop380 files, fixture lint6 files and frozen source passed;12 dedicated suites remain deferred. Exact cleanup plus17 independent absence checks passed; shared bases/persistent data retained. Free bytes 252399202304 -> 252286459904 (shared delta -112742400, not attributable reclamation). No spend, live credentials, external mail, DNS or production mutation. Durable poison-message rejection is staged, untested; private attachment/scanner composition, production endpoint/secrets, operations and app/native acceptance remain open: NOT credentials-only ready. See docs/mailserver/mime-ingestion.md.

# Mox activation and inexpensive acceptance plan

MAIL1023: Bounded Drain now selects its SQL attempt profile from the actual driver and rejects absent, mutable-invalid or held Mailpit profiles before admission. Private queued Mox proof covers accepted delivery into the tenant inbox, revocation before SMTP and durable reconciliation after unknown delivery without replay. Fleet-02 gate be02-19011666e1d54de1945dcd0768421961 passed 158 standard suites / 934 tests / 10,864 assertions; Mox 10/118, HTTP 1/33 and worker entry 2/107; combined 947 tests / 11,122 assertions, zero failures/errors/skips. Steep, RuboCop 360 files, fixture lint 3 files and frozen source passed; 12 dedicated suites deferred. Initial lint-only failure was corrected and retained in evidence. Exact cleanup and 17 independent absence checks passed; shared bases/persistent data retained. Free bytes 254801207296 -> 254815674368 (shared delta +14467072, not attributable reclamation). No spend, live credentials, external mail, DNS or production mutation. Production routing/secrets, scheduled multi-account ingress, operational activation and app/native acceptance remain open: NOT credentials-only ready. See docs/mailserver/queued-transport.md.

MAIL1022: Durable mailbox rotation prevents one busy mailbox from monopolizing due-job discovery. All712 synthetic mailboxes received one opportunity before the1000-job backlog received its second; selector p95 23.04ms, maximum48.17ms, eight concurrent lookups maximum193.12ms with3s statement/1s lock limits. Fleet-02 gate be02-d1d8d767a42e44f79a8ea17f24a92e80 passed157 standard suites/927 tests/10,806 assertions; Mox10/109, HTTP1/33 and worker-entry2/107; combined940 tests/11,055 assertions with zero failures/errors/skips. Twelve dedicated suites remain deferred. Steep, RuboCop359 files, fixture lint3 files, frozen source and exact cleanup passed;17 independent absence checks passed. Shared bases/persistent data retained; free bytes254850682880 ->254832197632 (shared delta-18485248, not attributable reclamation). No spend, live credentials, external mail, DNS or production mutation. Held profile composition, production secrets, multi-account ingestion and app/native acceptance remain open: NOT credentials-only ready. See docs/mailserver/mailbox-rotation.md.

MAIL1020b / MAIL1021: Held Mox attempts now atomically reserve daily recipient budgets across organization, group, mailbox, sender domain, shared egress pool and destination domain. Unknown delivery retains charges; late-axis denial rolls back the entire reservation. Worker admission now clamps idle waits and rechecks the clock after discovery; in-flight work retains its own deadlines. Fleet-02 gate be02-43e4649a15314558bc7d7ac7a54f4310 passed: 153 standard suites/915 tests/9,911 assertions; Mox10/109, HTTP1/33 and worker-entry2/107; combined928 tests/10,160 assertions, zero failures/errors/skips. Twelve dedicated suites remain deferred. Steep, RuboCop352 files, fixture lint3 files, frozen source and exact cleanup passed;17 independent absence checks passed. Shared bases/persistent data retained; free bytes254839009280 ->254853779456 (shared delta+14770176, not attributable reclamation). No spend, live credentials, external mail, DNS or production mutation. Fair scheduling, operational activation and remaining app/native acceptance remain open: NOT credentials-only ready. See docs/mailserver/aggregate-send-budgets.md.

MAIL1020a: SMTP attempts now bind organization, mailbox, account, credential version, reference and protocol; final authorization rechecks sender/account state before the held Mox transport resolves credentials. Fleet-02 gate be02-cab695ff6bd6445d9fd4dc6b19a3165e passed: 148 standard suites/888 tests/9,621 assertions; Mox10/107, HTTP1/33 and worker-entry2/107; combined901 tests/9,868 assertions, zero failures/errors/skips. Twelve dedicated suites remain deferred. Steep, RuboCop344 files, fixture lint3 files, frozen source and exact cleanup passed;17 independent absence checks passed. Shared bases/persistent data retained; free bytes254805770240 ->254871015424 (shared delta+65245184, not attributable reclamation). No spend, live credentials, external mail, DNS or production mutation. Aggregate budgets, scheduling, operational activation and remaining app/native acceptance remain open: NOT credentials-only ready. See docs/mailserver/smtp-account-binding.md.

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
Held application attempts now reserve six budget axes atomically; activation must configure their
actual limits, validated shared egress mappings and correspondence policy before any real send.
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
| App integration | Actual worker -> verified TLS SMTP -> Mox -> IMAP ingestion -> tenant inbox | Held direct/queued composition and scheduled real-process IMAP pass with account/version-bound test credentials, six-axis budgets and tenant isolation; general MIME, attachments and production integration remain open |
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
general MIME, rejection quarantine, private attachment/scanner composition, production routing/secrets, operations and exact-source/native acceptance
remain work, not credential entry. This document must not be reported as credentials-only ready.
