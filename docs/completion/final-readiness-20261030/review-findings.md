# Review findings P24-P34 (commit 696fcc9e)

Codex CLI gpt-6-astra, low effort, read-only over a source export. 27 defects, 3,613 lines, 7.47 defects/KLOC.

## P24

- **MEDIUM — `apps/web/src/features/settings/ConnectionsPage.tsx:108–117`: Older list responses can overwrite newer state.** `load()` has no request sequencing or cancellation; `useProtectedRequest` only rejects results after session invalidation or unmount, so concurrent reads in the same session both remain valid. **Failing scenario:** the initial list request captures the existing grants but responds slowly. The user creates a connection while that request is pending—the Grant access button permits this—and the post-create reload displays the new connection. The original response then arrives and overwrites the list, hiding the newly issued grant and its revoke control. **Fix:** assign each list request a monotonically increasing token and apply success/error results only for the latest token, or cancel superseded reads. Add a regression test that resolves the initial request after the post-create reload.

DEFECTS: 1 LOC: 380

## P25

- **MEDIUM — apps/web/src/features/settings/ConnectionsPage.tsx:456:** Selection validates only the minimum, despite the contract’s 50-mailbox maximum. **Failing scenario:** Select 51 mailboxes and submit; the HTTP adapter rejects the input with a generic error, without explaining the limit. **Fix:** Enforce `CONNECTOR_GRANT_MAX_MAILBOXES` in the form, display an actionable error, and test 50 versus 51 selections.

- **MEDIUM — apps/web/src/features/settings/ConnectionsPage.tsx:566:** Connection instructions omit the existing integration page’s warning that its packages and commands are unpublished and authentication is session-only. They also direct users to create an API token rather than explain the displayed connection secret. **Failing scenario:** A user follows “Connect a client” and is instructed to install an unavailable package and use an unsupported authentication workflow. **Fix:** Preserve the planned-feature warning and provide instructions aligned with the supported credential flow.

DEFECTS: 2 LOC: 198

## P26

- **MEDIUM — `apps/web/src/features/send/SuppressionsPage.tsx:56`**: The search field uses `defaultValue={q}`, so it does not synchronize with URL changes after editing. Only the results list is keyed by `q`. **Failing scenario:** edit the search field, then navigate back to a suppression URL with another query while the page remains mounted. Results follow the URL, but the field retains the previous text; clicking Search applies that stale filter. **Fix:** synchronize controlled input state with `q`, or remount the input with `key={q}`. Add a regression test covering query navigation after editing.

DEFECTS: 1 LOC: 599

## P27

- **HIGH — apps/windows/build/build-installer.sh:26:** NSIS changes its working directory to the script directory, but `PUBLISH_DIR` and `OUTFILE` are relative to `apps/windows`. **Failing scenario:** A clean build publishes to `apps/windows/artifacts/publish`, then NSIS searches `apps/windows/installer/artifacts/publish` and fails. **Fix:** Pass absolute paths or add `-NOCD` to `makensis`.

- **HIGH — apps/windows/installer/elevateo.nsi:46:** Recursive removal deletes everything under `$INSTDIR`, contradicting the comment promising to remove only installed files. **Failing scenario:** A user stores an unrelated file in the installation directory; uninstall permanently deletes it. **Fix:** Delete explicitly installed files using an installation manifest, then remove only empty directories.

- **MEDIUM — apps/windows/src/Elevateo.Client.Core/Api/ApiJsonContext.cs:8:** The serializer configuration does not enforce non-null reference values. In .NET 8, `required` checks property presence, so explicit JSON nulls pass. **Failing scenario:** An otherwise valid mailbox response containing `"items":null` becomes a successful `ApiResult`; `MainViewModel` then throws when enumerating it. This violates STANDARDS §4 boundary validation. **Fix:** Validate deserialized objects, nested members and collection elements before returning success; add explicit-null regression tests.

