# Windows desktop and local-agent research

Research date: 2026-10-04. Planning only; no runtime, account, deployment, or DNS changes. Repository inputs: AGENTS.md, approved frontend STANDARDS.md, product-master-plan.md, README, state, documentation, and package.json. The existing React 19/Vite 7/strict TypeScript frontend should be reused through MailroomGateway. Desktop/backend standards still require approval. Google personal inbox scope remains a recorded conflict requiring resolution.

Latest user clarification: ten users, each authenticating their own local Codex/Claude accounts and supplying their own AMF/Hunter keys; hosting below A$15/month. Onboard per user with mailbox connection, sender permissions, recipient import and old-message import. Keep CLI authentication owned by that user's desktop/OS profile; never collect subscription passwords or pool credentials. Agent workspaces and bridge sessions must be per user, not shared OS files. Encrypt per-user provider keys and enforce tenant scope on every server operation. Team roles, shared mailboxes, shared contacts/campaigns and historical-import retention remain proposed decisions. No off-PC AI generation is required yet; cloud sends use prepared approved content. The hosting ceiling needs separate cost validation, including Google infrastructure and logs.

## 1. Desktop shell recommendation

**Proposed:** Tauri 2 with the existing bundled Vite frontend and a small Rust host. On Windows Tauri uses installed WebView2 rather than bundling a browser; its version therefore depends on the device. This reduces browser distribution ownership but does **not** establish a RAM/CPU advantage for this application. Validate Evergreen runtime provisioning, enterprise policy, offline installation, and supported Windows versions. [Tauri webview versions](https://v2.tauri.app/reference/webview-versions/), [Windows installers](https://v2.tauri.app/distribute/windows-installer/).

| Choice | Practical tradeoff |
| --- | --- |
| Tauri 2/WebView2 | Reuses React; narrow native commands and per-window capabilities; introduces Rust/build skills and device runtime variability. Preferred for a deliberately small native bridge. |
| Electron | Reuses React plus familiar Node process integration; owns bundled Chromium upgrades and a broader privileged JS surface. Better if Node-only native dependencies or team experience outweigh distribution concerns. |

Electron supports sandboxed renderers; keep Node integration disabled, context isolation enabled, validate IPC sender and arguments, and expose individual operations rather than general Electron APIs. Its renderer sandbox is not an agent-process sandbox. Tauri capabilities similarly control access to IPC/plugins, not everything a spawned CLI can do. [Electron security](https://www.electronjs.org/docs/latest/tutorial/security), [Tauri capabilities](https://v2.tauri.app/security/capabilities/).

**Section feedback:** approve framework after a packaged proof of tray, notification click, CLI cancellation, and measured memory; do not choose from unsourced framework benchmark ratios.

## 2. Lifecycle, notifications and updates

Give the installed app a taskbar identity and tray menu: Open, Pause desktop notifications, Connection status, Quit. Distinguish close-to-tray from Quit and make autostart optional. Tray support is documented by [Tauri](https://v2.tauri.app/learn/system-tray/). Windows notification behaviour must be tested in an installed build: Tauri documents that development displays PowerShell identity. Validate notification permission, focus-assist suppression, clicks into a thread, lock-screen privacy, duplicates, and reconnect. [Notification plugin](https://v2.tauri.app/plugin/notification/).

Google change capture belongs on the hosted backend if enabled: Gmail watch delivers Pub/Sub change notices, not complete emails; renew at least every seven days (Google recommends daily), retrieve history, reconcile missed events, then publish app events. Preserve root MX. The PC may be off while ingestion/campaigns continue; Windows cannot display local notifications while powered off. Show a catch-up summary on reconnect. [Gmail push](https://developers.google.com/workspace/gmail/api/guides/push).

Separate Authenticode installer signing from update authenticity. Tauri updater signatures are mandatory; signing keys require protected backups. Windows signing alone does not promise removal of SmartScreen warnings. Electron has Windows autoUpdater support with packaging-specific setup. Use staged updates, migration compatibility checks, and postpone restart while a draft/agent action is active. [Tauri updater](https://v2.tauri.app/plugin/updater/), [Windows signing](https://v2.tauri.app/distribute/sign/windows/), [Electron autoUpdater](https://www.electronjs.org/docs/latest/api/auto-updater).

**Section feedback:** settle close/quit, autostart, hidden-window memory, notification content privacy, and update channel before implementation.

## 3. CLI integration and authority

OpenAI Docs establishes `codex app-server` as a bidirectional JSON-RPC-style protocol with JSONL stdio, initialization, streamed lifecycle events, and approval requests. Use parent-owned stdin/stdout pipes, not terminal scraping or a network listener. Generate schemas from the exact deployed CLI version, bound frame/output sizes, handle unknown events safely, and support interruption, exit, timeout, and auth-expired states. WebSocket transport is currently experimental/unsupported; non-loopback listeners can be unauthenticated by default. [Codex app-server](https://learn.chatgpt.com/docs/app-server).

Codex native Windows sandbox has elevated and unelevated modes; the latter has weaker isolation. Treat setup failure as a visible unavailable state, not permission to broaden access. Use a dedicated agent workspace with no provider secrets and a verified sandbox configuration. [Windows sandbox](https://learn.chatgpt.com/docs/windows/windows-sandbox).

Claude supports `-p` structured JSON/stream-json output, but is a separate adapter with distinct event/auth/error semantics. Its documentation currently says native Windows shell commands run unsandboxed; its shell sandbox supports WSL2, macOS and Linux, and does not cover file tools, MCP servers or hooks. Thus native Windows automatic fallback does not meet sandbox equivalence. Prefer draft-only fallback with tools disabled, or an independently verified isolated environment; surface provider switch and unresolved action outcome. [Claude programmatic CLI](https://code.claude.com/docs/en/headless), [Claude sandbox](https://code.claude.com/docs/en/sandboxing).

**Proposed security boundary:** native host exposes typed, bounded commands; packaged local UI alone receives native capabilities. Cloud bearer credentials remain in OS-protected storage, outside JS and agent workspaces. External URLs/deep links never grant native permissions. Agent tools receive short-lived, user/account-scoped capabilities; server independently validates identity, consent, suppression, limits and campaign state. Model output proposes a draft/action; approval binds exact recipients, sender, content/version and operation ID. Retrying/fallback cannot repeat an uncertain send. CLI approval and mail-action approval are distinct.

**Section feedback:** define approved actions, account licensing/auth access, CLI version support, cancellation guarantees and fallback isolation. A provider subscription is not evidence of permission for arbitrary embedded use or guaranteed availability.

## 4. Cache, sync and resource measurements

**Proposed:** native-managed SQLite cache behind MailroomGateway; server owns message/campaign truth. Cache recent metadata and bounded bodies, fetch attachments on demand, expire old content, purge on account removal, and protect sensitive storage. Persist draft edits locally with revision numbers; queue mutations using idempotency IDs and explicit pending/conflict/error states. Revalidate send-affecting state on the server. Use resumable event cursors plus periodic reconciliation; one hosted scheduler continues approved prepared messages while the desktop and CLI are off. Off-PC AI generation remains a separate decision.

Do not run a continuous local agent. Spawn on demand; one active agent initially; bound transcript history and event batches. Suspend UI animations/background polling when hidden; avoid synchronous main-thread operations and oversized list rendering. Measure before adding virtualization. [Electron performance](https://www.electronjs.org/docs/latest/tutorial/performance), [WebView2 performance guidance](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/performance).

**Provisional goals, not measured promises:** idle combined process-tree CPU median <1% over ten minutes; shell/webview/private working set ≤250 MB visible and ≤150 MB tray-only, excluding CLI/WSL; interaction p95 ≤100 ms; cold usable window ≤3 s; one active CLI and bounded 10 MB streamed-output buffer. Report GPU utilisation and power without promising zero GPU: browser compositing can use it. Existing ≤250 KB initial JS and 900-contact/500-message frontend budgets remain binding. Benchmark both shells on the same Windows hardware, dataset and signed release builds; include launch, idle, mail sync, long agent stream, tray, resume, offline, cancellation, and total CLI/WSL overhead. Record p50/p95, process-tree memory, CPU, GPU and network activity.

## 5. Research evidence and frontend additions

[Greshake et al., arXiv:2302.12173](https://arxiv.org/abs/2302.12173) demonstrate indirect instructions embedded in retrieved content. [AgentDojo, arXiv:2406.13352](https://arxiv.org/abs/2406.13352) evaluates tool agents including email tasks and shows both task failures and injection risks. **Extrapolation:** treat email bodies, attachments, contact imports and tool results as untrusted data; test malicious reply content, cross-account access, forged approvals and exfiltration. Neither paper proves this design secure or predicts its Windows resource use.

Extend the Gmail sketch with connection/last-sync status; queue health and unknown outcomes; reviewable draft diffs with exact sender/recipients; campaign timezone, pause/resume and stop reason; identity/provider/Reply-To visibility; CSV preview with duplicate and consent evidence checks; notification privacy settings; local agent provider/version/isolation badge; cancel and recovery controls. Use honest empty/loading/offline/error states and server-confirmed status. Reuse domain validation; move remaining direct store writes behind the gateway before real integrations.

**Section feedback:** prioritise these operational controls over cosmetic expansion; decide Google scope and approval model before promising working personal inbox or autonomous campaign actions.
