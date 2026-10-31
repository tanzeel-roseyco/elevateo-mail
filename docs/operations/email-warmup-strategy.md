> **Historical strategy proposal, not an implemented or approved sending policy.** Vendor claims and suggested volume ramps below have not been revalidated in this documentation audit. They do not override held outbound, configured mailbox/user limits, consent requirements or Callum's approval gates. The current defaults are 30 recipients per mailbox and 300 per user per UTC day; increasing them needs review and approval. See the [handoff](../handoff/README.md), [production environment template](../../.env.production.example) and [mail development account](../handoff/mail-server-development.md).

# Email warm-up strategy (Resend + Instantly)

Status: proposal, 2026-10-21. Sources are Resend's and Instantly's own documentation, cited at the
end. Numbers quoted from them are exact; everything else is our plan.

## The one rule that shapes everything

Resend's warm-up guide says third-party warm-up tools that artificially boost engagement "can harm
your long-term sender reputation". Instantly's warm-up is exactly such a tool: it exchanges
automated opens and replies inside a network of other Instantly mailboxes. So the two are never
combined on the same domain:

| Stream | Transport | Warm-up method | Domain |
| --- | --- | --- | --- |
| Transactional (auth, invitations, notifications) | Resend | Real volume on Resend's new-domain schedule | `notify.<brand>.com` |
| Consented marketing and sequences sent by Elevateo Mail | Resend | Real volume on Resend's new-domain schedule, started after transactional is stable | `mail.<brand>.com` |
| Cold outbound from human mailboxes (if we do it at all) | Google Workspace / Microsoft 365 mailboxes driven by Instantly | Instantly warm-up network | Separate secondary domains, never the brand root and never a Resend domain |

Resend recommends subdomains over the root domain so one stream's problems cannot poison the others,
and warns against lookalike domains (`getbrand-mail.com`) because filters treat them as phishing. The
cold-outbound domains in row three are the standard Instantly pattern and are the one place where a
lookalike-style secondary domain is conventional; keep them clearly separate from product mail and
accept that they carry their own reputation.

## Part 1: Resend (product mail)

### Prerequisites, before the first message
1. Verify `notify.<brand>.com` and `mail.<brand>.com` in Resend (SPF and DKIM come from the
   verification records). Add a custom return-path subdomain. Publish DMARC yourself (Resend does not
   add it): start at `p=none` with `rua` reporting, move to `p=quarantine` after two clean weeks.
2. Separate sender addresses per purpose (`no-reply` discouraged; use `account@notify…`,
   `team@mail…`) so Deliverability Insights and provider feedback stay attributable.
3. Register both subdomains in Google Postmaster Tools and watch domain reputation daily during the
   ramp. Keep tracking off for auth and security mail; Resend flags tracking on sensitive emails.
4. Keep the app's existing fail-closed config: `ELEVATEO_OUTBOUND_MODE=held` until DNS is verified
   and the pilot workspace is chosen.

### Schedule: Resend's "new domain" table, applied per subdomain
| Day | Messages per day | Messages per hour |
| --- | --- | --- |
| 1 | up to 150 | n/a |
| 2 | up to 250 | n/a |
| 3 | up to 400 | n/a |
| 4 | up to 700 | 50 |
| 5 | up to 1,000 | 75 |
| 6 | up to 1,500 | 100 |
| 7 | up to 2,000 | 150 |

Our volumes are far below these caps at pilot scale, so the table is a ceiling, not a target. What
matters is the shape: real, wanted mail, growing steadily, never bursting. Concretely:

- **Week 1 (transactional only, `notify`)**: invitations, login and password mail to the pilot
  workspace's own members. These are the highest-engagement messages we have, which is why they go
  first. Expect tens per day.
- **Week 2 (consented sequences, `mail`)**: enable `resend` mode for the pilot workspace. Send only
  to recipients with consent evidence (the approval path already refuses the rest). Start with the
  most engaged segment (existing customers or warm replies), at most 150 the first day, and follow the
  table's growth rate: roughly 1.6x per day while bounce and complaint rates hold.
- **Week 3+**: widen to the full consented list, still inside the table's hourly caps; the app's
  per-mailbox daily budget (existing quota authority) is the enforcement point, so set the pilot
  budget to the day's cap rather than relying on people to count.
- **Any change** (new vendor, new subdomain, planned volume jump) restarts the schedule; Resend says
  "whenever you change your sending patterns, warm up".

