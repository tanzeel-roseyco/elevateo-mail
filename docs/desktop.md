# Desktop preview

`src-tauri/` is a small Tauri 2 shell around the existing fictional-data web demonstration. It is explicitly named **Elevateo Mail Preview** and uses a separate application identifier. Its inbox remains fictional. A separate Windows draft handoff panel can invoke the locally configured Claude companion against the approved HTTPS backend; it does not sign the GUI in, deliver messages or notify about real incoming mail. No installer has been built or verified yet.

## Build inputs

- Exact Rust dependencies: `tauri = 2.12.1`, `tauri-build = 2.7.1`. The root development dependency must pin `@tauri-apps/cli = 2.12.1`; no renderer-side Tauri library is needed.
- Run `node src-tauri/package-preview.mjs` from the repository root after `npm ci` and installing Rust 1.90.0 plus the target OS native prerequisites. The script explicitly selects the platform configuration and requires the Cargo lockfile. Windows configuration produces an NSIS `.exe`; macOS configuration produces a `.dmg`.
- The build hook forces `VITE_BACKEND=demo`, builds `../dist`, gives the document a persistent offline-preview title, and generates installer icon formats from the existing transparent `public/logo.png`. Generated icons and build artifacts are ignored. The low-resolution source limits native icon sharpness.
- `src-tauri/Cargo.lock` now locks the full Rust dependency graph. Use `--locked` for subsequent Cargo validation. The controlled Linux run used Rust 1.90.0 on Debian Bookworm.

## Security and resource boundaries

There are no plugins, remote origins, arbitrary shell execution, renderer filesystem APIs or updater. One registered command, `prepare_draft`, is restricted to the local bundled `preview` window capability. Navigation is restricted to bundled origins; new windows and downloads are denied. CSP permits only native IPC connections and blocks remote renderer network connections, frames, objects and form submission. Inline styles support the existing theme/layout; scripts remain bundled. Local fictional demonstration data may persist in the WebView profile. Do not import private data into this preview.

Tauri uses the platform WebView rather than bundling another browser. The shell creates one window and adds no polling, background daemon or GPU compute. Closing the window ends the application. Resource use still needs measurement on actual target machines; no CPU/RAM claim has been validated.

The command accepts at most 1 KiB of one-use handoff JSON. Its blocking worker owns the single-run guard for the entire process lifetime; hiding the panel or dropping its promise cannot unlock another run. The existing companion lock also excludes console/GUI overlap. Runtime deadlines terminate bounded child jobs, and exiting the application closes kill-on-close Job Object handles. This is process containment, not an OS security sandbox.

## Verification and distribution gates

Rust navigation tests cover bundled routes and external, credential-bearing, port-bearing and privileged URL rejection. Both tests passed in a task-scoped Debian Bookworm Docker container using Rust 1.90.0, the official WebKit/GTK prerequisites, and `cargo test --locked --bin elevateo-mail-preview`. This compiled and linked the full Tauri crate with the actual generated offline assets; it did not launch a window or build an installer. Evidence: `output/takeover/tauri-native-check.log` and `tauri-assets-check.log`.

Run Rust tests in a prepared container, alongside the existing Docker web checks. Windows installer and WebView behavior require a Windows native build environment; macOS DMG and WebKit behavior require macOS/Xcode. Record any necessary native-test exception explicitly. Verify both themes, navigation/reload, CSV import, preview labelling, blocked outbound network/new windows/downloads, window close and uninstall. Check installer/taskbar/Dock icons. No native visual gate has passed yet.

Before public downloads, complete Windows signing and macOS signing/notarization, produce checksums, and exercise install/uninstall on both platforms. Signing credentials come last. The web application remains its own same-origin deployment; its cookie authentication must not be weakened to make the bundled preview talk to it. The bundled GUI has no live cookie authentication. Its narrow native handoff uses a ticket issued by the authenticated web app; the inbox remains a demonstration.

## Official references

