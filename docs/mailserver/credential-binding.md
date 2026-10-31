> **Historical implementation and evidence snapshot.** This page records source-specific October research and test gates, not current deployment instructions or completion status. Later work supersedes its open-item lists, Resend-first decisions and fleet execution instructions. Use the [current handoff](../handoff/README.md), [mail development account](../handoff/mail-server-development.md) and [backend receipt](../completion/backend-20261030-receipt.md). Do not execute historical fleet commands; fleet-01 is off limits.

# Held account-bound mail credentials

MAIL1019a/1019b implement bounded IMAP lookup; MAIL1020a adds SMTP authorization and transport
binding. Both accept only test references. Public remote production remains held.
See [SMTP attempt binding](smtp-account-binding.md) for outbound revocation and rollback limits.

## Boundary and rotation

SQL claims return organization, mailbox and account UUIDs, account version, credential reference,
and cursor state. The resolver indexes the complete identity plus protocol; knowing a reference
alone is insufficient. Only `test:` references are currently accepted. A disabled or stale claim
fails before lookup/network. After network fetch, the ingest transaction rechecks account state
and version under the durable lock. A rotation winning that lock prevents insertion and cursor
advance; an ingest already holding it may commit before rotation. This does not make the worker
itself untrusted or prevent every pre-revocation network read.

The private UTF-8 JSON bundle has exactly `format_version: 1` and `entries`. Each entry has exactly
`organization_id`, `mailbox_id`, `account_id`, `credential_version`, `credential_ref`, `protocol`,
`username`, and `password`. Duplicate JSON keys, duplicate complete bindings, invalid identities,
unknown fields, unsupported protocols and malformed values are rejected. Maximum file size is
2 MiB; maximum entries is1,424. Username is1..254 bytes and password1..4,096 bytes; neither allows
CR/LF/NUL. Entry count and individual password limits do not override the aggregate byte limit.
Read-only/no-follow/nonblocking open is followed by descriptor checks: regular file, one link,
0600 mode and owner root or current uid. Resolution errors and inspection redact secret values.

Load once into an immutable index: O(1) per lookup and no repeated file parsing. Rotate by revoking
or advancing the SQL version, atomically replacing the private bundle, then restarting the held
worker. The intervening gap fails closed. A continuously mutable shared cache would reduce restart
work but introduce invalidation races and extra complexity. SQL remains the authority at import; SMTP has a separate final authorization fence.
The migration is reversible; rollback changes claims from seven keys to their previous three-key
shape and therefore requires a compatible application release while workers are held.

## Verified execution

Current gate: `ops/local/be02-cab695ff6bd6445d9fd4dc6b19a3165e/`.
901 tests/9,868 assertions passed, zero failures/errors/skips; twelve dedicated suites deferred.
Steep,344-file canonical lint and3-file fixture lint passed. The source manifest binds the tested
implementation. Result and cleanup receipts: `docs/completion/qa815-evidence/mail1020a-result.json`.

Coverage includes full tuple/protocol isolation, bundle/file bounds, cached lookup, IMAP rotation
and row-lock races, SMTP stale/disabled/account/sender rejection, immutable attempt identity,
migration down/up and ACLs, unknown acknowledgment without replay and tenant inbox visibility.
FIFO/wrong-owner/path-replacement races are not claimed. Whole-network IMAP deadlines and owned
socket cleanup passed in MAIL1019b and remain in the current snapshot; SQL stays outside timeout.

Exact cleanup and17 independent absence checks passed; shared bases and persistent data remain.
No real secret, public mail delivery, credential purchase or external warmup service was used.

## Remaining release work

MAIL1020b aggregate budgets, bounded scheduling, full application/native acceptance, off-host
restore, alerts and held native deployment proof remain. Production secrets, real domain DNS,
public TLS, hosting/port approval and controlled canaries come last. Private consenting seed
checks do not prove public deliverability or reproduce an external-provider warmup network.
