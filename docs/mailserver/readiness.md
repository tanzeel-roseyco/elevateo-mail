# Low-cost self-hosted mail readiness

MAIL1019b: Bounded IMAP networking and owned socket/receiver cleanup passed fleet-02 gate be02-71155e5ff2f84877a58056c82334d909. Standard Ruby145 suites/870 tests/9,501 assertions; real Mox10/107, HTTP1/33 and worker-entry2/107: combined883 tests/9,748 assertions, zero failures/errors/skips. Twelve dedicated suites remain deferred. Steep, canonical RuboCop339 files, fixture lint3 files, frozen-source verification and exact cleanup passed;17 independent absence checks passed. Shared bases and persistent data retained. Host free bytes254795493376 ->254793297920 (shared delta -2195456, not attributable reclamation). No spend, live credentials, external mail, DNS or production mutation. SMTP identity binding, aggregate budgets, scheduling, operational activation and remaining app/native acceptance remain open: NOT credentials-only ready. See docs/mailserver/imap-runtime-bounds.md.

MAIL1019a: Account/version/protocol-bound IMAP credentials and durable revocation passed the fleet-02 gate be02-d1d4f01d583f4e90aa93a0deae34e6de. Standard Ruby: 143 suites, 854 tests/9,407 assertions; real Mox compatibility 7/27 and worker/inbox composition 3/80; HTTP 1/33, totaling 865 tests/9,547 assertions with zero failures/errors/skips. Twelve dedicated suites are deferred. Steep, canonical RuboCop (334 files), fixture lint (3 files), and 97 runner units passed. Exact cleanup and 17 independent absence checks passed; shared bases and persistent data retained. Host free bytes rose22,003,712, a shared-host delta, not attributable reclamation. No spend, real credentials, external mail, DNS or production mutation. The timeout adapter remains under review and is excluded from this passing snapshot; SMTP identity binding, aggregate budgets, bounded scheduling, operational activation and app/native acceptance remain open. NOT credentials-only ready. See docs/mailserver/credential-binding.md.


## Scope and identity

Owner: primary Codex agent, running in Orca on Windows; fleet-02 owns every Docker operation.
Research advisers: Aster (cost/licensing) and Selene (delivery design), requested gpt-6.1-sol/low.
The main agent implements inline. No paid infrastructure, credentials, DNS, real mail or public listeners.
Runtime model/billing tier is not independently exposed by the shell.

User quantity clarification is pending: 500 messages/day plus 200 diagnostics/day differs from
500 sending accounts plus 200 diagnostic accounts. Prepare both scenarios; do not equate them.
Capacity acceptance targets 700 synthetic account definitions and a bounded active subset before
increasing concurrency. Account count alone cannot establish production throughput or disk needs.

## Selection and tradeoff review

Mox v0.0.17 is the provisional choice: MIT, one Go executable, SMTP/IMAP, message API and webhooks.
Keep Rails/PostgreSQL authoritative for application permissions, scheduling, consent and suppression.
Avoid a second groupware UI/database cluster. Native Linux deployment follows upstream guidance;
Docker is for private tests. Do not modify upstream cryptography, authentication or spam checks.
Stalwart Community is the fallback if verified Mox account administration cannot meet the integration
contract. Its AGPL obligations and enterprise-only features must be considered before adoption.
mailcow's default 6 GiB minimum is an unattractive baseline for this application's cost target.

Tradeoff simulation: the actual plan uses MiB quotas: 700 times 50 MiB plus twelve times 250 MiB
is 37.11 GiB. Add Mox's documented ~15% metadata, 10 GiB OS/queue reserve and 20% free space:
65.84 GiB minimum disk. An 80 GB decimal disk is 74.51 GiB; a 40 GB disk fails this budget.
This excludes application data and backups; doubling mailbox quotas requires a new capacity plan.
No mailbox polling process per account: bound connections and rotate active mailboxes through workers.
Do not lower password hashing, disable TLS, remove sender authorization or skip backups to save cost.

## Budget, verified 2026-10-16

EU Hetzner server price + IPv4 + automatic server backup, excluding VAT:

| Profile | Server | RAM / disk | Approx. monthly subtotal |
| --- | --- | --- | --- |
| Private pilot / low message volume | CX23 | 4 GB / 40 GB | EUR 7.09 |
| Light-account candidate, capacity not certified | CX33 | 8 GB / 80 GB | EUR 10.69 |
| More disk / concurrency candidate | CX43 | 16 GB / 160 GB | EUR 19.69 |

