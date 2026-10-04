# Outreach Mailroom monitoring and operations research report

**Scope:** research only. I made no code changes, DNS changes or account actions.

## Sources I read

**arXiv papers (abstract pages only)**
1. **arXiv:2204.09670**, *Characterizing and Mitigating Anti-patterns of Alerts in Industrial Cloud Systems*, Yang et al., DSN'22. https://arxiv.org/abs/2204.09670
2. **arXiv:2404.16887**, *Anomaly Detection for Incident Response at Scale* (Walmart AIDR), ASPLOS'24 AIOps workshop. https://arxiv.org/abs/2404.16887

**Official documentation**
- Google SRE Workbook, Alerting on SLOs: https://sre.google/workbook/alerting-on-slos/
- OpenTelemetry, Handling sensitive data: https://opentelemetry.io/docs/security/handling-sensitive-data/
- OpenTelemetry, Metrics concepts: https://opentelemetry.io/docs/concepts/signals/metrics/
- Gmail API push notifications: https://developers.google.com/workspace/gmail/api/guides/push
- Gmail sender guidelines: https://support.google.com/a/answer/81126
- Sentry pricing: https://sentry.io/pricing/
- Self-hosted Sentry requirements: https://develop.sentry.dev/self-hosted/
- Grafana Cloud pricing: https://grafana.com/pricing/

**Access gaps:** No fetch failed. However, I did not read the full PDFs of the two papers, only the abstract pages. I also did not check:
- Published OTel SDK CPU/memory overhead benchmarks
- Log retention and pricing for any specific host (none has been chosen)
- Instantly, Smartlead or Hunter webhook documentation
- Prometheus documentation

## What the sources say

1. **Alert quality (2204.09670).** The study covered millions of Huawei Cloud alerts over two years and surveyed 18 on-call engineers.
   - Alerts are often "misleading, non-informative, non-actionable."
   - It found four individual and two collective alert anti-patterns.
   - It proposes judging alerts on three things: indicativeness, precision and handleability.
2. **Alert fatigue (2404.16887).** Rule-based alerting tuned to catch everything ends up with low precision, which causes alert fatigue.
   - Walmart's AIDR combined ML with static rule thresholds and a feedback loop.
   - It covered 63% of major incidents and cut mean time to detect by more than 7 minutes.
   - That ran on more than 3,000 models, which is far beyond what this project needs.
3. **SLO burn-rate alerts (Google SRE).** For a 99.9% SLO:

   | Action | Burn rate | Long window | Short window | Budget used |
   |---|---|---|---|---|
   | Page | 14.4× | 1h | 5m | 2% |
   | Page | 6× | 6h | 30m | 5% |
   | Ticket | 1× | 3d | 6h | 10% |

   Both windows must be over the threshold before the alert fires, so it clears about 5 minutes after the errors stop.
4. **Metric cardinality (OTel).** Each unique combination of labels on a metric uses memory.
   - The SDK caps this at 2,000 combinations per metric by default (changeable with a View). Anything beyond that goes into one overflow bucket marked `otel.metric.overflow=true`.
   - With "cumulative" reporting, an overflow lasts until the process restarts. With "delta" reporting, the limit applies per export cycle.
5. **PII (OTel).** OTel cannot tell what data is sensitive. Its advice is to avoid collecting it in the first place.
   - The Collector has attribute, filter, redaction (allowlist) and transform processors for cleanup.
   - Hashing emails is weak protection, because hashes "are reversible in practice if the input space is small and predictable."
6. **Gmail push notifications.**
   - The watch must be renewed at least every 7 days; Google recommends daily.
   - Notifications usually arrive within seconds but can be delayed or dropped. The fallback is polling `history.list`.
   - Notifications are limited to 1 per second per user; extras are dropped.
7. **Gmail sender rules.**
   - Keep the spam rate in Postmaster Tools below 0.10%, and never at or above 0.30%.
   - One-click unsubscribe (RFC 8058) is required for senders of 5,000+ messages a day.
8. **Pricing (checked 2026-10-04).**
   - **Sentry:** Developer plan free (1 user). Team $26/mo, Business $80/mo. Paid plans include 50k errors and 5M spans. Uptime and cron monitoring are pay-as-you-go.
   - **Self-hosted Sentry minimum:** 4 cores, 16 GB RAM plus 16 GB swap (32 GB recommended), 20 GB disk, and it needs high disk throughput.
   - **Grafana Cloud free tier:** 10k active series, 50 GB logs and 50 GB traces per month, 14-day retention, 3 users.

## How the options compare

| Option | Cost | Running burden | Fits the brief? |
|---|---|---|---|
| Hosting provider's logs + custom health page (OTel-structured) | About $0 | Low | **Yes** |
| Managed Sentry | $0–26/mo | Low | Good for stack traces. Not needed for queue or business health. |
| Self-hosted Sentry | One VM with 16–32 GB RAM | High | Too heavy for this project |
| Self-hosted Prometheus/Grafana | One VM plus upkeep | Medium–high | Too much infrastructure for now |
| Grafana Cloud free tier as an OTel destination | $0 within limits | Low | Good fallback if the custom page isn't enough |

## What I infer for this project (my extrapolation, not from the sources)

