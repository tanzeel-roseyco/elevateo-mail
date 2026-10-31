> **Historical implementation and evidence snapshot.** This page records source-specific October research and test gates, not current deployment instructions or completion status. Later work supersedes its open-item lists, Resend-first decisions and fleet execution instructions. Use the [current handoff](../handoff/README.md), [mail development account](../handoff/mail-server-development.md) and [backend receipt](../completion/backend-20261030-receipt.md). Do not execute historical fleet commands; fleet-01 is off limits.

# IMAP runtime bounds and cleanup

The held fixture uses one monotonic network deadline (default and maximum15 seconds) across
connect, verified TLS, greeting, login, select, search and fetch. SQL ingestion stays outside the
asynchronous timeout. Each operation consumes the same budget; database/application time consumes
remaining wall time but never receives the network exception asynchronously.

OwnedImapClient targets pinned net-imap0.6.7. It records the raw socket and receiver before an
interrupt can lose them, closes/shuts down the socket, then joins the receiver for0.25seconds,
kills it if necessary and joins for another0.25seconds. Failed cleanup quarantines the transport
instance; this is process-local. Socket connect/resolution use at most3seconds or half the remaining
budget. Native DNS depends on those platform timeout facilities; no hard real-time guarantee.
The parser caps a response at2MiB, search results at10,000, fetched batches at50 and MIME at1MiB.
Debug is disabled per connection even if the net-imap global default is enabled.

## Exception tradeoff simulation

If cleanup fails while handling primary, Ruby3.4.11 automatically assigns primary as cleanup.cause.
Re-raising cleanup with cause:nil does not clear an existing cause; attaching cleanup to the
original primary then raises a circular-cause error. The retained fleet runtime probe is
control/mail1019b-cause-probe.log. Raising primary.dup with cleanup as cause preserves class,
message, backtrace and instance state while changing raised object identity; the original primary
remains at the tail of the cause chain. Identical exception objects use a separate guard.
Closing and receiver cleanup use ensure so a socket error cannot skip receiver termination.

## Verified acceptance

MAIL1019b: Bounded IMAP networking and owned socket/receiver cleanup passed fleet-02 gate be02-71155e5ff2f84877a58056c82334d909. Standard Ruby145 suites/870 tests/9,501 assertions; real Mox10/107, HTTP1/33 and worker-entry2/107: combined883 tests/9,748 assertions, zero failures/errors/skips. Twelve dedicated suites remain deferred. Steep, canonical RuboCop339 files, fixture lint3 files, frozen-source verification and exact cleanup passed;17 independent absence checks passed. Shared bases and persistent data retained. Host free bytes254795493376 ->254793297920 (shared delta -2195456, not attributable reclamation). No spend, live credentials, external mail, DNS or production mutation. SMTP identity binding, aggregate budgets, scheduling, operational activation and remaining app/native acceptance remain open: NOT credentials-only ready. See docs/mailserver/imap-runtime-bounds.md.

New tests cover shared budget exhaustion, database work outside asynchronous interruption,
fetch failure without partial durable insertion, login/session/constructor cleanup double faults,
implicit/explicit cause retention, socket close failure and unjoinable receiver quarantine.
Real TLS sockets cover stalled handshake/greeting/login/search, peer EOF and descriptor/thread
counts, interrupted constructor after receiver creation, and an oversized declared literal.

Failed gates are retained: be02-3915e733b03d4ad2b555930b4aa4ffc8 (mock import/cause cycle),
be02-76d37e0792624d8bb3f1a7a561c3bec6 (implicit cause cycle), and
be02-cc6bcd947c064b2493ddd5722e3c3539 (redundant EOFError rescue lint). Final pass supersedes them.
No frontend changes; its prior867 Vitest/coverage/lint/typecheck/build evidence is historical.
This change does not certify Android, desktop, public mail or deferred suites.
