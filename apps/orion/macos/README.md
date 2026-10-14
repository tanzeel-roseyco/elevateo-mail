# MAC-814 macOS release template

This is a static template for the future Orion Tauri v2 shell. No native shell, macOS binary, or DMG exists in this baseline. The shared React UI is `apps/web`; a future Orion shell must point its Tauri frontend distribution to `apps/web/dist` and consume only versioned application APIs. The template selects a **universal Intel and Apple Silicon** target; no architecture is claimed tested. It names a local URL callback scheme as an integration assumption, not a registered or working callback.

A release runner on macOS must pin Xcode, Rust, Tauri CLI, Node and lockfile versions; build both x86_64 and aarch64 slices; generate the DMG; record source commit, tool versions and SHA-256 checksum. The runner must verify the binary architectures and install/open the DMG on both Mac architectures. Docker on Linux can run static validation only and cannot prove a Mac build.

Before distribution, the owner must supply an Apple Developer account and Developer ID Application identity through the macOS runner's secret store, sign the application and DMG, submit for Apple notarization, staple the accepted ticket, and verify Gatekeeper with `spctl` on a clean Mac. These credentials and paid account are not requested or used here. Native acceptance must cover installed-app login, callback replay rejection, logout and secure-store clearing, expired session, and upgrading a prior install without losing safe local state. No release is approved until those checks pass.

Soren QA815 bounded Docker command from repository root (Python standard library only):

```sh
python3 apps/orion/macos/validate_release_template.py apps/orion/macos/release-template.json
python3 -m unittest discover -s apps/orion/macos -p 'test_*.py'
```

This command is a request, not executed evidence. It performs no build, signing, network operation or live send.
