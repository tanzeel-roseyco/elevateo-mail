# Elevateo Mail — efficiency plan

Planning proposal, 4 October 2026. **Spend resources only on useful work, measure the cost, and keep safety checks intact.** None of the performance targets below has been demonstrated for the future backend or desktop app.

## 1. The smallest useful system

Keep one backend codebase, one desktop app, one structured database, object storage and a durable work queue. Do not add Redis, a search cluster, microservices, a monitoring cluster or an AI server without evidence that the simpler design fails. Separate code by responsibility; a folder does not need its own deployed service.

Approved campaigns run in the cloud. The desktop and AI can sleep. One optional adapter failing must not stop normal inbox use. Hunter, AMF, EmailGuard, Instantly and Smartlead stay outside the critical path.

**Review:** the [master plan](product-master-plan.md) remains the product scope; this document describes how to operate it cheaply.

## 2. Cost envelope before capacity promises

The pilot mailbox allowance is confirmed: **10 per user, 100 total**, permitting at most 300/user/day and 3,000/day across the app. Propose 50 GB total R2 storage, **including backups**, and D1 comfortably below its included 5 GB. Storage/history allowances still need agreement; the mailbox cap does not limit incoming mail volume.

Workers US$5 plus 40 GB of chargeable R2 at US$0.015 is **US$5.60/month**, before operation overages and other services. At illustrative FX 1.70 plus 10% tax this is **A$10.47**. Keep the remaining A$4.53 as headroom, not a feature budget. Allowances may be shared with other projects. [Workers](https://developers.cloudflare.com/workers/platform/pricing/), [R2](https://developers.cloudflare.com/r2/pricing/), [D1](https://developers.cloudflare.com/d1/platform/pricing/)

An inefficient 200-mailbox scenario with five-minute polling and 100 GB storage already models **A$15.41**, before other overages. Thirty outgoing emails per mailbox does not bound incoming traffic. The [cost research](research/2026-10-04/efficiency-cloud-cost.md) lists assumptions and smaller scenarios. Billing alerts and per-request CPU limits are not hard spending caps.

For 100 active mailboxes, five-minute reconciliation produces 864,000 jobs/month; maximum sending adds 90,000. At three queue operations/job, 2.862 million operations cost roughly US$0.745 above the included million. With the proposed 50 GB allowance that gives **about A$11.87**, before push, watch renewals, retries and other overages. This leaves less than A$3.14 headroom. Bound and measure those remaining costs before admitting the full pilot.

**Review:** agree history/storage allowances before accepting users at maximum capacity. Mail providers, enrichment, AI subscriptions, signing and Google approval costs are separate.

## 3. Efficiency from the whole system down to each request

| Area | Rule | Evidence to collect |
| --- | --- | --- |
| Incoming mail | Use Google notifications, combine repeated notices for one mailbox, recover missed notices. Renew watches daily. | Notifications versus actual sync jobs; time since successful sync |
| Background work | One minute scheduler selects indexed due work; queue small IDs. Hourly idle reconciliation and five-minute active checks are starting proposals. | Queue operations, oldest due work, CPU per useful job |
| Correct sending | One durable intent and shared quota ledger. Duplicate jobs do not duplicate delivery; ambiguous outcomes stay unresolved until safe evidence arrives. | Last-slot race and crash/timeout tests |
| Database | Fetch a bounded page, initially 50 rows, maximum 100. Stable cursors and indexes for measured queries. Avoid repeated exact totals and unchanged row rewrites. | Query plan, scanned/returned rows, p95 time, bytes and writes per message |
| Message content | Load bodies/attachments when opened; keep a bounded cache. Store imported originals and approved outbound content durably. | Bytes retained, cache effectiveness, operations per mailbox |
| Imports | Stream bounded batches, checkpoint progress and reserve storage before accepting bytes. One user cannot fill every worker. | Peak memory, rejected oversized input, resume and fairness tests |
| Interface | Small reactive subscriptions; page mail results; load secondary screens on demand. Replace whole-inbox localStorage snapshots during backend integration. | Initial JS, long tasks, interaction latency with large histories |
| Desktop | Idle work slows in the tray; notifications still work. No running CLI without an active task. | Full Tauri/WebView2 process-tree CPU, RAM and GPU, including tray mode |
| AI | One job at a time, selected context, bounded output/deadline, cancel and clean up its children. Use fixed rules for permissions and scheduling. | Parent-plus-child resource peak; no background AI calls after completion |
| Monitoring | A small private health screen, redacted logs and one independent outage check. Aggregate useful counts. | Log volume, alert usefulness, outage and recovery rehearsal |

Small queue messages and batching reduce overhead; batching does not remove per-message charges. Indexes make reads faster but increase writes and storage. R2 request rounding matters: crossing one million included Class A operations can add US$4.50. Measure rather than assume. [Queue pricing](https://developers.cloudflare.com/queues/platform/pricing/), [D1 indexing](https://developers.cloudflare.com/d1/best-practices/use-indexes/), [R2 operations](https://developers.cloudflare.com/r2/pricing/)

No provider-call-per-render, full-inbox scan on each refresh, mailbox-per-second timer, or repeated retry loop without a deadline. Do not add memoisation or a new cache until profiling shows the expensive operation and its invalidation rules are understood.

**Review:** archived search/offline history must have a defined scope; putting old bodies in object storage does not make them fully searchable or backed up independently.

## 4. Resource targets and proof

| Proposed gate | How to measure |
| --- | --- |
| Initial JS at most 250 KB gzipped | Production build; inherited approved frontend budget |
| Interaction feedback p95 below 100 ms | Recorded Windows hardware, ordinary and large mail lists |
| Idle CPU below 1% averaged over ten minutes | Entire app/WebView2 process tree; visible and tray separately |
| Visible app below 250 MB; tray below 150 MB working set | Count WebView2 children; report shared/GPU memory and CLI peak separately |
| Local usable window within three seconds | Cold startup on recorded reference machine; network data can remain loading |
| API-owned work p95 below 500 ms | Agreed concurrent sync/import/user workload; provider latency reported separately |
| Imports do not starve inbox/send recovery | Ten-user contention test with one heavy importer |
| Estimated monthly hosting below A$15 with headroom | Include storage, requests, retries, backups, logs, notification transport, FX and tax |

A 300 ms list-response target from storage research is a diagnostic stretch target, not an additional approved requirement. Hardware, mailbox history and network conditions accompany every result. Tauri is a proposal; reject or adjust the design if its real process tree fails the agreed budget. No local model inference is planned; ordinary UI rendering can still use the GPU.

**Review:** resource figures are acceptance proposals. The pilot establishes realistic allowances before release.

## 5. Pressure, failure and growth

Reserve worker/storage capacity for receipts, opt-outs, consent, unknown-send recovery and account repair. Then serve interactive mail and due sends; imports, enrichment and cosmetic analytics come later. Use per-user fairness, bounded concurrency and backoff with jitter. If receipt capacity is exhausted, return a retryable failure and surface an incident; never acknowledge an event that was not durably captured.

Budget warnings first pause new bulk work. Reject an import before exceeding its allowance. A stale inbox pauses follow-ups until reconciliation; it does not justify sending without knowing whether the person replied. Preserve the 30/mailbox cap across aliases and provider paths; the pilot's ten-mailbox allowance makes its effective maximum 300/user/day. The earlier 600/user ceiling is a later expansion bound. Keep conservative capacity for unresolved attempts.

At growth limits, decide explicitly between agreed retention changes, more budget, or a database redesign. Never silently discard mail, rotate accounts to bypass limits, or remove permission/consent checks for speed.

**Review:** notification destination, retention and operator response still need an owner.

## 6. Useful tests without paid test APIs

Use the existing Docker test environment, deterministic fake providers and seeded histories. Test the high-consequence boundaries: two sends racing for the final slot, duplicate events, accepted send followed by timeout, unsubscribe during dispatch, revoked grants, cross-user IDs, expired sync history, oversized imports and paused restore. GUI checks cover connect, read/reply, approve/pause, reconnect and uncertain outcomes. Avoid tests that merely repeat a getter or take fragile full-page snapshots.

Run a small load scenario locally/in Docker against fakes, report rows/CPU/memory and project monthly operations. Native Windows installation, sandbox and notification tests require actual Windows because Linux containers cannot validate them. Before release, an explicitly authorised small real-account smoke test proves provider compatibility; fakes cannot do that.

No paid AI, sending or cloud test service is needed for routine checks. Existing hardware, eligible Docker use and build infrastructure are assumptions, not universally free resources. Clean task-owned test containers/images/cache immediately afterward.

Supporting research: [storage](research/2026-10-04/efficiency-storage.md), [scheduling](research/2026-10-04/efficiency-scheduling.md), [desktop](research/2026-10-04/efficiency-desktop.md), [design challenge](research/2026-10-04/efficiency-design-review.md). These proposals become implementation gates only through approval of the [backend standards](../.planning/BACKEND-STANDARDS.md).
