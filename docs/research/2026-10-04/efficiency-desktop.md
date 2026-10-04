# Desktop efficiency and CLI lifecycle

4 October 2026. Research proposal; no implementation or benchmark run. Backend/desktop standards remain unapproved. Read against the product master plan and backend blueprint.

## Recommended shape

Use one Tauri window/WebView2 with native taskbar identity and optional tray, a small Rust host, and the existing React UI. Tauri uses the OS WebView; that reduces bundled runtime duplication but does not establish a memory benchmark. WebView2 has browser, renderer and GPU processes: measure the complete app tree, not just the Rust executable. Avoid a permanent Node service, local model, or idle CLI agent. [Tauri process model](https://v2.tauri.app/concept/process-model/), [WebView2 performance](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/performance).

Pause refresh timers, animations and unnecessary subscriptions when hidden; resume with one incremental refresh. Keep GPU acceleration enabled. WebView2 suspension/low-memory APIs are optional optimisations requiring verified Tauri bindings and restore tests; suspension pauses JavaScript and cannot carry essential background work. A native host may handle lightweight notifications while running. Quit/off means no desktop notifications or local AI; approved cloud campaign workers continue independently.

## Bounded AI work and permissions

Launch Codex only for an explicit user task using their installed/authenticated CLI and stdio app-server; allow one active task. Do not copy credentials or launch a listening localhost control port. Bound the queue, context, transport buffers and output. Proposed starting limits: 20 selected messages, 256 KiB extracted text, 10 MiB output and 120 seconds wall time; expose oversized selection and timeout errors. Bytes are not model tokens: enforce the selected model's context limit separately. Fetch bodies on demand; omit attachments by default. [Codex app-server](https://learn.chatgpt.com/docs/app-server).

Own each child's Windows Job Object, validate assignment, disallow breakaway where compatible, and enable kill-on-close. Request cancellation, wait briefly, then terminate only the owned job on timeout, quit or account removal. Test nested-job compatibility and escaped-child failure cases: job membership is not universal. Job Objects manage resource lifetime; subprocesses are **not security sandboxes**. [Microsoft Job Objects](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects).

Prefer verified Codex native elevated sandboxing; weaker unelevated mode is a disclosed configuration decision, never a silent permission expansion. Native Windows Claude commands are currently unsandboxed. Initially allow Claude fallback only for bounded drafting with built-in tools, MCP and hooks disabled and effective configuration tested. `--tools ""` alone does not remove MCP. Configuration/tool restrictions are not OS isolation. Fallback retains the same selected-mailbox scope and separate send approval; neither provider sends directly. Mailbox context transfer still requires the policy/consent gate. [Codex Windows sandbox](https://learn.chatgpt.com/docs/windows/windows-sandbox), [Claude sandboxing](https://code.claude.com/docs/en/sandboxing), [Claude CLI](https://code.claude.com/docs/en/cli-reference).

## Frontend and proposed acceptance budgets

Replace whole-state loading with cursor pages (50 initial, maximum 100), narrow entity subscriptions, stable cached snapshots and batched updates. Avoid subscribing every row to the complete store. Bound disposable local cache separately from durable drafts; partition by account and clear removed-account data. [React external stores](https://react.dev/reference/react/useSyncExternalStore).

| Measure on recorded Windows hardware | Proposed gate |
| --- | --- |
| Ten-minute idle after two-minute warm-up | Average app-tree CPU <1% |
| Visible / tray working set | <250 / <150 MiB |
| Cold usable window / interaction feedback | <3 s / p95 <100 ms |
| Idle CLI children / cancelled-job cleanup | Zero / within 5 s |
| Hidden UI | No sustained animation or repaint; record GPU counters |

These are targets, not demonstrated results; GPU zero is not promised. Record Windows/WebView/CLI versions, dataset, CPU normalisation and complete process-tree peaks separately during AI work.

## Minimum free verification

Run Docker browser/domain tests against deterministic fake providers: pagination bounds, empty/error/offline states, account isolation, draft persistence and approved-cloud-job execution with desktop absent. Use fake CLI fixtures for hanging, oversized-output and child-spawn cancellation. Native Windows tests are necessary for Job Objects, sandbox denial, installer/taskbar/tray and actual WebView performance; document this platform exception. Drive the packaged UI with free WebDriver tooling and manually verify appearance. No paid inference is needed for these gates. [Tauri WebDriver](https://v2.tauri.app/develop/tests/webdriver/).
