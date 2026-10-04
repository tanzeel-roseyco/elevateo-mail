# Backend design research — 4 October 2026

Research proposal; backend standards still require approval. No deployment or DNS changes are proposed. Obsidian connection was unavailable; the explicit capacity and cost simulations below substitute for a connected tradeoff simulation.

## Recommendation and boundaries

For ten users and the hard target below A$15/month, start with a strict TypeScript modular monolith on Cloudflare Workers Paid, D1, Queues, and R2, conditional on a measured storage/load envelope. Keep API and background consumers separately deployable from one repository. Hosted workers continue when Windows is off. PostgreSQL is the scale-oriented alternative once its hosting/backup bill is funded. Avoid Kafka, Redis, independent microservices, and external search initially. This budget does not support a bespoke high-availability promise.

Preserve `MailroomGateway` as the frontend boundary. Proposed backend modules: contracts/domain, application commands, repositories, provider adapters, and jobs. Mailbox sync, campaign orchestration, delivery adapters, and reporting own separate concerns but share transactions. Authentication and tenant authorization apply to every API and worker lookup. Validate API inputs and webhook signatures; put credential access in one typed configuration module, encrypt OAuth refresh tokens, and redact credentials and message bodies from logs.

Model mailbox separately from sender alias: nine aliases do not imply nine licensed inboxes or nine independent quotas. Store workspace, membership, mailbox, sender identity, consent/suppression, immutable campaign version, send intent, attempt, receipt, outbox, sync cursor, and audit event. Suppression applies across the workspace; never expose it across unrelated workspaces. Unique keys cover mailbox/provider message ID and campaign-version/recipient/step. Approval binds content, recipients, and sender identity. `POST /send-intents` returns an ID; accepted, delivered, bounced, failed, and unknown are distinct. Cursor pagination and explicit errors prevent UI ambiguity.

Each user owns their OAuth, Hunter/AMF, and AI connection credentials. Encrypt server-required credentials with versioned per-user data keys wrapped by an operator-owned deployment secret; document operator access and rotation. Account subscription sessions stay local unless official delegated authentication explicitly permits hosted use. Manual mailbox/recipient/import additions need ownership checks, size limits, and import preview/rollback.

