# Native shell checkpoint (NATIVE-812)

## FC-MAC Mac client (2026-10-29)

The macOS shell now adds, on top of the guarded exact-origin WebView below: single instance,
app/Edit menus (About, Check for Updates, Sign Out, Quit, clipboard), system-browser OIDC login
(authorization code + PKCE S256 over a one-shot 127.0.0.1 loopback callback; `src/auth.rs`),
signed auto-update with rollback (`src/update.rs`, `src/host.rs`), a background reachability probe
surfaced to the web UI as standard online/offline events, and one reviewed Tauri capability
(`capabilities/main.json`: main window, `core:event:default` only; the `https://*` remote context
is confined to the single approved origin by the exact-origin navigation guard). The refresh
credential lives in the macOS Keychain via the `keyring` crate; access tokens stay in memory. The
server native token-exchange endpoint is not in contracts yet, so login ends in an honest
"exchange unavailable" state (`ContractPendingExchange`).

Build-time public configuration (not secrets): `ELEVATEO_WEB_ORIGIN`, `ELEVATEO_OIDC_ISSUER`,
`ELEVATEO_OIDC_CLIENT_ID`, `ELEVATEO_UPDATE_MANIFEST_URL`, `ELEVATEO_UPDATER_PUBKEY`. The updater
private key (`TAURI_SIGNING_PRIVATE_KEY`) exists only in release automation env.

### Auto-update rollback flow

1. "Check for Updates" asks the web UI's reported busy state first (`host_report_busy`): an
   unsaved draft or in-flight send blocks the install; the user finishes and retries.
2. Before `tauri-plugin-updater` installs a verified signed update, the current `.app` is copied
   to `<app data dir>/Elevateo Mail.previous.app` and a launch marker
   (`update-launch-marker.json`, `ready: false`) is written.
3. On the next launch, the injected init script calls `host_ready` when the approved origin's page
   finishes loading; that flips the marker to `ready: true`.
4. The launch after that evaluates the marker (`update::post_launch_action`): ready → keep the new
   version, delete marker and archive; not ready and archive present → the previous bundle is
   restored over the failed one and the app re-execs itself (now the previous version); not ready
   with no archive → keep running and clear the marker.
5. Limitation: a new version that crashes before Tauri setup never re-evaluates the marker; the
   user relaunches manually and step 4 then rolls back.

### Release script

`macos-release.sh` builds the universal (default) or `--arch arm64` `.app` + `.dmg` ready for
notarization. All credentials come from environment variables only (signing identity/team,
notarization keychain profile or API key or Apple ID, updater signing key). With no credential env
set it performs an explicit UNSIGNED DRY RUN (validates config, prints the exact signed-run
commands, exit 0); partial credentials fail with the missing names; `--dry-run` also runs on Linux
(no Xcode) for CI validation. Covered by `test_macos_release.py` and
`test_validate_macos_config.py`.

## Terminal DNS dot preflight

The Rust launch validator and Windows unsigned-package preflight reject bare `invalid`/`test` and reserved fixture suffixes after stripping terminal DNS dots for the reserved-host comparison. Trailing-dot, uppercase and bare variants are regression inputs. Fleet Docker evidence covers the Rust validator and Linux PowerShell origin regressions; no Windows installation or runtime result follows from those checks. Platform icons are now generated and selected explicitly, as recorded below.

The shared Tauri 2 root is `apps/native/src-tauri`; desktop `main.rs` and Android/macOS `lib.rs` enter the same guarded shell. For the first release it opens one approved HTTPS first-party web origin, embeds that public origin at build time, and uses the existing web application's HttpOnly cookie/session flow. It loads no remote page when the origin is missing or invalid. Top-level navigation is restricted to that exact origin and popup and WebView permission requests are denied. No capability file or privileged command is registered, so the remote page receives no native IPC or filesystem/shell permission. No native token, OAuth callback or OS credential store is used.

The app remains online-only: it does not bundle `apps/web/dist` or a local Rails service. The web server must serve the existing React production app and API on the same approved origin, including its own CSP, HttpOnly/Secure cookies and CSRF handling. This shell has not been shown to preserve cookies, redirects or session/logout state on any target OS. A redirect to a different origin is blocked; any legitimate cross-origin browser flow needs a separately reviewed system-browser design.

