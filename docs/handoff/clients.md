# Client builds and releases

Jeison and Tanzeel maintain the clients; Callum chooses updates and signs the [release gate](README.md) before any external signing upload, store submission or public release. The commands below build candidates, not approved releases. Use the accepted SHA and [environment inventory](environment.md). Native packaging checks on the target OS supplement Docker application tests.

| Client | Build and validation host | Current release limit |
| --- | --- | --- |
| Web | Linux containers | Final merged gates and real integrated visual QA pending; no static web/edge service in production Compose |
| macOS | macOS with Xcode, Rust/Tauri and Apple credentials | Cargo.lock regeneration/review and signed/notarized artifact validation pending |
| Windows | Docker build plus a real Windows machine | Other worktree has uncommitted Windows changes; native exchange/bridge integration needs resolution |
| Android | Linux containers; emulator requires KVM | Current recipe makes isolated QA artifacts, including when signed; production recipe and acceptance remain open |
| iOS | Linux for core only; macOS/Xcode for app, simulator and signing | Core tests are not app proof; native session exchange and signed/device QA remain open |

## Web

For every local Docker command on this page, first run `export DOCKER_CONTEXT=desktop-linux` (PowerShell: `$env:DOCKER_CONTEXT='desktop-linux'`). Follow the [cleanup procedure](verification.md#docker-cleanup) after builds and checks.

Run the web commands in [verification](verification.md). `npm run build` inside the build image creates `apps/web/dist` in its workspace. Publish only the production bundle, never `dev-fixtures.html` or fixture assets; the Docker test image checks for fixture leakage. The company static hosting/edge and exact upload command are TO CONFIRM with Jeison and Callum. Record artifact hash, origin and API/auth routing; smoke-test the real HTTPS application before approval. Rollback uses the previous compatible static artifact and edge configuration, not a database reset.

## macOS

Source: [native README](../../apps/native/README.md), [release script](../../apps/native/macos-release.sh). First regenerate/review the lockfile in an approved containerized native validation workflow. Configure the reviewed HTTPS web origin and OIDC/updater settings. From the repository root:

```sh
sh apps/native/macos-release.sh --dry-run --arch universal
```

Expected: configuration validation and a redacted plan; unsigned dry run produces no binary. On an approved macOS runner, with complete signing and one supported notarization credential set, run `sh apps/native/macos-release.sh --arch universal`. The script builds the universal app/DMG, verifies architecture/signature, submits notarization, staples, assesses Gatekeeper and writes a SHA-256 file. Those external calls require Callum's approval first. Outputs are under `apps/native/src-tauri/target/<target>/release/bundle/`; use the script's printed path.

Pass: native tests, arm64/x86_64 slices for universal, codesign, notarization/stapling/Gatekeeper, actual install/login/keychain/revocation/update tests. Rollback: restore the previous approved signed app/update manifest; retain compatible user data. Do not publish an unsigned candidate as production.

## Windows

The implementation is .NET 8/Avalonia with NSIS, not the older proposed WPF or Tauri Windows stack. Sources: [README](../../apps/windows/README.md), [build recipe](../../apps/windows/build/Dockerfile), [installer script](../../apps/windows/build/build-installer.sh).

```sh
docker build -t elevateo-win-build apps/windows/build
docker run --rm -v "$PWD/apps/windows:/workspace" elevateo-win-build dotnet test Elevateo.Windows.sln -c Release
docker run --rm -v "$PWD/apps/windows:/workspace" elevateo-win-build bash build/build-installer.sh
```

Set `DOCKER_CONTEXT=desktop-linux` before these commands. With no signing inputs, expect an explicitly unsigned installer under `apps/windows/artifacts`; partial signing input fails. For a signed run, inject the PFX/password/timestamp settings using Docker `-e NAME` forwarding (and a private read-only mount if using the PFX-path option), without writing secrets into commands or logs. Use a trusted runner; review signing-tool credential exposure before use.

Pass: tests and installer build, signature verification, clean install/upgrade/uninstall on Windows, SSO and credential protection, mailbox flows and native bridge behavior. Existing source still has native exchange/bridge gaps; do not infer success from installer creation. Reconcile `feature/final-readiness` first. Rollback: distribute the prior approved installer only after compatibility review; preserve local data.

## Android

Source: [build Dockerfile](../../apps/android/build/Dockerfile) and [build script](../../apps/android/build/build-apk.sh). Supply a reviewed immutable Rust 1.90 image reference through the build argument and a writable output directory outside the repository:

```sh
docker build -f apps/android/build/Dockerfile --target build --build-arg RUST_IMAGE="$RUST_IMAGE" -t elevateo-android-build .
docker run --rm -v "$PWD:/src" -v "$APK_BUILD_ROOT:/artifacts" -e APK_BUILD_ROOT=/artifacts -w /src --user 1000:1000 elevateo-android-build bash apps/android/build/build-apk.sh
docker build -f apps/android/build/Dockerfile --target emulator --build-arg RUST_IMAGE="$RUST_IMAGE" -t elevateo-android-emulator .
docker run --rm --device /dev/kvm --group-add "$(stat -c %g /dev/kvm)" -v "$APK_BUILD_ROOT:/artifacts" elevateo-android-emulator bash /opt/elevateo/apps/android/build/emulator-acceptance.sh /artifacts/elevateo-android-x86_64-qa.apk /artifacts/qa-trust /artifacts/acceptance
```

Expected: labelled QA APK and acceptance evidence. The script sets an isolated QA web origin/artifact profile. Supplying all four Android signing settings does not turn this into a company production build. No supported production-publication command is established; Jeison and Tanzeel must implement/review it before Callum approves distribution. Real-device checks and any manual `NOT_RUN` acceptance items remain gates. Rollback: withdraw a candidate; for an installed public version, use the distribution channel's approved rollback/update process, which is TO CONFIRM.

## iOS

Sources: [README](../../apps/ios/README.md), [core Dockerfile](../../apps/ios/Dockerfile.core), [build script](../../apps/ios/build.sh).

```sh
docker build -f apps/ios/Dockerfile.core -t elevateo-ios-core apps
docker run --rm elevateo-ios-core
```

Expected: Swift core package build/tests only. On macOS with a compatible Xcode/Swift toolchain, run `bash apps/ios/build.sh`. No signing inputs gives an unsigned validation run; a complete four-variable signing set enables archive/export under `apps/ios/dist`. Confirm Xcode compatibility with the checked-in Swift package; a historical minimum version statement is not compatibility evidence.

Pass: core tests, simulator app, real device SSO/session revocation and secure storage, signed archive/export and installation. `/v1/native/sessions` is a client-side expectation without a matching current server route; close that contract/integration gap before release. Apple account ownership, provisioning and distribution remain TO CONFIRM. Rollback: withdraw the candidate or use the approved store distribution process; preserve the previous compatible release.

After container builds, follow the cleanup rules in [verification](verification.md). Save artifact hashes and exact commands with the release SHA; never attach signing credentials to the evidence.
