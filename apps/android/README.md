# Android APK lane (APK-813)

This is an **offline, unsigned development scaffold**. It does not authenticate, load mailbox data, or send mail. The launch activity intentionally declares no callback intent filter until Cassian supplies an accepted versioned mobile session contract and registered HTTPS App Link.

## Pinned build inputs

AGP 8.9.2, Gradle 8.11.1, JDK 17, Android API 35 and Build Tools 35.0.0 are fixed in source. Android's [AGP 8.9 compatibility table](https://developer.android.com/build/releases/agp-8-9-0-release-notes) pairs AGP 8.9 with Gradle 8.11.1, JDK 17 and API 35. Soren supplies an immutable JDK image digest plus verified official Android command-line-tools and Gradle archive SHA-256 values in the fleet Docker lease. No checksum has been invented here; missing inputs fail the image build.

Proposed exact fleet commands, under Soren's lease in the verified checkout:

```sh
docker build -f ops/build/android/Dockerfile \
  --build-arg JDK17_IMAGE="$JDK17_IMAGE" \
  --build-arg SDK_TOOLS_URL="$SDK_TOOLS_URL" \
  --build-arg SDK_TOOLS_SHA256="$SDK_TOOLS_SHA256" \
  --build-arg GRADLE_SHA256="$GRADLE_SHA256" \
  -t elevateo-apk813-build .
docker run --rm -v "$PWD:/src" -w /src elevateo-apk813-build \
  bash ops/build/android/build-unsigned.sh
```

The script runs three callback unit cases and `assembleDebug`, then prints the APK SHA-256. This request is **NOT_RUN**; an unsigned APK has **not** been shown to compile. Soren must record the exact image digest, archive hashes, command output and disposable cleanup. Debug APK signing by the SDK's generated debug key does not count as release signing.

## Platform boundaries

Only `INTERNET` is declared. Backups and cleartext traffic are disabled. No contacts, storage, camera, notification or background location permissions are requested. The UI is an offline placeholder; no web Playwright result proves this Android shell.

Before a real session, register an HTTPS App Link with verified domain association and make callback validation check exact scheme, host, path, single state, state expiry and single use, PKCE verifier binding, and expected issuer/audience. `AuthCallback` currently checks only the static URI/state shape and is not wired to an exported activity. It never extracts a token. Reject unsolicited callbacks, duplicate parameters, fragments and userinfo. No live OAuth registration is authorized.

Session secrets, if later approved, require Android Keystore-backed encryption with non-exportable keys, authenticated encryption, key invalidation recovery and explicit logout deletion. Keep plaintext and bearer tokens out of logs, bundles, WebView, backups and clipboard. On resume, revalidate session and mailbox scope; on network loss, show bounded retry without replaying writes. Keyboard and system-bar insets, safe areas, rotation, process death and accessibility remain device acceptance items. Emulator/device installation, callback association, lifecycle/resume, network interruption, IME/insets, signature and upgrade tests are **BLOCKED/NOT_RUN** until target runtime and accepted contracts exist.

Orion owns the separate shared Tauri shell. The integration seam is the versioned Rails API and session contract; no Tauri source is modified by this APK lane.
