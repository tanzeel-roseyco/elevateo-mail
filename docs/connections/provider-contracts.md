# Elevateo Mail — proposed provider contracts

Development preparation only, checked 4 October 2026. This document does not approve backend implementation, live account checks, DNS changes or deployment. Product/local folder name is Elevateo Mail; requested GitHub repository name is `elevateo-mail`. Read [product plan](product-plan.md), [inspection](inspection.md), approved [frontend standards](../../.planning/STANDARDS.md) and proposed [backend standards](../../.planning/BACKEND-STANDARDS.md) together. Latest authorised selected-mailbox AI reading/drafting and approved-subdomain DNS scope supersede older draft prohibitions; exact execution still requires separate approval.

<!-- AIDEV-NOTE: Capabilities describe verified provider powers; app grants and send admission remain independent. -->

## 1. Ownership and records

Ten private users supply their own provider credentials. Google app sign-in is separate from mailbox consent. An API body never supplies authoritative `ownerId`, credential reference or provider account identity. Derive owner from the authenticated session; allocate connection IDs on the server. Route IDs select a record only within that owner. Provider account/mailbox IDs come from authenticated discovery, not a submitted address. Queued work resolves owner-scoped records again at execution.

| Record | Minimum fields and invariants |
|---|---|
| Connection | Server ID, owner ID, adapter kind/version, verified provider account key, lifecycle, health, revision, available capabilities, enabled grants, last successful check/sync. Separate lifecycle from network health. |
| Credential record | Owner/connection binding, opaque secret reference, key version, granted scopes, safe expiry/status. Ciphertext and wrapping material stay server-side; browser DTOs expose neither ciphertext nor secret reference. |
| Connected mailbox | Stable internal ID, authenticated provider mailbox key, owning user, selected-for-read flag, AI grant revision, sync cursor. Reconnect resolves this record instead of resetting allowance. |
| Send identity | Verified address, evidence/status, stable mailbox quota ID, allowed provider routes and purpose. Alias address is not a mailbox identity. Domain ownership alone does not prove mailbox control. |
| Capability grant | Read selection, AI read/draft selection, send enablement, revision and approval evidence. Provider scope must cover it; broader scope never enables an app grant automatically. |
| Send intent | Owner, mailbox, identity, provider route, purpose, immutable content/recipient revision, approval reference, user-scoped idempotency key, lifecycle and quota reservation. |

Resend identities must map to an already established stable mailbox quota identity before sending. Do not infer this mapping by matching local parts or permit an unmapped sender to bypass the cap. A reconnect, alias addition or transport switch preserves mapping; ambiguous account relinking pauses sending for review.

**Section review:** approve mailbox identity evidence and reconnection matching, including send-only identities that cannot authenticate a mailbox themselves.

## 2. Small adapter boundary

Use explicit adapter modules, not a plugin marketplace, arbitrary MCP loader or universal provider class. The internal call context is constructed by the authenticated use case and contains an owner-bound connection, validated configuration, resolved credential handle, deadline and cancellation signal. Never accept this context directly from the browser or AI tool.

| Operation | Input / result contract | Gate |
|---|---|---|
| Check connection | Validated adapter configuration → verified account, actual capabilities, safe health result or explicit limited-verification result. No test send. | Registered owner and credential binding. Sending-only keys may have no safe identity/read probe; report unverified rather than inventing success. |
| Discover mailboxes | Opaque owner/connection-bound cursor and bounded limit → selected DTO page plus next cursor. | Provider mailbox discovery available; never simulate mailboxes for send-only Resend. |
| Sync selected mailbox | Stable mailbox, provider cursor, bounded item/byte budget → message changes and cursor/reset-required. | Read grant and mailbox selection checked each batch. Cursor expiry requires bounded resync, never false empty results. |
| Fetch message/attachment | Owner mailbox/message ID and explicit byte budget → normalised text/metadata or safe failure. | Read grant; attachment access separately bounded. Remote HTML/tracking is not rendered. |
| Submit approved send | Immutable, admitted dispatch envelope → accepted with provider ID; definitively rejected; or outcome unknown. | Only server admission may call this operation. Available transport is not send authority. |
| Reconcile send | Attempt/provider ID → known outcome or unavailable/unknown. | Advertised capability and appropriate credential; optional, never assumed for every provider. |
| Revoke provider grant | Bound credential → revoked, unsupported/manual-step-needed, or failed with safe reason. | Local disable occurs first; provider revocation failure cannot restore app access. |

Capability names should be closed values such as `mail.read`, `mail.sync`, `mail.send`, `send.reconcile`, `provider.revoke`. App drafts use app storage and need no provider draft capability. DNS uses a separate port, grant and credential scope. Errors carry stable code, safe message, retry guidance and correlation ID; provider response bodies, tokens and raw headers stay out of client errors/logs.

Initial page proposal: default 25, maximum 100 items; positive integers only, cursor bound to owner/connection/query. Message/history/attachment byte limits and deadlines must be approved before enabling import. Empty pages are valid; invalid, oversized or revoked requests fail explicitly.

