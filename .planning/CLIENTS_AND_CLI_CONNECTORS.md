# Client applications, premium motion and in-app CLI connectors

Status: documentation only, updated 2026-10-13. The user selected Rails backend, Laravel Blade/Livewire frontend, self-hosted Supabase and Resend. [ADR 0002](../docs/decisions/0002-rails-laravel-presentation.md) and [the architecture](../docs/architecture.md) supersede the earlier React/TypeScript product frontend. TypeScript remains for MCP/adapters and tooling. No client, connector or installer is built by this document; the three unsuccessful consultations remain [saved for the next agent](consultations/README.md), not retried here. Implementation-detail reviews remain pending. Read the [diagram](../docs/architecture-diagram.md), [reuse playbook](../docs/component-reuse-playbook.md), [desktop/MCP design](../docs/desktop-and-connectors.md), [local completion plan](../docs/local-completion-plan.md) and [test matrix](../docs/cross-platform-testing.md). Keep provider credentials, signing and live activation last.

## 1. Product and ownership brief

Codex first inventories the existing frontend and six snapshots, then completes the research/adoption gate. Follow [the adoption matrix](../docs/component-adoption.md) and reuse playbook: translate useful React interaction/markup/style patterns into Blade/Livewire and Alpine/plain JavaScript rather than adding a React frontend. Preserve licenses/provenance, replace unsafe authentication/raw HTML/send loops and record what was ported versus merely studied. A frontend mock is never evidence of backend completion.

| Work package | Requested owner | Required handoff |
| --- | --- | --- |
| UX, application shell, mailbox views, composer and connector panel | Fable 5 or Opus 5.5, in a separately started agent | Routes, design tokens, accessible states, typed API bindings, source provenance and browser evidence |
| Anime.js motion, visual refinement and every proposed C++ task | Opus 5.5 | Bounded brief, performance comparison, reduced-motion behavior and reviewed patch |
| Fable/Claude in-app CLI adapter | Fable 5; Opus 5.5 reviews | Verified official provider/protocol identity, authentication constraints, lifecycle/consent tests |
| Codex in-app CLI adapter | Codex | Version-pinned app-server protocol adapter, permissions and stream/recovery tests |
| Shared contracts, trust boundaries and final integration | GPT 6 ASTRA MAX architecture lead | Independently requested Fable 5, Opus 5.5 and Fable 5.1 opinions, disposition of disagreements and an ADR |