Use indexed metadata search first; benchmark D1 text search before promising full-body search. PostgreSQL offers built-in full-text search on migration. Keep attachments and large bodies in object storage with authorized retrieval, retention, and safe HTML rendering. Google remains authoritative; hosted data is a synchronized projection. Gmail requires initial full sync, history sync, and full resync after an expired history ID returns 404. [Google synchronization guide](https://developers.google.com/workspace/gmail/api/guides/sync)

## Correctness before throughput

Atomically commit a send intent and outbox record. The relay can publish twice; consumers must deduplicate logical work. A managed queue carries IDs, not authoritative content. Cloudflare Queues explicitly provides at-least-once delivery. [Delivery guarantees](https://developers.cloudflare.com/queues/reference/delivery-guarantees/)

D1 workers claim using atomic conditional updates and checked affected-row counts. PostgreSQL workers can use short `FOR UPDATE SKIP LOCKED` transactions. Persist a lease and attempt token, then release locks before provider calls. An attempt token prevents stale database updates; it cannot prevent an external request completing after timeout. [PostgreSQL SELECT](https://www.postgresql.org/docs/current/sql-select.html)

Freeze payloads and reuse a stable provider idempotency key where supported. A timeout after submission creates an **unknown outcome**, not permission to send again or switch providers. Reconcile provider records/webhooks; otherwise hold for operator resolution. Resend keys last 24 hours, illustrating why provider deduplication is bounded. Gmail and other adapters need their own documented reconciliation rules. No design can promise exactly-once email delivery. [Resend idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys)

Enforce provider, mailbox, and tenant admission limits with fair scheduling, bounded retries, jitter, and `Retry-After` handling. Recheck suppression and consent immediately before submission; revocation after submission cannot retract an accepted message. Preserve append-only receipts and tolerate duplicate/out-of-order webhooks. Retryable failures, permanent failures, and uncertain outcomes use separate transitions and operator views.

One authority owns campaign timing. Internal dispatch or Instantly/Smartlead can own a campaign, never both concurrently. Delegation freezes its version and records external IDs; switching requires cancellation/reconciliation before new authority begins. Hunter enrichment is optional, budgeted, and outside the dispatch critical path. Approved messages do not require AI execution.

## PostgreSQL versus D1

PostgreSQL offers straightforward multi-row transactions, row locking, relational reporting, and full-text search. Its tradeoff is a recurring database bill and connection/backup operations. A hosting provider and region have not been selected, so no defensible PostgreSQL monthly quote exists yet.

D1 is attractive for a Cloudflare-centered, modest workload, especially tenant-isolated data. Its `batch()` executes statements transactionally; it is incorrect to say D1 has no transactions. However, claim/outbox logic needs explicit conditional-write design rather than assuming PostgreSQL locking semantics. [D1 database API](https://developers.cloudflare.com/d1/worker-api/d1-database/)

Each D1 database has a hard 10 GB ceiling and executes queries serially. Cloudflare illustrates roughly 100 queries/second at 10 ms per query; this is an explanatory model, not a guaranteed benchmark. Replicas improve reads, not primary write capacity. Sharding introduces routing, reporting, and operational complexity. [D1 FAQ](https://developers.cloudflare.com/d1/reference/faq/)

Choose D1 only after benchmarks establish storage and write headroom. PostgreSQL is more forgiving for unquantified scale; a cheap VPS shifts patching, backups, and recovery to the operator rather than eliminating their cost. No selected VPS/managed quote establishes compliance with A$15. Extract services only for measured contention or deployment isolation; mailbox sync is a plausible first extraction.

## Explicit capacity and cost simulations

These are hypothetical workloads, **not permissible sending rates**. Provider quotas, consent, and deliverability can constrain sending first. Assume 30 days, eight billed D1 row writes per logical send including index effects, and 2 KB metadata per send before indexes/attachments:

| Scenario | Monthly sends | Writes | Metadata growth | Implication |
|---|---:|---:|---:|---|
| 900 contacts × 3 steps | 2,700 | 21,600 | 5.4 MB | Small; mailbox synchronization may dominate |
| 100,000 sends/day | 3 million | 24 million | 6 GB | One D1 database needs aggressive retention/sharding |
| 1 million sends/day | 30 million | 240 million | 60 GB | Cannot fit one D1 database |

D1 paid includes 50 million writes/month; additional writes cost USD1/million. The largest example therefore adds USD190 in writes alone. Included storage is 5 GB account-wide, then USD0.75/GB-month. Reads and index changes also count; these assumptions must be measured. [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/)

Cloudflare Queues normally charges three operations per successful message. At 30 million jobs/month, 90 million operations minus one million included cost USD35.60, excluding retries. Workers Paid starts at USD5/month; compute and request overages are additional. Included allowances are shared, and email-provider, storage, synchronization, AI, and support costs remain separate. [Queues pricing](https://developers.cloudflare.com/queues/platform/pricing/), [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)

At 100,000 sends/day and three SQL operations/send, average demand is 3.47 operations/second. A burst of 100 sends/second means 300 operations/second: averages hide overload. With 0.5-second provider latency and 70% utilization, 100 sends/second needs approximately `ceil(100 × 0.5 / 0.7) = 72` concurrent requests, **only if provider limits permit**. PostgreSQL queue workers avoid a separate queue-operation bill, but database capacity, storage, and backups still cost money. Report budgets in USD and AUD using actual billing exchange rates and taxes; do not invent a conversion.

Retention can dominate: ten users retaining 100,000 messages each at 20 KB adds 20 GB of bodies; one 1 MB attachment per message adds 1 TB. R2 Standard includes 10 GB-month, then USD0.015/GB-month: approximately USD14.85 storage alone at 1 TB, already threatening the entire hosting cap before compute and operations. Limit imports and attachment retention explicitly. [R2 pricing](https://developers.cloudflare.com/r2/pricing/)

## Evidence and acceptance gates

[“Delivery, consistency, and determinism: rethinking guarantees in distributed stream processing”, arXiv:1907.06250](https://arxiv.org/abs/1907.06250) analyzes stream delivery/recovery semantics and determinism. It supports distinguishing transport guarantees from consistent state; applying that distinction to external email side effects is our extrapolation, not an email-delivery proof.

[“Serverless Query Processing with Flexible Performance SLAs and Prices”, arXiv:2409.01388](https://arxiv.org/abs/2409.01388) explores cost/latency tradeoffs for analytical queries. It supports explicit service budgets. Prioritizing dispatch/UI over batch analytics is our extrapolation; the paper does not benchmark D1, PostgreSQL OLTP, or email.

Before implementation approval, define users, licensed mailboxes, peak load, retention, region, operating owner, and monthly ceiling. Provisional gates: crash-injection around every commit/submission boundary; duplicate/out-of-order receipt tests; unknown sends never automatically resent; 48-hour PC-off operation; twice agreed peak load without unbounded backlog; tenant-isolation tests; and restore drills with agreed RPO/RTO. Alert at 70% storage and 80% cost budget. Scale before sustained demand exceeds half measured capacity or dispatch latency misses its agreed objective. These thresholds are proposal defaults, not established product requirements.
