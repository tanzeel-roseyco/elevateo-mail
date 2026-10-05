# Backend foundation — 5 October 2026

Implemented under explicit user authorisation on `feature/backend-foundation`, preserving interrupted CLI files. This is the credential-free foundation requested by the outer backend brief, not the complete product in the embedded product roadmap. The Fable frontend worktree and all frontend source are unchanged.

## Architecture and safety

One modular Worker exposes HTTP, one-minute scheduled relay with immediate due approval enqueue and queue entry points. D1 owns sessions, mailbox permissions, consent, suppression, campaigns, immutable intents, quota reservations, receipts and plain-text messages. R2 is a reserved binding: attachment ingestion/download is not implemented. Queues carry only owner/intent identifiers; the database is the durable outbox. No Redis or extra message bus exists.

Live adapters are never constructed by entry points. Configuration accepts only fake/disabled mode, defaults dispatch paused, disables workers.dev and preview URLs, and contains placeholder resources. No cloud resources were provisioned. The build uses `wrangler deploy --dry-run`; it does not deploy.

Sessions contain hashed opaque tokens with expiry. There is no public signup, OAuth login or token-issuance endpoint; tests seed synthetic sessions. Owner predicates and composite foreign keys isolate every resource. API errors expose stable codes and correlation IDs without provider errors, tokens or message logs. Body reads are streamed and capped at 128 KiB, provider responses at 64 KiB. Responses disable caching. No production CORS policy is enabled; deployment must decide same-origin routing or an exact frontend origin.

## Sending semantics

The conservative simulation policy counts unique normalised To/CC/BCC recipients per immutable envelope, across manual, campaign and AI paths. Thirty recipient deliveries per mailbox in a rolling 24 hours is enforced atomically by SQL triggers on approval and dispatch. Ten connected mailboxes per owner and ten pilot users are database limits. Existing provider subject reconnects retain identity/quota; disconnected identities free connection slots but retain history and owner-wide quota. A 300-recipient owner ceiling prevents replacement rotation from evading the pilot allowance. The fake API rejects duplicate addresses and preserves provider subjects; production must additionally prevent aliases from creating separate quota identities. Real OAuth must bind the verified Google subject; an address supplied by a client is insufficient.

Draft creation stores a canonical content hash. The same idempotency key with changed content conflicts; approvals must match that exact hash. Approvals reserve quota immediately, schedules are bounded to 30 days, and expiry is scheduled time plus configured TTL (default one hour, range 60 seconds–one day). SQL constants are validated against environment values: quota changes require a migration. These are explicit conservative defaults pending final product policy decisions.

Pending, dispatching and unknown intents hold quota until cancellation or positive reconciliation. Accepted usage expires from actual dispatch time. Approval expiry, revocation, consent, suppression, campaign state and reply stops are checked again at the dispatch claim. A concurrent duplicate queue job cannot acquire a second claim. A stale claim becomes unknown after one minute; it is never automatically resent. Durable fake receipts survive provider reconstruction and positively reconcile acceptance. Scheduled lifecycle reconciliation checks at most20 unknowns per tick, with five-minute backoff and ten attempts; uncertain outcomes remain held. Persisted envelopes require an independently stored immutable digest before provider invocation. Legacy undigested rows fail closed. Gmail has no asserted send idempotency or definitive negative reconciliation; Resend's idempotency is adapter capability only. Neither live adapter is wired into workers.

Eligibility revoked after approval cancels pending work rather than occupying the first relay page forever. Cancellation of dispatching/unknown work is refused because acceptance might already have happened. Revocation after a provider request starts cannot recall the request; production UX must explain this boundary. Quota applies only to sends through this app.

## HTTP contracts and frontend migration

The first-journey handoff is [integration v1](contracts/integration-v1.md), with portable runtime schemas, authoritative quota and a tested HTTP consumer. [Docker-only fixtures](integration-fixtures.md) supply synthetic users/messages/sessions. The table below includes experimental foundation routes outside that handoff.

