# Cross-platform verification and release evidence

Status: documentation only, 2026-10-13. This is the next implementation agent's test specification. No application, test suite, CI workflow, benchmark, installer or deployment is created or claimed by this document. The user confirmed Laravel Blade/Livewire presentation and a browser-facing server, with Alpine/plain JavaScript and Anime.js for local interaction. Rails remains the domain/API/worker authority, Supabase supplies PostgreSQL/Auth/private Storage, and Resend is simulated until separately authorized activation.

## 1. Establish one reproducible test environment

Run backend, presentation-server and browser application checks in disposable Docker environments with pinned versions. Run native application checks on their target OS. Test against real local Supabase PostgreSQL, Auth and private Storage: SQLite, mocked permissions or a service-role-only fixture cannot establish production isolation or locking behavior. Generate disposable development secrets in ignored files; never use real company mail or production tokens in test artifacts.

Seed two isolated organizations, ten active staff in the primary organization, users with viewer/contributor/sender roles, private/shared mailboxes, and nine synthetic addresses across `alpha.test` and `beta.test`. Include aliases that resolve to the same mailbox, a disabled mailbox, a revoked user and an unrelated organization's user. Keep people, addresses, mailboxes and provider identities distinct. Use deterministic timestamps/IDs and fixtures containing Unicode, long threads, hostile HTML, oversized/malformed headers, deleted records, quarantined attachments and duplicate webhook events.

Use the durable fake provider required by [the local completion plan](local-completion-plan.md): it records accepted messages persistently and can accept then time out, reject, delay/reorder/replay events, expire idempotency keys and restart without forgetting prior acceptance. Use a controllable clock for the retry horizon. API/worker restarts and provider restarts must be independent. A test double that always succeeds is insufficient.

Enforce no live sends with both configuration validation and network policy: test services may reach only the local dependencies and fake transport; omit real Resend/SMTP/Instantly credentials; reject a live provider URL in the test profile. Tests must prove forbidden external send requests cannot leave the environment. Supabase invitation/password-reset mail goes to a local capture service. Provider verification mail, forwarding, campaigns and Instantly warmup remain disabled. Browser/network traces must use synthetic content and redact credentials.

## 2. Backend and presentation boundary tests

| Layer | Required verification |
| --- | --- |
| Rails operations and API | Authentication; current organization and mailbox permissions; strict request schemas; stable errors; bounded pagination; optimistic draft conflicts; immutable approved payload; one job per approved draft version; cancellation boundary; database rollback on partial failure |
| PostgreSQL and Storage | Test actual runtime roles and RLS, including attempted cross-organization foreign keys, forbidden joins/downloads, attachment quarantine and revocation; authenticate every attachment proxy request, with no client-visible Supabase signed URLs; test concurrent transactions with separate connections, not sequential mocks |
| Supabase Auth | Login/logout, expiry, refresh, current-session revocation, disabled user, role change and token audience/issuer validation; redirects restricted to registered destinations; no bypass through a privileged test-only client |
| Laravel presentation and BFF | Blade/Livewire: escaping, validation/error rendering, CSRF, secure session cookies, session fixation/logout, bounded Rails API timeouts, stale-session rejection and per-user cache isolation; test the real Laravel-to-Rails hop with the current user's bearer token, never an all-powerful service token |
| BFF session store | Server-side encrypted session/token storage under a separate least-privilege role; current revocation, refresh-token rotation races, expiry, deletion/logout and encryption-key rotation; cookies contain only an opaque session identifier and no provider credentials |
| Cross-language contract | Versioned request/response schemas, unknown enums, missing fields, timeout/conflict errors and previous released client compatibility; Laravel/native clients cannot obtain database or Resend privileges or become alternate send authorities |
| Upgrade and rollback | Apply migrations to an empty database and a representative prior release; verify expand/contract compatibility and supported rollback/recovery; never assume a destructive down migration restores lost data |

