# Pilot scenario: 10 users, 100 Gmail mailboxes, 3,000 sends per day

Fixed facts: ten users, up to ten Gmail mailboxes each, at most 30 sends per mailbox per day (300 per user, 3,000 in total, about 90,000 per month). Launch is Resend-first; the self-hosted mailserver is deferred. Users bring their own provider keys and local Codex or Claude accounts. Clients: web, Windows .exe, Mac .dmg and Android. Builds run on fleet-02.

Line item IDs refer to `cost-model.csv`.

## Hosting only (the under-A$15 target)

| Item | Low | Recommended | High |
| --- | --- | --- | --- |
| Server (H01 CX23 / H02 CX33 / H03 CAX21, incl. IPv4) | 9.70 | 14.56 | 17.80 |
| Hetzner backups, 20% of server (H07) | 1.78 | 2.75 | 3.40 |
| Off-host backup (H09 B2 20 GB / H09 / H08 Storage Box) | 0.20 | 0.20 | 5.18 |
| Domain, amortised (N01) | 1.26 | 1.26 | 1.26 |
| DNS, TLS (N02, N03) | 0 | 0 | 0 |
| Database and storage (D01 self-hosted Supabase) | 0 | 0 | 0 |
| Total A$ per month | 12.94 | 18.77 | 27.64 |

The low case meets the A$15 target on a 4 GB server, which is the Supabase self-host minimum; expect to tune or drop unused Supabase services (Realtime, Analytics, Studio) to fit. The recommended 8 GB server is A$18.77. If Hetzner's x86 CX line stays unavailable, the ARM CAX21 is the next cheapest and needs arm64 images. Co-hosting on fleet-02 is A$0 marginal but is not recommended for production data.

## All-in monthly, excluding people, mailboxes and AI

| Item | Low | High |
| --- | --- | --- |
| Hosting only (above) | 12.94 | 27.64 |
| Resend (R01 Free / R03 Pro 100k if opted-in volume goes via Resend) | 0 | 50.51 |
| Apple Developer Program amortised (S01) | 11.90 | 11.90 |
| Windows signing (S02 Azure Artifact Signing Basic) | 14.42 | 14.42 |
| macOS CI minutes (C02; zero on a company Mac) | 0 | 8.95 |
| Enrichment (E01/E03 free tiers vs E02 Hunter Starter + E04 AnymailFinder 1,000) | 0 | 141.42 |
| Error tracking (M03 Sentry Developer / M04 Team) | 0 | 41.85 |
| Uptime checks (M01 UptimeRobot Free / M02 Solo) | 0 | 17.32 |
| CASA assessment amortised (G02; only with restricted Gmail scopes) | 0 | 86.58 |
| CI (C01 GitHub free minutes) | 0 | 0 |
| Total A$ per month | 39.26 | 400.59 |

One-off: Google Play registration A$36.08 (G04); first CASA assessment A$779 to A$1,039 if required (G02); OV code-signing certificate A$317.46 per year only if Azure Artifact Signing eligibility fails (S03).

## People (fractional, contract)

| Role | Day rate A$ | Days per month | A$ per month |
| --- | --- | --- | --- |
| Tech lead (P01) | 1,275 | 2 | 2,550 |
| Backend engineer (P02) | 1,000 | 4 | 4,000 |
| Senior full-stack / frontend (P03) | 1,000 | 2 | 2,000 |
| DevOps / platform (P04) | 1,100 | 2 | 2,200 |
| Security engineer (P05) | 1,600 | 1 | 1,600 |
| QA engineer (P06) | 800 | 2 | 1,600 |
| Total | | 13 | 13,950 |

Range: A$6,975 (half the days) to A$20,925 (one and a half times). Contractors on ABN include superannuation in the rate; employees add 12% super. People are the dominant pilot cost: the all-in high case is 3% of the people estimate.

## Decisions that move the numbers

1. Gmail connection method. App passwords (SMTP/IMAP with 2-Step Verification) avoid OAuth verification and CASA entirely; OAuth with `gmail.send` needs sensitive-scope verification but no assessment; OAuth IMAP (`https://mail.google.com/`) is restricted and costs A$779 to A$8,658 per year in assessments. Workspace admins can disable app passwords, so confirm policy with the mailbox owners first.
2. Whether any outreach volume goes through Resend. Only opted-in recipients may; the pilot's cold outreach must leave via the Gmail mailboxes under Google's limits, which keeps Resend on the free tier.
3. Enrichment. Both Hunter and AnymailFinder have free or pay-per-result tiers; start there and buy credits only when the free allowance is exhausted.
4. Server size. Measure memory after the Supabase stack is trimmed; move from CX23 to CX33 only if swap or OOM appears.
