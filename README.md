# Elevateo Mail

A planned shared company mailbox for approximately **10 people**, available on a web subdomain and as downloadable macOS and Windows clients.

## Current state

**Design package and six-repository source intake complete; Elevateo application implementation has not started.** Resend and self-hosted Supabase are selected by the user. This update replaces the earlier assumption that the primary product is a campaign engine across 18 existing mailboxes. Existing mailbox count, domain and migration requirements remain unresolved.

The repository contains 2,764 pinned upstream files under `third_party/upstream`, six independent technical dossiers, per-file integrity manifests, preserved licenses, architecture, requirements, a database/backend tutorial, connector/desktop designs and a phased implementation plan. The upstream snapshots contain executable source but are not installed, run or integrated. There is no working Elevateo application, installer or deployment. Engineering standards remain **draft pending explicit approval**, as required by [the repository standards](.planning/STANDARDS.md).

## Recommended design

- **Resend** transports permitted outbound mail and delivers incoming-mail events. Elevateo owns the mailbox experience and durable history.
- **Self-hosted Supabase** supplies PostgreSQL, Auth and private attachment Storage. It is not an IMAP/SMTP mail server.
- **Proposed:** strict TypeScript, React/Vite, a Node API and separate worker sharing domain modules. Use PostgreSQL for the durable job queue; add Redis only if measurements justify it.
- **Proposed:** Tauri 2 packages the same frontend for macOS and Windows. All clients use one central backend.
- **Proposed:** an Elevateo MCP connector exposes authorized search/read/draft tools to Codex and Claude. Sending stays in the human-controlled application initially.
- **Proposed:** start on a VPS with Docker Compose, TLS reverse proxy and off-host backups. Railway remains an alternative if operational convenience outweighs infrastructure cost/control.

These proposals are reviewable choices, not already approved or implemented dependencies. Resend now also documents a private-beta Inboxes API; it is not a launch dependency. See [delivery and hosting](docs/mail-delivery-and-hosting.md).

## Source collection and goals

- [What the finished Elevateo Mail looks like](docs/end-goal.md)
- [All six source snapshots, exact revisions and integrity checks](third_party/README.md)
- [Six independent repository dossiers](docs/reference-repositories/README.md)
- [Best-component adoption matrix](docs/component-adoption.md)
- [Our goals and acceptance evidence](docs/goals-and-traceability.md)
- [Third-party licenses and notices](THIRD_PARTY_NOTICES.md)

The source collection preserves all 2,765 tracked paths in its manifests. One published sample TLS private-key file is deliberately omitted; all other 2,764 files retain exact upstream bytes. Reference inclusion does not approve runtime adoption.

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

There is no Elevateo application to install yet. Do not execute the archived upstream setup instructions as a way to launch this design. Clone this repository and read the design documents. Code blocks and route names are design examples, not runnable integrations. The next implementation milestone starts only after the standards gate is resolved.

Application lint, typecheck, unit/integration tests must run in Docker; browser validation and platform-specific packaging checks follow before release. Documentation checks for this update are recorded in `code-reviews.md`. No live email, domain change, infrastructure purchase or deployment occurred.

Verify source intake with `python3 scripts/verify_upstream.py`; run isolated provenance-tool tests with `python3 -B scripts/test_snapshot_tools.py -v`. These are repository tooling checks, not application acceptance tests.