Rails provides unit/integration/system testing facilities; Laravel supports unit and feature tests. Pick the project conventions once and document the exact runnable commands when applications exist. The Laravel lane must not quietly introduce independent mailbox tables, queues, authentication truth or business rules. See [Rails testing](https://guides.rubyonrails.org/testing.html) and [Laravel testing](https://laravel.com/framework/docs/13.x/testing).

## 3. Browser, desktop and mobile matrix

| Target | Required runtime and tools | Minimum acceptance |
| --- | --- | --- |
| Web | Playwright projects for Chromium, Firefox and WebKit; add actual stable Chrome/Edge/Safari smoke runs for supported releases | Full mail journey, session expiry, keyboard navigation, long content, downloads, resizing, loading/empty/error/conflict states and all permission denials |
| Responsive web | Portrait/landscape profiles at 360/390, 768, 1280 and 1440 CSS pixels; narrow widths, zoom and touch; then physical iOS Safari and Android Chrome | Composer keyboard/viewport behavior, safe areas, touch targets, no hidden critical actions, no horizontal overflow and recoverable interrupted navigation |
| macOS | Actual macOS runner; Rust unit/integration tests for the proposed Tauri host; packaged-app interaction using supported native/WebDriver tooling | Install/launch/login/logout, Keychain isolation, callback replay rejection, menu/keyboard/focus, notifications, external links, sleep/wake and native bridge denials; test each released CPU architecture |
| Windows | Actual Windows runner; .NET unit/integration and UI Automation tests for C#/WinUI 3 with WebView2 | Clean-machine installer, credential storage, URI handler, Narrator/keyboard, DPI/multiple monitors, suspend/reconnect and update rollback; test each supported Windows/CPU release |
| Android | Java unit tests plus AndroidX/Espresso instrumented tests on emulator and a physical supported phone | APK install/upgrade, secure storage, permissions denied, rotation, process death, background/foreground, offline/reconnect, TalkBack and soft keyboard |
| iOS | Swift tests plus XCTest/XCUIAutomation on simulator and a physical supported iPhone | Session and Keychain behavior, Dynamic Type/VoiceOver, scene lifecycle, memory pressure, permission denial, deep links, background/foreground and real-device signed-install gate |

Playwright supports the three browser engines and device emulation; emulation is browser configuration, not proof of an installed native app. Its WebKit build does not replace a release smoke test on actual Safari. Pin the browser binaries with the Playwright version. [Browser support](https://playwright.dev/docs/browsers), [device emulation](https://playwright.dev/docs/emulation).

The Rust/Tauri Mac and C#/WinUI 3 Windows clients load the hosted Laravel mailbox in an unprivileged WebView. Their CLI panel is a separate trusted bundled surface. Test origin isolation and prove that hostile mail, remote-page script, navigation, `postMessage` and event forwarding cannot invoke native commands or reach CLI approval/session data. Granting remote content IPC to make a test pass is a security failure. Test external-link allowlisting, cookie separation, logout/cache clearing and denied navigation to unexpected origins on the actual OS WebView. No PHP server runs on the device and no offline mailbox is promised; loss of connectivity must produce an honest, recoverable state. Java Android Views and SwiftUI iOS use the same Rails APIs directly, without bypassing permission or attachment-proxy checks.

For Tauri, current documentation recommends WebdriverIO's Tauri service, whose embedded driver supports macOS; direct `tauri-driver` has different platform limits. Any embedded test server or privileged test plugin must be absent or disabled in release artifacts, with a release check proving that. [Tauri testing](https://v2.tauri.app/develop/tests/webdriver/). Use [Windows UI Automation](https://learn.microsoft.com/en-us/windows/win32/winauto/uiauto-usefortesting), [Android instrumented tests](https://developer.android.com/training/testing/instrumented-tests) and [Apple XCUIAutomation](https://developer.apple.com/documentation/XCUIAutomation) for the relevant platform evidence.

Automate accessibility rules, then manually exercise keyboard-only interaction, a screen reader on each released platform, visible focus, 200% zoom, appropriate contrast, error announcements and reduced-motion settings. Automated accessibility scans do not prove conformance. Opus-owned Anime.js effects must preserve focus and outcome visibility; reduced motion must remove movement without removing feedback. Visual snapshots use deterministic synthetic fixtures and are reviewed rather than blindly regenerated. Use Puppeteer only for a specific Chromium diagnostic that adds evidence beyond Playwright.

## 4. Common end-to-end scenario and adversarial cases

Every released client must complete the same scenario against the shared local backend: log in → receive a simulated message → assign it → add a private note → save a versioned draft → encounter and resolve a second-user conflict → approve the exact version → observe simulated acceptance → receive a simulated reply → log out. Verify persistence after API and worker restarts, correct per-user read state and denied access from the second organization. Clearly label acceptance as simulated, and acceptance as distinct from delivery.

Add adversarial cases for guessed resource IDs, stale membership, attachment proxy authorization, stored XSS/email CSS, blocked remote images, attachment redirect/SSRF attempts, CSV/export formula injection if export exists, CSRF, open redirects, MIME confusion, deeply nested/large content, API rate limits and sensitive logs. Test attachment/download boundaries separately from conversation access, including revocation between page load and download; no cache or reusable client URL may bypass authorization. Assert Laravel has no mailbox database permissions, Resend keys or domain-worker authority. No critical authorization or duplicate-send regression may be quarantined as a flaky test.

Mailbox MCP tests use real scoped API grants with a deterministic local client: allowed search/read/draft; denied cross-mailbox access, revoked grants and any send capability. In-app CLI adapters use fake executable processes speaking the pinned protocol: malformed/oversized frames, crash, timeout, cancellation, stale approval, output backpressure, duplicate turn retry, secret redaction and denied shell/filesystem tools. Incoming mail and model output must not expand tool scopes. Actual Codex/Claude compatibility stays a separate activation check; a fake executable is not proof of a live model connection.

For a selected loopback companion, test wrong Origin/Host, absent pairing capability, CSRF, DNS rebinding, token expiry, replay and revocation. Prove only loopback is bound. Test that arbitrary executable names, shell metacharacters and mail-provided paths cannot influence process creation. The browser, mobile app and mail renderer cannot launch a desktop CLI by themselves.

## 5. Fault injection and recoverability

Apply every case in [the reliability failure matrix](contracts-and-reliability.md#failure-matrix), including two competing workers, lost provider response after acceptance, provider key expiry, stale leases, reordered events, attachment-fetch failure, database outage and restart with `dispatching` rows. Assert persisted state, unique logical send count and audit events, not merely an HTTP status. Test retry boundaries with a fake clock and verify no automatic resend after the safe horizon.

Also interrupt the presentation-to-Rails connection, isolate the worker from PostgreSQL, fill a disposable database volume, interrupt an upload, restart the fake provider and revoke a session during an active client workflow. The UI must retain an unsent draft or explicitly report the recoverable limit; it must never convert uncertainty to “sent.” Enforce bounded timeouts, retry backoff and visible degraded states.

Restore a database backup and private objects into a fresh isolated environment, invalidate restored presentation sessions unless replay-safe revocation/refresh recovery has been proven, verify referential/object integrity and permissions, then run the common journey. Keep outbound dispatch held until pre-restore provider effects are reconciled; restored old jobs must not blindly resend. Record actual backup age, lost accepted writes and recovery duration. The proposed noncritical pilot RPO of 24 hours/RTO of four hours is not an approved production guarantee; a primary company mailbox requires the recovery-tier decision described in [the implementation plan](implementation-plan.md).

## 6. Performance and resource acceptance

“Ultrafast, secure and reliable” requires measured evidence, not a framework label. Before baseline collection, record hardware/OS, server resources, runtimes, network conditions, release build flags, database size and cold/warm cache state. Use ten active users with a repeatable workload; start with 10,000 and 100,000 synthetic messages and representative attachment metadata, then revise for observed real workload before rollout. Report sample count, p50/p95/p99, error rate and worst cases; never hide failed requests from latency results.

| Proposed budget | How to measure and interpret |
| --- | --- |
| p95 common API reads <500 ms | Measure Rails at the API boundary under the agreed ten-user workload; include authorization/database work; also report the full browser→Laravel→Rails→render latency and its breakdown; set and approve a numeric end-to-end budget from the baseline before release |
| p95 visible local interaction feedback ≤200 ms | Measure click/keypress-to-feedback on agreed baseline devices; this does not promise a network operation completed in 200 ms |
| Normal inbound visibility ≤60 seconds | From durable fake-provider event acceptance to authorized UI visibility; record external provider delay separately at activation |
| Animation near a 16.7 ms frame budget at 60 Hz | Trace real target devices, compare reduced-motion mode and identify long tasks; do not block send/typing on animation |
| Bounded startup, memory and energy | Record cold/warm startup, idle and busy RSS/CPU, battery/energy evidence, installer size and long-session growth for each native host; set numeric thresholds from baselines before release |

These are initial project targets, not measured results or availability SLAs. Include 150 ms added round-trip latency, constrained bandwidth and brief offline periods in the matrix; separate degraded-network results from normal conditions. Run a bounded burst test and a multi-hour soak to expose query growth, retained event listeners, reconnect storms, queue buildup and memory leaks. Record slow-query plans and index improvements. Introduce a broker, cache or service split only when the evidence shows the current boundary is inadequate.

## 7. CI lanes, artifacts and completion reporting

The following are lane specifications for future CI, not existing workflow names or executable commands. The next agent must create and document actual commands after implementation, without changing the acceptance requirements to fit what happens to pass.

| Lane | Trigger and required evidence |
| --- | --- |
| Documentation/provenance | Each documentation or reuse change: links, decision consistency, licenses and immutable snapshot verification |
| Application PR | Docker lint/static analysis, Rails and presentation tests, real PostgreSQL/Supabase contracts, fake-provider faults and browser smoke; dependency/secret scan with reviewed results |
| Browser regression | UI/security changes and scheduled runs: all engine/viewport projects, accessibility and reviewed visual/trace evidence |
| Target OS | Native changes and release candidates: actual Mac/Windows builds and interaction tests; Android emulator/iOS simulator plus physical-device release gates |
| Recovery/performance | Relevant storage/queue/query changes and release candidates: isolated restore, migration compatibility, benchmark and bounded soak comparison |
| Release candidate | Clean-machine install/upgrade/uninstall, supported previous-client compatibility, signed-update tamper/downgrade rejection, provenance/checksums, no debug bridges/secrets and pending activation gates |

Save commit SHA, fixture revision, command, tool/browser/OS versions, hardware, exit status, test counts, durations, logs and failures with each result. Keep screenshots/traces/videos/benchmark data synthetic and redact tokens, cookies and signed URLs. Restrict artifact access and retention. A rerun records both failure and rerun; flaky critical tests require a fix and regression, not an automatic pass.

After implementation, record bounded adversarial review assignments and findings in [code-reviews.md](../code-reviews.md), with a separate design-tradeoff review. The release report must distinguish implemented and tested, provider-simulated, actual-runtime verified, externally activated, and blocked/unverified. Missing Windows hardware, an iPhone, signing or provider credentials is an explicit unverified lane; it is never inferred from a browser screenshot. This documentation-only update supplies the plan and no application test result.
