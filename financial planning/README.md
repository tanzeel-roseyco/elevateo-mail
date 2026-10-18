# Financial planning

Cost estimates for running Elevateo Mail as a Resend-first private pilot, then at growth, then with enterprise controls. Every price was checked live on 2026-10-18; `cost-model.csv` holds the line items, source URLs, check dates and a `verified` or `estimate` flag. Prices labelled `estimate` could not be read from an official page (Hetzner renders prices client-side and lists the CX/CAX lines as unavailable; Microsoft and Cloudflare pages print no figure) or come from vendor quotes and salary guides.

Scenarios: [pilot.md](pilot.md), [growth.md](growth.md), [enterprise-readiness.md](enterprise-readiness.md).

## Summary (A$ per month unless stated)

| Scenario | Hosting only | All-in, excluding people | People (contract, fractional) |
| --- | --- | --- | --- |
| Pilot (10 users, 100 Gmail mailboxes, 3,000 sends/day) | 12.94 low / 18.77 recommended / 27.64 high | 39.26 low / 400.59 high | 13,950 (6,975 to 20,925) |
| Growth (50 users, 500 mailboxes, 15,000 sends/day) | 41.60 low / 51.32 high | 127.09 low / 1,167.41 high | 32,000 (25,000 to 45,000) |
| Enterprise readiness (adds controls to growth) | as growth + 31.89 second region | growth + 3,216.60 recurring; 18,038 to 43,290 one-off SOC 2 year one; 8,000 to 40,000 pentest | growth + on-call retainer |

"Hosting only" is the figure the under-A$15 target applies to: server, server backups, off-host backup storage and the domain. It excludes mailbox, provider and AI subscriptions, verification and code signing, as the brief requires. The low pilot figure (A$12.94 on a Hetzner CX23) meets the target; the recommended CX33 (4 vCPU / 8 GB, the Supabase self-host recommendation) is A$18.77, and an ARM fallback with a Storage Box is A$27.64. The company already pays for fleet-02; co-hosting the pilot there has zero marginal cost but mixes a build host with production data, so it is listed as an option, not the base case.

The three biggest drivers of the all-in pilot high case are enrichment subscriptions (Hunter Starter plus AnymailFinder 1,000 credits, A$141.42), the annual CASA security assessment amortised (A$86.58, only if the app uses restricted Gmail OAuth scopes) and Resend Pro 100k (A$50.51, only if opted-in outreach goes through Resend). Hosting is fourth.

## Assumptions

- Exchange rates: US$1 = A$1.443 (AUD/USD 0.6928 on 2026-10-01); EUR 1 = A$1.62 (2026-10-02). Rates move daily; amounts are rounded to cents.
- Prices exclude GST and VAT unless stated. Hetzner quotes EUR ex VAT; Australian GST (10%) applies to domestic services such as pentests.
- Pilot volume: 10 users x 10 Gmail mailboxes x 30 sends per day = 3,000 sends per day, about 90,000 per month. Outreach sends leave through the users' own Gmail mailboxes (SMTP/IMAP), so Resend carries only transactional mail unless recipients have opted in. Resend's acceptable use policy prohibits cold outreach, purchased lists and scraped contacts and shuts accounts above a 0.08% complaint or 4% bounce rate, so 90k/month on Resend is priced but only lawful for opted-in recipients.
- Gmail limits: Google Workspace allows 2,000 recipients per account per day and free Gmail about 500; 30 per mailbox per day is far below both. App passwords require 2-Step Verification. Gmail OAuth with `gmail.send` is a sensitive scope (verification, no assessment); `gmail.readonly`, `gmail.modify`, `gmail.compose` and `https://mail.google.com/` are restricted and add an annual CASA assessment.
- Supabase is self-hosted on the same VPS (free software); Supabase Cloud is priced as an alternative only.
- Google Workspace mailbox subscriptions and Claude/Codex accounts are excluded by scope; the 100 mailboxes are the largest real cost of the pilot and must be priced separately.
- fleet-02 (the Hetzner build server) is already paid for; its contract price is not visible to this plan.
- People costs are Australian contract day rates from 2026 guides where found; QA and on-call figures are assumptions with no source and are marked as such.
- The repository's earlier figures (docs/mail-delivery-and-hosting.md: Resend Pro US$20 for 50k; Railway illustration US$58; docs/mailserver/readiness.md: CX23 EUR 7.09, CX33 EUR 10.69, CX43 EUR 19.69) were reconciled: the Resend figure still holds; Hetzner figures changed after the 2026-04-01 and 2026-06-15 repricings and the CX line is currently listed as unavailable, so this model uses the tracker figures and flags them as estimates.
