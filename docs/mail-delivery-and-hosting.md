# Mail delivery, inbox setup, and efficient hosting

Status: design proposal for approximately 10 company users. Resend and self-hosted Supabase are user-selected. Infrastructure sizes, operating targets, and implementation details below remain proposed; no accounts, DNS records, credentials, servers, or mailboxes were changed. Provider documentation checked **11 October 2026**.

Architecture reconciled **13 October 2026**: [Rails domain/API/worker + Laravel Blade/Livewire presentation](decisions/0002-rails-laravel-presentation.md) is user-selected. This edit preserves the dated provider/pricing evidence below; it is not a new price check. Include the always-running PHP presentation service and its protected session store in future sizing, deployment and recovery measurements.

## What we are actually hosting

Elevateo Mail will provide the company's interface, permissions, conversation history, drafts, assignments, and operational records. Self-hosted Supabase provides PostgreSQL, authentication, and optional storage/realtime services. **Supabase is not an email server.**

Resend transports outbound email and accepts inbound email through its receiving service. Our backend communicates with those services through HTTPS APIs and signed webhooks. We do not need Postfix or Dovecot for this baseline. Those would introduce SMTP delivery operations, mailbox storage, spam filtering, reputation management, and an IMAP service that this application does not currently require.

A mailbox in our database means an authorized address and its conversations. It does not automatically create an IMAP account that Apple Mail or Outlook can connect to. The web app and downloadable clients will share Elevateo's API instead. If existing Gmail or Microsoft 365 mailboxes must be synchronized—including their historical mail, folders, and changes made in other clients—that is a separate provider integration.

