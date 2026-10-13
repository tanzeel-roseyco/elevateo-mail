# System architecture

Updated 2026-10-13. **User-selected stack: Rails backend, Laravel Blade/Livewire frontend, self-hosted Supabase and Resend.** The user confirmed the two-server Rails/Laravel interpretation. Implementation design reviews and the three named Claude consultations remain pending for the next agent. This update changes documentation only; no application exists yet.

Read [ADR 0002](decisions/0002-rails-laravel-presentation.md) for framework boundaries, [the diagram](architecture-diagram.md), [component reuse](component-reuse-playbook.md) and [cross-platform tests](cross-platform-testing.md). They supersede earlier React/TypeScript frontend and Node-domain defaults. TypeScript remains allowed for scoped tooling/MCP, not the product frontend.

## Context and ownership

The web path is **browser → Laravel presentation → Rails API → PostgreSQL**. Native mobile and mailbox MCP call Rails directly with their own scoped user identity. Rails API and worker share one domain codebase; the worker alone submits mail. Supabase Auth owns identity; Storage holds private quarantined objects. Resend is external mail transport, so self-hosting Supabase does not make the full email chain self-hosted.

About ten staff use nine addresses across one or two domains; actual addresses, aliases, routing and MX ownership are still unknown. Local tests use synthetic addresses and a durable provider simulator; no live sends, warmup, DNS changes or provider connection are authorized by this documentation update.

## Containers and data boundaries

| Component | Responsibility | Persistent data / authority |
| --- | --- | --- |
| Laravel / PHP presentation server | Blade views, Livewire actions, allowlisted Rails adapter, browser session/CSRF | Separate protected session store only; no mail-table, provider or Supabase privileged access |
| Alpine/plain JavaScript + Anime.js | Immediate local interaction, editor integration, accessible motion | Necessary render/unsaved state; no authoritative send result or browser token store |
| Rails API | Per-request identity/authorization, domain commands, transactions, signed webhooks | Restricted PostgreSQL domain role; private Storage adapter |
| Rails worker | Same domain code, durable jobs, send/reconcile, import and attachment pipeline | Separate limited worker role; only provider submission authority |
| Supabase Auth / PostgreSQL / Storage | Identity, durable application data and private objects | Separately owned internal schemas and domain/session roles; encrypted backups |
| Mac Rust/Tauri and Windows C# host | Remote mailbox WebView without native powers; separate trusted assistant panel | Web session isolated from OS-protected assistant credentials |
| Java Android / SwiftUI iOS | Later native mailbox clients of Rails | Platform-protected session material; offline mail deferred |
| TypeScript mailbox MCP | Read/search/draft tools calling Rails | Expiring mailbox grant; no send, direct SQL or provider keys |
| Local Express provider simulator | Deterministic signed events and fault-controlled submission | External acceptance ledger outside application restore target |
| Scanner / reverse proxy / backup services | Quarantine, TLS and bounded routing, recovery | Include footprint and operational ownership in capacity planning |

Laravel adds a PHP process and a network hop. Co-locate it with Rails initially, aggregate API reads and measure complete request latency. The service split satisfies the selected stack; no claim of superiority comes from framework count. Avoid an additional Spring/Ktor/ASP.NET/Go/Python domain backend.

## Proposed repository structure

These paths are implementation destinations, not directories created by this documentation change:

```text
apps/web/app/Livewire/                 PHP presentation components
apps/web/app/Services/RailsApi/        allowlisted user-scoped Rails HTTP adapter
apps/web/resources/views/             Blade layouts and components
apps/web/resources/js/                Alpine/plain JS, editor and Anime.js hooks
apps/web/resources/css/               shared design tokens and web styles
apps/web/database/                    presentation-session schema only if required
apps/server/app/controllers/          Rails HTTP/auth/webhook boundary
apps/server/app/domain/               access, conversations, drafts, delivery, audit
apps/server/app/workers/              lease/import/reconciliation processing
apps/server/app/adapters/providers/   Ruby Resend and simulator adapters
apps/server/db/                       sole domain migration lane
apps/server/test/                     Ruby and real-PostgreSQL tests
apps/provider-simulator/              local-only TypeScript/Express provider
apps/desktop-macos/                   Rust/Tauri host, isolated views and DMG
apps/desktop-windows/                 C# host, isolated WebViews and installer
apps/mobile-android/                  Java Android client
apps/mobile-ios/                      SwiftUI client
packages/desktop-assistant-ui/        trusted bundled CLI panel; no remote mailbox DOM
packages/design-tokens/               portable CSS tokens and interaction specifications
contracts/                           OpenAPI/event/CLI schemas and fixtures
packages/contracts/                  tooling/MCP bindings and validators
packages/mcp/                        TypeScript stdio mailbox tools
third_party/upstream/                immutable reference snapshots
infra/                               future deployment and Supabase integration
```

