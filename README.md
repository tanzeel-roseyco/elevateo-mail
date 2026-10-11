# Elevateo Mail

A planned shared company mailbox for approximately **10 people**, available on a web subdomain and as downloadable macOS and Windows clients.

## Current state

**Design package complete; application implementation has not started.** Resend and self-hosted Supabase are selected by the user. This update replaces the earlier assumption that the primary product is a campaign engine across 18 existing mailboxes. Existing mailbox count, domain and migration requirements remain unresolved.

The repository contains architecture, requirements, a database/backend tutorial, a reuse plan grounded in six audited repositories, connector and desktop designs, and a phased implementation plan. There are no running services, executable application, credentials, installers or deployment. Engineering standards remain **draft pending explicit approval**, as required by [the repository standards](.planning/STANDARDS.md).

## Recommended design

- **Resend** transports permitted outbound mail and delivers incoming-mail events. Elevateo owns the mailbox experience and durable history.
- **Self-hosted Supabase** supplies PostgreSQL, Auth and private attachment Storage. It is not an IMAP/SMTP mail server.
- **Proposed:** strict TypeScript, React/Vite, a Node API and separate worker sharing domain modules. Use PostgreSQL for the durable job queue; add Redis only if measurements justify it.
- **Proposed:** Tauri 2 packages the same frontend for macOS and Windows. All clients use one central backend.
- **Proposed:** an Elevateo MCP connector exposes authorized search/read/draft tools to Codex and Claude. Sending stays in the human-controlled application initially.
- **Proposed:** start on a VPS with Docker Compose, TLS reverse proxy and off-host backups. Railway remains an alternative if operational convenience outweighs infrastructure cost/control.

These proposals are reviewable choices, not already approved or implemented dependencies. Resend now also documents a private-beta Inboxes API; it is not a launch dependency. See [delivery and hosting](docs/mail-delivery-and-hosting.md).

## Read in this order

1. [Product requirements and decisions](documentation.md)
2. [System architecture](docs/architecture.md) and [ownership decision](docs/decisions/0001-mailbox-ownership.md)
3. [Backend and database tutorial, including CAP](docs/backend-database-tutorial.md)
4. [Mail delivery, DNS, Supabase and hosting tutorial](docs/mail-delivery-and-hosting.md)
5. [Mac/Windows and Claude/Codex connectors](docs/desktop-and-connectors.md)
6. [What we will reuse from the audited repositories](docs/repository-reuse.md)
7. [API contracts and failure recovery](docs/contracts-and-reliability.md)
8. [Implementation roadmap and release gates](docs/implementation-plan.md)
9. [Engineering standards awaiting approval](.planning/STANDARDS.md)
10. [Current state](state.md) and [review evidence](code-reviews.md)

## Setup and testing

There is no application to install yet. Clone this repository and read the design documents. Code blocks and route names are design examples, not runnable integrations. The next implementation milestone starts only after the standards gate is resolved.

Application lint, typecheck, unit/integration tests must run in Docker; browser validation and platform-specific packaging checks follow before release. Documentation checks for this update are recorded in `code-reviews.md`. No live email, domain change, infrastructure purchase or deployment occurred.
