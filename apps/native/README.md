# Native shell checkpoint (NATIVE-812)

This Tauri 2 shell bundles the existing production React assets from `apps/web/dist`. It registers no privileged IPC commands, local-only capability has no permissions, and its CSP permits no external connections. A manually created window rejects non-bundled top-level navigation and new-window requests. The browser-cookie web gateway and OAuth callback do not yet have an approved native auth contract, so sign-in and protected workflows are **not supported in installed clients**. No renderer refresh token path or native authentication success is claimed.

`src-tauri/src/oauth.rs` implements native-only PKCE/state/nonce/issuer validation with single-use callback consumption. There is no registered callback handler, browser launch, token exchange, or renderer token command, so enrollment remains disabled. Windows Credential Manager and macOS Keychain storage are isolated in `session_store.rs`; Android and Linux storage fail closed. These stores must be validated on their target OS before use.

`src-tauri/src/config.rs` is a public HTTPS-origin validation draft for a future approved native gateway. It is intentionally not wired to the shell: accepting an origin is not proof of CORS, CSRF, session, callback or secure-storage behavior. No server URL, service-role key, provider secret or signing key belongs in this bundle. The bundled web app currently makes relative requests, which the CSP confines to local app origin and therefore fail closed.

## Fleet-only requested checks

Soren alone may acquire the Docker lease and run from the repository root after verifying the candidate SHA:

```sh
# Run inside Soren's fleet-02 Docker lane; never on the host.
docker run --rm -v "$PWD:/work" -w /work/apps/native/src-tauri <SOREN_VERIFIED_RUST_IMAGE_DIGEST> sh -lc 'cargo test --locked'
```

A Cargo.lock must be produced and reviewed in that lane before `--locked` is meaningful. The Rust source pins Tauri 2.12.0 and tauri-build 2.7.0; Soren must confirm toolchain compatibility and dependency resolution. Soren supplies the verified Rust image digest and Tauri Linux system packages; the placeholder is not an executable command as written. A second gated build needs the existing web production build and Tauri Linux system libraries; Linux success would not establish Windows installation. Windows NSIS signing, WebView2 install/run/upgrade/uninstall and native OAuth/security validation need a real Windows lane and later authorized credentials. `embedBootstrapper` requires network when WebView2 is absent; offline clean-machine behavior is an open release gate.

`ci/windows-unsigned.ps1` is a target-Windows runner script requiring preinstalled pinned Rust, Tauri CLI, NSIS and a reviewed Cargo.lock. It emits only an unsigned setup EXE and SHA-256; signing and installed-app behavior remain separate gates.
