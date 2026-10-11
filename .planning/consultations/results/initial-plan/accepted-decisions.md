# Accepted initial local design decisions

Decision date: 2026-10-12. Scope: the five initial PLAN tasks, at base `103baeb042925badbbc50dc0d3d3bfbf09ce8344`, with the evidence and dissent in [synthesis.md](synthesis.md). These decisions accept local architecture direction; they do not approve unreviewed dependency adoption, future task implementations or production activation. Publish/link them in the existing `docs/decisions` convention rather than creating a second ADR hierarchy.

## D-01 — one backend authority and one schema lane

Rails API and worker share one Ruby domain model. Rails alone authorizes and mutates business data. PostgreSQL is the source of truth for business state and the explicit durable send-job ledger. Supabase provides real local Auth, PostgreSQL and private Storage; it is not a second business-logic owner. Express is limited to the local durable provider simulator. No browser, native client, language SDK or mailbox MCP server bypasses the Rails business boundary.

Use one Rails application migration lane and distinct migrator, API and worker roles. Official Supabase services retain ownership of their internal schemas/migrations. Business migrations are reversible or have an explicit, reviewed safe recovery path. Normal application calls cannot use a table-owning or service role to bypass policies. RLS supplies a second boundary behind Rails authorization, not a replacement for it.

Rejected alternatives: Fastify as a simultaneous business backend, parallel domain implementations, Sidekiq/Redis as an additional job authority, and client-side direct privileged business writes. The additional language tools remain bounded deliverables, sequenced after contracts stabilize rather than deleted from scope.

## D-02 — real identity, permissions and pooled-connection isolation

Use real Supabase Auth locally. Rails validates the supported token/session mechanism, enforces current-session validity/revocation, derives organization/mailbox access from server-owned membership and uses the approved cookie/CSRF boundary. BE-02 must prove those paths before protected business APIs are usable; a decoded JWT or UI login indicator alone is insufficient.

Set application identity context only within the database transaction serving that authenticated operation. Missing or invalid context denies access. Test the actual restricted database role with a one-connection pool, user A then user B, success and rollback paths. Composite organization-aware constraints must prevent cross-organization references even when an API check is missed. A minimum fixture set includes two organizations, multiple users, shared and private mailboxes, plus denied nonmembers.

Private Storage must reject anonymous and unauthorized principal access. Later attachment downloads additionally check current mailbox authorization and scanner/quarantine state. Privileged local bootstrap credentials may exist for official setup; they stay outside client bundles and ordinary request execution. Real production secrets are unnecessary for local completion.

## D-03 — approval consumes a draft once

Human approval atomically checks draft status and current version, consumes the draft's send intent, saves an immutable full-envelope/content snapshot, creates exactly one durable send job and appends the audit event. A unique constraint on `(draft_id, approved_version)` alone does not prevent a second version of the same consumed draft from creating another send.

Approval of stale content returns a conflict. One draft produces one send intent. Retries reuse its job and immutable payload. A deliberate resend creates a new explicitly cloned draft and requires a new human approval; cancellation, rejection or timeout does not silently make a consumed draft sendable again. Agent-originated drafts retain a server-owned origin flag and require review of the exact recipients, attachments and content. No agent bulk-approval path is introduced.

## D-04 — keep provider evidence while fencing state changes

Provider I/O never occurs inside the approval transaction. Jobs use leases and monotonically increasing fencing generations. A stale worker cannot mutate the authoritative job/message projection or overwrite a newer owner.

Authenticated, attempt-correlated provider observations are append-only evidence even if their originating worker lease has expired. A fresh reconciler reads that evidence and applies a fenced, monotonic transition. Otherwise a delayed accepted response from generation 1 could be discarded after generation 2 marked the outcome unknown. Evidence ingestion validates job/attempt/provider identity and deduplicates; it does not treat arbitrary callbacks as proof of acceptance.

Timeout or crash after a possible provider side effect means `unknown`, not an automatic safe retry. Retry policy considers the provider's finite idempotency window and reconciliation evidence. Stable send identity and an immutable request allow repeat attempts of the same intent to reuse a key, but deterministic key generation cannot prove safety after restore or after provider key expiry. The exact key construction belongs to BE-03/04's fresh design gate.

## D-05 — restore starts held and keeps external evidence

An outbound hold controlled outside the restored business database defaults to held on restore. Restoring an older database must not re-enable dispatch from an old database flag. The local Express simulator persists its provider ledger outside the application backup/restore boundary and supports duplicate, delayed, lost-response and expired-key fixtures.

Operators reconcile externally observed sends against restored jobs before release of hold. Do not label a restored `pending` row safe solely because its deterministic key is reproducible. OPS-01 must exercise this failure scenario, record retained ledger ownership and measure local resources before accepting deployment sizing.

## D-06 — local email stays inside the fixture environment

All mail sending remains disabled or captured locally. Runtime configuration rejects live provider keys/nonallowlisted SMTP destinations, has no live fallback, and defaults to the local simulator/hold. This includes Supabase Auth signup, invitation and password-recovery paths. If used, Mailpit is a capture-only Docker service with relay disabled. Runtime mail egress is denied while dependency downloads/builds use an explicitly separate path.

Use synthetic two-domain fixtures that distinguish mailbox accounts, aliases, recipient routes, sender identities, shared/private visibility and Instantly eligibility. Aliases are not independent authenticated accounts. Receiving-route ownership is explicit (`resend`, external forwarder or none); Resend receiving is not automatically a conventional IMAP/SMTP inbox usable by Instantly. Inbound routing trusts authenticated provider envelope recipients, never an attacker-controlled MIME `To` header.

