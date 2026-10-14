# APK-813 Android lane: shared Tauri/React candidate

`apps/android/tauri.android.conf.json` extends Orion's `apps/native` Tauri 2 shell for Android. It packages `apps/web/dist`; it does not ship a second Java UI. The old Java offline activity was removed. Source readiness and native runtime acceptance remain separate.

## Architecture and route boundary

The shared React app uses hash routes for mailbox selection, thread, drafts, send review/status, members and search. Tauri's local asset origin can render those routes, but Orion's CSP currently permits `connect-src 'self'`, and the web gateway makes relative Rails requests using browser cookies and CSRF. Therefore installed native sign-in and protected data access remain **unsupported** until Cassian accepts a versioned native session/transport contract and the web/native owners implement it. No remote URL, broad CSP, privileged IPC or fixture fallback is enabled here. Orion owns `apps/native`; Mira owns shared web entry/route presentation. The Android override changes only min API/version and neutralizes the Windows bundle target.

The generated Android manifest is a build artifact. It must request only network access needed for an approved HTTPS API; inspection is part of Soren's build receipt. No callback intent filter or App Link is declared until the HTTPS host, `assetlinks.json`, signing certificate fingerprint and exact callback contract are accepted. Callback handling must check exact scheme/host/path, one time and expiring `state`, PKCE verifier binding, issuer/audience, duplicate parameters and replay. No tokens in query fragments, logs or WebView storage.

Native secrets will require Android Keystore backed authenticated encryption, key invalidation recovery and logout deletion. Until a reviewed bridge exists, no token persistence is implemented. Resume must revalidate session and mailbox scope. Offline and network errors must be visible with bounded retry and no automatic write replay. Back navigation must not bypass logout or protected view fencing; keyboard/system bar insets and safe areas require target device checks. The shared React route behavior is a source candidate, not proof of those Android behaviors.

## Fleet-only unsigned APK request

Soren alone runs this under `/home/tanzeel/elevateo-mail-wave-20261014/control/soren-docker.lock` on fleet-02 from an integrated checkout containing Orion's `apps/native` plus `apps/web` and this APK lane. A reviewed `apps/native/src-tauri/Cargo.lock` is required. The container requires an immutable Rust 1.90.0 image digest. Node 22.15.0 and official Android command-line tools archive SHA-256 values are pinned in the Dockerfile from the [Node release checksums](https://nodejs.org/dist/v22.15.0/SHASUMS256.txt) and [Android Studio downloads](https://developer.android.com/studio). `Dockerfile` installs JDK 17, API 37/Build Tools 36.0.0, NDK 28.2.13676358, Rust aarch64 target and exact Tauri CLI 2.12.0. Its Debian packages and SDK repository metadata remain mutable inputs to record in the build receipt; successful compile alone is not a bit-for-bit reproducibility claim.

```sh
docker build -f ops/build/android/Dockerfile \
  --build-arg RUST_IMAGE="$RUST_IMAGE" \
  -t elevateo-apk813-build .
docker run --rm -v "$PWD:/src" -v "$APK813_BUILD_ROOT:/artifacts" \
  -e APK813_BUILD_ROOT=/artifacts -w /src elevateo-apk813-build \
  bash ops/build/android/build-unsigned.sh
```

The script runs three Gradle wrapper pinning cases, `npm ci` and web build, Tauri Android init/build, then rejects a signed or ambiguous APK and prints the artifact SHA-256. The [Gradle 9.6.1 binary checksum](https://gradle.org/release-checksums/) is pinned into Tauri's generated wrapper. Soren must retain exact source, image/archive hashes, command logs, generated manifest permission inspection, artifact path/hash and cleanup. An unsigned APK has **not yet been compiled** for this candidate.

Emulator/device installation, session/login/logout, App Link, lifecycle/resume, offline/back/keyboard/insets, release signature and upgrade tests are **NOT_RUN** and remain acceptance gates. Web Playwright does not establish Android shell behavior. No live OAuth registration, release key, DNS, SMTP or paid infrastructure is authorized.
