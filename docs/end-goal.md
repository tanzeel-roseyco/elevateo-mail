# What the finished Elevateo Mail looks like

**Elevateo Mail becomes the company's everyday email workspace: one place where approximately ten people can receive, organize, discuss and respond to company correspondence, with clear ownership, controlled AI assistance and a recovery process the company understands.**

This is the target outcome, not a description of working software today. The source collection and design documents exist; the integrated application remains to be built. Resend and self-hosted Supabase are selected by the user. The remaining implementation choices retain the status recorded in [the requirements](../documentation.md).

## The experience for the team

A staff member opens an HTTPS address such as `mail.yourcompany.com`, or launches Elevateo on their Mac or Windows computer. After signing in, they see the same authorized mailboxes, conversations and saved work across all three clients. The example hostname is illustrative; the actual domain remains to be selected.

The interface has a familiar structure: mailboxes and saved views on the left, a searchable conversation list in the middle, and the selected conversation with its composer and activity beside it. Views include assigned work, unassigned conversations, drafts and sent mail. Each person can find what needs their attention without reading every company message.

Shared addresses such as `hello@yourcompany.com` and `support@yourcompany.com` can belong to a team. Private addresses can be restricted to specific people. An email address is separate from a mailbox, and a mailbox is separate from a user: several addresses may route into one shared mailbox, and several people may work in it. The web hostname does not determine the company's sending addresses.

Staff can read a conversation, assign responsibility, change its team status, add an internal note, search its history and prepare a reply with attachments. Internal notes stay inside Elevateo. Personal read/unread state stays separate from the team's shared status. Concurrent edits produce a visible conflict or a new version instead of silently overwriting a colleague's work.

## A normal working day

1. A customer emails a company address. Elevateo records the incoming message, routes it to the correct mailbox and presents its content safely.
2. A team member assigns the conversation to the colleague responsible. Other authorized staff can see who owns the reply and what has happened.
3. That colleague asks Claude or Codex to find relevant correspondence, summarize it and prepare a draft. The connector can access only the mailboxes and actions that person has granted.
4. The colleague reviews the recipients, wording and attachments, then approves the exact draft version for sending in Elevateo.
5. The application records the send request durably. It displays whether the request is queued, accepted by the provider, reported delivered, failed or awaiting investigation. Provider acceptance and delivery are different events; neither proves that the recipient read the message.
6. The reply and subsequent customer responses become part of the shared history. Another authorized colleague can take over without asking someone to forward a private thread.

## Useful AI with clear authority

Claude and Codex connect through an Elevateo connector with explicit search, read and draft permissions. They can answer questions such as “Which conversations assigned to me need a reply?” or “Draft a response using our previous correspondence.” Their answers should refer to the messages they used so a person can check them.

The first release keeps sending under human control in the application. Removing a user's mailbox access or revoking a connector grant stops subsequent access. Instructions found inside an email cannot expand a connector's permissions. The product makes it clear when selected mail content is being shared with an external AI service.

## The system behind it

All clients use one central application backend. Resend handles the selected email transport integration. Self-hosted Supabase supplies the application's PostgreSQL database, identity services and private attachment storage. Elevateo owns the conversation model, permissions, assignments, draft versions, send history and audit records. External email and AI services still process the data needed for their integrations.

The proposed implementation uses a shared TypeScript web interface, a modular API, a separate background worker and a PostgreSQL job queue. Tauri is the proposed desktop packaging layer. A modest VPS is the proposed starting deployment; Railway remains an alternative. Final sizing follows measured message volume, attachment storage, scanning workload and operating costs. Ten desktop installations connect to the same system; they do not require ten servers.

The database should tell a coherent story: **who belongs to the company; which mailboxes they may use; which conversations and messages belong there; who owns the work; what was drafted and approved; what was submitted to the provider; and what happened afterward.** Attachments live in private object storage with database records governing access and lifecycle. Durable jobs let the system resume unfinished work after a restart.

When a provider request times out, the system preserves uncertainty and reconciles evidence before taking another action. A restore begins with outbound sending held until potentially completed sends have been checked. These rules make failures visible and recoverable without promising exactly-once email delivery.

## What “institutional grade” means for this project

The finished system earns trust through demonstrated behavior:

- **Access isolation:** a user cannot retrieve another mailbox's messages, search snippets, attachments or audit details without permission. Revocation applies to new requests across every client and connector.
- **Accountability:** assignments, permission changes, approved drafts and send attempts have an attributable history. Operational logs avoid unnecessary message bodies and secrets.
- **Reliable handling:** duplicate webhooks, competing workers, retries, restarts and uncertain provider responses have tested outcomes. The UI exposes unresolved work instead of showing invented success.
- **Safe content:** email HTML is sanitized and isolated, remote content is blocked by default, and attachments have private access and quarantine rules.
- **Recoverability:** encrypted backups are stored separately, database and attachment recovery are tested together, and the operator can execute the restore procedure. Agreed recovery objectives are measured before the company relies on the service.
- **Maintainability:** deployments, database migrations, upgrades, rollback procedures and license obligations are documented. Monitoring shows delivery problems, stuck work, storage growth and backup failures.

These are release requirements. They do not imply formal certification, zero downtime or zero data loss. A single VPS remains a single failure domain.

## What is delivered when the first release is complete

| Deliverable | Observable completion evidence |
| --- | --- |
| Company web mailbox | Invited staff use an authenticated HTTPS subdomain to receive, assign, search, draft and reply within their permissions |
| Mac and Windows applications | A signed, notarized Mac `.dmg` and a signed Windows installer, with clean-machine installation, login, updates and rollback verified on each platform |
| Resend integration | Controlled end-to-end send and reply, verified inbound events, durable imports and tested recovery from ambiguous sends |
| Self-hosted data platform | Versioned schema, tested mailbox access rules, private attachment storage, backups and a successful restore drill |
| Claude and Codex connectors | Both clients complete authorized search/read/draft tasks; revoked grants and unauthorized mailbox requests are denied |
| Team workflow | Two users can work the same conversation with clear assignment and draft conflict handling; access restrictions hold for a third user |
| Efficient operations | A representative ten-person pilot establishes resource use, queue behavior, provider limits and an accepted operating budget |
| Understandable ownership | Another operator can follow setup, deployment, monitoring and recovery instructions; the owner can explain the database and failure model using the tutorial |

The release is complete when the team can run its agreed daily correspondence through this workflow and the failure/recovery checks pass. A mock interface, imported repository, passing unit-test count or built installer alone does not satisfy that outcome.

## How the six repositories contribute

The references supply candidate inbox interactions, workspace concepts, UI controls, connector registration patterns, provider error handling and delivery test ideas. Selected pieces are adapted into one consistent product, with provenance, retained notices and tests for Elevateo's own boundaries. Their existing authentication, schemas and send loops are assessed individually before any adoption. See the [component plan](component-adoption.md) and [independent dossiers](reference-repositories/README.md).

The first complete release centers on company correspondence. Unsolicited cold outreach is outside this release's scope. Consent-based campaigns, additional provider synchronization, old-mail migration, advanced automation and offline operation can become separately defined milestones. The actual addresses, existing mail provider, migration needs, retention, region, maintenance owner and recovery objectives must be settled before production rollout. The current stack does not by itself establish those decisions.

The detailed acceptance map is in [goals and traceability](goals-and-traceability.md), the build sequence is in [the implementation plan](implementation-plan.md), and the teaching material is in [the backend/database tutorial](backend-database-tutorial.md).