`ELEVATEO_WEB_ORIGIN` is a **public build-time value**, not a secret. Release packaging must pass its exact approved `https://host[:port]` origin. Validation rejects cleartext, IP literals, localhost, placeholder domains, credentials, paths, queries and fragments. An absent/invalid value makes launch fail closed. The app identifier `com.elevateo.mail` remains a candidate pending distribution registration/collision checks.

Tauri core/build are pinned to 2.12.3/2.7.2, including the October 2026 NSIS downgrade fix. `bundle.windows.allowDowngrades` is false. The NSIS setup embeds the WebView2 bootstrapper but still needs network if WebView2 is missing. The `ci/windows-unsigned.ps1` candidate runs on a real Windows runner with a reviewed Cargo.lock, pinned tooling and exact public origin; it does not sign or test an installed app.

## Build evidence and remaining platform gates

The repository contains Cargo.lock and fleet-only Linux/Android compile evidence. The retained Android APK is a compile-only fixture whose placeholder origin deliberately prevents launch; it is not a working mobile release. Windows origin regressions have run in Linux PowerShell, which does not establish Windows installation. Windows NSIS signing, WebView2 install/run/upgrade/uninstall and native authentication/security validation need a real Windows lane and later authorized credentials. `embedBootstrapper` requires network when WebView2 is absent; offline clean-machine behavior is an open release gate.

## macOS overlay (MAC-814)

`src-tauri/tauri.macos.conf.json` overrides the shared shell's NSIS bundle with a DMG and sets macOS 12 as the minimum. The entitlements plist is intentionally empty; any WebKit requirement must be measured on a signed Mac build before adding a right. Tauri's platform config merge is documented at https://v2.tauri.app/reference/config/. The release entrypoint is `apps/native/macos-release.sh`; it fails before build if the runner, Developer ID identity, notarization inputs or reviewed Cargo lock are missing. Tauri's macOS signing/notarization flow is documented at https://v2.tauri.app/distribute/sign/macos/ and DMG build at https://v2.tauri.app/distribute/dmg/.

The release script is not a release approval. It explicitly sets the `unsigned-candidate` provenance marker required by Rust's launch validator, independently of Tauri's signing/notarization. This prevents an absent or inherited `compile-only-fixture` marker from producing a package that always refuses launch. Three synthetic admission tests cover the marker and early rejection of a non-Mac runner or missing signing input; they stop before a real build/sign operation. An owner must verify Mac tool versions, final Tauri CLI version and both Intel/Apple Silicon slices, then install and exercise the signed artifact on clean target machines. No callback scheme is registered by this overlay and no remote navigation or privileged IPC is granted.
Repeat native source checks in a task-owned fleet Docker lane using the committed Cargo.lock: locked Cargo tests/checks, the boundary verifier, Tauri configuration validation and the macOS script admission regressions. Record exact source and image digests, exits and cleanup. Linux compile does not prove Windows, Android or macOS WebView behavior.

Target OS gates remain: real Windows NSIS install/run/upgrade/downgrade/uninstall with WebView2 present and absent, Android emulator/device cold start and cookie/session lifecycle, and macOS install/run with signing/notarization later. No signing keys, live credentials, live mail, DNS or deployment are handled here.

Orion fleet compile fixture: after the reviewed Cargo.lock is present, run `apps/native/ci/compile-fixture.sh` and the boundary verifier in Soren's fleet Docker lane. It uses only `https://app.elevateo.invalid`, `ELEVATEO_NATIVE_ARTIFACT=compile-only-fixture` and `tauri.fixture.conf.json` as an optional package override. It cannot launch and is not a release artifact; Windows unsigned-candidate packaging rejects the fixture domain. No approved production origin is recorded.

The source icon `src-tauri/icons/icon.png` is an exact byte copy of the first-party shared brand packet `brand/logo-icon.png` (SHA-256 `325d418f557e692314ee5c6cc56c2aa2baabb934527513b7080fabfa234922f4`). Pinned Tauri CLI 2.12.2 generated square 32/128/256px PNGs, ICO and ICNS inside fleet Docker using `--fit contain` to preserve the nonsquare original. `bundle.icon` explicitly selects those five platform assets. Generation provenance and hashes are in `docs/completion/qa815-evidence/inline979-native-icons.log`; these assets do not establish target-OS installation or launch.
