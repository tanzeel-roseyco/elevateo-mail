# ADR 0001: own the mailbox state, delegate internet email transport

Date: 2026-10-11. Status: **proposed**, with Resend and self-hosted Supabase already user-selected.

## Context

The product is now a roughly ten-person company mailbox across web, macOS, Windows and AI clients. Audited outreach repositories contain useful workflows but also unsafe send recovery and authorization boundaries. Combining their backends would multiply identity systems and state owners. The target repository has no application to migrate.

## Decision proposed

Use self-hosted Supabase PostgreSQL as the canonical store for company/mailbox membership, conversations, drafts, send jobs, incoming receipts and audit. Use Resend's stable HTTPS sending/receiving APIs for internet mail. Run one modular TypeScript codebase as an interactive API and a separate durable worker. Reuse the React frontend through Tauri and the same authorized API through MCP.

No Postfix/Dovecot or conventional IMAP service is required in the first release. No Resend private-beta Inboxes dependency, additional queue broker, separate search cluster or microservice fleet is selected. [Architecture](../architecture.md) and [reliability contracts](../contracts-and-reliability.md) contain the boundary details.

## Alternatives considered

- Fork Quickly wholesale: closest earlier campaign scaffold, but Python/React code and its scheduler/auth model require substantial replacement for this scope.
- Use Resend Inboxes as canonical mailbox: may reduce application work later, but private-beta access and a second state authority make it unsuitable as a launch dependency now.
- Operate a full mail server: supports conventional clients but adds spam, SMTP/IMAP, reputation, storage and server operations the user is trying to avoid.
- Managed Supabase: could reduce operational work, but the user explicitly selected self-hosting. Do not silently substitute it.
- Railway: potentially easier app deployment, but does not remove self-hosted Supabase maintenance and must be priced from measured always-on use.

## Consequences and revisit triggers

We must build mailbox routing, safe rendering, permissions, threading and reliable workflows. Resend processes content externally; this is not an entirely self-hosted email chain. A single VPS is one failure domain. Conventional Apple Mail/Outlook access and historical Gmail/Graph synchronization need separate integrations.

Revisit the choice if existing mailbox synchronization is mandatory, the team requires higher availability, Resend's policy does not cover the intended message category, Inboxes reaches suitable availability/stability, or workload measurements justify another service. Do not treat this ADR as standards approval or as evidence of working software.
