# Local restore verification

The Docker backend suite automatically includes `tests/restore.test.ts`. It uses synthetic data and Miniflare's persisted D1 binding, with no cloud credentials or live email. No new dependency is needed.

The drill closes the database writer, copies the persistence directory into a backup, restores a separate copy, and opens it without migrations or reseeding. It invokes the existing `prepareRestoredDatabase` safety step before using the restored database.

Assertions prove that two owners can retain distinct mailboxes and send requests with identical local IDs/idempotency keys; retries return their original requests; changed content under an old key is rejected; a foreign owner cannot cancel another owner's request; and a restored suppression still blocks approval for its owner without blocking another owner. Dispatch remains paused. The existing `recovery.test.ts` separately covers stale in-flight claims becoming unknown after restore.

Run through the project's Docker backend check, not on the host. This slice has not independently run that check; the integration task records execution evidence. Temporary synthetic source, backup and restored directories are removed after the test, including failure cleanup.

This is a cold local physical-backup drill, not a production D1 export/import or Time Travel rehearsal. Production backup retention, independent recovery access, cloud restore execution, session invalidation, encrypted-secret key recovery and provider reconciliation still need an operator runbook and credentialed rehearsal. Never copy a running SQLite persistence directory and assume it is consistent. Never resume dispatch merely because the database opened successfully.
