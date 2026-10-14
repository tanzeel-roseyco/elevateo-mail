# Native shell checkpoint (NATIVE-812)

This Tauri 2 shell bundles the existing production React assets from `apps/web/dist`. It registers no privileged IPC commands, local-only capability has no permissions, and its CSP permits no external connections. The browser-cookie web gateway and OAuth callback do not yet have an approved native auth contract, so sign-in and protected workflows are **not supported in installed clients**. No renderer refresh token path or native authentication success is claimed.

`src-tauri/src/config.rs` is a public HTTPS-origin validation draft for a future approved native gateway. It is intentionally not wired to the shell: accepting an origin is not proof of CORS, CSRF, session, callback or secure-storage behavior. No server URL, service-role key, provider secret or signing key belongs in this bundle. The bundled web app currently makes relative requests, which the CSP confines to local app origin and therefore fail closed.

## Fleet-only requested checks

Soren alone may acquire the Docker lease and run from the repository root after verifying the candidate SHA:

```sh
# Run inside Soren's fleet-02 Docker lane; never on the host.
docker run --rm -v "$PWD:/work" -w /work/apps/native/src-tauri rust:1.83-bookworm sh -lc 'cargo test --locked'
```

A Cargo.lock must be produced and reviewed in that lane before `--locked` is meaningful. The image tag is a draft and must be pinned to a verified digest by the fleet owner. A second gated build needs the existing web production build and Tauri Linux system libraries; Linux success would not establish Windows installation. Windows NSIS signing, WebView2 install/run/upgrade/uninstall and native OAuth/security validation need a real Windows lane and later authorized credentials. `embedBootstrapper` requires network when WebView2 is absent; offline clean-machine behavior is an open release gate.

## macOS overlay (MAC-814)

`src-tauri/tauri.macos.conf.json` overrides the shared shell's NSIS bundle with a DMG and sets macOS 12 as the minimum. The entitlements plist is intentionally empty; any WebKit requirement must be measured on a signed Mac build before adding a right. Tauri's platform config merge is documented at https://v2.tauri.app/reference/config/. The release entrypoint is `apps/native/macos-release.sh`; it fails before build if the runner, Developer ID identity, notarization inputs or reviewed Cargo lock are missing. Tauri's macOS signing/notarization flow is documented at https://v2.tauri.app/distribute/sign/macos/ and DMG build at https://v2.tauri.app/distribute/dmg/.

The release script is not a release approval. An owner must verify Mac tool versions, final Tauri CLI version and both Intel/Apple Silicon slices, then install and exercise the signed artifact on clean target machines. Native authentication remains fail closed until a versioned server/client flow exists. No callback scheme is registered by this overlay and no remote navigation or privileged IPC is granted.
