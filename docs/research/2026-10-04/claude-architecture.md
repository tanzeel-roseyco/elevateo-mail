# Outreach Mailroom: architecture challenge and performance design (research only)

I made no code changes and took no account actions. Every scale figure below is **hypothetical**. None of it is a user-approved sending volume or a quota.

## Sources read

**Papers (arXiv)**
- **arXiv:2111.11562**, *Reliable Actors with Retry Orchestration* (Tardieu et al., IBM, 2021/22): https://arxiv.org/abs/2111.11562
- **arXiv:1911.11286**, *LogPlayer: Fault-tolerant Exactly-once Delivery using gRPC Asynchronous Streaming* (Roohitavaf et al., 2019): https://arxiv.org/abs/1911.11286

I read only the abstract pages, not the full PDFs.

**Official documentation**
- Gmail API quotas: https://developers.google.com/workspace/gmail/api/reference/quota
- Gmail push notifications: https://developers.google.com/workspace/gmail/api/guides/push
- Workspace sending limits: https://knowledge.workspace.google.com/admin/gmail/gmail-sending-limits-in-google-workspace
- Cloudflare Queues limits: https://developers.cloudflare.com/queues/platform/limits/
- Cloudflare Queues delivery guarantees: https://developers.cloudflare.com/queues/reference/delivery-guarantees/
- PostgreSQL `SELECT … SKIP LOCKED`: https://www.postgresql.org/docs/current/sql-select.html

**Unavailable or not verified**
- The Instantly pause-campaign doc (`developer.instantly.ai/api/v2/campaign/pausecampaign`) returned **404**.
- I did not read any Smartlead, Hunter or Resend docs. Any claims about how those providers cancel campaigns are **unverified**.
- Background only, not cited as evidence: search results that pointed to Medium and dev.to outbox articles.

## Facts from the sources

- **Gmail API quotas:** 1,200,000 units/min per project and **6,000 units/min per user**. `messages.send` costs 100 units, `messages.get` 20, `history.list` 2.
- **Gmail push:** you must renew `watch` **at least every 7 days**. Notifications are capped at **1 event/sec per user**, and anything above that is dropped. Notifications "might be delayed or dropped," and Google recommends a periodic `history.list` fallback.
- **Workspace sending limits (paid account):** 2,000 messages/day, 3,000 external recipients/day, 10,000 total recipients/day. Trial accounts get 500/day. Once you exceed a limit, sending can be blocked "for up to 24 hours." The doc also says limits differ for API and SMTP relay sending.
- **Cloudflare Queues:**
  - Delivery is **at-least-once** by default.
  - 5,000 msg/s per queue and 128 KB per message.
  - Push consumers: up to 250 concurrent, with a 15-minute wall-clock limit per invocation.
  - Pull consumers: visibility timeout up to 12 h.
  - Retention: 24 h on the free plan, up to 14 days on paid.
- **Postgres `SKIP LOCKED`:** gives "an inconsistent view of the data… can be used to avoid lock contention with multiple consumers accessing a queue-like table."
- **arXiv:2111.11562:** failed invocations are retried, completed invocations are never repeated, and happens-before order is kept across failures. It is built on persistent stores plus queues and formalized in a process calculus.
- **arXiv:1911.11286:** in-order, exactly-once delivery of write-ahead-log (WAL) entries to shards, verified in TLA+, despite failures on either side.

## How the papers apply, and where the analogy stops

- **2111.11562 (Reliable Actors).** What carries over: model each campaign step (send, check reply, schedule next) as a retryable invocation, and persist its completion record so recovery never repeats a completed step.
  - **Analogy stops:** their "never repeated" guarantee covers invocations inside their own persistent system. A Gmail send is an **external side effect with no idempotency key that I could verify**. If the process crashes after Google accepts the message but before you record it, no retry layer can tell what happened.
- **1911.11286 (LogPlayer).** What carries over: drive delivery from a durable log (here, the outbox table), consume it with per-mailbox order, and track positions in the log.
  - **Analogy stops:** LogPlayer controls both ends, so the shards can deduplicate. Gmail, Instantly and Smartlead are third parties. Exactly-once *effect* can't be guaranteed. You can only get at-least-once attempts, plus deduplication on your side, plus reconciliation.

## Architecture recommendation

**Use a modular monolith (API) plus separate worker processes, all sharing one Postgres. Do not use microservices or a message bus.**

- One team and one database. The real bottleneck is provider limits (100 units per send, 2,000 sends/day per mailbox), not compute. Microservices would add network hops, more ways to fail, and cost, for no throughput gain.
- **Single scheduling authority:** one scheduler role decides "what is due." It runs as a singleton lease row in Postgres or an advisory lock. Workers only execute claimed jobs. The desktop app **never schedules**; it only issues commands to the API. That matters because sending must continue while the PC is off.

**Minimal repository layout** (each part listed only where it is justified):
```
apps/desktop   (current React/Vite UI, later Tauri/Electron shell)
apps/api       (HTTP, auth, commands → outbox)
apps/worker    (scheduler + executors; same codebase, different entrypoint)
packages/domain     (move today's src/domain pure rules)
packages/contracts  (API DTOs, job payload schemas, versioned)
packages/adapters/{gmail,instantly,smartlead,hunter}  (implement ports like MailroomGateway)
docs/adr/
```

- Make Hunter an optional adapter behind a port. The domain must compile and pass tests without it.
- **ADRs to write first:**
  1. Postgres as the queue.
  2. A single scheduler.
  3. Send state machine and reconciliation.
  4. Root MX stays on Google, and Resend (if used) is limited to a subdomain.
  5. Data-retention policy.
