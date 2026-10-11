# Client applications, premium motion and in-app CLI connectors

Status: planned work, 2026-10-12. No Elevateo client, connector or installer has been built or connected by this document. The initial architecture is accepted in ADR 0002; client implementation and its task-specific consultation gates remain outstanding. This plan extends [the desktop/MCP design](../docs/desktop-and-connectors.md), [end-goal](../docs/end-goal.md) and [local completion plan](../docs/local-completion-plan.md). The latest agent orchestration and technology decisions govern role availability and stack choices; keep provider credentials, signing and live activation last.

## 1. Product and ownership brief

Codex first inventories the existing frontend and the six local snapshots, then completes the research/adoption gate before assigning implementation. Reuse audited interaction patterns and components through [the adoption matrix](../docs/component-adoption.md); preserve provenance and replace unsafe authentication, raw HTML rendering and send loops. A frontend mock is never evidence of backend completion.

| Work package | Requested owner | Required handoff |
| --- | --- | --- |
| UX, application shell, mailbox views, composer and connector panel | Fable 5 or Opus 5.5, in a separately started agent | Routes, design tokens, accessible states, typed API bindings, source provenance and browser evidence |
| Anime.js motion, visual refinement and every proposed C++ task | Opus 5.5 | Bounded brief, performance comparison, reduced-motion behavior and reviewed patch |
| Fable/Claude in-app CLI adapter | Fable 5; Opus 5.5 reviews | Verified official provider/protocol identity, authentication constraints, lifecycle/consent tests |
| Codex in-app CLI adapter | Codex | Version-pinned app-server protocol adapter, permissions and stream/recovery tests |
| Shared contracts, trust boundaries and final integration | GPT 6 ASTRA MAX architecture lead | Independently requested Fable 5, Opus 5.5 and Fable 5.1 opinions, disposition of disagreements and an ADR |

