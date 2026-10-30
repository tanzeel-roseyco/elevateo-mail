# T3 Selenium source handoff

Status: AUTHORED ONLY; compilation, unit tests, browser execution and visual validation **NOT_RUN**. No host tests, builds, installs, Docker, SSH, commits or review agents were run. Root owns independent review, dependency/compiler integration, real topology, execution and sealing. All writes are confined to this report and `tests/acceptance/selenium/**`; T0 and Playwright are unchanged.

## Four independent W3C journeys

| T0 path | Partition and concrete assertion |
| --- | --- |
| SCN-AUTH-001-P | Manager enters credentials through actual sign-in; seeded mailbox thread and account control survive full reload. No independent count of Auth exchanges. |
| SCN-READ-002-P | Open seeded thread from mailbox; matching plaintext survives full reload; Back to conversations restores seeded list entry. No full ordering/scroll/read-state SQL claim. |
| SCN-DRAFT-001-P | Composer creates UUID draft, saves version 1, returns to list, reopens same ID, reloads and checks exact subject, recipient and multiline literal body plus saved version. No wire-receipt/SQL inspection. |
| SCN-AUTH-003-P | Manager signs out through account sheet, navigates to protected mailbox and reloads; sign-in heading appears and account/thread controls are absent. No logout race or revocation claim. |

Each path emits exactly one shared `recordCase` attempt 0 in lane `selenium`, profile `internal_http`, implementation `real`; timing includes setup and cleanup. Four fresh browser sessions are sequential, never concurrent; no scenario retries. Failed session cleanup or rejected setup stops creation of later sessions and emits remaining paths as `not_run`. Root explicitly accepted **SCN-DRAFT-001-P Selenium lane membership** in message `msg_f091eed56740` and owns adding it to the matrix before sealing evidence. This is sampled coverage, not all matrix partitions or 216 paths. Invitation acceptance, failure injection and manual visual QA remain NOT_RUN.

## Root integration

- Add exact `selenium-webdriver@4.49.0` (independent W3C automation) and `@types/selenium-webdriver@4.35.7` (strict compiler bindings); reuse existing zod/Node/TypeScript. No other dependencies requested.
- Extend acceptance compiler include with `selenium/**/*.ts`. Proposed Docker-only scripts after existing compilation: `node --test dist/selenium/boundaries.unit.spec.js` and `node dist/selenium/run.js`, working directory `tests/acceptance`. No host execution is authorized by this handoff.
- Preserve all existing T0 env. Require `ACCEPTANCE_BASE_URL=http://app.test`, `ACCEPTANCE_LANE=selenium`, `ACCEPTANCE_PROFILE=internal_http`, and a validated seed with `kind=runtime`. Root provisions canonical private output and `cases` directories, unique immutable run/dispatch identifiers and existing record caps.
- Require `SELENIUM_GRID_URL=http://selenium:4444` exactly (no slash, userinfo, path or query), `SELENIUM_EXPECTED_BROWSER=chrome`, `SELENIUM_EXPECTED_BROWSER_VERSION=153.0.8010.47`, `SELENIUM_EXPECTED_DRIVER_VERSION=153.0.8010.47` for the plan's selected Chrome tuple. Root must verify image digest/architecture and supply the actual selected tuple; code also supports explicitly configured Firefox/geckodriver. It does not treat Chromium as Chrome or support Safari/WebKit/Edge.
- Root freezes binding/Grid image tuple; driver verifies negotiated `browserName`, `browserVersion`, Chrome `chrome.chromedriverVersion` or Firefox `moz:geckodriverVersion` before entering passwords. Only validated version text enters evidence; raw capabilities are never exported. Chrome's parenthesized build metadata is parsed but not retained.
- Mount generated credentials at the frozen secrets interface. Loader accepts only a non-symlink regular file, bounds stat and actual read to 16 KiB, checks schema version 1, exactly nine actor aliases and nonblank 12..256-character passwords. Rejected values, contents and secret paths never enter diagnostics. This module independently consumes the frozen contract without importing Playwright internals.
- Supply production FE and actual Rails/Auth/Postgres same-origin routing and generated real Auth identities. Root must verify production fixture-route absence before runtime. Seed primary thread must be on the initial mailbox page and have plaintext containing `seed.data.marker`; manager and composer scope must match T0.
- Root applies an external process deadline from `ACCEPTANCE_TIMEOUT_MS`, resource limits and isolated Grid cleanup even on timeout/crash. Explicit DOM/page-load/script waits cap at min(config timeout, 30 seconds), but a stalled Grid transport or `quit` requires the external watchdog. No Promise race is claimed to cancel an in-flight WebDriver command.
- Keep Grid HTTP command/debug logs disabled: sendKeys necessarily transports credentials to the private Grid. Do not enable Selenium DEBUG/native command logs, session recording, traces, video, request/body capture or cookie dumps. Keep fixed native stderr private. This lane creates no binary artifacts, so artifact-byte consumption is zero; T0 record caps remain enforced by `recordCase`.

