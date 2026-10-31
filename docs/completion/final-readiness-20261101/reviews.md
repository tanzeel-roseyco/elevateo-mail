# Final readiness review evidence

All reviewers used the user's adversarial rubric and STANDARDS. Formatting belongs to linters.
Reviews are read-only; runtime verification is recorded separately. LOC counts are physical reviewed lines.

| Packet | Exact source ranges (relative to apps/windows) | LOC | Defects | Defects/KLOC |
| --- | --- | ---: | ---: | ---: |
| P27 packaging initial | build/uninstall-manifest.sh:1–22; installer/elevateo.nsi:1–55; tests/installer-regressions.sh:1–29; build/build-installer.sh:1–79 | 185 | 2 | 10.81 |
| P27 packaging repair | build/uninstall-manifest.sh:1–28; tests/installer-regressions.sh:1–73; build/build-installer.sh:1–85 | 186 | 0 | 0 |
| P27 remainder | Directory.Build.props:1–14; build/Dockerfile:1–12; src/Elevateo.Client.Core/Agents/IAgentsBridge.cs:1–63; Api/ApiError.cs:1–46; Api/ApiJsonContext.cs:1–22 | 157 | 0 | 0 |
| P28a | src/Elevateo.Client.Core/Api/ElevateoApiClient.cs:1–200 | 200 | 1 | 5.00 |
| P28b | src/Elevateo.Client.Core/Api/ElevateoApiClient.cs:201–265; IElevateoApiClient.cs:1–11; ApiResponseValidation.cs:1–57 | 133 | 1 | 7.52 |
| Design | src/Elevateo.Windows/ViewModels/MainViewModel.cs:122–155,372–458; src/Elevateo.Client.Core/Api/ElevateoApiClient.cs:76–99; tests/Elevateo.Client.Core.Tests/MainViewModelTests.cs:92–125; src/Elevateo.Windows/Views/MainWindow.axaml:153–160 | 187 | 2 | 10.70 |
| Design repair | src/Elevateo.Windows/ViewModels/MainViewModel.cs:372–480; tests/Elevateo.Client.Core.Tests/MainViewModelTests.cs:1–90 | 199 | 0 | 0 |

Confirmed findings and repairs:

- P27 medium: process substitution hid enumeration failures. Checked temporary listings now complete before manifest output; missing-root and forced-failure regressions.
- P27 medium: persistent publish output included obsolete release files. Fresh task-owned staging and cleanup now isolate each publish; stubbed publish regression proves old output is excluded and preserved.
- P28 medium: data context/version were not matched to session bootstrap. Each request now snapshots expected metadata and rejects mismatches; two regression cases plus existing matching case.
- P28 medium: UTF-8 replacement decoding accepted corrupted message bytes. Strict decoding now returns InvalidResponse; malformed and valid multibyte cases.
- Design high: lost draft acknowledgement retried a new operation ID and conflicted. Pending immutable operation is retained until acknowledgement; regression verifies exact replay and subsequent version advancement.
- Design medium: saved status described unsaved edits during/after an in-flight save. Status now distinguishes earlier acknowledged content and newer edits; regressions include signout during save.

Design simulations: lost acknowledgement favors one bounded pending payload over fresh IDs; editable composer requires acknowledgement comparison; signout generation fencing remains appropriate. No generic coordinator was added. Obsidian connection tools were unavailable: these were analytical simulations, not Obsidian-backed simulations.

## Additional bounded packets

