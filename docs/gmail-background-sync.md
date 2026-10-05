# Background Gmail sync

`runGmailSchedule(db, runtime)` performs up to two mailbox pages per invocation. It runs in the cloud, so an enabled deployment does not depend on an open desktop app. Each page remains capped at 25 messages. It does not send mail or infer marketing consent.

Integration: apply migration 0014, create the existing optional Gmail runtime in the Worker's scheduled handler, and await this function only when the runtime is enabled. Configure a once-per-minute cron during final deployment. No credentials or deployment settings are included here. Keep existing dispatch work independently awaited so a Gmail failure does not suppress dispatch.

The database records due times, ten-minute leases, unique lease tokens and a small failure counter. Competing cron runs acquire leases conditionally; stale completions cannot clear a newer lease. Gmail's existing cursor and credential revision checks protect simultaneous manual sync and revocation. Revoked or disconnected mailboxes are excluded before claiming, and the runtime checks again before reading.

Healthy mailboxes with more work become due after a minute; caught-up mailboxes after five minutes. Failures retry after two minutes, increasing to at most an hour. Only the fixed `sync_failed` diagnostic is stored. Two page calls start independently, so a slow mailbox cannot prevent the other starting. HTTP calls have existing ten-second timeouts; the ten-minute lease exceeds the bounded page's normal request budget. Worker interruption leaves an expiring lease for retry.

This is deliberately a low-cost polling baseline, not instant delivery. With 100 continuously busy mailboxes and two pages per minute, each mailbox gets roughly one page every 50 minutes. Initial imports may take considerably longer. Higher polling throughput, Gmail push notifications, desktop notifications and deployment-specific budget measurements remain separate work. No fixed monthly price is claimed. The existing pilot mailbox cap bounds schedule discovery; reevaluate this query and concurrency before increasing that cap.

Validation uses real local D1 fixtures and fake provider calls in Docker. Tests cover persisted due times, revocation, sanitized backoff/recovery, overlapping ticks and stale lease completion. Production credentials remain last.