Every `/v1` route except signed events requires a Bearer session. Successful operations are marked `simulated`; IDs and inputs are bounded and validated. JSON mutations accept `application/json` with optional parameters.

| Endpoint | Foundation contract |
| --- | --- |
| GET/POST `/v1/mailboxes` | Owner's connections; creation supports fake subjects only, maximum ten |
| PATCH `/v1/mailboxes/:id/permissions` | Connected/sendEnabled/aiRead/aiDraft/aiSend flags; sending defaults off |
| POST `/v1/contacts/import` | 1–500 distinct validated addresses with consent source/opt-in; withdrawal suppresses, reimport never removes suppression |
| POST `/v1/campaigns` | Idempotent minimal draft record; retry returns persisted state |
| PATCH `/v1/campaigns/:id` | Running/paused state |
| GET `/v1/messages` | mailboxId, empty q only (search unsupported), limit 1–100, composite before/beforeId cursor; bodies omitted |
| GET `/v1/messages/:mailboxId/:id` | Lazy plain-text body, explicitly untrusted |
| POST `/v1/send-intents` | Validated mailboxId, to/cc/bcc, subject/body, kind, numeric revision, idempotencyKey; campaignId only for campaigns, optional scheduledAt |
| POST `/v1/send-intents/:id/approve` | Exact returned content-hash revision; approval does not mean delivery |
| POST `/v1/send-intents/:id/cancel` | Only draft/pending |
| GET `/v1/send-intents/:id` | Persisted send state including unknown/rejected/accepted |
| POST `/v1/ai/context` | Selected connected mailbox with aiRead, 1–20 message IDs, aggregate context capped at 100 KB |
| POST `/v1/ai/drafts` | Selected mailbox with aiDraft, matching ai-kind draft; never approves automatically |
| GET `/v1/health` | Owner send counts and truthful simulation/pause/integration flags |
| POST `/v1/events/:connectionId` | Registered fake connection only, timestamped HMAC, owner derived from stored connection |
| GET/POST `/unsubscribe/:token` | Hashed opaque token; GET confirms without mutation, POST suppresses/opts out/cancels eligible pending intents |

The existing `MailroomGateway` is unchanged and still uses the browser mock. This HTTP surface is deliberately not claimed as a drop-in implementation of its bulk `load` and `sendMessage`/threadId contracts. The frontend owner should add a gateway that creates, approves and polls intents, maps accepted separately from delivered, and handles conflicts/pending/errors. Campaign metadata, analytics, sender management, contacts reads, archive/star/settings persistence and complete thread models remain integration work. Replace prototype `runCampaignBatch` with server scheduling, never desktop timers. Keep message text out of HTML rendering. Coordinate this migration with Fable; this branch does not edit its worktree.

## Providers, events, AI and DNS

Dormant Gmail and Resend adapters use injected fetch, validated responses, timeouts and bounded reads. Gmail creates UTF-8 MIME with folded headers/body and BCC. Resend permits only opted-in campaign envelopes from a matching verified identity and exposes no inbox capability. Provider tokens exist only as constructor inputs in contract tests; production requires a per-owner encrypted credential store and refresh handling. Adapter tests do not prove live deliverability, inbox sync, Gmail JWT or Resend/Svix webhook compatibility.

Signed fake events allow a five-minute timestamp window and transactional replay receipts. Changed content with the same ID conflicts atomically. Bounce/complaint suppress; inbound stores text; reply stops the matching recipient/campaign only when its intent belongs to the same mailbox and owner. Production must additionally verify provider event authenticity, thread correlation and mailbox identity. The fake connection `secret_hash` is the high-entropy HMAC key material for the fake protocol, not a claim that a stored hash can verify arbitrary live provider signatures.

AI grant policies permit selected-mailbox read/draft with expiry; exact-hash send approval and mailbox aiSend are separate. Context is labelled untrusted. No CLI, arbitrary shell, filesystem tool, desktop host or MCP bridge is implemented or started. Production local bridge sandboxing and one-active-task scheduling remain work. Enrichment is a typed disabled port returning no contacts; Hunter/AMF are not silently invented and enrichment cannot create consent.

