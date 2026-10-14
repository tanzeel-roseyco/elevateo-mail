# APK-813 Android lane: shared Tauri/React candidate

`apps/android/tauri.android.conf.json` extends Orion's `apps/native` Tauri 2 shell for Android. It does not ship a second Java UI. The old Java offline activity was removed. Root selected an online-only exact HTTPS app origin and existing same-origin web session for the initial native client; Orion source `625bef13fd1328beb407c208f70a171fea9fd12d` is merged in the isolated APK branch; Orion mobile library target and dependency repair `5108625` are merged, and a reviewed Cargo.lock `abdf268` are merged; fleet Android compile remains pending.

## Architecture and route boundary

The shared React app uses hash routes for mailbox selection, thread, drafts, send review/status, members and search. The selected online-only design loads the exact authorized HTTPS web app origin in Orion's Tauri WebView, so relative Rails requests retain the web origin and its existing cookie/CSRF session. Orion must enforce exact-origin navigation, zero remote IPC/capabilities and no fixture fallback. The Android override changes only min API/version and neutralizes the Windows bundle target. The merged Orion source chooses the exact remote origin at build time; do not claim remote-origin login until the APK is installed and tested.

The generated Android manifest is a build artifact. It must request only network access needed for an approved HTTPS API; inspection is part of Soren's build receipt. No Android callback intent filter or App Link is needed for the selected initial web-session design. System links must stay in the system browser unless an exact reviewed HTTPS origin/path policy is added. Never move tokens into query fragments, logs or WebView storage.

No native token store or Keystore bridge is part of the selected initial web-session design; the web server owns session validity and the WebView owns its existing secure cookie policy. Resume must revalidate session and mailbox scope. Offline and network errors must be visible with bounded retry and no automatic write replay. Back navigation must not bypass logout or protected view fencing; keyboard/system bar insets and safe areas require target device checks. The shared React route behavior is a source candidate, not proof of those Android behaviors.

## Fleet-only unsigned APK request

Soren alone runs this under `/home/tanzeel/elevateo-mail-wave-20261014/control/soren-docker.lock` on fleet-02 from an integrated checkout containing Orion's `apps/native` and this APK lane. A reviewed `apps/native/src-tauri/Cargo.lock` is required. The container requires an immutable Rust 1.90.0 image digest. The official Android command-line tools archive SHA-256 is pinned in the Dockerfile from [Android Studio downloads](https://developer.android.com/studio). `Dockerfile` installs JDK 17, API 36 and 37.0/Build Tools 36.0.0, NDK 28.2.13676358, Rust aarch64 target and exact Tauri CLI 2.12.2. Its Debian packages and SDK repository metadata remain mutable inputs to record in the build receipt; successful compile alone is not a bit-for-bit reproducibility claim.

```sh
docker build -f ops/build/android/Dockerfile \
  --build-arg RUST_IMAGE="$RUST_IMAGE" \
  -t elevateo-apk813-build .
docker run --rm --user "$(id -u):$(id -g)" --ulimit nofile=65535:65535 \
  -v "$PWD:/src" -v "$APK813_BUILD_ROOT:/artifacts" \
  -e APK813_BUILD_ROOT=/artifacts \
  -w /src elevateo-apk813-build \
  bash ops/build/android/build-unsigned.sh
```

Run from a disposable, writable archive of the exact integrated SHA. The archive and `$APK813_BUILD_ROOT` must be owned by the unprivileged UID. The script creates task-owned Cargo cache, target and home directories under `$APK813_BUILD_ROOT`; Soren's root-container attempts hit Tauri CLI OS24 before init, while a nonroot task-owned cache passed init. Generated project files stay in the disposable archive.

The script embeds the root-authorized **compile-only** `https://app.elevateo.invalid` fixture with Orion's `compile-only-fixture` artifact marker and `tauri.fixture.conf.json`; the package ID is `com.elevateo.mail.fixture` and launch is deliberately denied. It runs Orion's static remote-boundary verifier, three Gradle wrapper pinning cases, Orion Rust unit tests, Tauri Android init/build, then rejects unexpected permissions, an active VIEW callback filter, a signed or ambiguous APK, and prints the artifact SHA-256. The [Gradle 9.6.1 binary checksum](https://gradle.org/release-checksums/) is pinned into Tauri's generated wrapper. Soren must retain exact source, image/archive hashes, command logs, generated manifest permission inspection, artifact path/hash and cleanup. Soren's first fleet Docker image build on `7b9f314` failed because `platforms;android-37` was an invalid package path. The API 36 image built and a nonroot run passed Rust 7/7, Tauri init and aarch64 Rust compile, but Gradle then requested exact `platforms;android-37.0` and could not install it in a read-only runtime SDK. The next run reached Gradle Java compilation and showed Tauri's library also requires SDK 36; the recipe now installs both SDK platforms during image build. Exact `32d043f` Gradle generated `app-universal-release-unsigned.apk`, but the script exited before copy/hash/signature checks because AndroidX Core 1.13.1 added the package-scoped `DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION` with `signature` protection. The narrowed oracle allows exactly that fixture permission plus INTERNET and has eight regression cases for Soren’s fleet rerun. An unsigned-named APK was generated on `32d043f`; artifact signature/hash and script PASS remain pending. A fixture-origin APK can prove packaging only; it cannot launch into the app or prove login. A real approved origin and installed-runtime checks remain separate release gates.

Emulator/device installation, same-origin session/login/logout, system links, lifecycle/resume, offline/back/keyboard/insets, release signature and upgrade tests are **NOT_RUN** and remain acceptance gates. Web Playwright does not establish Android shell behavior. The case-by-case installed-runtime oracles are in [acceptance.md](acceptance.md). No live OAuth registration, release key, DNS, SMTP or paid infrastructure is authorized.
