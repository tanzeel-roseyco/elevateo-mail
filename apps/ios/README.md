# Elevateo Mail — iOS client

SwiftUI iOS client (iOS 17+) for Elevateo Mail: SSO sign-in, mailbox list, conversation list, plain-text thread view and a reply-draft composer. Sending stays in the web review/approval flow; this app saves drafts only.

**The iOS app target has not been built or run: no macOS host is available in this environment.** Only the `ElevateoCore` package is verifiable here (it builds and tests on Linux).

## Layout

- `ElevateoCore/` — Swift package (Swift 6 language mode, strict concurrency, Foundation only; `swift-crypto` pinned exactly `3.9.1` for SHA-256 on Linux). Typed async client for contracts/v1 (session, mailboxes, threads, thread+messages, draft create/update with optimistic versioning), validated Codable DTOs, OIDC authorization-code + PKCE (S256) with state binding, replay and expiry rejection, and a `TokenStore` protocol with an in-memory implementation.
- `ElevateoCore/Sources/ElevateoCore/State/` — screen-independent state owners the SwiftUI views render: `SessionLifecycle` (restore, server logout, cookie/credential cleanup, restore-vs-sign-out fencing), `DraftSaveCoordinator` (one operation id per immutable payload, unconfirmed-save replay, conflict reconciliation), `CursorPager` (continuation pages, visible pagination errors, refresh generations) and `ClientSettings` (configuration validation).
- `ElevateoCore/Tests/ElevateoCoreTests/` — XCTest: PKCE/callback and the shared vectors in `apps/shared/auth-conformance-vectors.json`, API response bounds/redirect/binding validation, reply draft saves, pagination and session lifecycle (happy path + failure paths).
- `signing-helpers.sh` + `test_signing_helpers.py` — keychain search-list preservation and ExportOptions provisioning-profile mapping used by `build.sh`, tested on Linux with a stubbed `security`.
- `Elevateo/` — SwiftUI app target: `ASWebAuthenticationSession` sign-in (Elevateo SSO / Authentik only), Keychain token store, mailbox/thread/message/composer screens. Message bodies render as plain `Text` only — never HTML, no WKWebView, no auto-loaded links or remote images.
- `project.yml` — XcodeGen spec; `Elevateo.xcodeproj/` — committed equivalent project so Xcode opens without XcodeGen.
- `build.sh` — macOS: unsigned simulator build; signed archive/export only when ALL of `ELEVATEO_IOS_TEAM_ID`, `ELEVATEO_IOS_SIGNING_CERT_BASE64`, `ELEVATEO_IOS_SIGNING_CERT_PASSWORD`, `ELEVATEO_IOS_PROFILE_BASE64` are set (none → "UNSIGNED DRY RUN", partial → failure). Linux: core build+test only.
- `Dockerfile.core` — Linux core verification image.

## Build / test

Core (Linux or macOS):

```sh
cd apps/ios/ElevateoCore
swift build
swift test
```

Or in Docker (from the repository root; the context is `apps/` so the shared auth vectors are included):

```sh
docker build -f apps/ios/Dockerfile.core -t elevateo-ios-core apps
docker run --rm elevateo-ios-core
```

App (macOS with Xcode 15+ only):

```sh
cd apps/ios
./build.sh            # core tests + unsigned simulator build; signed archive only with full env credentials
open Elevateo.xcodeproj
```

## Configuration

API base URL and SSO settings are build settings substituted into `Elevateo/Info.plist` (`ELEVATEO_API_BASE_URL`, placeholder `https://mail.company.example`; `ELEVATEO_SSO_AUTHORIZATION_ENDPOINT`, `ELEVATEO_SSO_CLIENT_ID`, `ELEVATEO_SSO_REDIRECT_URI`). Override per configuration or on the `xcodebuild` command line. No secrets live in the app bundle.

## Known limitation (contract request)

contracts/v1 has no native OIDC code-for-session exchange endpoint; v1 auth is a cookie/CSRF browser session. The PKCE front half is fully implemented and tested; the exchange is a typed port (`TokenExchangePort`) whose production implementation honestly reports "not available yet" on the sign-in screen (see `AIDEV-NOTE: contract-request` in `ElevateoCore/Sources/ElevateoCore/Auth/TokenExchangePort.swift`). If the server session cookie already exists in the app's session storage, `GET /v1/session` signs the user in at launch. Sign-out calls `POST /v1/auth/logout`, then always removes the app's cookies for the API origin and the stored credentials, and reports when the server could not confirm revocation.

Not testable without a Mac host (accepted blocker): the `ASWebAuthenticationSession` sign-in sheet, Keychain storage and SwiftUI rendering. Their logic lives in the tested `ElevateoCore` state owners above.