Rails controllers call explicit domain operations such as approve draft or assign conversation; those operations enforce transactions and authorization. Provider-specific mapping stays in the Ruby adapter. Livewire calls the PHP HTTP adapter, never a mailbox database model. The UI may validate inputs for helpful errors, but Rails and database constraints decide validity.

## Identity, sessions and untrusted content

Laravel owns the browser cookie/session boundary; Supabase remains identity authority. Store encrypted user access/refresh tokens server-side, not in Livewire public properties, HTML or browser storage. Use secure host-only cookies, CSRF/origin checks, session rotation, refresh serialization and defined expiry. If PostgreSQL holds presentation sessions, give Laravel only a separate private schema/role; it has no domain or Auth-table access. Login/logout, session-store restore and individual/all-device revocation must be designed and tested as in ADR 0002.

Rails selects a defined credential validator: Supabase JWTs require signature/issuer/audience/expiry and authoritative session checks; opaque connector grants require secure hash/constant-time verification plus current grant owner, expiry, revocation and scope checks. Every protected operation also checks current user status and mailbox membership. It cannot trust a BFF-supplied user ID, cached UI role or service identity as the user. For JWT sessions, check inactivity/time limits as well as session existence. Keep any cookie-authenticated Rails endpoints under their own CSRF boundary; public webhook routes use signature validation and bounded ingestion. [Supabase sessions](https://supabase.com/docs/guides/auth/sessions), [Rails API middleware](https://guides.rubyonrails.org/api_app.html).

Ordinary Rails connections assume restricted database roles and transaction-local verified claims; pooled connections must not leak identities. No owner/superuser/BYPASSRLS role for ordinary requests. Supabase owns Auth/Storage schemas; Rails owns domain migrations; Laravel's optional session migrations own only presentation storage. Mobile and assistant native sessions use reviewed system-browser/PKCE flows and OS secure storage. MCP grants intersect current user/mailbox permissions.

Every Livewire action argument is untrusted. Rails checks authorization even when a page was allowed moments earlier. Incoming/pasted HTML is sanitized and rendered in a restrictive isolated frame; remote images are blocked by default. Authenticated data is no-store, with no cross-user cache or persistent browser mailbox cache. Never expose secrets in application/native bundles.

Attachments stay private and quarantined until scanning succeeds. Downloads pass through a currently authorized streaming API/proxy; Laravel forwards to Rails without becoming a new attachment authority. Storage signed URLs remain server-side, never issued to clients. Old application links must fail after revocation. Set size/type limits and backpressure and deny arbitrary email-supplied fetch URLs. Previously received bytes cannot be recalled.

## Reliable mail and recovery

Approval freezes the reviewed draft version, recipients, body and attachments. Approval, uniquely identified send intent/job and audit record commit in one PostgreSQL transaction. A worker leases it and commits before external I/O. The stable payload/key and first-attempt time survive restarts; lease generations protect database writes but cannot fence a provider that already accepted mail.

Use the explicit Rails-owned send ledger from [reliability contracts](contracts-and-reliability.md). Framework jobs can assist scheduling but must not replace durable atomic intent or introduce automatic ambiguous-send retries. Rails queue transaction semantics depend on backend/database placement. [Rails job transactions](https://guides.rubyonrails.org/active_job_basics.html#transactional-integrity-on-jobs).

Acceptance, delivery, bounce and reading are distinct states. A timeout is unknown, not failure. Retry identical payload/key only within the documented safe horizon; later work requires reconciliation or explicit resolution. Persist signed inbound events and import intent before acknowledging; deduplicate provider receipts and mailbox routes and tolerate reordered events. Laravel and every native client display only the state supported by backend evidence.

Back up database and objects, retain the simulator's external acceptance evidence across app restore and start restores with outbound dispatch held. Reconcile accepted effects before releasing old jobs. Include presentation-session invalidation, backup keys, object consistency, scanner outages and expired provider URLs in recovery drills.

## Native and operating boundaries

Desktop mailbox UI is the hosted Laravel experience inside an unprivileged WebView. A separate bundled assistant panel alone has narrow native CLI capabilities; no remote mailbox event, script or URL can invoke that panel. Do not package PHP/Supabase on user devices or promise offline mailbox functionality. If the host cannot prove this separation, native release is blocked while the web product remains testable. See [desktop/connectors](desktop-and-connectors.md).

One VPS can initially run Laravel, Rails API/worker, required Supabase services, scanner and backup facilities, subject to measurement. It remains one failure domain; backups are not high availability. Start with indexed PostgreSQL search and bounded polling. Add Redis, external search or more services only after measured need. Closing clients must not stop inbound processing or accepted jobs.

Prove local two-user flows, cross-mailbox denial, web/desktop/mobile lifecycle, latency under representative history, full-stack CPU/RAM/storage, crash recovery and restore. [Cross-platform testing](cross-platform-testing.md) defines the evidence matrix and distinguishes proposed targets from measured results. No “ultra” performance/security/reliability label is an acceptance substitute.