- **MEDIUM — apps/windows/build/Dockerfile:4:** The SDK image uses a mutable tag, and line 7 installs unpinned packages from changing repositories. This violates STANDARDS §§1 and 9 requiring pinned dependencies and reproducible builds. **Failing scenario:** Rebuilding the same revision after upstream updates selects different SDK, NSIS or signing-tool versions. **Fix:** Pin the image digest and package versions using a reproducible package source.

DEFECTS: 4 LOC: 279

## P28

- **MEDIUM — apps/windows/src/Elevateo.Client.Core/Api/ElevateoApiClient.cs:157:** Response-body reads have no timeout. `ResponseHeadersRead` ends `HttpClient.Timeout` coverage once headers arrive; `ReadBoundedAsync` uses only the caller’s cancellation token. **Failing scenario:** The server returns headers then stalls indefinitely, leaving loading or draft-saving state active indefinitely. This violates STANDARDS §4’s bounded-timeout requirement. **Fix:** Apply a linked cancellation token with the configured deadline across both headers and body reads, mapping deadline expiry to `Unavailable`.

- **MEDIUM — apps/windows/src/Elevateo.Client.Core/Api/ElevateoApiClient.cs:159:** Body-read transport failures escape the typed error handling. Only `InvalidDataException` is caught here; the `HttpRequestException` handler covers headers only. **Failing scenario:** A connection drops midway through a response, causing `HttpRequestException` or `IOException` to propagate into UI commands that do not handle them, instead of displaying an API error. **Fix:** Catch body-read transport exceptions and return `Unavailable`, while preserving caller cancellation. Add a regression test using a stream that fails during reading.

- **MEDIUM — apps/windows/src/Elevateo.Client.Core/Api/ElevateoApiClient.cs:171:** Deserialization does not validate non-null fields or collection elements before returning success. The source-generated configuration checks required-property presence, but explicit `null` satisfies presence. This violates STANDARDS §4’s response-validation requirement. **Failing scenario:** A mailbox response containing all required properties but `"items":null` returns success, then crashes `MainViewModel.LoadMailboxesAsync` during enumeration. Similarly, `"actor":null` crashes sign-in. **Fix:** Validate deserialized objects, nested required values, collection elements, and contract bounds before returning success; return `InvalidResponse` for violations. Add explicit-null regression tests alongside the existing missing-field tests.

DEFECTS: 3 LOC: 264

## P29

- **MEDIUM — `apps/windows/src/Elevateo.Client.Core/Api/Models.cs:80`** — `required` enforces property presence, not non-null values or collection elements. An otherwise valid thread response containing `"items":null` or `"items":[null]` deserializes successfully, then throws during `MainViewModel.LoadThreadsAsync`. This violates STANDARDS §4 boundary validation. **Fix:** validate required references and collection elements before returning API success; map failures to `InvalidResponse`. Add regression tests for both payloads.

- **MEDIUM — `apps/windows/src/Elevateo.Client.Core/Auth/ITokenStore.cs:50`** — Establishing a session without a refresh token preserves the previous session’s stored credential. **Failing scenario:** establish account A with refresh token A, then establish account B with `RefreshToken=null`; the access token belongs to B while `ReadRefreshToken()` still returns A’s credential. **Fix:** erase the previous credential when a new sign-in supplies no refresh token. Test sequential sign-ins and a prepopulated store.

- **MEDIUM — `apps/windows/src/Elevateo.Client.Core/Auth/ITokenStore.cs:49`** — The access token is published before credential persistence succeeds. **Failing scenario:** `WindowsCredentialStore.WriteRefreshToken` throws on a failed `CredWriteW`; `Establish` throws, but `IsSignedIn` remains true and `AccessToken` exposes the new token. An empty refresh token also deterministically triggers this partial update. **Fix:** validate inputs and complete credential storage before publishing the access token; define failure behavior explicitly and test with a throwing store.

