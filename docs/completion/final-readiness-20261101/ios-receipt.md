# iOS Core verification — 2026-11-01

Docker context: `desktop-linux`. Swift image: `swift:6.0@sha256:1a1c10372d9c6c0ba9b6151085e0a26ee83a79968b3c738a47a70eac1a70bba4`.

Commands inside the Core container:

```sh
swift build --jobs 1
swift test --jobs 1
```

Both pass: **36 tests, 0 failures** (APIClient 14, AuthCoordinator 12, Drafts 10).
The initial attempt exposed missing `FoundationNetworking` in APIClientTests; the conditional import repairs Linux compilation and retains the redirect regression.

The retry's combined wrapper subsequently exited 127 because this image has no Python. That wrapper is not recorded as passing. The checked-in Dockerfile now runs only Swift. Signing helpers were independently run using PowerShell:

```powershell
$env:DOCKER_CONTEXT='desktop-linux'
docker run --rm --memory=256m --cpus=0.5 --mount "type=bind,source=$PWD/apps/ios,target=/src,readonly" elevateo-client-native-tools:20261101 python3 /src/test_signing_helpers.py
```

**3 tests, 0 failures**. No separate Swift lint tool is configured; compiler checks passed, not an invented lint gate. SwiftUI application build/signing requires macOS and was not run. Logs: `ios-core-final-gate.log`, `ios-core-final-retry.log`, `ios-signing-helpers.log`.
