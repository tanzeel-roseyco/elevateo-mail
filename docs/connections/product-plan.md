# Private Connections — product proposal

Planning only. Latest confirmed user direction governs this document; backend/desktop standards remain unapproved. No accounts, credentials or DNS were changed. Provider facts below were checked against official sources on 4 October 2026; phases and UI behaviour are proposals.

## 1. What the feature gives each user

Connections is a private area for connecting that person's own inboxes, campaign provider and approved domains. The ten users see only their own connections, messages, keys, permission history and jobs. App sign-in does not automatically connect a mailbox. Owning a domain does not authorise every mailbox under it.

Each connection card shows account, provider, verified identities, enabled capabilities, AI access, last successful sync, daily allowance, credentials health and cloud availability. Separate mailbox, campaign-sender and domain cards make their different powers understandable.

**Confirmed:** AI may read selected mailboxes and prepare drafts by default once the user explicitly selects those mailboxes. Sending is enabled separately. DNS management may cover explicitly approved subdomains. Company root records and existing `in.elevateoco.com` remain protected unless an exact change is separately approved.

The app's cloud backend synchronises supported mailboxes and sends already approved content while the PC is off. Codex CLI and its Claude drafting fallback run locally; new AI work waits while the PC is off. A cloud connection must not depend on a desktop-only password or a private LAN endpoint that the backend cannot reach.

**Section review:** confirm that connection cards should expose three separate controls: mailbox access, AI access and sending enablement.

## 2. Phased capability matrix

