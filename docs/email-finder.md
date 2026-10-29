# Email finder

The authenticated Email finder section provides person lookup, address verification,
company email discovery and decision-maker lookup. Person, verifier and decision-maker
forms accept UTF-8 CSV (2 MB, 5,000 rows maximum). Use headers `name,domain,company`
for people, `email` for verification, and `company,domain,role` for decision makers.
Either domain or company is required for people and decision makers. Downloads include
status, confidence, reasons, sources and check time; spreadsheet formula cells are escaped.

## Architecture and results

`apps/server/lib/elevateo/email_finder` separates pure name/pattern/extraction logic from
DNS, bounded HTTP crawling, SMTP and PostgreSQL adapters. The controller only queues
work and reads persisted results. `apps/server/bin/email-finder-worker` runs as the
`email-finder-worker` service in the existing production Compose stack. A PostgreSQL
session advisory lock serializes all discovery and probing across processes and tenants.
The reversible migration adds tenant-scoped jobs, results, domains, people and suppression
tables, plus global rate state. Existing Authentik session, CSRF and Outreach authorization
checks protect every `/v2/email-finder` endpoint. Jobs are visible to their creator within
their organization; opt-outs apply throughout that organization. Contract entries live in
`contracts/v2/openapi.json`; browser access goes through the existing gateway boundary.

Company names are resolved through public search results and confirmed with DNS/MX.
The worker crawls the company's site, respecting robots.txt, and extracts public email
addresses, names and titles, including linked PDFs. DuckDuckGo HTML, Bing and Mojeek
provide keyless fallback discovery. Responses, redirects, PDF output and processing time
are bounded; private network addresses are rejected. Scraped content is displayed as text.

Candidate patterns use normalized names and confirmed domain evidence, falling back to
organization-wide pattern frequency. Results are cached for 30 days. Suppression is checked
before work and when returning cached or completed results. Public sightings alone do not
establish mailbox validity. SMTP sends EHLO, MAIL FROM, RCPT TO, RSET and QUIT only;
it never sends DATA or an email. STARTTLS is used when offered. An accepted random
20-character recipient marks a catch-all domain; candidate results then remain `risky`.

Each result has `status`, optional `email`, confidence 0–100, reasons, sources and checked_at.
Statuses are `valid`, `invalid`, `risky`, `unknown`, `sources_unavailable` and `suppressed`.
SMTP acceptance describes an observed server response and cannot guarantee delivery or
permission to contact someone. Disabled SMTP never produces a fabricated valid result.
Discovery can still return company emails and likely candidates with explicit uncertainty.

## Enforced limits and recovery

Code enforces 50 SMTP probes per UTC day globally, at least 60 seconds per MX host,
and at most three candidate probes per person. Catch-all checks also consume the global
budget. A 4xx reply pauses that host for an hour; blocklist/reputation replies pause all
SMTP for 24 hours and surface an alert. Engine queries are spaced at least 10 seconds
with jitter; detected blocks pause that engine for six hours. If sources are unavailable,
the result does not claim that a person or address does not exist.

Jobs checkpoint discovery, attempts and completed rows in PostgreSQL. A replacement
worker resumes them; it conservatively spends a reserved probe if a crash occurs before
the network call. Capacity-limited jobs wait for their next persisted retry time. Health
shows worker activity, SMTP availability and reason, EHLO hostname, remaining probes
and any global halt. No Redis, external scheduler or paid service is required.

## Hetzner setup

Set `ELEVATEO_FINDER_PUBLIC_IP` in the existing worker environment file to the server's
public outbound IP. The worker obtains the EHLO hostname from that IP's PTR record,
logs the hostname, and tests a TCP connection to an MX on port 25 at startup. A failure
is recorded in health with its reason; the rest of the feature continues. Restart the
worker after fixing network/PTR configuration to repeat the startup check.

Hetzner Cloud blocks outgoing ports 25 and 465 by default; eligible accounts can request
unblocking. Dedicated Robot servers are not subject to that Cloud restriction. See
[Hetzner's server FAQ](https://docs.hetzner.com/cloud/servers/faq/).
In the Hetzner Cloud Console, open the server's Networking settings and edit its reverse
DNS entry to your chosen hostname. Configure its forward DNS consistently before use;
the worker uses the PTR value, rather than an independently configured EHLO name.
See [Hetzner's reverse DNS instructions](https://docs.hetzner.com/cloud/servers/cloud-server-rdns/).
This change makes no DNS edits, unblocking requests, live probes or deployment.

## Privacy

For B2B processing, legitimate interests may be an appropriate GDPR basis after a
documented necessity and balancing assessment; it is not automatic permission for
marketing. Provide required privacy information, observe applicable electronic marketing
rules and honour objections through the suppression list. See the
[ICO's B2B guidance](https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/business-to-business-marketing/).

## Local verification

From this worktree run `powershell -File ops/tests/email-finder/check.ps1` for the local
Docker Desktop verification pass. It uses an isolated RAM-backed PostgreSQL fixture,
fake SMTP and recorded HTML; tests make no live discovery or SMTP calls. Backend tests,
Steep, RuboCop, contracts, browser lint/types/unit tests, Playwright and deployment config
parsing run in containers. Evidence is written under ignored `.local-jobs/`. The harness
removes its containers and tagged images without deleting persistent volumes.