- [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)
- [Capabilities](https://v2.tauri.app/security/capabilities/), [CSP](https://v2.tauri.app/security/csp/) and [isolation](https://v2.tauri.app/concept/inter-process-communication/isolation/)
- [Configuration and platform overrides](https://v2.tauri.app/reference/config/)
- [Windows installers](https://v2.tauri.app/distribute/windows-installer/), [DMG](https://v2.tauri.app/distribute/dmg/) and [macOS signing](https://v2.tauri.app/distribute/sign/macos/)

The validation containers used --rm; the exact Rust image and 1.1 GiB target directory were removed afterward. No shared preview images or persistent data were removed. Remote host free space increased by approximately 3.05 GiB during cleanup, which includes concurrent host activity and is not an exclusive attribution. No Docker build cache was created for this run (dependencies were installed inside the disposable container).

## Windows draft companion

The separate `elevateo-draft` Cargo binary accepts a one-use JSON ticket copied from the web application's AI Assistant. It redeems selected-mailbox context against a locally configured HTTPS application, runs the pinned installed Claude Code 2.1.289 with fixed draft-only arguments, rechecks account/session permissions, and prints draft JSON for manual review. It does not send mail or open a shell supplied by the browser.

Setup and the exact local configuration schema are in [local-ai-bridge.md](local-ai-bridge.md#current-windows-draft-companion-implemented-acceptance-pending). Create `%LOCALAPPDATA%/ElevateoMail/native-cli.json` with the approved origin, opaque application account ID, installed Claude executable/hash and its existing subscription profile. Run `elevateo-draft.exe`, paste a fresh handoff JSON line, then copy the successful draft result back to the web workflow. Expired or already-used tickets require a new handoff. Never paste subscription tokens or API keys.

The local user explicitly trusts the installed CLI and administrator-managed policy. Windows Job Objects and bounded pipes constrain processes and resources; they are not an OS security sandbox and do not deny arbitrary filesystem reads by trusted local software. Account binding is to the application account; the chosen local Claude profile is not independently proven to have the same identity.

Codex execution, automatic fallback, macOS companion support, installers and live subscription acceptance remain incomplete. The console binary has not been exercised against real credentials or a deployed HTTPS application. The offline preview's navigation tests do not validate this companion.

Current companion validation: five protocol/flag tests passed in Rust 1.90 Docker; twelve harmless Windows fixture tests passed after isolated Windows-GNU cross-compilation. Evidence is in `output/takeover/native-companion/`. The earlier nine-test bounded-I/O run covered a prior harness slice only. These results do not establish installed Claude execution, real HTTPS ticket redemption, installer acceptance; see [the bridge validation and limitations](local-ai-bridge.md#current-windows-draft-companion-implemented-acceptance-pending).

## Bundled GUI draft handoff

On Windows, configure the companion as above, then expand **Connected Windows draft handoff** above the fictional inbox. Copy a fresh one-use handoff JSON from the live web AI Assistant, paste it into the panel and choose **Prepare draft for review**. Native code redeems the ticket, checks the exact configured account, runs fixed Claude arguments, and rechecks the live session/permissions before returning. The panel clears the pasted ticket immediately and keeps the result only in memory. Subject/body are plain read-only text for manual selection and copy; **Clear private draft** removes them. No send action exists. A fresh ticket is required after any failure. Other operating systems return an explicit unsupported result.

The UI cannot choose an executable, origin, account, filesystem path, CLI flags or command. Remote pages cannot obtain the local capability and navigation remains blocked. The installed CLI and administrator policy are trusted. Codex primary/fallback and macOS support remain missing; no installed account or live HTTPS acceptance has run. Native GUI visual acceptance and installers remain unverified.

Focused Docker validation: five desktop component tests passed, together with TypeScript and scoped ESLint checks. The current full Tauri crate, generated command permissions and actual preview assets compiled and linked in Rust 1.90 Docker: four tests passed (two navigation and two handoff input/concurrency tests). Evidence: `output/takeover/desktop-handoff/native-check.log`. The earlier two-test result is historical. This Linux run does not validate Windows-specific GUI execution.

## Reproducible unsigned packaging

`node src-tauri/package-preview.mjs` uses the existing build hook and fixed Tauri CLI, without shell interpolation. On Windows it produces a current-user NSIS installer under `src-tauri/target/release/bundle/nsis/`. On macOS it produces a DMG under `src-tauri/target/release/bundle/dmg/`, ad-hoc signed rather than developer signed/notarised. macOS local AI is unavailable and the UI says so. OS trust warnings and installation restrictions are expected for these test artifacts; these are not public-release packages.

The manually triggered `.github/workflows/desktop-preview.yml` reproduces both native builds and retains unsigned artifacts for seven days. It has read-only repository permissions and does not create a release or publish anything. The workflow has not been run; GitHub-hosted minutes may have a cost outside the account's allowance. Native target-OS bundling is a necessary exception to Docker-only testing: Linux containers cannot validate macOS signing/WebKit or Windows NSIS/WebView installation.

Local Windows installed-GUI verification is blocked by missing `cargo`, `rustc` and `cl` commands and no Visual Studio Installer `vswhere.exe` at its standard path. No build tools were installed on the host. A configured Windows builder and a macOS builder remain required. Script syntax and supported Tauri CLI argument forwarding were checked in Docker; independent review covered the 50-line packaging/copy slice with zero defects. No installer or native visual acceptance is claimed.

Current handoff validation cleanup: the disposable Rust container exited with `--rm`; the newly pulled `rust:1.90.0-bookworm` image and exact 2.0 GiB task target directory were removed. Source snapshots and the copied native log were retained. Shared application images/services were untouched. Remote host free space rose from 270,189,727,744 to 272,285,814,784 bytes (about 1.95 GiB); concurrent host activity prevents exclusive attribution. No Docker build cache or Windows Docker virtual disk was used.
