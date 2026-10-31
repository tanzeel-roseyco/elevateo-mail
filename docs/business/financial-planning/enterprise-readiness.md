# Enterprise readiness scenario

> Historical enterprise cost scenario. Prices and readiness recommendations below do not establish implemented compliance, production recovery or current provider costs. Current recovery evidence is limited as recorded in the [backend completion design](../../backend-completion-design.md); use the [handoff](../../handoff/README.md) for approval gates and remaining work.

Costs added on top of the growth scenario when a customer or auditor requires formal controls: an independent penetration test, SOC 2, error tracking with SLAs, external uptime monitoring with a status page, tested backups with point-in-time recovery, a second region and on-call coverage. Line item IDs refer to `cost-model.csv`. All figures are estimates from vendor guides and quotes; none are fixed prices.

## One-off

| Item | A$ | Notes |
| --- | --- | --- |
| Web application pentest, manual, authenticated, multi-role (X01) | 8,000 to 40,000 ex GST | Repeat annually and after major changes; cheap quotes are usually automated scans. |
| SOC 2 Type 1 auditor fee (X03) | 7,215 to 21,645 | Type 2 (6 to 12 months of evidence) costs more. |
| SOC 2 platform year one (X02) | 10,823 to 21,645 | Vanta or Drata startup tier; implementation fees of US$5,000 to 20,000 are common and not included. |
| SOC 2 year one total | 18,038 to 43,290 | Platform plus Type 1 audit. |

## Recurring (A$ per month)

| Item | A$ | Notes |
| --- | --- | --- |
| Error tracking with SLA (M04 Sentry Business) | 128.43 | Replaces Team. |
| Uptime and status page (M02 UptimeRobot Team) | 56.28 | 100 monitors, 30-second interval, white-label status pages. |
| Point-in-time recovery | about 5 (self-hosted WAL archiving to B2) or 144.30 (D03 Supabase Cloud PITR) | Self-hosted pgBackRest or WAL-G to H09; test restores monthly. |
| Second-region warm standby (X04) | 31.89 | Duplicate CX43 plus backups in another Hetzner location; failover automation is people time. |
| On-call retainer (X05) | 3,000 | Two people, business-hours-plus; assumption with no public source. |
| Total recurring addition | about 3,216.60 | Dominated by the on-call retainer. |

## Sequencing

1. Pentest first (before any external customer data): it is the cheapest evidence that the auth, tenancy and attachment controls hold.
2. Backups with tested restores and PITR next; the repository already has a restore drill (`ops/supabase/restore-drill.sh`), so the cost is mostly scheduling, encryption and an off-host target.
3. Error tracking, uptime and status page can start on free tiers and upgrade when a customer SLA requires it.
4. SOC 2 only when a contract requires it; the platform fee alone exceeds a year of hosting by two orders of magnitude.
5. A second region only once the availability requirement is written down with a number; a single VPS with off-host backups gives recovery, not continuity.
