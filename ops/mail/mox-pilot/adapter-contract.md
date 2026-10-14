# MAIL-818 protocol evidence packet for SEND-821 and MAIL-819

Source inspected on 2026-10-14: Elara branch `completion-elara-send811`
`smtp_snapshot.rb`, `smtp_profile.rb`, uncommitted `smtp_transport.rb` and
`submission_result.rb`; Corin branch `completion-corin-mail819` uncommitted
`imap_ingress.rb` and `imap_worker_store.rb`; Cassian integrated source through
`apps/server/db/be03_send/worker_authority.sql`. Their uncommitted files are
live owner work and are **not** imported here. This packet proposes exact seams
for owner agreement; only the synthetic protocol fixtures in this directory
are implemented by Rhea.

## Outbound agreement requested from Elara, Cassian and SQL owner

The canonical immutable snapshot has exactly 14 positions:
`[format, organization, mailbox, draft, version, [name,sender], recipients,
subject, body, reply_id, correspondence, human_attestation, attachments,
policy_version]`. Elara's `SmtpSnapshot` accepts plaintext, zero attachments,
verified sender and at most 524288 rendered MIME bytes. SMTP envelope sender
and recipients must derive from that frozen snapshot and account binding,
never from mutable UI state. The worker's existing SQL authority and final
fence remain Elara/SQL-owned.

Current `SubmissionResult` accepts only `local:<64hex>` receipts, while
`worker_authority.sql` requires `synthetic-v1`, `simulated=true`, a `local:`
receipt and observation source `local_failure_driver`. Elara's candidate
Mailpit client also returns `local:` after SMTP 250. That is sufficient to
exercise a **simulated** test profile, but cannot identify which adapter made
the observation; SQL/profile/source must be versioned together before any
non-simulated SMTP result is wired to the worker. Proposed test-only tuple:
`profile=mailpit-smtp-test-v1`, `simulated=true`,
`source=mailpit_smtp_test_v1`, `receipt_ref=mailpit-test-v1:<64hex>` for final
250 only. This is an internal evidence digest, never a provider delivery ID.
Do not relax the existing `synthetic-v1` constraints in place or relabel
historical local observations. Cassian versions the contract; SQL owner
versions constraints; Elara owns executor selection. Until then, retain the
current driver and hold.

Remote SMTP on 465 must require validated implicit TLS; 587 must require
STARTTLS with certificate and hostname verification. Elara's held profile
represents `secret://...` but supplies no resolver. A future server-only
resolver needs account ID, immutable credential reference, version and revoked
state; the final SQL fence must reject stale/revoked versions before connection.
No secret may enter a snapshot, client, log or ordinary provider event. No
remote profile should be enabled by this pilot.

After a final SMTP 250, record accepted-as-queued only. A timeout, disconnect
or lost response around DATA is unknown and held for manual evidence; SMTP has
no generic exact-attempt lookup. The driver must not fabricate a provider
lookup from Message-ID, hash, Mailpit list or IMAP presence, and must never
auto-resubmit an ambiguous attempt. The current local Mailpit result remains
simulated even if its HTTP API later shows a stored synthetic message.

## Inbound agreement requested from Corin and Cassian

Corin's held boundary takes
`(account_id, credential_version, uidvalidity, uid, raw_mime)`. SQL maps the
server-only account ID to tenant/mailbox, checks credential version/revocation,
and commits a deduplicated message and cursor atomically. `(account_id,
uidvalidity,uid)` identifies a protocol observation; changed UIDVALIDITY
requires explicit reset/rescan, not treating old UIDs as the same messages.
The fixture's `mox-uid-evidence.json` contains only UIDVALIDITY, UID and MIME
SHA-256 for a synthetic message. It proves same-volume restart persistence
when the second probe matches; it does **not** prove tenant mapping, account
authorization, attachment quarantine, production ingress or external routing.

Corin owns network client, SQL mapping and cursor behavior. Cassian owns any
new versioned API contract; Rhea's protocol probe must not call fake ingress
or create a second inbound authority.

## Soren's isolated Docker request

Run `scripts/run-pilot.sh` only on fleet-02 under Soren's lease with the exact
Mox and Mailpit image digests in `compose.yaml` and a locally verified pinned
Python image. The internal network publishes zero ports and pulls no image.
Mox probe checks accepted SMTP/IMAP, authenticated loopback submission,
permanent and temporary failures, DATA timeout as uncertain, wrong password,
external egress denial and UID evidence across restart. Mox is then stopped;
Mailpit probe checks local SMTP 250 plus its stored recipient through the
bounded HTTP API. The script retains private receipts and verifies exact
task-owned container/network/volume cleanup. All of these checks remain
**NOT_RUN** until Soren returns an exact fleet receipt; no app SMTP adapter,
IMAP worker or external mail is exercised by this protocol fixture alone.
