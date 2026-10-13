# ADR 0002: Rails domain backend and Laravel presentation

Date: 2026-10-13. **Stack selected by the user; implementation details require the pending task consultations and verification.** The user explicitly confirmed “Laravel Blade/Livewire UI + Rails API” and requested docs only. This supersedes React/TypeScript as the product frontend and Node as the domain backend. It does not claim those consultations ran, introduce application code or authorize live activation.

## Decision and terminology

Use Ruby on Rails for the central mailbox API and worker. Use a separate PHP/Laravel presentation application with Blade templates, Livewire for server-assisted UI interactions, Alpine/plain JavaScript for immediate browser behavior and Anime.js for restrained motion. TypeScript can remain in MCP, protocol bindings, simulators and tests; do not install a React/TypeScript product UI under this decision.

Laravel is itself a server framework. Calling it our frontend means it renders and coordinates presentation through a **backend for frontend (BFF)**, while Rails owns the domain. It adds a PHP runtime, patching/deployment work and a request hop. This is a user-selected separation, not a claim that two frameworks are faster or safer than one. Laravel documents Blade/Livewire and JavaScript framework options; here the PHP/Livewire path is selected. [Laravel frontend](https://laravel.com/framework/docs/13.x/frontend).

## Framework choices by surface

| Surface | Choice | Reason and limit |
| --- | --- | --- |
| Web rendering | Laravel + Blade + Livewire | Server-rendered views and cohesive PHP presentation components; keep business rules in Rails |
| Immediate interaction | Alpine/plain JavaScript + Anime.js | Typing, focus, menus, selection and animation stay local; persistence still requires acknowledged API results |
| Rails backend | Rails API + same-code worker | One domain model, authorization and durable transaction owner |
| macOS | Rust/Tauri host, unprivileged remote mailbox view; separate trusted bundled assistant panel | Reuses the Laravel web experience without distributing a PHP server or granting remote mail native powers |
| Windows | C#/.NET WinUI host with WebView2 following the same two-surface boundary | Requested C# GUI lane; actual integration, version floor and packaging must pass Windows tests |
| Android | Requested Java client with Android Views | Native screen/lifecycle implementation of Rails contracts; no Java domain server |
| iOS | SwiftUI client | Native lifecycle, accessibility and API integration; no PHP on the device |

Livewire includes Alpine and supports browser-local interactions without a PHP round trip; do not load duplicate Alpine runtimes. Keep composer keystrokes/local selection in JavaScript, debounce searches/autosave, paginate lists and preserve state/focus during DOM updates. These are project design choices to measure. [Livewire Alpine](https://livewire.laravel.com/docs/4.x/alpine).

Spring Boot is a Java/JVM application framework, and Ktor provides Kotlin server/client networking tools. Neither is the UI toolkit choice for this Laravel web frontend or the requested Java/SwiftUI clients. Adding another domain server would compete with Rails. If requirements later justify Kotlin mobile UI, evaluate an actual UI toolkit in a new decision rather than calling Ktor a renderer. [Spring Boot](https://spring.io/projects/spring-boot/), [Ktor server projects](https://ktor.io/docs/server-create-a-new-project.html), [Android Views](https://developer.android.com/develop/ui/views/layout/declaring-layout), [SwiftUI](https://developer.apple.com/documentation/swiftui).

## Mandatory server boundary

Laravel may render, validate presentation inputs, hold its browser session and call a fixed Rails origin through an allowlisted API adapter. It has no Eloquent mail models, mailbox migrations, sender jobs, provider keys, privileged Supabase client or direct domain queries. Rails receives the individual user's verified token, checks current session/grant and mailbox access, and owns every domain mutation. A BFF service identity or client-supplied user/mailbox ID never replaces user authorization.

Supabase remains the identity authority. Use its supported login flow through a reviewed authentication adapter; do not create an independent Laravel password/user-permission database. Keep per-user access/refresh material encrypted in a protected server-side presentation session store, outside Livewire properties, HTML, browser storage and logs. Use a host-only Secure/HttpOnly/SameSite cookie, CSRF checks, exact origins, session rotation and bounded idle/absolute expiry. Serialize refresh for a session so parallel components cannot race rotating credentials. A web session, native session and MCP grant have explicit separate identities and revocation tests.

If PostgreSQL stores Laravel sessions, use a separate private presentation schema, restricted role and Laravel-owned presentation-session migration lane. Rails alone owns domain migrations; Supabase owns Auth/Storage internal schemas. Laravel's role cannot read mail tables or Auth internals. Session-store failure denies protected web operations; no unsigned cookie or universal bearer fallback. Session restore invalidates old browser sessions unless replay-safe revocation/refresh handling is demonstrated.

Rails verifies Supabase JWT signature, issuer/audience, expiry and authoritative session validity for user-token calls. Opaque MCP grants instead require secure hash/constant-time verification, active owner/grant, expiry, revocation and scope checks. Both paths enforce current user status and mailbox membership; never pass an opaque grant through a JWT-only validator. Logout must invalidate the BFF session and its provider refresh/session access; define local-device versus all-device logout explicitly. Test an otherwise valid JWT after revocation. UI-hidden buttons and Livewire property protections are not permission checks. Public component state/action arguments are untrusted. [Livewire security](https://livewire.laravel.com/docs/4.x/security), [Supabase sessions](https://supabase.com/docs/guides/auth/sessions).

Use one aggregate mailbox response where possible instead of one Rails request per component. Set request deadlines/body limits, bounded concurrency and stable error codes. Do not automatically retry ambiguous writes with a new identity. Human send approval travels through Laravel to the same Rails approval endpoint and immutable ledger. PHP SDK/MCP grants remain read/search/draft only; the browser BFF uses the human's ordinary API authority, not a widened connector grant.

Authenticated page/API responses containing mail use no-store and no shared cross-user cache. Avoid keeping message bodies in Livewire session payloads or persistent browser caches; retain only necessary current render data. Browser, reverse-proxy and service-worker policies must not leak a previous user's mail. Stream attachments through the authenticated Laravel-to-Rails proxy with current authorization, size limits and backpressure; keep Storage signed URLs server-side. Scanning/quarantine rules are unchanged.

## Native trust boundary and tradeoff

Blade/Livewire requires the remote PHP server and cannot become a static application bundle. Reuse it in a remote desktop mailbox WebView with **no native capabilities/host objects/web-message command forwarding**. Restrict navigation, popups, downloads and external opening; never accept an email-supplied URL as a native command. Render hostile message HTML in the already required sandboxed content frame.

The desktop assistant is a separate trusted bundled panel with narrow allowlisted IPC and separate credentials/data grants. No remote script, window event, URL parameter or cross-window message can invoke it. Enforce window/origin-specific capabilities on Mac and equivalent controls on Windows. If the chosen host cannot prove this separation, ship the web mailbox and keep the native release pending; never grant broad remote capabilities to make the bridge work. [Tauri capabilities](https://v2.tauri.app/security/capabilities/), [WebView2 security](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/security).

Desktop mailbox use therefore depends on connectivity and the Laravel server. Show loss of connection honestly; do not claim offline mail or convert local animation into a successful save/send. A second fully bundled mailbox renderer is deferred until an explicit offline/native requirement justifies its duplicated UI and synchronization cost. Mobile clients use their own native views and API contracts; they are not a packaging shortcut for Blade.

## Quality and evidence

No framework guarantees “ultrafast, ultrasecure, ultra reliable.” Measure browser interaction, full browser-to-Laravel-to-Rails latency, database work, native launch/resource use and recovery under representative data/faults. Keep Ruby/PHP dependencies minimal, pin supported releases after compatibility review and record security update ownership. A single VPS remains a single failure domain.

[Cross-platform testing](../cross-platform-testing.md) defines concrete target runtimes, security failures, provisional performance budgets, test fixtures and release evidence. [Component reuse](../component-reuse-playbook.md) defines source provenance and the React-to-Blade translation boundary. The existing [reliability contract](../contracts-and-reliability.md) still governs every sender and client.

The three named Claude consultation prompts remain for the next agent. Update their packets with this selected stack and ask them to challenge its implementation and tradeoffs; do not silently switch frameworks or describe this user choice as completed model consensus.
