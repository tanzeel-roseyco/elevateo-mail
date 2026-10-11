# Project state

Updated: 2026-10-11.
Status: **design and documentation complete; application implementation awaiting explicit standards approval**.

## Completed

- Inspected the planning-only repository and preserved its explicit standards gate.
- Recorded the user-selected Resend and self-hosted Supabase stack and current approximately 10-person company-mailbox scope.
- Produced architecture, requirements, database/backend/CAP tutorial, delivery/DNS/hosting guide, desktop/MCP design, reliability contracts, reuse plan and implementation milestones.
- Used the user's installed Codex CLI 0.159.3 (`codex exec`, exit 0) to author the database/backend tutorial, then reviewed and harmonized it with verified provider facts.
- Carried forward six pinned repository audits and component scorecards. No upstream application code copied; no AGPL code incorporated.
- Performed bounded independent documentation reviews plus a design-tradeoff review; findings and verification are recorded in code-reviews.md.

## Not implemented or deployed

No application source, runtime dependencies, SQL migrations, working provider adapter, web UI, native installers, MCP server, infrastructure or production mailboxes have been created. No credentials, DNS records, purchases or email sending were needed for this update. Documentation examples are not functioning integrations.

## Selected versus proposed

Selected by user: Resend, self-hosted Supabase; web subdomain, Mac/Windows downloads, Claude/Codex connectors.
Recommended pending approval: strict TypeScript / React-Vite / Node, PostgreSQL durable jobs, Tauri 2, VPS/Compose, local read/search/draft MCP first. The revised engineering standards remain draft. A standards approval question was presented; no approval has been recorded in this change.

## Next steps

1. Record explicit approval or requested changes to .planning/STANDARDS.md before application implementation, as required by the existing repository instructions.
2. Build the local vertical slice with a fake provider, real PostgreSQL tests and actual UI validation; follow docs/implementation-plan.md.
3. Recover the full originating review rubric before claiming application review conformance; it is absent from this checkout.
4. Before deployment, confirm domain/MX ownership, mailbox/alias count, migration/history needs, message purposes/volume, region, retention, operating owner and recovery tier. Do not replace existing MX by assumption.
5. Integrate controlled Resend send/receive, then web pilot, local connectors and signed native packages through the documented gates.

Single-VPS operation is not high availability. Resend's private-beta Inboxes is not a launch dependency, and Resend does not permit unsolicited cold outreach. The application owns durable history and permissions while Resend remains an external processor.