DEFECTS: 3 LOC: 283

## P30

- **HIGH — apps/windows/src/Elevateo.Client.Core/Auth/LoopbackAuthenticator.cs:191–199:** The listener requires an HTTP.sys URL reservation, but uses random ports without provisioning reservations. The installer explicitly runs without elevation. **Failing scenario:** On a clean Windows installation, a standard user clicks Sign In; listener startup receives access denied, retries it as “port in use,” then throws before opening the browser. **Fix:** Use a socket-based loopback listener bound to `127.0.0.1:0`, avoiding administrator-managed URL reservations.

- **MEDIUM — apps/windows/src/Elevateo.Client.Core/Auth/LoopbackAuthenticator.cs:100–101, 226:** Callback response delivery controls whether an accepted authorization code reaches the exchange. Response-write exceptions escape; only cancellation is caught. **Failing scenario:** The browser disconnects after submitting a valid callback. Writing the response fails after the validator consumes the state, aborting sign-in without exchanging the code. An unrelated callback that disconnects can likewise terminate the attempt. **Fix:** Handle response transport failures separately from callback validation; continue processing accepted codes and waiting after rejected callbacks.

- **MEDIUM — apps/windows/src/Elevateo.Client.Core/Auth/LoopbackAuthenticator.cs:171–180:** Provider-response validation accepts an empty refresh token and access tokens containing newline characters. This violates STANDARDS §4 boundary validation. **Failing scenario:** A successful response containing `"refresh_token":""` passes validation, then `AuthSession.Establish` sets the access token before `WriteRefreshToken` throws. A newline-containing access token instead throws when constructing the API authorization header. The sign-in caller handles neither exception. **Fix:** Validate optional refresh tokens as nonempty when present and validate access tokens for bearer-header compatibility before returning success; add regression tests for both responses.

DEFECTS: 3 LOC: 385

## P31

- **MEDIUM — `apps/windows/src/Elevateo.Client.Core/Configuration/ClientConfiguration.cs:44`**: API base paths are accepted without a trailing slash, causing relative endpoint resolution to discard the final path segment. **Failing scenario:** configuring `https://example.com/mail-api` sends authentication to `/v1/native/sessions` and API requests to `/v1/...`, instead of `/mail-api/v1/...`. Both consumers use relative URI resolution, so this breaks sign-in and data access behind a path-prefixed deployment. **Fix:** normalize the API base path to end in `/`, or reject ambiguous base URLs explicitly. Add regression coverage for bases with and without a trailing slash.

DEFECTS: 1 LOC: 327

## P32

1. **HIGH — `apps/windows/src/Elevateo.Windows/ViewModels/MainViewModel.cs:83` — Sign-out retains private content and allows stale requests to repopulate state.**
   `SignOut` leaves `ComposerBody`, `ThreadSubject`, draft identifiers, and assistant state intact, and cancels no pending requests. **Failing scenario:** account A writes a reply, signs out, and account B signs in; A’s reply and subject remain visible before B selects a conversation. An outstanding detail response can also restore A’s messages after sign-out. **Fix:** invalidate the session’s outstanding work, reject responses from previous session generations, and clear all account-specific view and composer state.

2. **MEDIUM — `apps/windows/src/Elevateo.Windows/ViewModels/MainViewModel.cs:137` — Mailbox changes neither reset dependent state nor reject stale thread results.**
   Changing mailboxes starts another load, but leaves the previous conversation, messages, and composer active. `LoadThreadsAsync` applies results without checking that its captured mailbox is still selected. **Failing scenario:** select A, then B; B’s response arrives first and A’s arrives last, leaving A’s conversations under B. Even without overlapping requests, switching to an empty B leaves A’s displayed message and reply context intact. **Fix:** immediately clear dependent selections and composer state; cancel previous loads and verify mailbox/generation identity before applying results.

