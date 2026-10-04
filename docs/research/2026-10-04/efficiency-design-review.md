# Adversarial design and branding review

4 October 2026. Planning review only; backend standards remain unapproved. Read project instructions, approved frontend standards, master plan, blueprint, draft backend standards and available scheduling/storage efficiency reports. No backend execution, tests, Docker build or visual validation performed. Obsidian is unavailable: these are documented arithmetic scenarios, not live Obsidian simulations.

## Section-targeted planning findings

**P1 — Master §7 / blueprint §9: capacity is not an admission policy yet.** Ten users and 30/mailbox/day do not bound inbound mail, history, imports or mailbox count. The plans correctly disclaim guaranteed A$15 fit, but a pilot still needs enforceable allowances. Smallest correction: obtain mailbox count, retained-history/search scope and per-user import/storage limits; publish a budget worksheet with shared account allowances, retries, Google transport, backups and alerts. Keep essential suppression/recovery headroom outside disposable-cache quotas. Do not invent a paid monitoring tier or cheaper unsafe follow-up policy.

**P2 — Blueprint §10 / standards §11: backup independence is unresolved.** Encrypted exports and manifests in the same account improve recovery but do not establish survival of account loss. Smallest correction: name the second trust boundary, operator, key recovery route, measured size and cost before promising the 24-hour independent-backup RPO. A manual rehearsal with a documented external copy is sufficient for the pilot; no replication platform is justified.

**P2 — Blueprint §12 / master §9: sequencing can create needless infrastructure.** Retain one repository/backend and existing tests. Introduce workspaces when a second runnable app/shared package actually exists; avoid empty packages and universal provider abstractions. Start one Gmail connection and two-user isolation, then sending ledger/outbox. DNS remains read-only/manual initially; self-hosted mail needs one named adapter before implementation. These are sequencing clarifications, not permission to drop confirmed requirements.

**P2 — Blueprint §10: health-screen scope risks becoming analytics.** Start with last successful sync/watch expiry, oldest due work, unknown sends, auth failure, storage headroom and backup age. Reuse provider logs and bounded counters; do not build custom tracing/search infrastructure. Choose independent outage-check destination and deduplication/recovery rules before launch. A green dashboard cannot prove a dead backend is detectable; test the independent checker.

## Numeric tradeoffs

Assume 30 days, 100 GB total R2 including backups, US$1=A$1.70 and illustrative 10% tax. These are scenarios, not quotes or measured load.

| Scenario | Sends/month | Five-minute sync jobs/month | Queue operations at three/job | Base plus queue, A$/month |
|---|---:|---:|---:|---:|
| 30 mailboxes, all active | 27,000 | 259,200 | 858,600 | 11.87 |
| 200 mailboxes, all active | 180,000 | 1,728,000 | 5,724,000 | 15.41 |

Base US$5 Workers + US$1.35 R2; queue allowance one million operations, overage US$0.40/million. Excludes renewals, push-driven work, retries, API/CPU/database overages and other hosting costs. Queue batching reduces invocations, not message operations. Official prices checked: [Workers](https://developers.cloudflare.com/workers/platform/pricing/), [Queues](https://developers.cloudflare.com/queues/platform/pricing/), [R2](https://developers.cloudflare.com/r2/pricing/).

At 200 idle mailboxes, hourly reconciliation is 144,000 jobs versus 1,728,000 at five minutes: a 12× reduction. It cannot replace five-minute freshness for active follow-ups. At 2 KB metadata/send, six months is 324 MB for 30 mailboxes versus 2.16 GB for 200, before inbound/indexes. Prefer bounded lazy body retrieval; independent offline history is a separate retention decision.

## Focused verification proposal

Docker: happy send; simultaneous last quota slot; alias/reconnect; suppression-before-admission; timeout-after-acceptance; stale/history-reset sync; cross-user row/object access; empty/malformed/over-limit imports. Load fixtures: 30 and 200 mailboxes, burst sends, heavy inbound and one large import; compare p95 latency, reads/writes, memory, queue operations and starvation. Restore with sends paused; corrupt export/key loss; backend outage and alert recovery. Use deterministic provider fakes, existing tooling and behavioural assertions. Native Windows resource/installer/notification checks remain a documented exception. No tests claimed run.

## Branding source review and counts

Exact physical coverage: Bits.tsx lines 1–16 = 16; Sidebar.tsx entire existing file = 80; index.html = 13; package.json = 47; package-lock.json lines 1–12 = 12. **168 lines total; 6 changed lines; 0 confirmed source defects; density 0/168 = 0 per 1,000 lines.** Planning findings above: four; excluded from source density.

Scoped diff updates sidebar, initial HTML title, route-title suffix and all three package-name entries consistently. Search of runtime source/HTML/package metadata finds no old full title/package name. Existing generic “mailroom” wording is not the old full product title. Preserve localStorage keys for data continuity; rename would need migration. No new inputs, state transitions, loops, permissions or dependencies: null/empty/max, sanitisation and authorisation behaviour are unchanged by branding. Names/comments remain accurate; no extraction needed for three literals. Style belongs to linters. Documentation reflects the new name. Verification gap: static review cannot establish visual fit or title navigation behaviour; add/check one existing browser journey for sidebar/title and restored persisted data, then inspect desktop/mobile UI before publishing.
