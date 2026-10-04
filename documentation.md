# Product and design context

## Confirmed product
Elevateo Mail is a Windows personal inbox and consent-based campaign application. Ten independent users can connect up to ten mailboxes each across separate Google Workspace organisations or personal Gmail. Users remain private from each other.

Each connected mailbox may send at most 30 emails per day through the app. This permits at most 300 per user and 3,000 across the pilot. Rolling 24-hour counting by recipient delivery, including CC/BCC, is proposed; aliases, reconnects and different sending routes must share the same mailbox quota. The app cannot limit messages sent elsewhere.

Existing inboxes need real Gmail sync and notifications. Resend is suitable for eligible opted-in campaigns on owned verified domains, not a replacement for Gmail mailbox hosting. Named self-hosted providers follow through explicit capabilities; “any provider” is not an implemented promise. Users can add mailboxes, import recipients and import history.

Cloud scheduling keeps approved campaigns running while the PC is off. Local Codex is the primary AI provider; restricted Claude fallback uses each user's own account. Read selected mailboxes and draft are defaults; sending requires separate permission and approval. Hunter is optional personalisation. AMF needs identification. Provider keys belong to their user.

## Canonical planning documents
- [Product master plan](docs/product-master-plan.md): plain-English decisions, diagrams and section-specific review.
- [Backend blueprint](docs/backend-blueprint.md): data ownership, API boundaries, failure handling and rollout.
- [Efficiency plan](docs/efficiency-plan.md): resource/cost controls and measurable performance targets.
- [Connections contracts](docs/connections/README.md): provider capabilities, AI permissions and approved-subdomain DNS.
- [Draft backend standards](.planning/BACKEND-STANDARDS.md): backend foundation authorised on 2026-10-05; production and desktop decisions remain open.
- [Research index](docs/research/2026-10-04/README.md): six initial and ten follow-up assignments, evidence and limitations.

## Current prototype and its limits
The browser prototype has no real backend, provider integration, authentication, AI bridge or DNS access. Its 840 contacts, six campaigns and nine sender identities are fictional fixtures, not production capacity or permissions. Sending, scheduling, events and domain status are simulated.

- Campaign recipients need recorded opt-in and subscribed status; rules recheck suppression at simulated dispatch. Ordinary replies currently show warnings instead of campaign blocks. Production must classify message purpose and cannot permit this path to bypass marketing suppression.
- Campaign times use Settings' sending timezone. Replies default to the receiving identity; reply-all excludes our own addresses.
- Banners are per identity and opt-in. Changing sender restores that identity's default.
- Delivered means recipient-server acceptance, never read/opened. The backend must separately record provider acceptance and delivery evidence.
- Single stored folder per thread is a prototype simplification; Gmail integration requires labels and provider identifiers.
- Message bodies render a small markdown subset as React nodes. Real inbound HTML needs sanitisation and isolated display before rendering.
- Navigation and filters use URL state. Validated Zustand/localStorage data and seed fallback are prototype-only, not server persistence or recovery.
- Existing mailroom:data:v1 and mailroom:appearance:v1 keys remain unchanged after the product rename.
- MailroomGateway is the backend seam; several direct store mutations are a documented deferred review finding. Move these with pending/error/conflict UI when integrating the API.

## Backend direction, not implemented
One modular backend and one authoritative sending scheduler. Durable database records own users, mailbox connections, consent, suppression, campaign state, send intents and audit events. A queue wakes workers; it is not the source of truth.

Reserve quota atomically before dispatch. Check ownership, permission, consent, suppression and approval at the final admission boundary. Deduplicate incoming events. Treat timeout after a send request as an unknown outcome until reconciled; do not promise exactly-once external delivery or blindly retry.

Bound sync, imports, search, retained bodies and attachments. Load message bodies when needed, keep local AI off until requested, and separate urgent inbox/send work from imports. All runtime inputs and provider events are untrusted. Keep credentials out of logs/client bundles and isolate each user on every read, write and object lookup.

## Hosting and performance
Under A$15/month is the hosting target, excluding external email/AI subscriptions, Google verification and signing. Proposed 50 GB total cloud file storage including backups is not an agreed quota. Illustrative Workers/R2 base is A$10.47; a busy 100-mailbox, five-minute reconciliation scenario is about A$11.87 before push-driven work, retries, backup independence and other overages, using assumed FX/tax. These are estimates, not guarantees or measured benchmarks. See the efficiency plan for arithmetic and sources.

A small health screen should expose stale sync, unknown sends, overdue work, auth errors, capacity and backup age. Reuse provider logs and bounded counters. Name an independent outage checker, alert destination, backup trust boundary, key-recovery owner and costs before launch.

## Root MX incident and inbound routing
The user's pasted CTO messages report accidental root MX replacement on boltloop.co, flooda.co and elevateoco.com, followed by restoration to Google. These messages are incident context, not independently verified DNS state or permission to modify infrastructure.

Preserve company root MX. Gmail API access requires no MX change. MX priority is a preference among mail exchangers, not per-app routing or mail duplication. App-specific receiving can use a separately approved subdomain; in.elevateoco.com reportedly already has consumers and must not be repointed without checking ownership and dependencies. A campaign Reply-To on a subdomain does not capture mail addressed directly to a root-domain mailbox.

Users requested DNS management for explicitly approved subdomains. The design uses a separate broker with exact record previews, explicit approval, server-side policy and audit. AI and the application must never receive unrestricted zone credentials. If provider credentials cannot enforce the required boundary, keep writes manual until the broker containment is established. Read-only status is the first stage.

No DNS, AWS, Cloudflare or API-key changes were made. Recoverability of historical mail has not been investigated. The reported USD10 OpenAI project cap is unverified context, not authority to create keys or a guaranteed spending control.

## Remaining section-specific decisions
1. Quotas: approve rolling 24-hour/per-recipient counting, including manual mail and CC/BCC.
2. Data: retained history, import batches, attachment storage, export/deletion and regions.
3. Identity: authentication/MFA, external Google approval path and permitted Gmail-to-AI data use.
4. Connections: identify AMF and the first self-hosted server/API; review provider capability contracts.
5. Operations: independent backups/key recovery, outage destination, consent evidence and recipient jurisdictions.

See the master plan's review table rather than reopening already confirmed user/mailbox counts.

## Primary references
- [Gmail sync](https://developers.google.com/workspace/gmail/api/guides/sync)
- [Resend documentation](https://resend.com/docs) and [acceptable use](https://resend.com/legal/acceptable-use)
- [SES receiving setup](https://docs.aws.amazon.com/ses/latest/dg/receiving-email-setting-up.html)
- [C4 diagrams](https://c4model.com/introduction)

Capabilities, policies and prices were researched for planning and must be rechecked at integration. Separate domains reduce some reputation coupling but cannot guarantee isolation.

## Backend foundation (2026-10-05)
The credential-free backend is implemented in backend/. Canonical contracts, conservative quota semantics, secure setup, restore procedure and remaining integration work are in [backend-foundation.md](docs/backend-foundation.md). The browser prototype remains separate; no live provider or DNS operation is enabled.

Backend completion verification (2026-10-05): final Docker types/lint/typecheck/dry-run bundle and 24 tests passed. Twelve adversarial/design defects fixed. Task-owned Docker image/cache removed; persistent volumes retained. See docs/validation/2026-10-05-backend.md. Committed implementation retains disabled real sending, DNS and deployment; original CLI artifacts remain uncommitted.