These exclude application hosting, domains, separate backup storage, relay fees and additional disk.
Volume data is excluded from Hetzner server backups. Extra storage needs a separately verified quote
and backup plan. These are planning estimates, not purchases or promised availability.

## Warmup scope

Instantly documents exchanges, opens/replies and spam-folder recovery among participating accounts;
Smartlead documents volume ramps and reply settings. Their private networks are not reproduced by
putting 200 accounts on one server. Private local tests establish protocol correctness, not reputation.
Implement consented seed diagnostics and progressive sending: mailbox/domain/IP/destination quotas,
shared accounting for replies, suppression immediately before dispatch, and pauses on sustained errors.
Keep SMTP accepted, delivered, bounced, inbox, spam and unknown separate. Never fabricate placement
scores or simulate engagement against unwilling recipients. Live diagnostics stay disabled until
owned/consenting seed accounts and sending domains have passed activation checks.

## Acceptance sequence

1. Inspect the exact released image/package with REA; record hashes, architecture and provenance.
2. Run private Docker fixture with no host ports and no external route; observe version and resources.
3. Prove TLS/authentication, SMTP-to-IMAP sentinel retrieval, negative cases, restart and restore.
4. Exercise real `serve` policy separately: localserve intentionally catches unknown recipients and
   loops outgoing delivery, so it cannot certify anti-relay behavior or production account isolation.
5. Measure account provisioning, bounded connections, mailbox storage and queue recovery; report
   measured workload and limits rather than extrapolating from idle RAM.
6. Connect existing Elevateo SMTP/IMAP adapters, verify ownership, consent, suppression, retries and
   ambiguous acknowledgments, then run regression and browser acceptance on the exact source state.
7. Finish native-app and remaining application gates; record each independently.
8. Activation: actual server/IP, SMTP eligibility, domain ownership, PTR/DNS/TLS, backup destination,
   credential injection, consented live delivery/restore and ongoing reputation observation.

## Evidence and gaps

The new MAIL1017 evidence supersedes source-only assumptions only within its tested scope:
712 disabled definitions parse; 700 synthetic accounts/passwords provision; eight active accounts
and two workers exchange seventeen messages; TLS, sender/recipient isolation, quota/size refusal,
restart and full configuration/data/TLS restore pass. The measured peak is 356 MiB and median local
round trip is 213 ms. This is not a test of 700 simultaneous users or public-provider delivery.

Five actual application adapter compatibility tests pass (18 assertions), plus six TLS IMAP tests
(34 assertions), six IMAP synchronization tests (34 assertions), whole-server Steep and affected-file
RuboCop lint. Fixed typed UID search serialization: a quoted string was rejected by Mox, whereas a
Net::IMAP::SequenceSet sends the correct wire criterion. MAIL1018 additionally proves the held
approval/worker/receipt/Mox/IMAP/database/inbox composition (3 tests/74 assertions), including
unknown acknowledgment without replay, revocation before I/O and foreign-tenant isolation.
The full gate totals 843 tests/9,029 assertions; twelve dedicated suites remain deferred.
See [runtime evidence](runtime-evidence.md) for exact source and acceptance boundaries.

The held fixture has versioned receipt/profile storage. Production composition, tenant-bound secret resolution,
atomic aggregate sending budgets and native client acceptance remain implementation work.
Credentials are not the only live prerequisite: Hetzner SMTP unblocking is account-dependent;
public DNS/TLS/IP reputation and actual provider delivery cannot be proven inside an offline fixture.

## Primary sources

- https://www.xmox.nl/install/
- https://www.xmox.nl/faq/
- https://www.xmox.nl/features/
- https://github.com/mjl-/mox/tree/v0.0.17
- https://docs.mailcow.email/getstarted/prerequisite-system/
- https://www.stalw.art/compare/
- https://docs.hetzner.com/general/infrastructure-and-availability/price-adjustment/
- https://docs.hetzner.com/cloud/servers/faq/
- https://docs.hetzner.com/cloud/volumes/overview/
- https://help.instantly.ai/en/articles/5975329-how-warm-up-works-and-why-it-s-important
- https://helpcenter.smartlead.ai/en/articles/52-how-to-enable-ai-email-account-warm-ups