| Packet | Source ranges (apps/windows unless stated) | LOC | Defects | Defects/KLOC |
| --- | --- | ---: | ---: | ---: |
| P28 repair | ApiClientValidationTests:1-55; ElevateoApiClient:90-130,155-240 | 182 | 0 | 0 |
| P29a | Models:1-140; ITokenStore:1-60 | 200 | 0 | 0 |
| P29b | ITokenStore:61-75; AuthCallbackValidator:1-80; TokenValidation:1-18 | 113 | 1 | 8.85 |
| P30a | LoopbackAuthenticator:1-200 | 200 | 1 | 5.00 |
| P30b | LoopbackAuthenticator:201-244; Pkce:1-33; WindowsCredentialStore:1-123 | 200 | 0 | 0 |
| P31a | ClientConfiguration:1-74; App.axaml:1-9; App.axaml.cs:1-27; Program:1-17; AppServices:1-72; Core.csproj:1 | 200 | 0 | 0 |
| P31b | AssistantViewModel:1-142; AssistantResetTests:1-53 | 195 | 1 | 5.13 |
| P31 repair | AssistantViewModel:1-147; AssistantResetTests:1-53 | 200 | 0 | 0 |
| P32a | MainViewModel:1-200 | 200 | 1 | 5.00 |
| P32 repair | MainViewModel:73-155; CredentialUiTests:1-112 | 195 | 0 | 0 |
| P32b | MainViewModel:201-371 | 171 | 0 | 0 |
| P33a | MainWindow.axaml:1-200 | 200 | 1 | 5.00 |
| P33 repair/remainder | MainViewModel:315-321; MainViewModelTests:260-285; MainWindow.axaml:126-133,201-218; MainWindow.axaml.cs:1-22; app.manifest:1-10; appsettings.json:1-5; Core.csproj:2-10; Windows.csproj:1-23 | 128 | 0 | 0 |
| P33b | ApiClientValidationTests:1-200 | 200 | 1 | 5.00 |
| P34a | AuthFlowTests:1-200 | 200 | 1 | 5.00 |
| P34b | AuthFlowTests:201-277; Tests.csproj:1-17; TestSupport:1-39 | 133 | 0 | 0 |
| P33c/P34c | ApiClientValidationTests:201-315; CredentialStoreTests:1-85 | 200 | 1 | 5.00 |
| Authentication/fixture repairs | ApiClientValidationTests:100-120,246-280; AuthFlowTests:50-75; AuthCallbackValidator:1-81; LoopbackAuthenticator:138-174 | 200 | 0 | 0 |
| Windows regression additions | MainViewModelTests:91-259; AssistantResetTests:54-84 | 200 | 0 | 0 |
| P24a | ConnectionsPage.tsx:1-200 | 200 | 1 | 5.00 |
| P24b | ConnectionsPage.tsx:201-380 | 180 | 0 | 0 |
| P25 | ConnectionsPage.tsx:381-578 | 198 | 2 | 10.10 |
| P26a | SuppressionsPage.tsx:1-133; SuppressionsPage.test.tsx:1-50; deliveryFilters:1-17 | 200 | 1 | 5.00 |
| P26b | ConnectionsPage.test.tsx:1-112; IntegrationsPages.tsx:1-88 | 200 | 0 | 0 |
| P26c | deliveryFilters:18-26; IntegrationsPages.tsx:89-100; SettingsLayout:1-87; SettingsRoutes:1-47; main.tsx:1-44 | 199 | 0 | 0 |
| Suppression/verification repair | SuppressionsPage.tsx:7-134; SuppressionsPage.test.tsx:1-61; verification.Dockerfile:1-11 | 200 | 0 | 0 |
| UI/connection repair | WindowLayoutTests:1-47; MainViewModelTests:286-320; MainViewModel:491-502; CredentialStoreTests:86; AssistantResetTests:85-87; ConnectionsPage.tsx:81-159; ConnectionsPage.test.tsx:57-79 | 200 | 0 | 0 |

| Final web repair | ConnectionsPage.tsx:432-480,564-584; IntegrationsPages.tsx:28-44,68-106; ConnectionsReadiness.test.tsx:1-34 | 160 | 0 | 0 |

Additional findings repaired (runtime results recorded separately):
- P29 low: an observed expired callback could be revived by a clock rewind. Expiry now consumes the attempt; clock-rewind regression.
- P30 medium: token exchange buffered unbounded success/error responses. HttpClient now caps buffering at 65,536 bytes; valid oversized JSON checks the transport-failure disposition.
- P31 medium: runtime switching retained a different provider's assistant session. Reset owns the generation and labels use captured runtime; pending/completed switch regressions.
- P32 medium: cancelled session bootstrap retained established credentials. Cancellation rolls back session and stored refresh credential; real loopback regression.
- P33 medium: initial conversation failure had no retry. Retry preserves selected conversation and unsaved draft; regression covers recovery.
- P33 medium test defect: missing-items fixture also had an invalid UUID, masking required-field regressions. Fixture now removes only items from valid JSON.
- P34 medium test defect: oversized-response test used invalid JSON and generic failure assertion. It now uses otherwise valid JSON and asserts bounded-transport failure rather than parse/status failure.
- P33c medium test defect: detail fixtures omitted required fields, masking individual validation regressions. Tests now establish baseline validity before mutation.
- P24 medium: an earlier connection list response could overwrite a post-mutation refresh. A request generation rejects obsolete successes and errors; deferred-response regression added.
- P25 medium: grant selection lacked the contract's 50-mailbox maximum. The form now validates the shared limit with 50/51 boundary tests.
- P25 medium: instructions advertised unpublished connector installation and confused connection secrets with API-user tokens. Setup is explicitly planned and fixture grants simulated; messaging regression added. This finding incorporates the earlier review evidence after the initial packet missed it.
- P26 medium: URL query navigation did not update the uncontrolled suppression search input. Query-keyed remount plus navigation regression keeps visible state aligned.