This is **self-hosted application data with an external email provider**, not an entirely self-hosted mail system. Resend processes mail content. Its security documentation says stored data is in the United States, and choosing a sending region does not change that storage location. Standard email/log retention is 30 days on Free, Pro, and Scale plans. Therefore our database and private attachment storage must retain the required company history independently. [Resend security and retention](https://resend.com/security)

## Stable APIs first; optional Inboxes beta later

The baseline uses Resend's sending API, receiving API, and webhooks. The receiving service can notify our app, expose bodies and headers, retrieve attachments, and support threaded replies. [Receiving introduction](https://resend.com/docs/dashboard/receiving/introduction)

Resend also now documents an **Inboxes API**, including threads and drafts. It is currently a **private beta**, restricted to some users, and its response shapes may change. We should not make delivery of Elevateo depend on obtaining beta access. Keep it as an optional future adapter; evaluate whether it reduces enough work to justify synchronizing another system's inbox state. Supabase should remain the authority for permissions, assignments, approvals, and audit records. [Create Inbox and beta status](https://resend.com/docs/api-reference/inboxes/create-inbox)

## DNS tutorial: website address versus email address

DNS answers different questions with different record types. An A/AAAA record tells browsers where a host lives; an MX record tells sending mail systems where to deliver mail for an email domain. A web subdomain does not create an email inbox.

Use this illustrative separation until real domains are selected:

| Name | Purpose | Proposed destination |
| --- | --- | --- |
| `mail.company.example` | Website and desktop client's API | HTTPS reverse proxy on application host |
| `support@team.company.example` | Company shared support mailbox | Resend receiving service for `team.company.example` |
| `accounts@team.company.example` | Another authorized shared mailbox | Same receiving domain, different application routing |
| Existing `person@company.example` | Existing company email | Existing provider, unchanged |

The example domain is deliberately non-production. Copy the exact DNS values supplied by the provider when configuring a real domain; do not guess its MX hostname or DKIM key.

For an existing root-domain mailbox service, retain its MX records. Add Resend receiving on the separate subdomain. Competing MX providers on the same domain do not copy every message to both: priority determines routing, and equal priorities make delivery unpredictable. An alternative is forwarding selected existing addresses to an address on a domain verified for Resend receiving. Forwarding directly to the Resend MX server hostname does not work. [Custom receiving domains](https://resend.com/docs/dashboard/receiving/custom-domains)

Forwarding is a migration aid, not full mailbox synchronization. It may omit older mail, sent items, folder state, or address details. Forwarding can also change authentication results and spam treatment. Validate the forwarding provider's behavior, SPF/DKIM/DMARC results, duplicate handling, and loop prevention with test mail before routing company traffic. Do not invent an automatic forwarding loop between Elevateo and the old mailbox. [Google's forwarding authentication guidance](https://support.google.com/mail/answer/175365?hl=en)

Sending verification and receiving routing are related but separate setup steps. Publish Resend's required sending records for the selected sender domain and configure receiving MX separately. Record the intended DMARC policy and validate alignment before enforcing a stronger policy. Do not blindly add a second SPF record to a domain that already has one; review the existing configuration. Domain separation helps organization but does not guarantee reputation isolation.

## Which mail belongs on Resend

The intended starting product is a shared company mailbox for expected customer conversations, replies, and permission-based communication. A reply to a customer's support request is not automatically a marketing broadcast; Resend explicitly describes receiving support requests and replying to customers as inbound use cases. Record why the conversation exists and the appropriate sending purpose. [Receiving use cases](https://resend.com/docs/dashboard/receiving/introduction)

Resend's current acceptable-use policy prohibits unsolicited messages, explicitly including cold outreach, purchased lists, and scraped contact data. The original Instantly/Smartlead comparison cannot be interpreted as authorization to send those campaigns through Resend. Address verification does not establish permission. Any later promotional campaigns need suitable consent records, unsubscribe behavior, and dispatch-time suppression checks. [Resend acceptable-use policy](https://resend.com/legal/acceptable-use)

Before treating this as a replacement for every kind of company correspondence, validate the actual communication categories against the provider's policy. Keep message purpose visible in the product model rather than hiding marketing campaigns behind a transactional API name. Resend's consent guide emphasizes permission for the specific type of message being sent. [What counts as email consent](https://resend.com/docs/knowledge-base/what-counts-as-email-consent)

## Inbound mail: accept the event, then retrieve the content

```mermaid
sequenceDiagram
    participant Sender
    participant Resend
    participant API as Elevateo API
    participant DB as PostgreSQL
    participant Worker
    participant Store as Private object storage
    Sender->>Resend: Email to verified receiving domain
    Resend->>API: Signed email.received webhook
    API->>API: Verify raw body, signature, timestamp
    API->>DB: Commit event and durable retrieval job
    API-->>Resend: Success only after commit
    Worker->>DB: Claim job with lease
    Worker->>Resend: Retrieve body, headers, attachment metadata
    Worker->>Store: Quarantine and save permitted attachment bytes
    Worker->>DB: Save message and routing; finish job
```

The webhook contains metadata, not the full body, headers, or attachment content. The worker must retrieve those through the receiving and attachment APIs. [Get email content](https://resend.com/docs/dashboard/receiving/get-email-content)

Verify Resend's signature using the original request body and the documented signing headers before acting on the event. Do not parse and reserialize JSON before verification. [Webhook verification](https://resend.com/docs/webhooks/verify-webhooks-requests)

Our proposed database transaction stores a unique `(provider, account_context, webhook_event_id)` record and a retrieval job together. Keep that receipt restricted to ingress processing and create separate authorized mailbox routing projections when one event addresses multiple company mailboxes. Duplicate delivery returns success once the original event is durably stored. A database failure returns a failure response so the provider can retry. A worker failure does not lose the already accepted event: the job remains retryable with a bounded lease, backoff, and an operator-visible failure state.

Resend's documented retry intervals are cumulative: immediately, then 5 seconds, 5 minutes, 30 minutes, 2 hours, 5 hours, 10 hours, and another 10 hours. Persistent endpoint failures may cause automatic disabling. Manual replay is available. Do not assume endless retries or a ten-hour total recovery window. [Retries and replays](https://resend.com/docs/webhooks/retries-and-replays)

Add a periodic reconciliation worker that lists received emails with an overlap window and deduplicates by provider email ID. Persist its progress. This recovers missed notifications and detects gaps before provider retention expires. Alert on the age of the oldest unprocessed message and on a disabled webhook. Reconciliation complements webhooks; it is not another independent owner of message insertion rules.

The receiving domain accepts arbitrary local addresses. Route only explicitly configured mailbox aliases into user-visible mailboxes; quarantine unknown recipients. Apply company-wide and global quarantine byte/job quotas, a short retention period, bounded retrieval/scanning concurrency and alerts; unknown addresses must not bypass resource limits. Under pressure, retain minimal routing evidence rather than retrieving unlimited bodies. Dropping local content cannot undo provider receipt charges. A shared domain is not permission for every user to read every address. Verify forwarding/envelope metadata before routing aliases, and test BCC and multiple-recipient behavior rather than assuming visible `To` always identifies the original delivery recipient.

## Attachments, message rendering, and threads

Resend attachment retrieval returns temporary download URLs valid for one hour. Refresh an expired URL through its API; it is not a permanent company archive link. [Receiving attachments](https://resend.com/docs/dashboard/receiving/attachments)

The proposed ingestion pipeline must:

1. Enforce configurable per-file, per-message, and per-mailbox quotas before and during streaming. The application limits are an explicit launch decision, not an assumed provider guarantee.
2. Fetch only URLs obtained from the authenticated provider response. Enforce HTTPS, bounded redirects, public-network destinations, timeouts, and byte limits; reject redirects or resolved addresses outside the permitted policy.
3. Save under generated object IDs in a private quarantine area, never a sender-controlled filesystem path. Preserve the original filename only as untrusted metadata.
4. Validate content type from bytes, scan attachments before release, and keep scanner failures quarantined. Antivirus lowers risk; it does not prove a document safe.
5. Authorize every download against the current session/grant, mailbox membership and scan status at the Rails download proxy. Browser downloads stream through Laravel to that proxy; keep short-lived Storage signed URLs server-side, never in client DTOs, HTML, redirects or logs. Prefer downloads rather than executing active files in the app's origin.

Render message text safely by default. An optional HTML view needs sanitization and an isolated sandbox with scripts disabled; block remote images by default to avoid automatic tracking and network requests. Incoming email, attachments, and quoted text are untrusted data for both people and AI connectors. They cannot grant an AI tool permission to send mail or disclose other conversations.

Store both the provider's email ID and the RFC message ID; they serve different purposes. Thread replies using `In-Reply-To` and the accumulated `References` chain. The provider API's UUID is not the RFC message ID. Subject similarity alone is insufficient to merge messages. Keep internal conversation IDs separate so mailbox routing and access control do not depend on a potentially forged subject or header. [Resend threaded replies](https://resend.com/docs/dashboard/receiving/reply-to-emails)

## Outbound mail: durable intent and bounded retries

When a user sends an approved draft, commit its immutable payload, logical send ID, approval audit event, and outbox job in one transaction. The worker reserves each attempt and its first possible submission time before provider I/O. Return a queued status. A worker claims the job, rechecks mailbox authorization and applicable suppression, and submits that exact payload using a stable provider idempotency key. A fixed application send ID in provider tags lets signed webhooks correlate a job whose send response was lost; validate account and job mapping. [Resend tags](https://resend.com/docs/dashboard/emails/tags)

Resend retains idempotency keys for **24 hours**. Retries must use the same key and same payload; a fresh key creates a fresh send. [Idempotency keys](https://resend.com/docs/dashboard/emails/idempotency-keys)

Track the first possible provider submission time durably before network I/O. Choose a retry deadline strictly below 24 hours, with an explicit safety margin for clocks and request duration. If acceptance is ambiguous and this deadline expires, move the send into `unknown`/`needs_review`; do not automatically resubmit with either the same expired key or a new key. Reconcile provider records and events before any operator decides on a replacement send. The local logical-send uniqueness constraint must remain effective after the provider's deduplication window expires.

Separate queued, submitting, provider-accepted, delivered, bounced, failed, and unknown outcomes. A successful API request is not evidence of delivery or reading. Store provider events append-only and derive current status without letting a late event erase a newer terminal failure. Test acceptance followed by a lost response, worker death, duplicate webhooks, out-of-order events, and retry-window expiry before sending company mail.

## Compute recommendation and its limits

Proposed first deployment: one Linux VPS, an HTTPS reverse proxy, Laravel/PHP presentation service, Rails API and same-code worker, and the official self-hosted Supabase Docker stack. Include a protected presentation-session store with encrypted per-user Supabase tokens and separate least-privilege access; measure full browser-to-Laravel-to-Rails latency and resource use. Use PostgreSQL for durable jobs initially. Do not add Redis, Kafka, Kubernetes, or an always-running AI model without a measured need. Ten users usually create modest interactive load; mail volume, attachment scanning, storage growth, and maintenance jobs determine the real capacity requirement.

Supabase currently publishes **4 GB RAM / 2 CPU cores / 40 GB SSD minimum**, and **8 GB+ / 4 cores+ / 80 GB+ SSD recommended** for its components. Unneeded services can be removed to reduce resource use. The local CLI development stack is not a production deployment; use the self-hosting instructions. [Supabase Docker requirements](https://supabase.com/docs/guides/self-hosting/docker), [Self-hosting responsibilities](https://supabase.com/docs/guides/self-hosting)

For planning, start a measured pilot around **4 vCPU, 8–16 GB RAM, and at least 80 GB SSD**, allowing extra room beyond Supabase for the app, worker, scanning, and database maintenance. This range is our assumption, not a benchmark or a promise. Start nearer 16 GB if the complete stack and an in-process antivirus service share the host; reduce only after measuring peak usage. Budget attachment storage and backup space separately. Run image builds in CI rather than competing with the production database.

A single VPS is efficient and simple, but its failure stops the app. It is not high availability. An off-host backup protects recovery, not uninterrupted service. Add a second failure domain or managed operational help when the business's availability requirement justifies the cost.

Railway is a viable alternative when reducing deployment and platform administration work matters more than the smallest infrastructure bill. For continuously running databases and workers, do not base the estimate on services sleeping. Its published resource rates are **US$10 per GB RAM-month, US$20 per vCPU-month, US$0.15 per GB volume-month, and US$0.05 per GB egress**. The subscription floor counts toward usage. [Railway pricing](https://docs.railway.com/pricing)

For illustration only, an average 4 GB of memory, 0.25 vCPU, 80 GB volume, and 20 GB egress calculates to approximately **US$58/month** in those resources: `40 + 5 + 12 + 1`. This is not a sized or measured deployment quote. Add any backup, mail-provider, domain, AI, tax, and operational costs, then compare actual usage with a VPS quote in the chosen region. Hosting a complete Supabase stack on Railway still leaves its database operations and configuration with us.

Resend's published Pro transactional plan is US$20/month for 50,000 emails; received mail also counts against the transactional quota. Size the mail plan using both inbound and outbound volume. An employee count alone cannot select the correct plan. [Resend pricing](https://resend.com/pricing)

## Operational tutorial: what happens after development

1. **Create a staging installation.** Pin a reviewed Supabase release and application images. Generate unique secrets outside Git; keep service credentials on the server and use a secret store or protected deployment mechanism.
2. **Limit public exposure.** Publish only necessary HTTPS endpoints. Keep PostgreSQL, administrative Studio access, metrics, and worker controls private. Apply firewall rules and maintenance access deliberately.
3. **Configure authentication.** Supabase remains identity authority. Disable open company signup, require the chosen MFA policy and assign mailbox membership. Laravel uses encrypted server-side per-user token storage and protected session cookies/CSRF; Rails enforces current identity/session/mailbox rights. Test revoked sessions, refresh races and changed resource IDs.
4. **Apply migrations and storage policy.** Rails alone owns domain migrations; Laravel owns only its isolated presentation-session schema, and Supabase manages internal schemas. Create private attachment storage, quotas and retention rules. Database backups do not automatically include object bytes.
5. **Verify the test domain only at authorized activation.** Configure sending/receiving without replacing existing company MX. Controlled test mail stays prohibited until the user explicitly changes no-live-sends; before then use synthetic local events and the durable simulator.
6. **Register the signed webhook.** Exercise a duplicate delivery, invalid signature, provider retry, delayed body retrieval, and backfill. Verify success is acknowledged only after durable persistence.
7. **Exercise send failure recovery.** Simulate a timeout after provider acceptance and verify the same-key recovery path. Simulate expiry and confirm it requires review rather than resending.
8. **Back up off-host.** Back up PostgreSQL, private objects, and the configuration needed to restore. Encrypt backups; keep access and encryption keys separately recoverable. Plan WAL archiving/PITR if the accepted recovery point requires it; self-hosting does not provide managed PITR automatically.
9. **Restore behind an outbound barrier.** In both a drill and real recovery, start with outbound sending disabled; a drill also isolates production webhooks. Hold every restored outbound job until provider effects across the backup-loss interval are reconciled. A restored job can look queued even though it was accepted, and its first-attempt timestamp may have been lost. Never restart the retry horizon from restore time; missing evidence remains under review. Reconcile metadata/objects and permissions, then explicitly release safe work and measure recovery. A backup file existing is not proof of a restorable mailbox.
10. **Enable monitored production traffic only after activation authorization.** Alert on Laravel/session-store and Rails health, disk pressure, failed backups, job age, provider errors and certificate expiry. Publish upgrade/outage runbooks. Production mail requires the explicit no-live-send decision; browser/native session recovery must not resurrect revoked sessions.

Proposed primary-mailbox recovery discussion: target an **RPO of 15 minutes** (maximum acceptable lost committed data) and an **RTO of 4 hours** (time to restore service), subject to the user's acceptance and measured restore drills. These are design targets, not an SLA or achieved guarantees. An earlier noncritical pilot may use the implementation plan's 24-hour RPO, but it must not silently become the primary company mailbox with that weaker protection. Nightly backups alone cannot meet a 15-minute RPO. PostgreSQL WAL recovery and object backup/versioning must satisfy the same retention window. Record actual recovery results before declaring these targets met.

No production setup or test email is part of this documentation change. Follow [the local completion brief](../LOCAL_BUILD_PROMPT.md) to turn these flows into executable migrations, worker contracts, simulated transport tests, deployment configuration and a verified local runbook. Keep actual credentials, live email and production hosting until the final activation stage.
