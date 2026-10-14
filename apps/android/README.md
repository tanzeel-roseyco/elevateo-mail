# APK-813 Android lane: shared Tauri/React candidate

`apps/android/tauri.android.conf.json` extends Orion's `apps/native` Tauri 2 shell for Android. It does not ship a second Java UI. The old Java offline activity was removed. Root selected an online-only exact HTTPS app origin and existing same-origin web session for the initial native client; Orion source `625bef13fd1328beb407c208f70a171fea9fd12d` is merged in the isolated APK branch; Orion mobile library target and dependency repair `5108625` are merged, and a reviewed Cargo.lock `abdf268` are merged; fleet Android compile remains pending.

## Architecture and route boundary

The shared React app uses hash routes for mailbox selection, thread, drafts, send review/status, members and search. The selected online-only design loads the exact authorized HTTPS web app origin in Orion's Tauri WebView, so relative Rails requests retain the web origin and its existing cookie/CSRF session. Orion must enforce exact-origin navigation, zero remote IPC/capabilities and no fixture fallback. The Android override changes only min API/version and neutralizes the Windows bundle target. The merged Orion source chooses the exact remote origin at build time; do not claim remote-origin login until the APK is installed and tested.

The generated Android manifest is a build artifact. It must request only network access needed for an approved HTTPS API; inspection is part of Soren's build receipt. No Android callback intent filter or App Link is needed for the selected initial web-session design. System links must stay in the system browser unless an exact reviewed HTTPS origin/path policy is added. Never move tokens into query fragments, logs or WebView storage.

No native token store or Keystore bridge is part of the selected initial web-session design; the web server owns session validity and the WebView owns its existing secure cookie policy. Resume must revalidate session and mailbox scope. Offline and network errors must be visible with bounded retry and no automatic write replay. Back navigation must not bypass logout or protected view fencing; keyboard/system bar insets and safe areas require target device checks. The shared React route behavior is a source candidate, not proof of those Android behaviors.

## Fleet-only unsigned APK request

Soren alone runs this under `/home/tanzeel/elevateo-mail-wave-20261014/control/soren-docker.lock` on fleet-02 from an integrated checkout containing Orion's `apps/native` and this APK lane. A reviewed `apps/native/src-tauri/Cargo.lock` is required. The container requires an immutable Rust 1.90.0 image digest. The official Android command-line tools archive SHA-256 is pinned in the Dockerfile from [Android Studio downloads](https://developer.android.com/studio). `Dockerfile` installs JDK 17, API 36/Build Tools 36.0.0, NDK 28.2.13676358, Rust aarch64 target and exact Tauri CLI 2.12.2. Its Debian packages and SDK repository metadata remain mutable inputs to record in the build receipt; successful compile alone is not a bit-for-bit reproducibility claim.

```sh
docker build -f ops/build/android/Dockerfile \
  --build-arg RUST_IMAGE="$RUST_IMAGE" \
  -t elevateo-apk813-build .
docker run --rm -v "$PWD:/src" -v "$APK813_BUILD_ROOT:/artifacts" \
  -e APK813_BUILD_ROOT=/artifacts \
  -w /src elevateo-apk813-build \
  bash ops/build/android/build-unsigned.sh
```

The script embeds the root-authorized **compile-only** `https://app.elevateo.invalid` fixture with Orion's `compile-only-fixture` artifact marker and `tauri.fixture.conf.json`; the package ID is `com.elevateo.mail.fixture` and launch is deliberately denied. It runs Orion's static remote-boundary verifier, three Gradle wrapper pinning cases, Orion Rust unit tests, Tauri Android init/build, then rejects unexpected permissions, an active VIEW callback filter, a signed or ambiguous APK, and prints the artifact SHA-256. The [Gradle 9.6.1 binary checksum](https://gradle.org/release-checksums/) is pinned into Tauri's generated wrapper. Soren must retain exact source, image/archive hashes, command logs, generated manifest permission inspection, artifact path/hash and cleanup. Soren's first fleet Docker image build on `7b9f314` failed at SDK installation because `platforms;android-37` was absent; the recipe now uses stable API 36. An unsigned APK has **not yet been compiled** for this candidate. A fixture-origin APK can prove packaging only; it cannot launch into the app or prove login. A real approved origin and installed-runtime checks remain separate release gates.

Emulator/device installation, same-origin session/login/logout, system links, lifecycle/resume, offline/back/keyboard/insets, release signature and upgrade tests are **NOT_RUN** and remain acceptance gates. Web Playwright does not establish Android shell behavior. The case-by-case installed-runtime oracles are in [acceptance.md](acceptance.md). No live OAuth registration, release key, DNS, SMTP or paid infrastructure is authorized.

## Integrated parser/policy checkpoint — 2026-10-14

The earlier checkpoint above predates exact Astrid `d93c331` and Soren's compile-only fleet receipt. This integration now includes the owner fail-closed permission and unsigned classifiers plus their tests, the manifest ancestry parser, and the owner build recipe that invokes all three. Soren's exact `d93c331` compile-only build generated an unsigned fixture APK with SHA256 `743046f42bb8fd6d3eb662cc7708ed06612839b1582a5323dc896a6913458c83`, byte-identical to the retained older rejected artifact, and its current reviewed merged-manifest/permission/unsigned policy passed. The `.invalid` fixture cannot establish launch, login, device behavior or release signing. Receipt: `docs/completion/qa815-evidence/android-d93c3311d1c1.txt`. No newer integrated-SHA APK build is inferred.
