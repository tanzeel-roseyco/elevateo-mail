# Growth scenario: 50 users, 500 Gmail mailboxes, 15,000 sends per day

Scales the pilot by five: 50 users, up to 500 mailboxes, 15,000 sends per day (about 450,000 per month), two sending domains, and a second person able to operate the stack. Line item IDs refer to `cost-model.csv`.

## Hosting only

| Item | Low | High |
| --- | --- | --- |
| Server (H05 CX43 8 vCPU / 16 GB / H06 CAX31 ARM) | 26.71 | 34.81 |
| Hetzner backups 20% (H07) | 5.18 | 6.80 |
| Off-host backup (H09 B2 200 GB / H08 Storage Box) | 2.01 | 5.18 |
| Domains x2 amortised (N01) | 2.52 | 2.52 |
| B2 for growth-high in addition to Storage Box | 0 | 2.01 |
| Total A$ per month | 36.42 | 51.32 |

Low total used in the README is A$41.60 (CX43 with both B2 and a Storage Box, which is the safer backup layout). At 500 mailboxes the IMAP ingestion workers, attachment scanning (ClamAV) and PostgreSQL need the 16 GB tier; measure before moving to CCX dedicated vCPU, which Hetzner repriced sharply in June 2026 (CCX13 about EUR 43).

## All-in monthly, excluding people, mailboxes and AI

| Item | Low | High |
| --- | --- | --- |
| Hosting only | 41.60 | 51.32 |
| Resend (R01 Free for transactional / R05 Scale 500k if opted-in volume goes via Resend) | 0 | 505.05 |
| Enrichment (free tiers / E02 Hunter Growth 10k + E04 AnymailFinder 5k) | 0 | 430.02 |
| Uptime checks (M02 UptimeRobot Solo, 60-second interval) | 17.32 | 17.32 |
| Error tracking (M04 Sentry Team) | 41.85 | 41.85 |
| Apple Developer amortised (S01) | 11.90 | 11.90 |
| Windows signing (S02) | 14.42 | 14.42 |
| CASA amortised (G02; restricted scopes only) | 0 | 86.58 |
| macOS CI minutes (C02) | 0 | 8.95 |
| Total A$ per month | 127.09 | 1,167.41 |

The high case is dominated by Resend Scale and enrichment credits, both of which are usage choices rather than fixed costs. Sentry and UptimeRobot paid tiers are included in the low case because 50 users and 500 mailboxes make unlimited seats and one-minute checks worth A$59 a month.

## People

Growth needs roughly one full-time-equivalent spread across roles: backend 10 days, senior full-stack 6, DevOps 4, tech lead 4, QA 4, security 2 per month, about 30 days at the day rates in P01 to P06, or A$32,000 per month (range A$25,000 to A$45,000). A second operator with production access is required for the bus-factor and on-call items in the readiness plan.

## Excluded but material

500 Google Workspace mailboxes are the largest cost in this scenario and are out of scope here; price them with Google's current per-user rates before committing to growth. Claude and Codex usage stays on users' own accounts.