## UI and backend assumptions read from source

Source roots: Fable FE01 R1 `apps/web/src` and BE02 Codex `apps/server`; neither modified. HashRouter URLs use `/#/mailboxes/{id}`, `/threads/{id}` and `/drafts/{id}`. Sign-in inputs are resolved by exact associated labels `Email address` and `Password`; buttons use exact normalized text `Sign in`, `New draft`, `Save draft`, `Sign out`. Account button uses `aria-label="Account and sign-out"`. Thread anchors use `data-thread` and exact hash href; plaintext is a `pre` inside `article[aria-label="Conversation"]`. Draft fields use associated labels `Subject`, `To`, `Message`; version uses exact `Saved version 1` span and saved list href. Back links use partial link text `Back to conversations` / `Back to drafts` because icon children contribute presentation.

`SignInPage.tsx`, `AccountSheet.tsx`, `ThreadPage.tsx`, `DraftEditorPage.tsx` and T1's source were read. `app/draftIntent.tsx` explicitly retains unsaved intent in memory only, supporting full reload as the persistence boundary. BE routes/controller expose challenge/login, session, logout, authorized mailbox/thread reads, draft list/detail and guarded draft PUT; the UI supplies all auth/context/CSRF material. The lane never reads or injects cookies and never calls those APIs directly. Root still owns independent durable SQL and response-receipt evidence.

`ui.ts` uses explicit polling and implicit timeout zero; stale reads are retried at most twice per readiness call. Click/clear/sendKeys/save operations are not retried because their side effects may already have occurred. Selenium Builder environment overrides are disabled to prevent `SELENIUM_REMOTE_URL` or `SELENIUM_BROWSER` bypassing our settings. See [official Builder API](https://www.selenium.dev/selenium/docs/api/javascript/Builder.html) and [WebDriver API](https://www.selenium.dev/selenium/docs/api/javascript/WebDriver.html).

Pure boundary regressions cover private Grid allowlisting, missing/invalid versions, browser/driver mismatch, both capability shapes, safe diagnostics, strict credential shape/length and draft origin/mailbox/UUID/query rejection. They use synthetic values and do not read runtime secrets. Runtime and compiler results are still NOT_RUN, including these unit tests.

## Authored source inventory

Hashes below cover literal source bytes (SHA-256); LOC includes comments and blank lines. Report hash is supplied separately in the worker completion to avoid self-reference. No module exceeds 200 lines.

| File under tests/acceptance/selenium | LOC | SHA-256 |
| --- | ---: | --- |
| boundaries.ts | 34 | 82FDFBAC5A412814B7A7DE06DE536E21A8FC16130272002D752FBE546DBEB817 |
| boundaries.unit.spec.ts | 61 | 1B9F9255F57EC2ABC42085FBF07A26E28784F9BA50F66246DEE4AAE6AB8B0B64 |
| credentials.ts | 36 | 487AEA4F62BB1016E47055B565836276FD0D19025F65126438AF28648A5C323C |
| journeys.ts | 87 | 2F7E8402747AFA1C4CB9C6D4FD4303F3A216D7112055CE3A67967E840558E0E4 |
| run.ts | 63 | FB13FDF0D4B914F869E755A05F79D13AD319FF7CCBC83E1F5A3D5AE4AB3D1F26 |
| ui.ts | 41 | 89A384162DF0234AED431495E6931127DA69C706237FA32E5A42300484CC3DDC |

Total authored TypeScript: 322 lines. No runtime report records were fabricated during authoring.
