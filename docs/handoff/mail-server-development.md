# How the mail servers were developed

This account explains the implementation and its evidence. Use the [handoff](README.md) for setup, approval gates and current open items. Tanzeel did the bulk of development. Jeison and Tanzeel maintain it together; Callum decides which updates happen and reviews and approves them. Historical agent rosters describe research assignments, not current ownership.

No infrastructure was accessed for this documentation audit. fleet-01 is read-only and off limits. Historical fleet commands below the linked research banners are not instructions to run them.

## Decisions and development sequence

The [earlier delivery proposal](../mail-delivery-and-hosting.md) selected Resend to avoid operating a mail server. It treated Supabase as application database, auth and storage, not SMTP/IMAP. It considered Postfix/Dovecot unnecessary for that earlier scope. The later self-hosted investigation changed that direction; Resend now remains an optional application transport.

The [research roster](../mailserver-rd-roster.md) and [research notes](../history/mailserver-rd/notes/team.md) separated cost/licensing, protocol integration, recovery and operational questions. The [selection record](../mailserver/readiness.md#selection-and-tradeoff-review) chose Mox v0.0.17 provisionally because it was an MIT-licensed single Go executable with SMTP/IMAP, a message API and webhooks. Rails/PostgreSQL retained application authorization and scheduling. The record considered Stalwart Community a fallback if account administration failed the integration contract, with licensing/feature constraints to assess; mailcow's documented memory baseline was unattractive for the cost target. These are recorded selection reasons, not a fresh vendor or pricing comparison.

Three directories preserve different stages:

| Source | Role and boundary |
| --- | --- |
| [ops/mail/mox-pilot](../../ops/mail/mox-pilot/README.md) | Isolated localserve protocol pilot and [adapter contract](../../ops/mail/mox-pilot/adapter-contract.md). Localserve loops delivery and cannot establish production relay policy. |
| [ops/mailserver](../../ops/mailserver/) | Disabled-account planner and isolated real-serve, SMTP/IMAP, runtime and application fixtures. The prepared 712-account plan is not a concurrent-user capacity result. |
| [ops/selfhosted-mail](../../ops/selfhosted-mail/README.md) | Held configuration, DKIM and TLS preparation for a real server. Its separate-host workflow predates the consolidated [production Compose](../../ops/production/compose.yaml). Generating files does not authorize DNS or activation. |

The current production route is distinct from the test fixture route. [ProductionMoxProfile](../../apps/server/lib/elevateo/send_worker/production_mox_profile.rb) validates the hostname and verified sender domains. [ProductionMoxTransport](../../apps/server/lib/elevateo/send_worker/production_mox_transport.rb) uses authenticated SMTP on port 587 with required STARTTLS, system roots and hostname verification. The [send worker](../../apps/server/bin/send-worker) selects `mox-smtp-v1`; production IMAP uses `mox-imap-v1` on port 993. The [production transport receipt](../completion/selfhosted-transport-20261023.md) records this transition and its original failed and passed gates. The later backend receipt supplies the subsequent isolated protocol evidence.

## Account binding and dispatch

SMTP authorization binds organization, mailbox, account, credential version, credential reference and protocol to the immutable attempt. SQL checks account/sender authority at the final authorization fence. A private credential Bundle resolves that exact tuple before connection; production references use the `secret:` namespace, while fixture references are separate. Rotation after the final fence cannot retract bytes already authorized for submission. See [SMTP binding](../mailserver/smtp-account-binding.md), [credential binding](../mailserver/credential-binding.md) and [production transport](../../apps/server/lib/elevateo/send_worker/production_mox_transport.rb).

Queued execution selects the stored SQL profile from the actual driver and rejects incompatible profiles before admission. An exception after SMTP DATA might have begun becomes durable `unknown`. SMTP acceptance is not delivery, and missing acknowledgment does not permit automatic resubmission. See [queued transport](../mailserver/queued-transport.md) and the production transport's `observation` and `deliver` methods.

## IMAP polling and recovery

Polling is explicitly enabled per account. Due accounts receive bounded leases; identity/version changes and expired leases fence stale workers. The worker uses verified TLS, UIDVALIDITY and UID cursors, processes at most 50 messages per batch, and validates the whole returned page before committing its first message. A changed UIDVALIDITY starts a new cursor epoch. See [polling design](../mailserver/imap-polling.md) and [ImapSync](../../apps/server/lib/elevateo/inbound/imap_sync.rb).

Accepted message receipts prevent duplicate imports and support cursor recovery. A deterministic MIME rejection records the account/version/epoch/UID, digest and reason, then advances the cursor so a later valid message can arrive. Transient failures are retried; they are not classified as malformed mail. Whole-page oversize failures can still block a page. See [rejection recovery](../mailserver/imap-rejection-recovery.md). [Runtime bounds](../mailserver/imap-runtime-bounds.md) records bounded network operations and owned-socket cleanup; it does not establish an unconditional whole-process deadline.

## MIME and attachments

[ImapMimeParser](../../apps/server/lib/elevateo/inbound/imap_mime_parser.rb) parses once, prefers plaintext from supported alternatives and converts HTML to inert text. It does not render message HTML or fetch its URLs. Raw MIME is bounded to 1 MiB; decoded text and each supported attachment are bounded to 262,144 bytes. [ImapMimeTree](../../apps/server/lib/elevateo/inbound/imap_mime_tree.rb) limits depth and part count. Unsupported structures/types are rejected rather than silently dropped. See [MIME evidence](../mailserver/mime-ingestion.md).

Transfer decoding precedes exactly one charset conversion for body text. Attachment hashes and sizes describe original transfer-decoded bytes, not transcoded text. The evidence records an actual double-conversion failure and its regression repair. Supported attachment media types in this parser are PDF, PNG, JPEG and plain text.

Inbound attachments enter private quarantine storage. Replay keeps immutable attachment IDs and metadata. A duplicate storage response is accepted only after authenticated readback verifies the exact bytes. Scanner verdicts gate clean download; malware and failed scans remain held. Download authorization is checked independently of knowing an object identifier. See [attachment ingress](../mailserver/attachment-ingress.md), [scanner process](../mailserver/attachment-scanner.md), [storage implementation](../../apps/server/lib/elevateo/attachments_worker_storage.rb) and [scan loop](../../apps/server/lib/elevateo/attachments_scan_loop.rb).

Draft attachment reservation was developed separately from inbound ingestion. Its [historical staging receipt](../mailserver/draft-attachment-staging.md) predates the implemented [upload gateway](../../apps/server/lib/elevateo/draft_attachment_gateway.rb). Do not infer that production Mox outbound attachments work from successful inbound attachments: the production transport receipt explicitly excludes them.

## Send budgets and scheduling

The held Mox path added atomic UTC-day recipient reservations across organization, group, mailbox, sender domain, shared egress pool and destination domain. Locks have fixed ordering; denial on any axis rolls back the whole reservation. Unknown sends retain their charge. See [aggregate budgets](../mailserver/aggregate-send-budgets.md). Current pilot ceilings are configured separately through mailbox/user limits in the [environment template](../../.env.production.example); the default hold still prevents live dispatch.

Durable mailbox rotation gives each due mailbox a discovery opportunity before a busy mailbox repeats. The [rotation evidence](../mailserver/mailbox-rotation.md) measured 712 synthetic mailboxes, selector p95 23.04 ms and eight concurrent lookups. These are discovery measurements, not proof of public mail throughput, deliverability or 700 active users. The [warmup proposal](../operations/email-warmup-strategy.md) is historical and does not authorize a ramp or override budgets.

## What the recorded tests establish

| Evidence | Verified scope | Limit |
| --- | --- | --- |
| [MAIL1017 runtime](../mailserver/runtime-evidence.md) | Real Mox serve in a network-disabled fixture; 700 provisioned synthetic accounts, eight active accounts, two workers, 17 messages; TLS, authentication/isolation, quota refusal, restart and restore. | Not 700 concurrent users, public DNS, real delivery or reputation. |
| [MIME recovery](../mailserver/imap-rejection-recovery.md) | Rejected message followed by valid mail, durable receipt/cursor and replay fencing. | Oversized page handling can still block ingestion. |
| [Attachment ingress](../mailserver/attachment-ingress.md) | Real Mox to private Storage, quarantine, clean/malware verdicts, exact clean download, revoked/foreign/unauthenticated denial and replay. | Isolated infrastructure; not company storage/credential acceptance. |
| [Backend completion receipt](../completion/backend-20261030-receipt.md) | 1,285 standard tests/14,595 assertions; 46 migrations; dedicated database gates; real Ruby-to-Mox protocol 4 tests/412 assertions; application chain 1 test/88 assertions; encrypted six-volume restore. | Source-specific local Docker evidence. No production deployment, external mail or live authentication/deliverability claim. |

The backend receipt's Resend wire test used six loopback HTTP calls and zero live provider calls. Its restore drill took 44.57 seconds locally; off-host SFTP connectivity and the existing Authentik registration were not exercised. Historical results are not a new test run of this documentation branch.

## Git checkpoints

These abbreviated commits were checked in local history. Inspect a checkpoint with `git show --stat COMMIT`, replacing `COMMIT` with its identifier; use `git show COMMIT -- PATH` for its actual patch.

| Commit | Recorded change |
| --- | --- |
| `8c942403` | Private real-Mox capacity and adapter compatibility evidence. |
| `9c7c0ac0` | Held worker and tenant inbox integration. |
| `bf858a0b` | Account/version-bound IMAP credentials. |
| `23a77e1d` | Immutable SMTP credential binding. |
| `278a2fc6` | Atomic send budgets and bounded worker admission. |
| `3a95bbe2` | Queued transport profiles and Mox reconciliation. |
| `76aae4c6` | Scheduled polling and bounded inbound worker. |
| `d4a5ccee` | Bounded MIME and charset-byte handling. |
| `94e8afbe` | Durable malformed-MIME rejection. |
| `d02ff36f` | Private attachments and replay recovery. |
| `177c4d26` | Held self-hosted preparation and production initialization, including the distinct production transport. |

## Remaining proof and change ownership

Company host/IP/provider, domain authority, public TLS renewal, permitted SMTP networking, off-host restoration, live account provisioning and consented provider delivery need deployment-specific evidence. Local fixtures cannot prove inbox placement, reputation, sustained capacity or production recovery time. No historical source authorizes buying infrastructure, editing DNS/MX, releasing the hold or sending a canary.

Jeison and Tanzeel should reproduce the affected bounded tests on the accepted release commit, document rollback and unresolved limits, and submit the proposed update to Callum. Callum decides whether the update proceeds and approves each outward-facing or irreversible step through the [handoff gates](README.md). Resolve infrastructure unknowns through that guide's TO CONFIRM register before the dependent step.
