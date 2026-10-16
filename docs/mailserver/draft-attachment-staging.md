# Draft attachment staging

This database slice prepares attachments for a future upload endpoint. It does not yet expose uploads to the UI or send attachments through SMTP.

## Data and authority

A reservation ledger retains immutable organisation, actor and operation identity after a draft is deleted. A separate metadata table is protected by forced row-level security and references the draft with a composite foreign key. Reservations validate fresh session scope, editable-draft ownership, bounded filename, SHA-256 identity, supported media type and the one-MiB object limit. Per-draft active limits are enforced under locks; reusing a retired operation cannot resurrect an attachment.

Reservation and finalization both take the protected-write authority path. Finalization is atomic and idempotent; repeated completion preserves the pending scan rather than resetting it. The draft-delete trigger aborts active reservations and releases active slots while preserving identity history.

## Quarantine and failure handling

Scan claims use bounded leases and three attempts. Clean, malware and failed outcomes remain distinct; an expired third claim is settled as failed. Only the claim owner can complete a live lease. These records alone do not constitute a running scanner for draft uploads.

Rollback acquires parent, ledger and metadata locks before checking that the tables are empty. Database race tests prove that an in-flight reservation cannot be silently removed by rollback. The older thread migration regression now detaches and restores the exact registered draft-attachment foreign key inside its transaction; unexpected constraints still fail closed.

## Design tradeoffs

Keeping the ledger after deletion costs a small row per operation but prevents replay/resurrection. The database owns operation identity and concurrency rather than relying on UI state. A future gateway must commit its reservation/one-shot claim before Storage I/O, perform a fresh authority check before finalization, and reconcile uncertain writes without unbounded retries. No network I/O belongs inside these database transactions.

## Validation

MAIL1032: durable draft-attachment reservations, per-draft limits, quarantine scan leases and deletion/rollback race protection passed fleet-02 gate be02-20c3f1d9302a4daa8de238792d326154: 184 standard suites / 1,065 tests / 12,666 assertions; API and worker checks bring the total to 1,068 tests / 12,806 assertions, zero failures/errors/skips. Steep and RuboCop408 files passed. Twelve dedicated suites remain deferred; this gate did not rerun the earlier Mox or scanner-process scenarios. Exact cleanup removed 12 task resources and 17 independent absence checks passed, with shared bases and persistent data retained. Host free bytes 254219001856 -> 254116356096 (shared delta -102645760, not attributable reclamation). Upload HTTP/Storage integration, outbound attachment MIME, Android runtime and remaining app/native acceptance are still open: NOT credentials-only ready. No spend, live credentials, external mail, DNS or production mutation. See docs/mailserver/draft-attachment-staging.md.

MAIL1032 adversarial review: Mira297, Ada370, Iris370, Lyra379, Mira rollback332 and Nora200 reviewer-lines, each inspection pass at most200 LOC and each assignment at most400 unique LOC. Three defects identified and repaired across1,948 reviewer-lines: density1.54 defects/KLOC (reviewer coverage includes overlap, not unique application size). Nora verified the exact draft-attachment foreign-key rollback registry after the first integration gate exposed its omission; the four RuboCop ambiguous-block findings were delegated to lint and repaired. Dedicated design review included reservation/finalization ordering, immutable operation identity and rollback locking. Final full backend gate passed1,068 tests/12,806 assertions, Steep and RuboCop408 files; no open findings in this scoped database slice. End-to-end upload and production readiness are not claimed.

## Remaining work

Wire a bounded upload endpoint and Storage gateway, prove timeout/revocation/delete races across HTTP, connect the draft scanner and UI, and validate MIME construction at the final send boundary. Enforce aggregate organisation/storage limits before activation. Android, browser and desktop acceptance remain separate gates. Live credentials and Hetzner/DNS setup stay last.
