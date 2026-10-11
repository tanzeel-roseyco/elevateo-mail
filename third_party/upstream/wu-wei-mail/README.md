# Wu Wei Mail

Open-source cold email infrastructure. Self-hosted alternative to the
sending side of Instantly, Smartlead, and Lemlist. Multi-inbox, IMAP-based
reply detection, bounce handling, A/B sequences, OAuth (Google + Microsoft).

MIT licensed. Built for operators who want to own their outbound stack.

## Status

Working software, used in production by the maintainer for daily outbound
across 14 inboxes. APIs may change. Bug fixes and security PRs welcome; not
actively accepting feature PRs yet.

## What works today

- Multi-inbox sending via SMTP with Google/Microsoft OAuth
- Multi-step campaign sequences with A/B variants
- IMAP polling for replies, bounces, opens, clicks
- Per-inbox daily caps, send pacing, sender rotation
- Lead list management with custom fields
- Real-time analytics dashboard
- Webhook event processing (bounces, opens, clicks, replies)

## What doesn't work yet

- **Warmup.** The `workers/warmup.py` file exists as scaffolding but isn't
  operationally ready. Building a credible warmup network is genuinely hard -
  it needs many active inboxes mailing each other. I currently pair Wu Wei Mail
  with Instantly's cheapest tier ($47/month) for warmup-only and run all
  sending through Wu Wei Mail. PRs welcome if anyone wants to tackle proper
  warmup; happy to merge it.

- A few API endpoints are stubbed. See GitHub issues for the running list.

## Why

I cancelled Instantly's Hypergrowth tier three months ago because I wanted to
own my outbound stack. The cold email tooling industry charges $97-358/month for
what's honestly a few thousand lines of well-organized Python around an SMTP
socket. The hard work is the deliverability discipline and the orchestration
layer on top. Warmup is genuinely hard and worth paying for. The rest should be
free.