| Phase / adapter | Verified provider capability | Proposed product scope and release gate |
| --- | --- | --- |
| 1 — Gmail / Workspace | OAuth scopes distinguish read, send and broader mailbox actions. `gmail.readonly` reads mail; `gmail.send` sends; `gmail.compose` manages drafts **and sends**. [Google scopes](https://developers.google.com/workspace/gmail/api/auth/scopes) | One authorised mailbox first, then two isolated users. Read selected inboxes, local/app drafts, separately enabled sending. Avoid provider-stored drafts until their broader scope is explained. Google approval/data-policy route must be settled before launch. |
| 2 — Resend campaign sender | Keys support full access or sending access; sending access only sends emails. Domain restrictions are available. [Key permissions](https://resend.com/docs/api-reference/api-keys/create-api-key), [domain restriction](https://resend.com/docs/dashboard/api-keys/introduction) | User's own sending key and verified owned domain, opted-in campaigns only. Sending-only credentials cannot inspect domains or reconcile outcomes through read APIs: require separately verified metadata and an approved outcome strategy; never silently demand full access. |
| 2 — approved subdomain management | Resend custom-domain receiving uses MX routing; a Resend-managed receiving subdomain is also available. [Receiving](https://resend.com/docs/dashboard/receiving/introduction) | Preview/validate/approve changes through a separate DNS capability. No root routing migration. Domain setup can produce instructions when DNS automation is unavailable. Optional app-only receiving is separate scope. |
| 3 — one named JMAP self-hosted server | JMAP Mail specifies mailboxes, email, identities and EmailSubmission. Creating a submission sends mail. [RFC 8621](https://datatracker.ietf.org/doc/html/rfc8621) | Pilot one agreed server/version/auth mode. Discover actual session capabilities and permissions, then certify read/sync and separately sending. HTTPS protocol compatibility does not establish reliable cloud reachability or tenancy. |
| 4 — one named IMAP/SMTP server | IMAP accesses mail; SMTP submission sends it. TLS guidance defines encrypted access/submission, including IMAPS 993. [RFC 8314](https://www.rfc-editor.org/rfc/rfc8314) | Separate read and submission checks; validate certificates, auth and folder mapping. Cloud transport/runtime feasibility, reconnect/polling resource costs and safe send reconciliation must pass before offering unattended operation. |
| Later — other providers/MCP servers | No universal interoperability has been verified. | Adapter request queue with named provider/version, tested capability declaration and supported authentication. MCP availability alone is insufficient for support. |

Resend receiving can fetch inbound content and attachments and notify by webhook. This does **not** connect an existing Google or arbitrary IMAP inbox, migrate its folders or establish general mailbox compatibility. Keep the existing personal inbox at its provider. [Resend receiving](https://resend.com/docs/dashboard/receiving/introduction)

Google provider scopes can be wider than our UI capability: compose includes sending, and modify includes read/compose/send. Therefore backend capability checks must prevent sending even when the provider token could send. Read/draft AI defaults should use app drafts and the narrowest necessary grant. Restricted Gmail scopes carry verification/security-assessment requirements for server storage/transmission; determine the applicable approval path, rather than treating ten users as an exemption. [Google scopes](https://developers.google.com/workspace/gmail/api/auth/scopes)

**Section review:** choose the first named self-hosted server for a pilot; general “any provider” support is not a release promise.

## 3. AI-assisted connection journey

1. Choose Google, Resend or a supported self-hosted adapter. The assistant asks for provider/account type and desired capabilities, not passwords or keys in chat.
2. Show the account/subdomain and exact requested access. Secret entry uses a dedicated protected form or provider OAuth browser flow; prompts, screenshots, logs and CLI environments do not receive credentials.
3. The user completes provider consent. A bounded connection check confirms authenticated identity, available capabilities and transport health; it does not send a test email without a separate approval.
4. Select which connected mailboxes the AI can read. Explain that local CLI execution can still transmit selected content to its AI provider; enable only after the subscription/data-policy review. Imported email instructions are untrusted data.
5. Show the capability summary: “Read selected mailboxes and draft enabled”; “Sending disabled”; domain/DNS permissions listed separately. Capability increases require their own approval.
6. For sending, select authorised identities and approve the proposed action/version. The same backend admission checks apply to manual, campaign and MCP sends. AI never gets an alternate direct-provider route.

MCP is a controlled way for the assistant to request app actions. Prefer app-owned typed connection tools over loading arbitrary provider/community servers. Mail MCP can inspect permitted connection status, query selected mail and create app drafts. It cannot access raw keys, change its own grants or mutate DNS. The Claude fallback initially has tools/MCP/hooks disabled; it cannot inherit the Codex connection tools without separately verified isolation and approval.

All outgoing app paths share the confirmed maximum of 30 per connected mailbox per day. Aliases/reconnects share stable mailbox identity; Resend sending must map to that mailbox. Lower provider limits still apply. Rolling 24 hours and per-recipient counting remain proposals. Sending outside this application cannot be prevented by its counter; show that limitation without implying provider-wide enforcement.

**Section review:** approve the supported adapter/capability list, not a blanket grant to whichever tools the assistant discovers.

## 4. Scoped DNS approval journey

DNS permission is a separate connection and execution authority from mail MCP. Provider credentials may cover an entire zone; our backend must enforce the user's subdomain allowlist and protected records even when the provider token cannot express that restriction.

The user selects an exact approved subdomain. The assistant may propose records; the DNS service resolves canonical names, validates ownership/scope and displays a before/after diff with record type, name, value, TTL and routing impact. Out-of-scope root records, protected existing records and conflicting changes are blocked. A DNS name prefix is not adequate scope checking.

Execution requires approval bound to the exact diff and observed record versions. If the zone changes before execution, refresh the preview and require approval again. Read back the provider result and distinguish applied records from propagation/verification still pending. Partial failures show the actual completed/failed records; rollback is another reviewable exact change, never a blind zone restore. No automated deletion or broad replacement.

The existing `in.elevateoco.com` setup gets a protection notice. Managing it or altering root records needs a separately approved exact change; selecting a neighbouring subdomain does not authorise that action.

**Section review:** decide the DNS provider and which exact subdomains may be onboarded first. Provider-specific granularity and implementation still need verification.

## 5. Approval, revoke and failure states

| State / action | Required visible behaviour |
| --- | --- |
| No connections | Explain inbox versus sender versus domain; offer supported providers. |
| Connecting / importing | Show progress, bounded history scope and cancellation; do not report a failed connection as an empty inbox. |
| Ready | Last successful sync, enabled capabilities and remaining app allowance; distinguish provider acceptance from delivery. |
| Partial grant / unsupported capability | State what works and what does not; offer narrowed access or cancel. No silent privilege expansion. |
| Expired / revoked / admin blocked | Pause affected cloud work, show reconnect action and cause safely; preserve drafts. An unrelated healthy connection stays usable. |
| Network / TLS / server unreachable | Mark data stale, pause dependent follow-ups and offer retry or endpoint correction. Do not bypass certificate checks. |
| Quota / rate limited | Show next eligible time according to the approved counting rule; defer safely, without rotating identities. |
| Send outcome unknown | Keep a visible reconciliation/review state and quota reservation; no automatic retry through another provider. |
| AI access removed | Stop new reads/tools, cancel pending AI work and clear transient context where possible. Previously transmitted data cannot be recalled. |
| Sending disabled | Stop new admissions and invalidate unsent authorisations; disclose that an already submitted provider request may complete. |
| Disconnect | Disable app use immediately, cancel queued work, remove stored grants/credentials, attempt provider revocation where supported and report remaining manual provider steps. Separately choose retained mail/export/deletion. |
| DNS scope removed | Block new DNS actions and invalidate unexecuted approvals; explain any already applied changes and offer an exact reviewed reversal. |

**Section review:** choose retention/export behaviour on disconnect; removing permission should not silently destroy the only copy of an imported message.

## 6. Decisions and acceptance gates

Confirmed access defaults and approved-subdomain DNS direction are recorded above. Still open: named self-hosted server/auth mode, DNS provider and subdomain list, mailbox/history/attachment limits, Google approval and AI data-policy eligibility, MFA, and the daily counting definition. Backend standards must be reviewed by section before implementation.

Before release, prove ten-user isolation; read/draft cannot send despite broad provider credentials; mail MCP cannot change DNS; stale DNS approval cannot apply; revoked grants stop new work; cap admission works across aliases/provider paths; provider failures do not produce false empty/sent states; PC-off cloud sending works with approved content; and actual Connections screens pass keyboard and visual QA. Run behavioural tests in Docker; use a documented native Windows check for CLI isolation/desktop resources and authorised live-provider smoke tests for compatibility.

No deployment, live connection or DNS configuration is authorised by this planning document. These gates are proposals to incorporate into approved backend standards and the execution plan.