Webhook handling validates signature and timestamp tolerance before new side effects, durably deduplicates events, and also collapses multiple valid event IDs for one provider message where appropriate. MIME/resource limits and quarantine remain BE-05 responsibilities. No real DNS/MX migration follows from the receiving-subdomain recommendation.

Instantly connection and Resend activation remain held. Current account-connection side effects are unverified: no claim is made that every connection necessarily sends email. A later isolated task may prove a genuinely side-effect-free account inspection/connection flow within its authorized boundary; any send-authority grant, automatic verification mail, warmup or campaign activation requires the corresponding explicit activation decision. Disposable external accounts do not make live effects local.

## D-07 — shared client UI, explicit native trust boundaries

Retain the requested language allocation: React/TypeScript web UI; Rust/Tauri macOS host; C#/WebView2 Windows host; native Java Android and SwiftUI iOS work; bounded PHP SDK/conformance, Go read-only doctor and Python MIME/fault fixtures. Select C# WPF with WebView2 as the initial Windows shell unless target validation reveals a concrete incompatibility. A fresh client task must validate this choice and pin supported runtime versions. Do not install both WPF and WinUI to defer the decision.

Desktop hosts share the React UI and a versioned minimal bridge schema. Bridge commands describe narrowly scoped operations; the webview receives no arbitrary credential read/write API, shell primitive or native database authority. Credential Manager/Keychain access stays internal to the native host. Untrusted email content cannot access the bridge. Generate compatible API clients from one versioned OpenAPI source and prove regeneration does not silently alter committed outputs.

The originating user instruction prohibits rendering message content as HTML, while later local plans describe sanitized sandboxed HTML. Initial implementation uses plain text. DOMPurify and sandbox/CSP research remains conditional; no rich-HTML rendering is accepted until the authoritative requirement is reconciled. This prevents an implementation decision from silently overriding the stricter stated boundary.

Android/iOS may be sequenced after desktop; they are still required deliverables. First useful mobile acceptance includes inbox/thread/draft/approve and durable versioned drafts across process termination. Complete parity is tracked explicitly rather than implied by a smaller milestone. No mobile agent runner is required by this initial milestone.

## D-08 — agent connectors cannot acquire mail authority

Use separate Codex and Claude/Fable product adapters behind one lifecycle/protocol boundary. Reuse protocol and conformance fixtures across hosts rather than duplicating subprocess engines in Rust and C#. Keep credentials in supported product/native storage flows. No subscription entitlement or supported product-auth claim is made until official support and an actual authorized test establish it.

Fake local runner coverage comes first: malformed protocol, crash, cancellation, stale approval and denied tool tests. The mailbox MCP surface is read/search/draft only, with scoped, revocable grants. Actual product integration remains visibly unavailable with a reason until its authentication and lifecycle checks pass. Agent-suggested mail cannot bypass exact human approval.

## D-09 — reuse follows evidence, motion follows actual state

Preserve useful first-party work after inspecting the pinned sibling checkouts. Do not claim their source bodies were reviewed in the initial packet. Inventory actual components, domain boundaries, routing and underlying notices before FE-01. Port compatible primitives/behavior through the Rails contract rather than treating a whole-app copy or a numerical rewrite threshold as the default.

Audit security-critical foundations first: compatible Supabase component set, Ruby JWT and webhook verification, MIME limits, then actual frontend/host dependencies. Candidate editor selection uses the same paste/IME/quote/export fixture. Chatwoot/FreeScout are behavior references unless separately proven license-safe; no unauthorized enterprise/AGPL code enters the app. Six previously identified A01–A13 reuse sources keep provenance/notices and negative fixtures. New shortlist candidates are not approved merely because they are named in an opinion.

Opus 5.5 owns Anime.js/motion and any justified C++ task. Begin with small pane/chip/composer/save-ack transitions; the saved indicator follows server acknowledgment and no animation invents send state. Respect live reduced-motion settings and an in-app override, keep focus stable, and tear down timelines. INP and long-task budgets are targets to measure in the actual app, not claims of completed performance work. C++/Qt is deferred unless an observed requirement warrants it.

## D-10 — preserve every task gate and actual execution evidence

Every implementation and bounded repair task needs three independently started successful opinions from the requested exact models, followed by actual Astra MAX synthesis. Initial opinions cover only PLAN-RESEARCH/ARCH/AGENTS/CLIENTS/MAIL. Do not replace this with a majority vote, two opinions, a low-risk exemption or a CLI substitution for the required official Devin MCP route.

Use isolated branches, one writer per owned area, exact commit/packet hashes, actual model/session evidence and recorded task bounds. Astra owns contract decisions; one delegated writer owns the contract file at a time. Unknown session creation is reconciled before retry. Two unsuccessful bounded repair attempts escalate; architectural, authorization and data-loss changes return immediately to design review.

Every changed code area receives adversarial review in assignments of at most 200 lines plus a dedicated design reviewer. Record exact coverage, defects, fixes and defects per 1,000 reviewed lines. All application checks run inside Docker with real dependencies where semantics matter; actual UI and target-OS native validation remain required for their respective tasks. No sampling-only review exemption is accepted.

The requested Obsidian tradeoff connection is unavailable in the observed tool/resource catalog. [Analytical scenarios](tradeoff-scenarios.md) preserve reasoning but are not an executed simulation or an Obsidian capture. The missing capability stays explicit; no document here claims it passed.