**Section review:** approve operations and numerical bounds; avoid adding mailbox writes/provider drafts before a real use case requires them.

## 3. Supported routes and provider facts

| Order | Product contract | Required restriction |
|---|---|---|
| Gmail first | One OAuth mailbox pilot; bounded read/sync; app drafts; separately enabled personal sending; then prove two-user isolation. | `gmail.readonly` reads; `gmail.send` sends. `gmail.compose` also sends, so do not request it merely to create app drafts. Determine verification and server-data policy route before launch. [Google scopes](https://developers.google.com/workspace/gmail/api/auth/scopes) |
| Resend campaign route | User-supplied sending key and verified approved sender metadata; opted-in campaigns only. | Sending-access keys can only send; no domain inspection, inbox reads or GET-based outcome reconciliation. No automatic escalation to full access. [Key permissions](https://resend.com/docs/api-reference/api-keys/create-api-key) |
| Optional Resend receiving | App-only receiving on an explicitly approved subdomain, verified inbound webhook plus bounded body retrieval under separately authorised credentials. | Receiving requires its routing setup; preserve company root MX and existing `in.elevateoco.com`. It is separate from connecting existing Gmail/IMAP mail. [Receiving](https://resend.com/docs/dashboard/receiving/introduction) |
| Optional Resend Inboxes beta | Evaluate separately if app-created mailboxes/threading/drafts are actually needed. | Official API labels Inboxes beta and provides creation; this is not evidence of importing arbitrary existing providers or production compatibility. No first-release dependency. [Create Inbox](https://resend.com/docs/api-reference/inboxes/create-inbox) |
| Named JMAP pilot | One agreed server/version/auth mode; discover session/account capabilities and certify mailbox read and optional EmailSubmission independently. | Protocol support does not prove endpoint reachability, permissions or safe retry. Creating EmailSubmission sends mail. [RFC 8621](https://www.rfc-editor.org/rfc/rfc8621) |
| Conditional IMAP/SMTP bridge | One named server after cloud runtime/cost feasibility; separate read and submission auth/health, TLS validation and folder mapping. | IMAP alone cannot send; SMTP submission may have uncertain acceptance without deduplication/reconciliation. No generic-server promise. [TLS guidance](https://www.rfc-editor.org/rfc/rfc8314) |

Resend sending-only onboarding must state that account/key health cannot be fully established by read APIs without sending. Obtain sender/domain evidence through an explicitly authorised setup/check path or provider dashboard evidence; do not treat self-declared metadata as verified. Keep campaign sending disabled until that evidence is accepted. First live send requires its ordinary content approval, never a hidden health probe.

Outcome strategy: use the same immutable payload and idempotency key for bounded recovery only within a conservatively tracked provider retention window. Resend retains idempotency keys for 24 hours; the application retains its attempt ledger longer. The retention start must be tracked conservatively from the earliest possible submission. A timeout cannot release quota or cause cross-provider fallback. [Resend idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys)

Delivery/bounce receipts require a separately configured signed webhook and owner/account mapping; a sending key alone does not configure or authenticate that channel. If webhook/read access is unavailable, show acceptance from the send response only, with delivery unknown. Unresolved submission after the recovery window stays paused for manual provider evidence; never call `get` with a sending-only key or replay as a fresh send.

**Section review:** approve this limited-key setup/outcome strategy and choose the named JMAP pilot; receiving and beta Inboxes are optional independent scopes.

## 4. Registration, updates and revocation

| Transition | Server contract |
|---|---|
| Register → pending authorization | Validate supported adapter/configuration; allocate owner connection; bind OAuth state/PKCE/redirect and one-time callback to that owner where applicable. Protected secret-entry flow never places keys in chat or URL. |
| Authorize/check → ready or needs action | Bind discovered account and credential; report missing capabilities/verification explicitly. Ready does not enable sending. Partial credentials cannot widen grants. |
| Update capabilities/selected mailboxes | Require expected revision and exact requested grant; increases require fresh approval/provider consent as necessary. Commit once, increment grant revision and invalidate affected stale tools/approvals. |
| Rotate credentials | Stage/check replacement under same owner/account, then replace atomically. Failure preserves old usable credential where permitted; different account requires explicit relinking and fresh identity evidence. |
| Provider expired/revoked → needs action | Stop affected reads/admissions, mark cache stale and preserve drafts. Do not fall back to another user's or another provider's credential. |
| Disable AI/read/send | Effective at authorization boundary immediately; cancel queued dependent work and reject stale revisions. Removing read access also stops AI reads for that mailbox. |
| Disconnect → revoked | Disable locally and cancel unsent jobs first; remove credentials/grants, attempt provider revocation where supported, report manual steps. Retention/export/deletion is a separate decision. |

Every dispatch worker checks current connection/grant revision immediately before submission. Revocation cannot recall a request already submitted; disclose this boundary. Retain only the audit/attempt metadata needed to identify outstanding outcomes, subject to approved retention. Retrying a disconnect is idempotent and cannot re-enable a record.

**Section review:** settle retained-mail/export policy and precise in-flight behaviour before implementing disconnect.

## 5. Shared send admission

All manual, reply, campaign and AI/MCP sends enter one use case. Adapter methods are internal. The server validates ownership, enabled send grant, mailbox/identity mapping, provider-purpose eligibility, exact current content approval, recipient bounds and consent/suppression. Marketing classification cannot be bypassed by calling it personal mail. Recheck suppression and revocation at dispatch.

Confirmed maximum is **30 per connected mailbox per day**, shared by all aliases, providers and application paths. Earlier aggregate ceiling is **600/user/day**, not an entitlement to exceed a mailbox cap. Lower provider quotas/pacing also apply. Rolling 24 hours and per-recipient counting across To/Cc/Bcc remain proposals; no executable counter should silently choose them. Sending outside Elevateo Mail cannot be enforced by this ledger.

After counting rules are approved: atomically create/deduplicate intent and reserve both mailbox and user allowance with outbox entry. At the final slot, concurrent sends permit only one admitted unit. Reservations for queued/in-flight/unknown work cannot expire while the work can still send. On late dispatch, reassess the current window without dropping its live reservation. Definite non-acceptance may release reservation with evidence; accepted/unknown retain appropriate charges. Deduplication returns the original intent, not a second reservation. No identity rotation or transport failover to evade limits.

**Section review:** approve day boundary/timezone, recipient counting and any reserved reply allowance. Those choices affect UI counters, queues and recovery together.

## 6. Small implementation slices after standards approval

1. `src/domain/schema.ts` plus proposed `connections.ts`: boundary schemas and pure grant/identity rules; replace fixed identity/domain assumptions through a versioned migration. Keep fictional data intact. Add behaviour tests beside modules.
2. `src/data/ports.ts`: add connection list/detail/register/update/revoke operations and paginated mailbox reads; preserve existing callers while introducing explicit send-intent status. `gateway.ts`/`mockGateway.ts` supply labelled simulated contracts; `store.ts`/`seed.ts` cache DTOs only, never credentials.
3. `src/features/settings/SettingsPage.tsx` and proposed `ConnectionsSettings.tsx`: activate `/settings/connections`, consume gateway contracts, show separate read/AI/send choices, partial verification, revoke and error states.
4. `src/domain/rules.ts`, `SendingSettings.tsx`, `IdentitySettings.tsx`, `CampaignWizard.tsx`, `CampaignTabs.tsx`, `Composer.tsx`: use stable mailbox allowance/verified send identities and consistent purpose validation. Current 500 max/40 default and repeated simulated batches must not become production policy.
5. Only after backend approval, introduce a small server connection use case, credential store, admission ledger/outbox and explicit Gmail adapter; server paths/layout are not present and must be chosen in the approved blueprint. Add Resend only after limited-key outcome strategy passes; JMAP and IMAP remain independent later gates.
6. Each slice updates dependent DTOs/UI, anchors and state/docs together. Docker lint/typecheck/unit/integration/provider-fake checks plus actual desktop/mobile Connections visual QA precede publishing. Live provider smoke tests need separate authorisation; fake tests cannot certify real delivery.

## 7. Contract acceptance cases

| Area | Happy case | Two likely failures / edge cases |
|---|---|---|
| Ownership | Two users connect their own Gmail and see only their records. | Other user's route/cursor/secret reference rejected; callback replay or owner mismatch rejected. |
| Read/draft | Selected Gmail mailbox syncs and AI creates app draft. | Broad provider token with send disabled cannot submit; deselected/revoked mailbox rejected even with cached tool capability. |
| Bounds | Empty mailbox page renders empty state and valid cursor page loads. | Zero/negative/over-max limit rejected; oversized body/import or expired cursor produces explicit bounded recovery. |
| Resend | Approved opted-in intent returns accepted ID via sending-only key. | GET/domain discovery never attempted with that key; timeout remains unknown with reservation and no fresh fallback send. |
| Lifecycle | Credential rotation preserves stable mailbox and quota. | Stale update revision conflicts; disconnect plus queued dispatch cannot admit new work, with in-flight uncertainty disclosed. |
| Admission | Manual Gmail and Resend campaign alias charge one mailbox allowance. | Concurrent final-slot intents cannot both pass; reconnect/new alias and duplicate AI action cannot reset or double-spend allowance. |
| Recovery | Signed receipt updates correct owner's attempt once. | Forged/wrong-account receipt rejected; unknown submission beyond idempotency window cannot auto-replay. |
| Self-host pilot | Named JMAP server exposes certified account/read capability. | Missing submission capability rejected; private/unsafe endpoint or failed TLS never bypassed. |

Pilot cost gate: ten users, bounded history/attachments/polling and the earlier maximum workload must be measured against hosting goal under A$15. Provider/AI/Google review costs are separate; IMAP persistent connections and beta mailbox storage have no proven fit yet.

**Section review:** accept these cases and bounds before implementation. No tests ran for this Markdown-only preparation; no application LOC changed.
