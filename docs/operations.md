# Operating Elevateo Mail

This is an implementation runbook, not evidence of a deployed service. Credentials and live-provider checks come last. Do not enable dispatch just because a build passes.

## Check the service

The authenticated Overview shows send counts and three shared scheduler checks: send scheduling, inbox scheduling and expired sign-in cleanup. A successful check means the scheduler returned successfully; it does not prove delivery or that a particular inbox is current. Read mailbox sync status and individual send outcomes separately.

Checks older than three minutes show no recent check-in. Failed checks need investigation. The UI refreshes on user action or its existing visibility refresh; it does not run a continuous monitoring loop. An unavailable API cannot alert through its own page. Independent uptime alerts are still a launch gate.

Expired sessions, OAuth attempts and native draft tickets are deleted in bounded batches of 100 per table each minute. Messages, consent, suppression, credentials and delivery evidence are not deleted by this task. Retention and user deletion need a separate policy.

## Stop sending first

Set the deployment dispatch pause and the database runtime pause before investigating inconsistent delivery. Stop queue consumers and scheduled jobs before a restore. Existing provider requests cannot be recalled; their result may remain unknown. Never release an unknown reservation or create a replacement send merely to clear an error.

For one account, pause affected campaigns and revoke the affected mailbox's sending permission. Keep immutable send IDs, provider receipt IDs, timestamps and status transitions. Do not copy email bodies, bearer tokens or API keys into diagnostic reports.

## Restore safely

1. Stop all writers, queue consumers and scheduled jobs. Keep the production service paused. Take a consistent provider-supported backup; the local test's closed SQLite copy is not a cloud backup procedure.
2. Restore into an isolated target with live sending disabled. Preserve the original database and evidence until recovery is verified.
3. Run `prepareRestoredDatabase` before accepting traffic. It pauses dispatch, clears restored login sessions/OAuth/native tickets and old job status, and marks previously dispatching sends unknown. A snapshot can otherwise resurrect a session revoked after the backup.
4. Confirm the schema matches the application. Verify owner isolation, suppression records, immutable send IDs and quota reservations. The Docker cold-restore test covers these core records.
5. Recover encryption keys from separately protected operator storage. Confirm decryption with controlled records without printing secrets. A database backup alone cannot recover encrypted provider access.
6. Reconcile every possibly sent request with provider evidence. Reconcile consent withdrawals and suppressions since the snapshot from independent evidence before enabling outreach; absence from an old backup does not mean consent exists.
7. Require fresh sign-in. Reconnect revoked/rotated provider credentials as necessary. Recheck scheduled campaigns and external queues against restored state before resuming them.
8. Resume a controlled test mailbox first, then explicitly approved production traffic. Record the recovery point, unresolved requests and observed recovery time.

The application does not yet provide a cloud restore command, independent suppression journal or tested key-recovery procedure. These steps are acceptance requirements, not completed automation.

## Credentials-last acceptance

Use a staging domain/subdomain and consenting test addresses. Configure Google app identity and mailbox OAuth, server encryption keys and the minimum provider bindings. Each user supplies their own optional provider key through the private connection flow. Keep secrets out of chat, source and browser storage.

Verify login/logout, account isolation, inbound sync, one manual Gmail reply, one opted-in Resend send, unsubscribe, provider events, revoke and recovery. Then verify unknown-result behavior without repeated sending. Keep campaign sequences disabled until reply detection passes live acceptance for every enabled campaign transport; implemented Resend receiving requires its own approved subdomain and signed endpoint configuration. Never change root MX for elevateoco.com, boltloop.co or flooda.co.

Before launch, record actual provider approval, production quota policy, backup recovery, Windows/macOS installation checks, realistic load results and hosting charges. The under-A$15 target is not yet measured or guaranteed.
