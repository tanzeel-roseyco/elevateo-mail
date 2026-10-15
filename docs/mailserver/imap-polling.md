# Scheduled held IMAP ingestion and worker runtime

MAIL1024 / MAIL1025 prepare automatic mailbox discovery and a separate worker process for the
private Mox test profile. Fleet-02 gate `be02-582d931978bb4c6885a8102e88266fa8` passed 982 tests / 11,752 assertions, with Steep, canonical and fixture lint, frozen source and exact cleanup. Twelve dedicated suites remain deferred. Production activation remains held. See [source-bound result](../completion/qa815-evidence/mail1025-result.json).

## Account admission and consistency

Migration 025 adds opt-in polling, a due time, capped failure count and a three-field lease.
Every existing account starts with polling disabled. One SQL call selects an eligible account,
ordered by due time and ID, with `FOR UPDATE SKIP LOCKED`; it returns account/version/token only.
API and read roles cannot invoke the worker functions or read secret references through this path.
The worker reclaims expired leases; it does not create a thread or database pool per mailbox.

Account claim, UIDVALIDITY reset, plaintext import and attachment import all carry the same lease.
The old function signatures remain available only for accounts outside scheduled polling. Their
renamed core implementations lose worker/public access. Authorization locks the account before
checking wall-clock expiry; transaction-start time cannot extend a lease while waiting for a lock.
Each authorized operation renews the 120-second lease. Changing account activation, polling,
credential reference/version, organization or mailbox invalidates ownership and resets scheduling.
A stale worker cannot import, finish, or rewrite the new owner's schedule.

Each poll processes at most 50 ordered UIDs, each with at most 1 MiB raw MIME. The complete page
is validated before its first import. PostgreSQL owns receipt/cursor atomicity and replay checks.
A full successful page schedules another opportunity after one second; a partial/empty successful
page waits 60 seconds. Failures increase the per-account delay from 30-35 seconds to at most 900
seconds, with jitter until the cap. Successful completion clears failures and all lease fields.
Rollback refuses any outstanding token; operators must quiesce and invalidate leases deliberately.
No database transaction remains open while IMAP or private object storage performs network I/O.

## Process entrypoint and limits

`apps/server/bin/inbound-worker --once` handles one admitted account or an idle result and exits.
`--run` continues until INT/TERM requests shutdown. Other arguments fail. The shared typed runtime
configuration must remain local, outbound-held and `elevateo_worker`; the extra profile must be
`mox-imap-test-v1`. Absolute bounded credential-bundle/CA paths are mandatory. Credentials are
resolved from the validated tuple-bound private bundle. This is not a production endpoint loader.

The process has one ActiveRecord connection, with 5-second connect/checkout limits, a 3-second
statement limit and 1-second lock limit. It verifies actual SQL session identity before every poll.
A fresh verified-TLS transport per attempt prevents a previous cleanup failure permanently poisoning
later attempts. IMAP networking retains the separately tested absolute deadline/owned cleanup.
The connection pool closes on exit; cleanup failure returns a nonzero exit status.

Idle waits are one second; successful work yields 50 ms before another admission. Process-level
errors back off 1, 2, 4, 8, 16, then 30 seconds, independently of SQL's per-account schedule.
Success resets process backoff. Waits check the stop flag at most every 100 ms. A stop received
during a poll allows that operation to finish and admits no next poll. A blocked operation still
has its own deadlines; this is not a measured whole-process shutdown deadline.

Logs contain only fixed event/result labels, elapsed milliseconds, retry delay and `simulated:true`.
Repeated outcomes log at most once per minute; changes log immediately. Provider exception text,
addresses, message bodies and credential paths are excluded. Logging failure propagates to a
nonzero process result; failures are never silently treated as successful polls.

## Test coverage and evidence limits

The targeted cases cover denied roles/core functions; absent/stale/expired/rotated leases; time
checked after a blocked row lock; concurrent selectors; complete lease clearing; capped backoff;
UIDVALIDITY resets; duplicate/plain/attachment transactions; guarded migration reversal; malformed
SQL responses; and 0/1/50-event batches. New process units cover configuration/path boundaries,
immutable configuration, once-mode outcomes, stop timing, backoff/reset and log throttling.

The private Mox fixture supplies two synthetic accounts and foreign-tenant denial checks, verified TLS
SMTP/IMAP, the real worker SQL role and inbox queries under each tenant. The process acceptance
exercises continuous import, TERM/INT at idle, one-shot restart without duplicate receipts, rejected
configuration and a missing CA path. Missing-CA rejection is a setup failure test, not an additional
certificate/hostname-rejection proof. Existing transport tests own those TLS negative controls.
The signal fixture proves idle shutdown; it does not prove OS interruption during active import.
Its child deadline is 30 seconds; output is bounded to a 64 KiB pending buffer and 64 JSON events.
A regression rejects event 65 even when it appears in the final output chunk.

## Design review and cost simulation

Cato recommended a dedicated process/pool instead of reusing the send-worker's raw PG connection:
the IMAP SQL adapters require ActiveRecord query/bind semantics. One process uses one DB slot;
712 per-account processes would impose at least 712 pools and idle runtimes. Fresh transport
allocation is minor compared with network setup and permits recovery after poisoned cleanup.
Signal handlers set a flag only; they do not attempt network/SQL cleanup inside the signal handler.

Selene's prior sizing exercise estimates 712 operations at five seconds each: 59m20s serial or
29m40s with two workers. At the 15-second network deadline the arithmetic is 178/89 minutes.
These are scheduling bounds for planning, not measured mailbox freshness or public throughput.
Fifty 1 MiB payloads mean up to 50 MiB of raw strings before parser/encoding/object overhead;
this is not an RSS cap. Start with bounded workers and measure lag/memory before increasing them.

Section review: SQL retains durable scheduling and fencing; runtime uses one bounded connection;
fixtures establish held local behavior only; operations still need supervision and deployment proof.
Root authored implementation inline. Advisers reviewed bounded passes without editing or testing.
No dependency, paid target, public listener, live credential, external mail or DNS change was added.

## Remaining work

General MIME/HTML-to-plaintext handling and quarantine behavior for poison messages; authorized
private attachment staging/scanning in this worker; production endpoint/secret loading; operational
supervision, alerts and off-host recovery; and final app/native acceptance remain open. Do not report
this checkpoint as credentials-only readiness or public mail delivery approval.