3. **HIGH — `apps/windows/src/Elevateo.Windows/ViewModels/MainViewModel.cs:322` — A completed save overwrites another conversation’s draft version.**
   The save awaits network I/O while thread selection can call `ResetComposer`. Its completion then writes `_composerVersion` unconditionally. **Failing scenario:** save a draft for A, select B before completion, then let A’s save return version 1. B now has no draft ID but version 1; saving B creates a fresh ID with `ExpectedVersion = 1`, violating the creation requirement and preventing the save. The UI also falsely reports B’s draft as saved. **Fix:** capture the draft/composer identity and apply completion state only if that identity remains current.

4. **MEDIUM — `apps/windows/src/Elevateo.Windows/ViewModels/MainViewModel.cs:111,166,228` — Pagination is discarded across all three read flows.**
   Mailbox, conversation, and message responses expose `NextCursor`, but every request passes `null` and no continuation state or command exists. **Failing scenario:** a response contains a non-null cursor; all subsequent mailboxes, conversations, or messages are inaccessible in the application. **Fix:** retain cursors and implement bounded, explicit pagination for each collection.

5. **MEDIUM — `apps/windows/src/Elevateo.Windows/ViewModels/MainViewModel.cs:332` — Authorization-context changes never trigger recovery.**
   `HandleSessionError` handles only `SessionExpired`. The API client maps context conflicts to `ContextChanged` and retains its bootstrap authorization headers until `GetSessionAsync` runs again. **Failing scenario:** mailbox permissions change during a session; requests return a context conflict, but Retry resends the same stale headers indefinitely while previously loaded content remains displayed. **Fix:** invalidate affected content, bootstrap the session again, and reload authorized data, or require a fresh sign-in.

DEFECTS: 5 LOC: 340

## P33

- **MEDIUM — `apps/windows/src/Elevateo.Windows/Views/MainWindow.axaml:50`**: Fixed columns consume 860 pixels, leaving at most 100 pixels for the message reader and reply composer at the permitted 960-pixel minimum width, before margins. **Failing scenario:** Resize to minimum width and select a conversation; the reply instructions wrap into many lines and the composer crowds out the message reader. **Fix:** Collapse the assistant/sidebar at narrower widths or use a responsive layout with a usable minimum width for the reader.

- **MEDIUM — `apps/windows/src/Elevateo.Windows/Views/MainWindow.axaml:38`**: The signed-in shell never identifies simulation mode, violating the project requirement to label simulated actions. The session model includes `SimulationMode`, but the view model does not expose it and the view displays ordinary “Save draft” messaging. **Failing scenario:** Sign into a session returning `simulation_mode: true`; simulated draft saves appear to be real persisted actions. **Fix:** Expose session simulation state and bind a visible simulation banner and explicit simulated-action labels.

DEFECTS: 2 LOC: 331

## P34

- **MEDIUM — apps/windows/tests/Elevateo.Client.Core.Tests/AuthFlowTests.cs:89:** The test reads request content after it has been disposed. `ExchangeCodeAsync` owns its request with `using`; awaiting `signIn` completes after disposal, while `StubHandler.LastRequest` retains that same request. **Failing scenario:** Successful authentication reaches line 89 and throws `ObjectDisposedException` instead of verifying the exchange body. **Fix:** Capture the body inside `StubHandler.SendAsync` before returning the response, then assert against the captured string.

- **MEDIUM — apps/windows/tests/Elevateo.Client.Core.Tests/AuthFlowTests.cs:75,101:** Waiting for `authorizeUrl` is unbounded and independent of the sign-in task’s failure. **Failing scenario:** If `StartOnFreePort` exhausts its retries or listener initialization fails, `signIn` faults before the browser launcher sets `urlSource`; the test waits forever and never reports that exception. **Fix:** Bound the wait and observe early sign-in completion/failure, propagating its exception. Cancel and await outstanding sign-in work during cleanup.

DEFECTS: 2 LOC: 227