### Stop and slow-down thresholds (Resend's own)
- Bounce rate above 4% or complaint rate above 0.08%: Resend may pause sending. Our own trip-wires
  sit lower: slow the ramp (hold the previous day's volume) at 2% bounces or 0.05% complaints, and
  stop at Resend's thresholds while the cause is found.
- Every hard bounce and complaint goes to the suppression list automatically; never re-send to it.
- The free plan is 100 transactional emails per UTC day and 3,000 per month; the paid plans remove
  the daily cap. Rate limit is 10 requests per second per team (batch API counts 100 emails as one
  request). Dedicated IPs are a $30/month Scale-plan add-on for senders above 3,000 emails per day;
  Resend warms those automatically. Below ~30k per month they advise against it, so the pilot stays
  on the shared pool.

### Instrumentation in Elevateo Mail
- The webhook sidecar already records delivered/bounced/complained events; add a daily per-domain
  roll-up (sent, bounced, complained, rates) to the send status page so the ramp decision is made
  from our own numbers, not the Resend dashboard alone.
- Make the ramp table a config value (`warmup_day_cap`) consumed by the existing per-mailbox quota so
  the cap is enforced, not advised.

## Part 2: Instantly (cold outbound mailboxes only)

Use Instantly only for human mailboxes on domains that will never send product mail. If the business
decides not to do cold outbound, skip this part entirely; nothing in the product depends on it.

### Setup
- 2 to 3 mailboxes per secondary domain, each on Google Workspace or Microsoft 365, with SPF, DKIM
  and DMARC on that domain. Several small domains beat one big one: a burnt domain is discarded.
- Add every mailbox to Instantly with warm-up enabled and the default-generated warm-up filter tag so
  warm-up threads leave the primary inbox.

### Settings (Instantly's documented defaults for new accounts)
| Setting | Value |
| --- | --- |
| Increase per day | 1 |
| Daily warm-up limit | 10 for new accounts (raise to 30 to 40 once aged) |
| Reply rate | 30% |
| Slow warm-up | on for new accounts; disable only for aged accounts |
| Weekdays only, Read emulation | on if the plan offers them (HyperGrowth and LightSpeed) |

### Timeline
- Warm for 2 to 3 weeks before the first campaign (Instantly says new accounts need two to four
  weeks to reach moderate capacity; aged domains need days).
- Keep warm-up running after campaigns start; Instantly recommends moving accounts to campaigns
  gradually rather than switching straight to full sending.
- Campaign ceiling: around 30 real emails per mailbox per day, which with 3 mailboxes per domain and
  5 domains is roughly 450 per day. Scale by adding domains and mailboxes, not by raising the cap.
- Pause a mailbox whose warm-up health score drops or that lands in spam in Instantly's placement
  tests; let it recover on warm-up only before re-adding it to campaigns.

### Why not use Instantly to warm the Resend domains
Instantly warms by sending from the mailbox through its own SMTP/OAuth connection; it cannot send
through Resend's API, so it would not touch the IP pool or the Resend-signed DKIM path at all. The
only thing it could warm is the domain's name reputation, and Resend states that artificial
engagement harms that. So the answer is structural, not just a preference: there is nothing for
Instantly to warm on the Resend side.

## Decision summary
1. Two Resend subdomains, warmed with real mail on Resend's new-domain table, transactional first.
2. DMARC published by us, Postmaster Tools watched daily, trip-wires at 2% / 0.05%, stop at 4% / 0.08%.
3. Ramp cap enforced through the existing per-mailbox quota, not by hand.
4. Instantly only for cold-outbound mailboxes on separate secondary domains, defaults as documented,
   2 to 3 weeks before campaigns, warm-up never switched off.
5. No dedicated IP until sustained volume exceeds roughly 3,000 per day.

## Sources
- Resend, Domain and IP Warm-up Guide: https://resend.com/docs/knowledge-base/warming-up
- Resend, Account Quotas and Limits: https://resend.com/docs/knowledge-base/account-quotas-and-limits
- Resend, How do Dedicated IPs Work: https://resend.com/docs/knowledge-base/how-do-dedicated-ips-work
- Resend, Dedicated IPs feature page: https://resend.com/features/dedicated-ips
- Resend, Why are my emails going to spam: https://resend.com/docs/knowledge-base/why-are-my-emails-going-to-spam
- Resend, Subdomain or root domain: https://resend.com/docs/knowledge-base/is-it-better-to-send-emails-from-a-subdomain-or-the-root-domain
- Resend, Domains introduction (DMARC, return-path, subdomains): https://resend.com/docs/dashboard/domains/introduction
- Instantly, Warmup settings explained: https://help.instantly.ai/en/articles/7988514-warmup-settings-explained
- Instantly, How to change the warmup settings: https://help.instantly.ai/en/articles/9214348-how-to-change-the-warmup-settings
- Instantly, Infra basics course (warm-up duration and ramp): https://instantly.ai/courses/infra-basics-getting-started-6
- Instantly, 30-Day Warmup & Hygiene System: https://instantly.ai/blog/30-day-warmup-hygiene-system-for-primary-inbox/