Official Anthropic documentation identifies `claude-fable-5-1` and `claude-opus-5-5`; the legacy Fable 5 page identifies `claude-fable-5` as still available. Fable and Opus are Claude models, not separate CLI products. Preserve the exact model requested for each assignment. [Current model catalog](https://platform.claude.com/docs/en/models/overview), [Fable 5](https://platform.claude.com/docs/en/models/fable-5/overview).

Codex CLI 0.159.3 and Claude CLI 2.1.296 are verified. Independent initial opinions returned the exact claude-fable-5, claude-opus-5-5 and claude-fable-5-1 identities; actual gpt-6-astra MAX synthesized them in ADR 0002. Earlier expired-auth attempts are historical. Every client task still records its own input revision, identities, opinions, synthesis and execution evidence. Never relabel a substitute or store authentication secrets in the repository.

Interpret the user's “C+++” as a request for C++ pending a more specific correction. It does not identify a separate language. Keep C/C++ native work behind narrow tested bindings when needed; ordinary mail interaction does not require a renderer or a ray tracer.

## 2. Clients and delivery sequence

One shared API owns permissions and business rules. Client adapters bind those contracts to platform controls, token storage, dialogs and notifications. Never duplicate authorization, sending logic or the database in each client. Generate or validate client bindings against a versioned contract, and support the previous released client during server upgrades.

| Client | Planned path and role | Completion evidence |
| --- | --- | --- |
| Web subdomain | Shared strict TypeScript/React interface using existing suitable local UI; HTML/CSS and Anime.js | Real local login and mailbox workflows at narrow and desktop widths in Chromium, Firefox and WebKit |
| macOS | Tauri/Rust host for bundled UI and narrow native commands; `.dmg` | macOS build/install/login/logout, secure storage, callback replay rejection and update checks |
| Windows | Requested C#/.NET GUI lane; assess a native host with bundled shared UI before duplicating screen implementations | Actual Windows build/install, WebView or native accessibility, credentials, callbacks, network-loss and update checks |
| Android | Requested Java client using Android SDK and the same API; `.apk` development/distribution lane | Android emulator/device permissions, secure storage, lifecycle/reconnect and authenticated workflow tests |
| iOS | Requested SwiftUI client using the same API | Simulator/device lifecycle and auth tests; signing/distribution remains final activation |
| Qt | Alternative native C++ client experiment owned by Opus 5.5 | Adopt only if a documented platform capability justifies replacing a selected host |
| Ionic / Capacitor | Alternative shared mobile UI experiment | Compare to Java/SwiftUI before choosing; do not ship duplicate mobile clients by default |
| Electron | Alternative desktop host if a required integration cannot be supported efficiently in the chosen host | Measure package size, idle RAM, security isolation and integration compatibility before replacing Tauri/C# |

The C# Windows request changes the earlier Tauri-for-both default: resolve it in the client ADR and update existing implementation instructions before coding. Tauri remains the current reference baseline for comparison; do not silently build both Windows clients. Java Android and SwiftUI iOS are requested additional milestones after the web/Mac/Windows core, not prerequisites for proving the first shared mailbox workflow.

Use one product/release page with platform-specific downloads. A single OS executable does not run on both macOS and Windows; a macOS universal binary only addresses Mac CPU architectures. Produce separate signed/notarized Mac and signed Windows artifacts, plus their checksums and provenance. Unsigned local builds precede production credentials. Actual target-OS tests are required: browser emulation does not prove native behavior. [Tauri distribution](https://v2.tauri.app/distribute/).

Mobile clients initially offer mailbox operations and scoped remote assistant services, if activated. Do not promise that desktop Codex/Claude CLI executables will run on iOS or Android. A remote agent executor would need a separate architecture, operating budget and permission design.

## 3. Premium interface and Anime.js brief for Opus 5.5

Start with useful polish: legible typography, spacing, dense but readable conversation lists, strong focus states, consistent surfaces, restrained color and clear delivery status. Propose two annotated visual directions using actual inbox/composer data shapes before committing to one design token set. Use locally available suitable components before introducing a replacement framework.

Apply Anime.js to small transitions: opening a conversation pane, moving an assignment indicator, resizing the composer and acknowledging a saved draft. Animation must reflect committed state; it must never imply delivery, hide an error, delay a send action or distract from reading. Prefer opacity and transform where feasible, dispose animations when views unmount, and avoid continuous background effects. The documented Scope/media-query integration supports responding to reduced-motion settings. [Anime.js documentation](https://animejs.com/documentation/), [media queries](https://animejs.com/documentation/scope/scope-parameters/mediaqueries/).

Project acceptance budgets, to measure on an agreed ordinary laptop: common transitions 120–220 ms; immediate pressed/loading feedback; smooth transitions targeting a 16.7 ms frame budget at 60 Hz; no animation task exceeding 50 ms in the measured scenario; interaction responsiveness target at or below 200 ms. These are design targets, not measurements or blanket performance guarantees. Record browser/device, fixture size and trace before/after each substantial effect.

Honor `prefers-reduced-motion` dynamically, with an in-app override and an equivalent immediate state change. Preserve keyboard focus, screen-reader announcements, contrast, zoom and navigation without a pointer. Avoid flashing, scroll hijacking, focus movement caused by decoration and animation-only status signals. Stop background animation in hidden tabs and when the affected view is inactive.

If Opus proposes shaders, ray tracing or a custom native renderer, require a specific user benefit and measured fallback, energy, accessibility and packaging costs. Confine any approved experiment to optional decoration outside the mail-reading/send path. “Premium” is judged by clarity and responsiveness, not by a graphics dependency count.

## 4. Two distinct connector products

| Boundary | Purpose | Authority |
| --- | --- | --- |
| Elevateo mailbox MCP adapter | External Codex/Claude clients search/read permitted mail and create/update drafts | Per-person, per-mailbox, expiring/revocable grants; no direct send, shell, SQL or arbitrary fetch |
| In-app CLI/agent adapter | Elevateo displays a conversation with a locally installed, supported agent runtime | Separate agent runtime identity and separately granted local capabilities; no implicit authority over mail or local files |

Mailbox MCP remains required even if an in-app assistant exists. Registering MCP does not implement an embedded CLI, and spawning a CLI does not authorize mailbox access. Keep human approval of the exact outgoing draft in the ordinary application send flow. Mail contents and model output are untrusted data, never shell arguments, installer instructions or authority to expand capabilities.

The public web application cannot directly spawn a machine's CLI. Start with a packaged desktop bridge using a bundled trusted UI and narrow native IPC. If browser access is later needed, pair an installed local companion explicitly. Do not expose the raw agent server to the internet or permit an arbitrary remote page to invoke native functions.

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

1. Resolve remaining runtime authentication and client ADR; inventory local frontend candidates and research findings. The explicitly requested consultation attempts above do not establish account linking or successful inference; this document itself does not authorize installing additional CLIs or activating application credentials.
2. Fable/Opus implements accessible web flows against typed contracts and real local backend services. Opus owns the isolated Anime.js refinement branch; integrate only after functional flows pass.
3. Codex and the assigned Fable agent implement separate protocol adapters behind the same fake-runtime harness; a third agent reviews trust boundaries and cancellation behavior.
4. Complete mailbox MCP against the actual local API, then prove the default in-app mailbox agent cannot access arbitrary files/shell or send mail.
5. Build one selected host per desktop platform, followed by the Java Android and SwiftUI iOS milestones; add native adapters without forking business logic.
6. Complete local evidence and capability gaps before requesting real provider, signing or deployment credentials. Activate only the verified provider/client routes and label unsupported ones unavailable.

| Test layer | Minimum evidence |
| --- | --- |
| Node.js scripts | Schema/adapter contract checks, malformed frames, process crash, timeout, cancellation, bounded output and no secret leakage |
| Playwright primary browser suite | Real login, two-user assignment/draft conflicts, hostile mail content, keyboard/zoom/reduced motion, cross-browser and responsive journeys |
| Puppeteer where uniquely useful | A targeted Chromium tracing/diagnostic requirement not already covered by Playwright; no duplicate full end-to-end suite |
| Agent bridge integration | Real local process with fake inference, denied shell/file actions, approved workspace isolation, replay/stale approval rejection and failure recovery |
| Loopback companion if selected | Wrong origin/Host, pairing replay, CSRF, DNS rebinding, token expiry, revocation and no non-loopback listener |
| Actual provider activation | Exact client/model/auth version, supported login, stream, cancellation, approval denial and narrow permitted MCP draft; no mail send |
| Native/mobile | Actual target runtime install/launch/session/logout and platform lifecycle, with unsupported targets explicitly pending |
| Release | Signed artifacts, checksum/provenance, updater rejection/rollback and current/previous client compatibility |

Run application checks in Docker as required by root instructions; additionally run native tests on their actual target OS. Store synthetic evidence with commit, command, versions, exit status and counts. Report separately what was implemented, simulated, verified against a real runtime, externally activated or blocked. This document adds acceptance gates and assignments; it supplies no completion evidence itself.