Official Anthropic documentation identifies `claude-fable-5-1` and `claude-opus-5-5`; the legacy Fable 5 page identifies `claude-fable-5` as still available. Fable and Opus are Claude models, not separate CLI products. Preserve the exact model requested for each assignment. [Current model catalog](https://platform.claude.com/docs/en/models/overview), [Fable 5](https://platform.claude.com/docs/en/models/fable-5/overview).

The coordinator verified Codex CLI 0.159.3 and Claude CLI 2.1.241 locally. A native GPT 6 ASTRA MAX architecture lead completed the provisional proposal. Three separate consultation attempts targeted the exact Fable 5, Opus 5.5 and Fable 5.1 model IDs through the installed Claude CLI with safe mode, tools disabled and session persistence disabled. Each failed before inference because the OAuth session had expired and could not be refreshed; no model usage or independent opinion was returned. These attempts establish an authentication blocker, not lack of model existence or a completed consultation.

Runtime access and account entitlement for those Claude assignments remain pending. Continue independent work while retaining the three unresolved consultation gates; obtain an explicit replacement decision if a requested model cannot be used. Never relabel another model or simulate an independent opinion. The coordinator records actual model ID, effort, task/session ID, scope, output and reviewer. Refresh authentication only through the provider's supported user-controlled flow; never collect session secrets into repository files.

Interpret the user's “C+++” as a request for C++ pending a more specific correction. It does not identify a separate language. Keep C/C++ native work behind narrow tested bindings when needed; ordinary mail interaction does not require a renderer or a ray tracer.

## 2. Clients and delivery sequence

Rails owns shared permissions and business rules. Laravel renders the web UI and forwards allowlisted requests under each user's current identity; mobile/MCP use Rails directly. Never duplicate authorization, sending logic or mailbox tables in the presentation server or clients. Validate bindings against versioned contracts and support the previous released client during server upgrades.

| Client | Planned path and role | Completion evidence |
| --- | --- | --- |
| Web subdomain | Laravel Blade/Livewire BFF, Alpine/plain JavaScript and Anime.js; reuse through explicit ports | Real local login, BFF/Rails user isolation and mailbox workflows in Chromium, Firefox and WebKit |
| macOS | Tauri/Rust host with unprivileged remote Laravel mailbox WebView and separate trusted bundled assistant panel; `.dmg` | Actual macOS WebView isolation, separate enrollment/logout, secure storage, callback replay rejection and update checks |
| Windows | C#/WinUI 3 GUI with WebView2 using the same two-surface boundary | Actual Windows install, no remote host objects/command forwarding, accessibility, separate credentials, lifecycle and update checks |
| Android | Java Android Views calling Rails directly; `.apk` development/distribution lane | Android emulator/device permissions, secure storage, lifecycle/reconnect and authenticated workflow tests |
| iOS | Requested SwiftUI client using the same API | Simulator/device lifecycle and auth tests; signing/distribution remains final activation |
| Qt | Alternative native C++ client experiment owned by Opus 5.5 | Adopt only if a documented platform capability justifies replacing a selected host |
| Ionic / Capacitor | Alternative shared mobile UI experiment | Compare to Java/SwiftUI before choosing; do not ship duplicate mobile clients by default |
| Electron | Alternative desktop host if a required integration cannot be supported efficiently in the chosen host | Measure package size, idle RAM, security isolation and integration compatibility before replacing Tauri/C# |

The selected C# Windows lane replaces the earlier Tauri-for-both default; do not build both Windows hosts. Hosted Blade/Livewire cannot be bundled as an offline static mailbox. Do not ship a PHP server or Supabase on devices or promise offline mail. Native mailbox WebViews have zero IPC/native capabilities, host objects or web-message command forwarding. Remote scripts, URLs and cross-window events cannot invoke the assistant panel. If separation cannot be demonstrated, native release remains pending. Java Android and SwiftUI iOS follow the web/Mac/Windows core as native API clients.

Laravel stores encrypted per-user Supabase access/refresh material only in a protected server-side session store, using a separate private PostgreSQL schema/role if applicable. Its role cannot read domain/Auth tables or hold Resend/privileged Supabase keys. Use host-only secure cookies, CSRF/origin checks, refresh serialization and defined session expiry. Rails checks authoritative session validity and current mailbox access on every forwarded call. Stream authorized attachments through Laravel to Rails; keep Storage signed URLs server-side and deny new downloads after revocation. Test no-store/cross-user cache isolation and invalidate restored sessions unless replay-safe recovery is proven.

The remote mailbox's web session and trusted assistant enrollment are separate. No browser cookie/token is transferred to a native bridge. Enroll the assistant through its supported user-controlled flow, hold its credentials in OS secure storage, and expose only allowlisted operations to its bundled panel. Native mobile and any assistant user-session flow use reviewed system-browser/PKCE callbacks. Define individual session/grant logout and all-device revocation; current membership and revoked-token tests apply to each surface.

Use one product/release page with platform-specific downloads. A single OS executable does not run on both macOS and Windows; a macOS universal binary only addresses Mac CPU architectures. Produce separate signed/notarized Mac and signed Windows artifacts, plus their checksums and provenance. Unsigned local builds precede production credentials. Actual target-OS tests are required: browser emulation does not prove native behavior. [Tauri distribution](https://v2.tauri.app/distribute/).

Mobile clients initially offer mailbox operations and scoped remote assistant services, if activated. Do not promise that desktop Codex/Claude CLI executables will run on iOS or Android. A remote agent executor would need a separate architecture, operating budget and permission design.

## 3. Premium interface and Anime.js brief for Opus 5.5

Start with useful polish: legible typography, spacing, dense but readable conversation lists, strong focus states, consistent surfaces, restrained color and clear delivery status. Propose two annotated visual directions using actual inbox/composer data shapes before committing to one design token set. Use locally available suitable components before introducing a replacement framework.

Apply Anime.js to small transitions: opening a conversation pane, moving an assignment indicator, resizing the composer and acknowledging a saved draft. Animation must reflect committed state; never imply delivery, hide errors or delay sending/typing. Keep keystrokes/focus/menu behavior local in Alpine/plain JavaScript; debounce persistence and do not add a duplicate Alpine runtime. Preserve composer state/focus across Livewire updates and dispose animation/listener resources on replacement. Prefer opacity/transform and avoid continuous effects. Scope/media-query integration supports reduced-motion settings. [Anime.js documentation](https://animejs.com/documentation/), [media queries](https://animejs.com/documentation/scope/scope-parameters/mediaqueries/).

Project acceptance budgets, to measure on an agreed ordinary laptop: common transitions 120–220 ms; immediate pressed/loading feedback; smooth transitions targeting a 16.7 ms frame budget at 60 Hz; no animation task exceeding 50 ms in the measured scenario; interaction responsiveness target at or below 200 ms. These are design targets, not measurements or blanket performance guarantees. Record browser/device, fixture size and trace before/after each substantial effect.

Honor `prefers-reduced-motion` dynamically, with an in-app override and an equivalent immediate state change. Preserve keyboard focus, screen-reader announcements, contrast, zoom and navigation without a pointer. Avoid flashing, scroll hijacking, focus movement caused by decoration and animation-only status signals. Stop background animation in hidden tabs and when the affected view is inactive.

If Opus proposes shaders, ray tracing or a custom native renderer, require a specific user benefit and measured fallback, energy, accessibility and packaging costs. Confine any approved experiment to optional decoration outside the mail-reading/send path. “Premium” is judged by clarity and responsiveness, not by a graphics dependency count.

## 4. Two distinct connector products

| Boundary | Purpose | Authority |
| --- | --- | --- |
| Elevateo mailbox MCP adapter | External Codex/Claude clients search/read permitted mail and create/update drafts | Per-person, per-mailbox, expiring/revocable grants; no direct send, shell, SQL or arbitrary fetch |
| In-app CLI/agent adapter | Elevateo displays a conversation with a locally installed, supported agent runtime | Separate agent runtime identity and separately granted local capabilities; no implicit authority over mail or local files |

Mailbox MCP remains required even if an in-app assistant exists. Registering MCP does not implement an embedded CLI, and spawning a CLI does not authorize mailbox access. Keep human approval of the exact outgoing draft in the ordinary application send flow. Mail contents and model output are untrusted data, never shell arguments, installer instructions or authority to expand capabilities.

The public web application and remote desktop mailbox cannot spawn a CLI or call native IPC. Only the separate bundled trusted assistant panel can use its narrowly scoped desktop bridge; enforce origin/window capability separation and prohibit remote event forwarding. A browser companion is a deferred feature requiring a new reviewed boundary and explicit pairing, not an exception to current zero remote capabilities. Never expose a raw agent server to the internet.

The optional loopback companion must bind only loopback, enforce exact allowed origins and Host values, reject unexpected or absent origins for browser calls, require a high-entropy pairing capability and CSRF protection, rate-limit and expire sessions, and validate every request. Pairing is a user-visible local ceremony, not a secret in a URL or a blanket localhost exemption. Test hostile origins, DNS rebinding, replay, a stolen pairing token and revocation. Local hostile processes remain a distinct OS trust concern; loopback is not authentication.

## 5. Protocol adapters and authentication

Codex owns `CodexAgentAdapter`: drive the installed supported `codex app-server` through stdio JSON-RPC, negotiate initialization, retain conversation IDs and consume lifecycle/approval events. Generate and pin schemas from the exact CLI version. Do not scrape terminal output or invoke a shell with concatenated strings. Codex app-server documents stdio as the default and WebSocket transport as experimental/unsupported; use stdio behind the desktop bridge. [Official app-server protocol](https://learn.chatgpt.com/docs/app-server).

The separately started Fable 5 agent owns the Claude adapter implementation, with Opus 5.5 reviewing. Select the requested Claude model through a supported Claude runtime; no separate `fable` binary is required. Evaluate the official Claude Agent SDK or documented structured subprocess interface, including permission callbacks and cancellation. Pin the protocol and exact model configuration, and verify the product's authentication route independently from developer CLI access. [Claude Agent SDK](https://code.claude.com/docs/en/agent-sdk/overview).

Authentication eligibility is a release gate, not inferred from an installed CLI. Anthropic's SDK documentation states third-party products cannot offer claude.ai login or its rate limits without prior approval; use supported API authentication or obtain the required approval. Never copy subscription/session tokens into Elevateo, use a CLI wrapper to evade product authentication restrictions or promise free inference from a consumer subscription. Existing-user CLI integration still needs a supported, permitted product route.

For Codex, verify the chosen official authentication route, account access and product eligibility at implementation; a listed model is not proof that an inference request is entitled. If using an approved ChatGPT plan integration, follow its current registration/authentication/renewal flow. Do not harvest the user's Codex credentials. Keep any provider-managed authentication in its supported runtime and integration-owned secrets in OS secure storage. [Codex app-server authentication integration](https://developers.openai.com/siwc/token-sharing-open-source/codex-app-server).

Local adapter development uses a deterministic fake agent and synthetic mail. Actual model credentials and model calls stay at final activation unless an already-authorized supported session is explicitly in scope. Show a disabled connector with its concrete reason when prerequisites are missing; never label a fake response as a live model result.

## 6. Shared binder contract and execution controls

Implement an internal typed adapter interface such as `inspectAvailability`, `startSession`, `startTurn`, `streamEvents`, `respondToApproval`, `cancelTurn` and `closeSession`. These are proposed Elevateo method names, not claimed provider APIs. Normalize supported states and errors while retaining provider-specific metadata; reject unsupported operations rather than pretending parity.

Every session binds an actor, adapter/version, chosen model/effort, approved data scope, selected workspace if any, expiry, resource limits and audit ID. Report connecting, awaiting approval, running, interrupted, failed and completed accurately. Enforce output bounds, concurrency, timeouts and cancellation cleanup. A UI disconnect must not silently create a second turn; resolve the previous turn before retrying a mutating action.

Launch only an explicitly selected trusted executable by absolute path with a fixed argument array and `shell: false` (or its native equivalent). Validate executable provenance/version and reject arbitrary executable paths received through API or mail content. Use a minimal environment and isolated working directory; do not inherit provider/server keys, unrelated MCP configuration, repository hooks or unreviewed plugins. Never pass secrets in command-line arguments or telemetry.

Default in-app mailbox assistance to the scoped MCP tools only, with filesystem and shell tools unavailable. Enforce that restriction in the actual runtime/tool policy and test it; a prompt saying “do not use shell” is insufficient. Workspace coding is a distinct opt-in mode with its own folder/file/tool/network grants, sandbox and approval UI. Do not load mailbox content automatically into a workspace agent with shell authority. Moving selected mail into that mode requires an explicit data-sharing action and disclosure.

Separate mailbox authorization, machine access and provider billing consent. None implies the others. Audit approvals without storing secrets or full mail bodies by default. Display what data will be sent to which provider, and allow cancellation/revocation without losing an unsent application draft. Provider approval prompts cannot bypass the backend's mailbox permission checks or human send requirement.

## 7. Implementation sequence and required evidence

1. The next agent launches the saved consultations against the user-selected Rails/Laravel split, then resolves implementation details and inventories reusable sources. Earlier failed attempts do not establish successful inference or account linking; this documentation change does not install CLIs or activate credentials.
2. Fable/Opus ports suitable UI into accessible Blade/Livewire with Alpine/plain JavaScript, a user-scoped Laravel-to-Rails adapter and real local services. Opus owns the isolated Anime.js branch; integrate only after functional flows pass.
3. Codex and the assigned Fable agent implement separate protocol adapters behind the same fake-runtime harness; a third agent reviews trust boundaries and cancellation behavior.
4. Complete mailbox MCP against the actual local API, then prove the default in-app mailbox agent cannot access arbitrary files/shell or send mail.
5. Build one selected host per desktop platform, followed by the Java Android and SwiftUI iOS milestones; add native adapters without forking business logic.
6. Complete local evidence and capability gaps before requesting real provider, signing or deployment credentials. Activate only the verified provider/client routes and label unsupported ones unavailable.

| Test layer | Minimum evidence |
| --- | --- |
| Node.js scripts | Schema/adapter contract checks, malformed frames, process crash, timeout, cancellation, bounded output and no secret leakage |
| Playwright primary browser suite | Real login, two-user assignment/draft conflicts, hostile mail content, keyboard/zoom/reduced motion, cross-browser and responsive journeys |
| Puppeteer where uniquely useful | A targeted Chromium tracing/diagnostic requirement not already covered by Playwright; no duplicate full end-to-end suite |
| Presentation/session boundary | Laravel uses the current individual token, has no domain/provider privileges, denies revoked sessions, protects encrypted refresh material and streams authorized attachments |
| Agent bridge integration | Real local process with fake inference, denied shell/file actions, approved workspace isolation, replay/stale approval rejection, no remote WebView/native event path and failure recovery |
| Loopback companion if selected | Wrong origin/Host, pairing replay, CSRF, DNS rebinding, token expiry, revocation and no non-loopback listener |
| Actual provider activation | Exact client/model/auth version, supported login, stream, cancellation, approval denial and narrow permitted MCP draft; no mail send |
| Native/mobile | Actual target runtime install/launch/session/logout and platform lifecycle, with unsupported targets explicitly pending |
| Release | Signed artifacts, checksum/provenance, updater rejection/rollback and current/previous client compatibility |

Run application checks in Docker as required by root instructions; additionally run native tests on their actual target OS. Store synthetic evidence with commit, command, versions, exit status and counts. Report separately what was implemented, simulated, verified against a real runtime, externally activated or blocked. This document adds acceptance gates and assignments; it supplies no completion evidence itself.
