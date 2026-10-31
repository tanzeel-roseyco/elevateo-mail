# Elevateo Mail — Windows client

C#/.NET 8 desktop client: Elevateo SSO sign-in, mailbox/conversation/thread reading (plain text
only), reply drafting, and an assistant side panel. Sending and send approval stay in the web
review flow; this client only saves drafts.

## ADR: Avalonia UI 11 on .NET 8 LTS, NSIS installer, osslsigncode signing

**Decision.** The Windows client uses .NET 8 LTS with Avalonia UI 11 (MVVM via
CommunityToolkit.Mvvm), not WPF or WinUI. The installer is built with NSIS (`makensis`) and signed
with `osslsigncode`.

**Rationale.** All builds and unit tests must run in a Linux Docker container (project rule — no
host builds). WPF/WinUI require Windows build hosts; Avalonia restores, compiles, unit-tests and
publishes a self-contained `win-x64` output from Linux. NSIS and osslsigncode are Linux-native, so
the complete installer pipeline — including Authenticode signing — runs in the same container.

**Consequences.** No WebView dependency exists (also a security requirement: mail is rendered as
plain text only, never HTML). Native Windows integration (Credential Manager) is isolated behind
`ITokenStore` with a P/Invoke implementation that only activates on Windows. Visual QA on a real
Windows machine remains a separate release gate; the container proves compile, tests and packaging,
not pixels.

**Signing inputs.** Only environment variables, never files in the repo:
`ELEVATEO_WIN_SIGN_PFX_BASE64` (or `ELEVATEO_WIN_SIGN_PFX_PATH`),
`ELEVATEO_WIN_SIGN_PFX_PASSWORD`, `ELEVATEO_WIN_SIGN_TIMESTAMP_URL`. All set → signed installer;
none set → unsigned installer plus an explicit `UNSIGNED DRY RUN` line; a partial set → non-zero
exit. All NuGet package versions are pinned exactly; `Nullable`, `TreatWarningsAsErrors` and
analyzers are on via `Directory.Build.props`.

## Layout

| Path | Purpose |
| --- | --- |
| `src/Elevateo.Client.Core/` | UI-free library: typed v1 API client (validated responses, bounded timeouts, request IDs), RFC 8252 PKCE loopback sign-in, token stores (Windows Credential Manager + in-memory double), `IAgentsBridge` port with honest unavailable stub |
| `src/Elevateo.Windows/` | Avalonia app: sign-in, mailbox list, conversation list, plain-text thread view, reply draft composer, assistant panel |
| `tests/Elevateo.Client.Core.Tests/` | xUnit: PKCE/loopback callback, API response validation, credential-store sign-out |
| `build/` | `Dockerfile` (SDK 8.0 + nsis + osslsigncode) and `build-installer.sh` |
| `installer/elevateo.nsi` | Per-user NSIS installer: Start-menu shortcut, uninstaller, version from `VERSION` |

## Build, test and installer (Docker only)

```powershell
# From the repository root; restore packages during image build, then verify offline.
$env:DOCKER_CONTEXT='desktop-linux'
docker build --memory=4g -t elevateo-windows-p27-p34:toolchain apps/windows/build
$env:DOCKER_CONTEXT='desktop-linux'
docker build --memory=4g -f apps/windows/build/verification.Dockerfile -t elevateo-windows-p27-p34:verify .
New-Item -ItemType Directory -Force apps/windows/artifacts | Out-Null
$env:DOCKER_CONTEXT='desktop-linux'
docker run --rm --network=none --memory=4g -e ELEVATEO_VISUAL_EVIDENCE=/workspace/artifacts/p27-p34 -v "${PWD}/apps/windows/artifacts:/workspace/artifacts" elevateo-windows-p27-p34:verify bash -c 'set -e; bash tests/installer-regressions.sh; bash build/build-installer.sh'
# After inspecting artifacts, remove only these disposable images, then build cache (never volumes).
$env:DOCKER_CONTEXT='desktop-linux'
docker image rm elevateo-windows-p27-p34:verify elevateo-windows-p27-p34:toolchain
$env:DOCKER_CONTEXT='desktop-linux'
docker builder prune -a -f
```

Output lands in `apps/windows/artifacts/`. The API base URL ships as the placeholder
`https://mail.company.example` in `appsettings.json`; override with `ELEVATEO_API_BASE_URL`
(plus `ELEVATEO_OIDC_AUTHORIZE_URL`, `ELEVATEO_OIDC_CLIENT_ID`). The authorization code is
exchanged with the Elevateo server at `POST <api base>/v1/native/sessions` (proposed contract,
`docs/contract-requests.md` §2), never directly with the identity provider.
No secrets are stored in configuration.

## Known contract gaps (desktop)

contracts/v1 defines cookie-session auth for the web client. This desktop client implements the
task-specified OIDC authorization-code + PKCE flow and sends `Authorization: Bearer`; the server
must register a public desktop client and accept bearer sessions before desktop login works
end-to-end. The assistant panel's `IAgentsBridge` stub reports "not available" until the separately
owned native process adapters ship. Details: `AIDEV-NOTE: contract-request` anchors in
`ElevateoApiClient.cs` and `IAgentsBridge.cs`, and the coordinator's `docs/contract-requests.md`.
