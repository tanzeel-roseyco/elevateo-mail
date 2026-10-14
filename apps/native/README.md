# Native shell checkpoint (NATIVE-812)

The shared Tauri 2 root is `apps/native/src-tauri`. For the first release it opens one approved HTTPS first-party web origin, embeds that public origin at build time, and uses the existing web application's HttpOnly cookie/session flow. It loads no remote page when the origin is missing or invalid. Top-level navigation is restricted to that exact origin and popup and WebView permission requests are denied. No capability file or privileged command is registered, so the remote page receives no native IPC or filesystem/shell permission. No native token, OAuth callback or OS credential store is used.

The app remains online-only: it does not bundle `apps/web/dist` or a local Rails service. The web server must serve the existing React production app and API on the same approved origin, including its own CSP, HttpOnly/Secure cookies and CSRF handling. This shell has not been shown to preserve cookies, redirects or session/logout state on any target OS. A redirect to a different origin is blocked; any legitimate cross-origin browser flow needs a separately reviewed system-browser design.

`ELEVATEO_WEB_ORIGIN` is a **public build-time value**, not a secret. Release packaging must pass its exact approved `https://host[:port]` origin. Validation rejects cleartext, IP literals, localhost, placeholder domains, credentials, paths, queries and fragments. An absent/invalid value makes launch fail closed. The app identifier `com.elevateo.mail` remains a candidate pending distribution registration/collision checks.

Tauri core/build are pinned to 2.12.3/2.7.2, including the October 2026 NSIS downgrade fix. `bundle.windows.allowDowngrades` is false. The NSIS setup embeds the WebView2 bootstrapper but still needs network if WebView2 is missing. The `ci/windows-unsigned.ps1` candidate runs on a real Windows runner with a reviewed Cargo.lock, pinned tooling and exact public origin; it does not sign or test an installed app.

## Soren fleet-only request

A Cargo.lock must be produced and reviewed in that lane before `--locked` is meaningful. The image tag is a draft and must be pinned to a verified digest by the fleet owner. A second gated build needs the existing web production build and Tauri Linux system libraries; Linux success would not establish Windows installation. Windows NSIS signing, WebView2 install/run/upgrade/uninstall and native OAuth/security validation need a real Windows lane and later authorized credentials. `embedBootstrapper` requires network when WebView2 is absent; offline clean-machine behavior is an open release gate.

## macOS overlay (MAC-814)

`src-tauri/tauri.macos.conf.json` overrides the shared shell's NSIS bundle with a DMG and sets macOS 12 as the minimum. The entitlements plist is intentionally empty; any WebKit requirement must be measured on a signed Mac build before adding a right. Tauri's platform config merge is documented at https://v2.tauri.app/reference/config/. The release entrypoint is `apps/native/macos-release.sh`; it fails before build if the runner, Developer ID identity, notarization inputs or reviewed Cargo lock are missing. Tauri's macOS signing/notarization flow is documented at https://v2.tauri.app/distribute/sign/macos/ and DMG build at https://v2.tauri.app/distribute/dmg/.

The release script is not a release approval. An owner must verify Mac tool versions, final Tauri CLI version and both Intel/Apple Silicon slices, then install and exercise the signed artifact on clean target machines. Native authentication remains fail closed until a versioned server/client flow exists. No callback scheme is registered by this overlay and no remote navigation or privileged IPC is granted.
Under Soren's fleet Docker lease: build the existing `apps/web` source in its canonical container; generate and review `apps/native/src-tauri/Cargo.lock` from this exact commit in a task-owned Rust container with Tauri Linux system packages; run `cargo test --locked` and `cargo check --locked` from `apps/native/src-tauri`; run `python3 apps/native/ci/verify_boundary.py` from repository root and validate the Tauri JSON schema; record image digests, source SHA, exits and cleanup. No host app build/test is authorized. Linux compile does not prove Windows, Android or macOS WebView behavior.

Target OS gates remain: real Windows NSIS install/run/upgrade/downgrade/uninstall with WebView2 present and absent, Android emulator/device cold start and cookie/session lifecycle, and macOS install/run with signing/notarization later. No signing keys, live credentials, live mail, DNS or deployment are handled here.

## macOS overlay (MAC-814)

`src-tauri/tauri.macos.conf.json` selects DMG and macOS 12.0 for this shared online-only shell; `macos/Entitlements.plist` requests no extra rights. `apps/native/macos-release.sh` requires a configured exact HTTPS origin at build time and Mac signing/notarization prerequisites before building. This source is not a tested DMG or release approval. Soren owns Docker static/source checks; a real Mac runner and installed-app tests remain necessary. No Mac callback scheme is registered.

Orion fleet compile fixture: after the reviewed Cargo.lock is present, run `apps/native/ci/compile-fixture.sh` and the boundary verifier in Soren's fleet Docker lane. It uses only `https://app.elevateo.invalid`, `ELEVATEO_NATIVE_ARTIFACT=compile-only-fixture` and `tauri.fixture.conf.json` as an optional package override. It cannot launch and is not a release artifact; Windows unsigned-candidate packaging rejects the fixture domain. No approved production origin is recorded.

The compile icon `src-tauri/icons/icon.png` is an exact byte copy of the first-party shared brand packet `brand/logo-icon.png` (SHA-256 `325d418f557e692314ee5c6cc56c2aa2baabb934527513b7080fabfa234922f4`). Platform `.ico`/`.icns` packaging assets and visual acceptance remain pending.
