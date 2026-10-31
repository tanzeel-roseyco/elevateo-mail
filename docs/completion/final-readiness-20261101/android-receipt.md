# Android verification — 2026-11-01

Docker context: `desktop-linux`. Reused existing immutable toolchain image `sha256:ea90b42344e4ce108c4d46c3649f4ed6f3a34c103465a508bd5924fc69496dd7`; no new Android image build/pull. The image's inspected build-stage recipe contains toolchain only. Repository source was copied into owned container storage, not taken from an image application checkout.

```powershell
$env:DOCKER_CONTEXT='desktop-linux'
$repo=$PWD.Path
$ev=Join-Path $repo 'docs/completion/final-readiness-20261101'
docker run --name elevateo-client-android-final-20261101 --memory=2000m --cpus=1 --mount "type=bind,source=$repo,target=/input,readonly" --mount "type=bind,source=$ev,target=/evidence,readonly" sha256:ea90b42344e4ce108c4d46c3649f4ed6f3a34c103465a508bd5924fc69496dd7 bash /evidence/android-gate.sh
```

First execution runs `APK_BUILD_ROOT=/artifacts CARGO_BUILD_JOBS=1 bash /work/apps/android/build/build-apk.sh` unprivileged. It passed, exit 0:

- Boundary verifier, 42 package + 26 build/helper Python tests: 68 passed, 0 failed.
- `cargo test --locked`: 40 passed, 0 failed.
- `cargo test --locked --release config::tests`: 7 passed, 0 failed (33 filtered out).
- `cargo tauri android init --ci` and `cargo tauri android build --debug --apk --target x86_64 ... -- --locked`: passed with the checked-in Android and QA config overrides. Exact complete arguments are in `apps/android/build/build-apk.sh`.
- Rust/Kotlin compilation passed; existing native dead-code warnings and generated Tauri/Android Gradle deprecations remain, not a warning-free claim.
- APK v2 debug signature verification, packaged QA identity/permissions/network trust/CA and manifest-tree verification passed. Cargo.lock did not change.

Artifact retained locally (untracked): `apps/android/artifacts/elevateo-android-x86_64-qa.apk`, **126,340,179 bytes**.
SHA-256: `0f4605dad146f50e30b07fd783112338963d29183ea9ce85eebcfbc0a1bb3395`.
This is a debug-signed x86_64 isolated-QA artifact for `https://elevateo.qa.internal`, not a production release. No release-signing credentials were supplied. The temporary QA CA private key was deleted by the recipe; the server private key stayed in disposable container storage and was not copied into evidence.

The initial lint pass failed with 2 errors caused by one unsupported TV-advertising defect. The customizer now removes the generated leanback feature/category. The new regression failed against old source and all six customization tests passed after repair. `android-lint.sh` records that negative-control sequence followed by `./gradlew --no-daemon --max-workers=1 :app:lintUniversalDebug`: PASS, 0 errors, 36 warnings, 1 hint. Warnings concern generated/upstream Android code/resources and remain follow-ups.

The final `docker start -a elevateo-client-android-final-20261101` used the restart branch now recorded in `android-gate.sh` to rebuild the APK from repaired source using existing caches and the same public QA CA. PASS, exit 0: **43 + 26 Python tests, 40 Rust tests, 7 release-configuration tests**, boundary verifier, Kotlin/Rust compilation, APK v2 signature, package/trust/manifest verification and unchanged Cargo.lock. The artifact hash above describes this repaired rebuild. Logs: `android-rebuilt-gate.log`, `android-lint-repaired.log`, `android-lint-final-report.txt`, `android-final-container-state.json`.

Emulator and installed-client visual QA: NOT_RUN. Docker exposes 4,103,761,920 bytes RAM (3.82 GiB), below the required 8 GB. `/dev/kvm` was not probed once RAM failed the prerequisite. No emulator image pull or runtime claim.

Evidence: `android-final-gate.log`, `android-container-state.json`, `android-packaged-manifest.xml`, `android-packaged-network.xml`, `android-packaged-resources.txt`, `android-emulator-memory.txt`. The unused draft `android-tools.Dockerfile` was not executed and is not a verified recipe.

Replay caveat: `android-lint.sh` is the historical, non-idempotent negative-control sequence: it requires the pre-repair customizer in `/work`. Do not rerun that script against the final repaired checkout; it deliberately fails if the negative control passes. Current `android-gate.sh` copies repaired source and its restart branch rebuilds, without invoking that historical script. To replay final lint after the build, use the exports on lines 3–8 of `android-lint.sh`, then `cd /work/apps/native/src-tauri/gen/android` and `./gradlew --no-daemon --max-workers=1 :app:lintUniversalDebug`, as the unprivileged build user. Toolchain image and compiled caches were removed after verification; they must be restored before replay.