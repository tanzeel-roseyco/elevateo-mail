# Connections design

Proposed for Elevateo Mail, 4 October 2026. These documents prepare implementation; no live provider, MCP or DNS integration exists yet. Backend standards require approval before execution.

## What the user confirmed

Ten completely separate users connect up to ten mailboxes each (100 total). AI can read selected mailboxes and prepare drafts; sending is enabled separately. DNS management is limited to explicitly approved subdomains. Users enter their own provider/enrichment keys in secure settings. The 30-per-mailbox daily cap applies across app sending paths, making the pilot's effective maximum 300/user/day.

## Five completed assignments

| Assignment | Review this section for |
| --- | --- |
| [Product plan](product-plan.md) | Connections screens, provider capabilities, Google/Resend/self-hosted rollout |
| [Security plan](security-plan.md) | Ownership, AI grants, credentials, network access and DNS restrictions |
| [Prototype inspection](inspection.md) | Existing code that must change before real connections work |
| [Provider contracts](provider-contracts.md) | Connection lifecycle, requests, errors, capabilities and implementation slices |
| [MCP and DNS contracts](mcp-dns-contracts.md) | Bounded AI tools, permission checks, DNS plans, approvals and failure tests |

The two development assignments produced implementation contracts because backend/desktop standards are still unapproved. Their output is preparation, not functioning integrations.

## Decisions carried into the master plan

- Gmail supplies existing personal inboxes without changing MX. Resend is a campaign sender with explicit capabilities; its receiving/inbox products do not automatically connect existing Google or arbitrary self-hosted mailboxes.
- Pilot one named self-hosted server/API before promising generic compatibility. A private desktop-only server cannot receive cloud work while that computer is off.
- AI may guide setup, but credentials and consent go through secure application screens. Backend code enforces selected-mailbox grants on every action.
- DNS is a separate service with exact allowed records and reviewed changes. Cloudflare zone credentials can be broader than app restrictions; manual owner changes remain the initial path until the residual risk or a provider-enforced boundary is accepted.
- Company root MX and the reported existing `in.elevateoco.com` setup remain protected.

## Section-specific review

Product: identify the first self-hosted product. Permissions: confirm which accounts AI may read at connection time. DNS: identify the owner-approved subdomains and record types. Engineering: approve the [draft standards](../../.planning/BACKEND-STANDARDS.md) before backend work. Performance: apply the [efficiency plan](../efficiency-plan.md) to every adapter.