- **Contracts:** version the job payloads (`v1`). Every job carries `idempotency_key`, `mailbox_id`, `campaign_step_id` and `attempt`.

**Queue choice: start with a Postgres job table** using `FOR UPDATE SKIP LOCKED`, leases, and partial indexes on `(status, run_at)`. It gives you one transactional store, so the outbox write and the domain write commit atomically, and no extra vendor.

Move to Cloudflare Queues **only when a trigger fires**: sustained claim latency above about 1 s at p95, job-table bloat or vacuum pressure, or a move of workers onto Cloudflare. Even then, Cloudflare Queues is at-least-once, so deduplication logic stays the same.

## Concurrency budgets

- **Per mailbox:** 1 in-flight send. This preserves order and keeps you clear of quota bursts.
- **Global send executors:** start at about 4.
- **Sync executors:** about 8, `history.list`-driven.
- **Enrichment (Hunter):** 1, and it can be dropped entirely.
- **Local Codex/Claude CLI:** 1 job at a time, run at low priority, with outputs cached by input hash.

## Scenario arithmetic (hypothetical)

Assumptions: 50 sends per mailbox per day, metadata of about 2 KB per stored message, and full bodies averaging about 75 KB.

| | A: 18 mailboxes / 100k msgs | B: 100 mailboxes / 1M msgs |
|---|---|---|
| Sends per day | 900 | 5,000 |
| Peak sends/min if spread over 8 h | about 2 | about 10 |
| Gmail units/min per mailbox (cap 6,000) | well under 100 | well under 100 |
| Metadata storage | about 200 MB | about 2 GB |
| Storage if full bodies kept | about 7.5 GB | about 75 GB |
| Max push events/s (1/s per user cap) | 18 | 100 |
| Polling cost (`history.list` every 5 min) | 18 × 2 = 36 units per cycle | 100 × 2 = 200 units per cycle, negligible |

- **Distinguish the load types.** User/API load is small: one user clicking around, plus sync events. *Provider sending limits* are a separate ceiling, enforced per mailbox per day. A big traffic spike in the UI doesn't change how much you can send, and spreading sends evenly over the day doesn't change how much UI capacity you need.
- **Data minimization and caching:** store headers, thread IDs and snippets, and fetch bodies on demand with a size-capped local LRU cache. That keeps scenario B at about 2 GB, which fits the cheapest managed Postgres tiers (vendor pricing not verified). Purge enrichment data and campaign contacts on a retention schedule.
- **UX budget:** inbox list renders in under 200 ms from cache, thread opens in under 1 s, and command acknowledgement (a durable write) in under 300 ms. The UI shows "queued" state honestly instead of blocking on the provider.

## Top five correctness and performance traps

1. **Losing a send when the job and the domain change aren't committed together.** Fix with a **durable outbox**: write the campaign state change and the outbox row in **one transaction**. The worker publishes or executes later, at-least-once.
2. **Lease expiry during a slow external send.** If a send takes longer than the lease, a second worker reclaims the job and sends a duplicate. Mitigations:
   - Set the lease well above the provider timeout and use a client-side timeout shorter than the lease.
   - Heartbeat-extend the lease.
   - Move the job to `sending` with a fencing token *before* calling the provider, and refuse to commit results from a stale token.
   - Never re-send a job in `sending` automatically. Hand it to reconciliation instead.
3. **Unknown outcome reconciliation.** After a timeout or crash, the state is `unknown`, not `failed`. Search the mailbox's Sent folder for a deterministic marker, such as a custom `Message-ID` header (marker idea is my design, not from a doc). If you find it, mark the job sent. If not, wait a grace period and then retry once. For Instantly or Smartlead, query their lead or activity status (endpoints unverified).
4. **Stop-on-reply race.** A reply can arrive between "step is due" and the send call, and push can be delayed or dropped (documented). Mitigations: re-check the thread with `history.list` immediately before sending, and add a small minimum delay (e.g. 10–30 min) after the most recent inbound sync. You can still lose a narrow window, so report it as a measured rate, not zero.
5. **Provider-managed campaign cancellation limits.** When Instantly or Smartlead owns the schedule, a pause may not recall emails already queued on their side (unverified, because the doc 404'd). Treat cancellation as best-effort, keep *one* authority per campaign (local or provider, never both), and confirm the effect by polling. A related performance trap: a missed 7-day `watch` renewal or an unbounded body sync can silently stall the inbox.

## Practical scale triggers (performance before cleverness)

- **Add read replicas, partitioning or an external queue only when one of these holds:**
  - Job-claim p95 is above 1 s.
  - Postgres CPU stays above 60%.
  - A single table exceeds about 50M rows.
  - Push volume gets close to the 1 event/s per user cap.
- **Do not add up front:** Kafka, service mesh, CQRS, or event sourcing.

## Measurable checks

- Duplicate-send rate, measured as Message-IDs per step. Target 0. Alert on any.
- Count of jobs in `unknown` older than 30 min.
- Reply-to-stop latency at p95, and the count of sends that went out after a reply.
- Watch-renewal age, which must stay under 7 days.
- Quota 429 rate per mailbox, and daily sends per mailbox against the configured cap.
- Job lag (now minus `run_at`) at p95.
- Chaos test: kill a worker mid-send, then check for no duplicate and that the job resolves.

## Limitations

- I read only the paper abstracts, and neither paper addresses email or third-party side effects.
- Pricing, the Resend/Hunter/Smartlead behaviour, and the Instantly pause semantics are unverified.
- The Workspace limits doc says API and SMTP relay limits differ, and I didn't get those figures.
- The storage figures rest on assumed message sizes.
- Nothing here guarantees perfect correctness or unlimited scale.