**Architecture**
- Instrument the backend with the OTel SDK: structured logs plus a few counters and histograms, sent to the host's log output. You don't build a log database or a tracing engine.
- Keep a separate **`ops_health` store**, either its own schema or a small KV store, apart from the email business data. It holds:
  - Periodic snapshots: one row per minute per signal, no message content
  - Open alerts with a dedup key
  - Heartbeats
  - Backup and restore evidence

  Keep it 30–90 days and delete old rows automatically.
- The dashboard reads `ops_health` plus a few live queries against the queue tables.

**Signals to track.** Labels should be limited to `job_type`, `provider`, `outcome` and `campaign_id_bucket`. Never use an email address, subject line or user ID as a label.

| Signal | Suggested warn / page threshold |
|---|---|
| Queue age (p95 wait time) | > 5 min / > 30 min |
| Oldest due send overdue by | > 10 min / > 60 min |
| Webhook ingestion lag (provider event time vs. stored time) | > 5 min / > 30 min |
| Gmail sync lag (time since last `historyId` advance or poll) | > 15 min / > 2 h, plus falling back to `history.list` |
| Gmail watch expiry | < 48 h warn / < 24 h page |
| Unknown send outcomes (no ack within N min) | > 0 for 30 min = ticket; > 1% of sends = page and pause sending |
| Bounce rate per campaign | > 2% pause / > 5% stop |
| Spam complaint rate | ≥ 0.08% warn; ≥ 0.10% auto-pause (the Gmail threshold) |
| OAuth / API token expiry or refresh failure | Expiring within 7 days = notify the user; refresh fails = page |
| Spend (Hunter, sending tools, cloud) | 80% of budget = warn; 100% = hard stop in code |
| Backup | Last backup > 26 h = page; last restore test > 35 days = ticket |

**SLOs**
- Two SLOs: "scheduled sends dispatched within 15 minutes" at 99.5%, and "inbox sync lag under 15 minutes" at 99%.
- Use the SRE burn-rate table above. At low traffic, require a minimum event count before an alert can fire.

**Alerts**
- Give every alert a dedup key, such as `signal+scope`.
- Send one notification when it opens, re-notify only every 4 hours, and send an automatic "resolved" message.
- Every alert should link to its runbook. This applies the paper's three criteria (indicative, precise, handleable).

**User notifications vs. ops alerts.** Keep these as separate channels.
- **User notifications (in the app):** reconnect Gmail, campaign paused due to bounces, budget reached.
- **Ops alerts (email or a push service):** for the operator.
- A single person may get both, but they must not share one queue.

**External uptime check**
- An independent free uptime service pings `/healthz`. This only checks database access and queue reads.
- Separately, a dead-man's-switch heartbeat should be pinged by the scheduler every 5 minutes. If the pings stop, you get alerted, so failures stay visible even when the app is dead.

**Load shedding and graceful degradation**
- Order of priority: unsubscribe/complaint handling, then webhook ingestion, then inbox sync, then campaign sends, then personalization (Hunter / AI agents).
- When queue age goes over the page threshold, stop personalization and new campaign sends first.
- Webhooks should be accepted and stored right away (ack-then-process), so the provider doesn't retry and pile up requests.

**Rollout, rollback and restore**
- Feature flags per provider integration. Canary on one test mailbox. Database migrations must work in both directions.
- Roll back automatically if the error burn rate exceeds 6× within 30 minutes of a deploy.
- Run a monthly restore drill into a scratch database. Record row counts and checksums in `ops_health`.

**Runbooks to write first (one page each):** Gmail sync stalled, send outcomes unknown, complaint spike, token expired, spend cap hit, provider outage, restore from backup.

## Recommendation

Use the hosting provider's logs plus OTel structured telemetry, and build a small custom health dashboard backed by `ops_health`. Add an external uptime check and a heartbeat on top. Don't run Prometheus, Grafana or Sentry yourselves.

If you later need stack-trace grouping or longer-term metrics, connect the same OTel exporter to the Sentry Developer plan or the Grafana Cloud free tier. That needs no code changes.

## Limitations

- I only read the paper abstracts, and their scale (Huawei, Walmart) is far bigger than this project.
- All thresholds above are my judgement, not sourced, apart from Gmail's 0.10%/0.30% spam limits and the SRE burn-rate table.
- No overhead benchmarks or hosting log retention figures were checked.
- Prices change; these were checked on 2026-10-04.
- Pricing and webhook semantics for Instantly, Smartlead and Hunter were not checked.

## Acceptance checks

1. If the app process is killed, an alert reaches the operator within 10 minutes through the external uptime check and heartbeat.
2. A synthetic overdue send sets "oldest due send" correctly within 1 minute. Exactly one deduplicated alert is created, then resolved once fixed.
3. Every metric stays under 2,000 label combinations, and there are no `otel.metric.overflow` points in a 7-day load test.
4. A redaction test (synthetic email addresses or bodies sent through logs) finds zero PII in exported telemetry.
5. A complaint rate ≥ 0.10% in a test automatically pauses the campaign and sends a user notification. Ops alerts and user notifications are logged separately.
6. Gmail watch renewal runs daily. A simulated dropped notification is caught by `history.list` within 15 minutes.
7. When spend reaches 100% of a budget, paid API calls are blocked in code.
8. A monthly restore drill succeeds, with timestamped evidence stored in `ops_health`. Measured restore time is under the agreed target, e.g. 4 h.
9. Deleting the `ops_health` data has no effect on email business records, and the reverse also holds.
10. In a load test, when the queue backs up, personalization is shed before sends and unsubscribe handling is never delayed.
