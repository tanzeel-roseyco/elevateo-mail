# Held account-bound mail credentials

MAIL1019a changes inbound IMAP only. Remote production stays held; the fixture SMTP profile
still resolves a fixed test reference and is not multi-tenant SMTP credential integration.

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
work but introduce invalidation races and extra complexity. SQL remains the authority at import.
The migration is reversible; rollback changes claims from seven keys to their previous three-key
shape and therefore requires a compatible application release while workers are held.

## Verified execution

Fleet evidence: `ops/local/be02-d1d4f01d583f4e90aa93a0deae34e6de/`.
Its source hash manifest binds the actual snapshot. Standard Ruby:143 suites/854 tests/9,407
assertions; Mox compatibility7/27, worker-inbox composition3/80, HTTP1/33. Combined865/9,547,
zero failures/errors/skips. Twelve dedicated suites were deferred. Steep,334-file canonical lint,
three-file fixture lint, and97 runner units passed. Units evidence:
`docs/completion/qa815-evidence/mail1019-be02-units-r1.txt`.

Tests cover tuple/protocol isolation, malformed bundle and file limits, cached lookup, credential
rotation after a real Mox fetch, SQL row-lock races, migration down/up and ACLs, unknown SMTP
acknowledgment without replay, tenant inbox visibility, and inactive-account zero-network behavior.
FIFO/wrong-owner/path-replacement-race tests are not claimed. A new whole-network deadline and
socket ownership adapter is staged separately and is not part of this successful snapshot.

Task cleanup removed five service containers, builder container/registration/cache volume, two
other disposable volumes, network and server image; both Mox containers and private fixture files
were independently absent.17 independent checks passed. Shared pinned bases and persistent data
were retained. Host bytes252,038,373,376 ->252,060,377,088: shared delta+22,003,712, not attributable
reclamation; no compaction. Earlier `be02-bf75da24bb9e42d09fcca60801f80b08` failed Steep tuple
inference; `be02-e2a6e97373f44d01aafc3261dddd1372` failed fixture lint on an unused session variable.
Both remain failed evidence. The corrected fixture separately owns and closes polling/replay sessions.

## Remaining release work

MAIL1019b: one absolute network deadline, bounded response parsing, owned socket/thread cleanup,
failure quarantine and focused stalled-server regressions. SQL transactions must never receive
an asynchronous network timeout. MAIL1020a: tenant/version-bound SMTP authorization and transport;
MAIL1020b: atomic organization/group/mailbox/domain/shared-IP/destination budgets. Then bounded
scheduling, full app/native acceptance, off-host restore, alerts and held native deployment proof.
Credentials, real domain DNS, public TLS, hosting/port approval and controlled canaries come last.
No external warmup network or public deliverability claim follows from private consenting seed tests.