DNS policy validates exact approved TXT/CNAME/MX previews on explicit subdomains, including DKIM names. It protects root company zones and `in.elevateoco.com` descendants, rejects changed/unapproved/duplicate records and does not execute changes. There is no DNS client or credential binding. Root MX and existing routing remain untouched.

## Setup, tests and restore

From repository root, build `docker build -t elevateo-mail-backend-check -f backend/Dockerfile .`, then `docker run --rm elevateo-mail-backend-check`. This generates Worker types, lints, typechecks, bundles without deploying, and runs Node tests through tsx. Integration tests run real workerd/D1 bindings via Miniflare inside Docker, including migrations, concurrency, owner isolation, signed events, API workflows, restored persisted state and blocked-page queue fairness. No host or host-localhost tests are required. Miniflare may listen on loopback inside the disposable container; no port is published.

Pinned tooling: Node 24 Docker base; TypeScript for strict checks; zod for external boundary validation; Wrangler for generated platform types and dry-run bundles; Miniflare for genuine D1 integration; tsx for the built-in Node test runner; Node typings for test/tool code. Backend lockfile is separate to preserve the frontend lockfile. Miniflare 5 alpha is pinned to Wrangler's matching dependency; its exported v4-options converter keeps fixture configuration typed. Compatibility date 2026-10-01 matches the installed workerd build. Upgrade these together and rerun checks. Root development dependencies retain the previously documented three moderate audit entries; backend install reports zero vulnerabilities. No unrelated dependency upgrade was made.

Seven forward migrations preserve data; migrations 0006/0007 replace admission triggers with active-connection and indexed quota guards. Tests apply complete trigger statements and schema changes before seeding. For a future staging deployment, replace placeholder resource identifiers after least-privilege provisioning, apply migrations with dispatch config paused, and separately verify migration/restore against that environment. Destructive rollback requires a confirmed backup restore or reviewed forward repair, never an automatic table drop.

Restore procedure: stop consumers or enforce config pause before restoring; restore database/object snapshots and credential keys; call `prepareRestoredDatabase` before any consumers, which forces database pause and converts every restored dispatch claim to unknown; confirm consent/suppression/receipts and reconcile provider activity; only then explicitly resume eligible pending work. Missing controls fail closed. The included rehearsal copies a stopped local persisted D1 directory and verifies idempotency, suppression and paused unknown claims. Independent encrypted backups, object integrity, external outage alerts, RPO/RTO and cloud Time Travel restoration remain production gates.

## Credentials last and remaining gates

No credentials are needed for current checks. At integration time configure secrets through local provider login/Workers secret storage, never chat, source, browser bundles or logs:

1. Cloudflare account and least-privilege Worker/D1/R2/Queues provisioning identity plus resource IDs. No DNS grant. Agree staging/production separation and independent backup key ownership.
2. Google OAuth client ID/secret, reviewed redirect URI, approved scopes and consent route; per-user OAuth connections and securely encrypted refresh tokens. Decide session issuance, MFA, secret wrapping and revocation before enabling login.
3. Optional per-user Resend sending key and verified campaign identity; authentic webhook verification key after Svix implementation. Implement unsubscribe headers/link generation, reply routing and live controlled contract tests first.
4. Local Codex login on the user's device only when the restricted bridge exists. Claude login is optional. Enrichment keys are optional only after Hunter/AMF contracts are identified. No DNS credentials are required for manual previews.

Credentials alone do not activate this foundation. Activation requires a separately reviewed live dispatch factory, OAuth/inbox sync, webhook authenticity, identity and alias governance, frontend gateway integration, scheduling/queue cloud verification, backup/outage rehearsal, measured cost/latency, retention/import/attachment decisions, final quota policy and necessary visual/native release QA. Tauri installers/signing remain later work. No desktop/native checks or new UI screenshots are claimed for this backend-only change.
