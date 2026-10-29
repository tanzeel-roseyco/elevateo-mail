# T2 Puppeteer source handoff

Status: **AUTHORED ONLY / NOT_RUN**. Compiler, lint, pure tests, browser execution and visual QA have not run. This dispatch wrote only `tests/acceptance/puppeteer/**` and this handoff. No installs, application tests, Docker, SSH, commits, subagents, paid services or live sends were performed. Root owns integration, bounded independent review, matrix edits, execution, evidence sealing and cleanup.

## Exact sampled journeys

| Path | Concrete assertion |
| --- | --- |
| SCN-AUTH-001-P | Actual manager GUI password login; account control and exact seeded mailbox thread survive document reload. |
| SCN-READ-002-P | Open exact seeded thread; a child-free plaintext pre contains the marker before/after reload; back link restores the exact list entry. |
| SCN-DRAFT-001-P | Composer creates one draft, saves version 1, reopens its UUID from the list, reloads, checks exact subject/recipient/multiline literal body and same UUID/version. |
| SCN-AUTH-003-P | Actual account-sheet logout; protected mailbox navigation and reload show sign-in and no account/thread controls. |

These four scenarios currently require a root-owned `puppeteer_cdp` matrix lane addition. A coordinator question was sent and followed by escalation `msg_5edd2f60147a`; approval is not claimed by this handoff. Do not relabel these checks as unrelated performance or callback paths. The runner records these exact IDs as sampled partitions, not complete scenario coverage.

Each journey launches a fresh browser with one explicit isolated context, sequentially. GUI login is part of every journey. No automatic action retry, interception, request stubbing, cookie manipulation, storage injection or direct API shortcut is used. The draft is intentionally retained in disposable seeded database state; it is not sent. Browser/context cleanup runs before recording the outcome. A setup failure produces `not_run`; an entered GUI failure produces `failed`; either stops later journeys, which are recorded `not_run`. Cleanup failure is a failure. All four cases use unchanged shared `recordCase`, attempt zero, lane `puppeteer_cdp`, profile `internal_http`, implementation `real`.

## Root integration and external commands

- Pin exactly `puppeteer-core@25.13.0`: independent CDP browser automation with caller-owned Chromium, no browser downloader. Root owns package/lock changes and availability/API compatibility verification. Reuse shared zod, TypeScript and Node dependencies.
- Extend acceptance TypeScript include with `puppeteer/**/*.ts`; retain DOM compiler libraries because page-evaluated functions reference DOM types. All six modules are under 200 physical lines; total 314 LOC.
- After compilation inside Docker, from `tests/acceptance`, run `node --test dist/puppeteer/boundaries.unit.spec.js`, then independently `node dist/puppeteer/run.js`. Root chooses the enclosing Docker runner; no host execution is authorized here.
- Shared environment: `ACCEPTANCE_BASE_URL=http://app.test`, `ACCEPTANCE_LANE=puppeteer_cdp`, `ACCEPTANCE_PROFILE=internal_http`, valid run/dispatch IDs, runtime seed path and canonical private output directory with precreated `cases` child. Shared caps remain enforced.
- Require `PUPPETEER_EXECUTABLE_PATH` to name an absolute, canonical, nonsymlink regular executable file; symlink ancestors are rejected. Require `PUPPETEER_EXPECTED_BROWSER_VERSION` to contain the exact four-part version selected by root. No default version or executable is provided. The synthetic version in unit tests is not the runtime pin.
- Run as nonroot Linux UID. Launch uses no added Chromium arguments, default sandbox behavior, `dumpio:false`, headless mode and bounded launch/CDP/navigation/readiness timeouts (maximum 30 seconds each). No `--no-sandbox`, certificate bypass, broad capability or alternate binary fallback exists. Root must freeze executable/image hash, verify sandbox functionality and confirm actual tuple; executable path/version alone do not authenticate binary provenance.
- Root external watchdog enforces total deadlines, process-group/orphan cleanup and resource/storage caps, including hung close or launch rejection before a browser handle exists. Shared config/report failure before records can be written must be reconciled by root against the four expected IDs; no fabricated records are emitted during authoring.
- Mount supported Auth-admin-generated credentials at `/run/secrets/acceptance-credentials.json`. Reader validates canonical path, opens O_NOFOLLOW/O_NONBLOCK, fstats a regular file, bounds stat and actual read to 16 KiB and validates strict schema version 1 with exactly nine aliases and nonblank 12..256-character passwords. Runtime secrets, file paths and parse errors never enter records.
- Root must mount credentials and executable immutable/read-only; canonical checks are not a defense against a privileged concurrent mount replacement. Filesystem mount/symlink behavior still needs Docker integration validation.
- Supply production FE and real Rails/Auth/Postgres through internal Docker DNS `http://app.test`; no published ports, live transport or external egress. Supported admin seed owns account creation, never this browser source. Shared seed validation must first incorporate actual BE02 opaque authorization-version and null generation semantics; this lane itself uses only actor email, mailbox UUID, primary thread UUID and marker.

## Source-derived selectors and assumptions

Inspected T1/T3 handoffs and sources, shared config/schema/report, scenario matrix, and first-party FE `SignInPage.tsx`, `ThreadPage.tsx`, `DraftEditorPage.tsx`, `AccountSheet.tsx` in the Fable FE01 R1 checkout. No application files changed.

- Actual sign-in heading ID `sign-in-heading`; accessible input names `Email address`, `Password`; button name `Sign in`.
- Account button `button[aria-label="Account and sign-out"]`; exact accessible button name `Sign out` distinguishes global logout.
- Hash route `/#/mailboxes/{uuid}`; seeded link matches `a[data-thread]` and exact `/threads/{uuid}` hash href. Thread plaintext is under `article[aria-label="Conversation"] pre`; back link has exact mailbox hash href.
- Draft route `/drafts/{uuid}`, button `New draft`, article label `Draft`, field names `Subject`, `To`, `Message`, button `Save draft`, exact span text `Saved version 1`, list/back links with exact hash href. Keyboard edits use Control+A/Backspace and one typing operation, suited to the required Linux Chromium runner.
- Seed thread and newly saved draft must appear on the first list page. Composer must have real BE02 read plus compose permissions. Subject/body marker is synthetic; no capability/version/generation assumptions are taken from provisional numeric seed metadata.
- Puppeteer extended `::-p-aria` and `::-p-xpath` selectors resolve actual accessible controls and exact saved text. Pinned API/type compatibility and actual selectors await Docker validation.

## Evidence and limitations

Only version text and fixed assertion summaries are reported; raw framework errors, console output, network payloads, credentials, cookies and tokens are not exported. No traces, videos, screenshots, heap snapshots or protocol dumps are collected. Keep browser/runtime debug logging disabled and native stderr private. Binary artifact consumption is zero; root still owns total record/output limits and secret scanning.

Four pure regression tests cover private origin, absolute executable syntax, nonroot identity, exact version rejection, strict credentials, and draft URL origin/scope/UUID/query boundaries. They are authored, **NOT_RUN**. Real filesystem bounds/symlink mounts, sandbox execution, teardown failures and report publication require root's Docker validation. No independent review or zero-defect claim is made; review coverage and defect density remain root-owned.

This slice does not prove Auth exchange count, SQL durable state independently, full thread ordering, read mutation absence, logout races, rejected API requests, malicious message network isolation, callback cleanup, attachment security, performance, heap retention, TLS/Secure cookies or manual visual quality. GUI persistence is the only persistence assertion. Broader T2 diagnostics in the expansion plan remain outside this dispatched source slice and NOT_RUN.

## Source inventory

SHA-256 covers literal source bytes; physical LOC includes blanks/comments. Report hash is supplied separately to avoid self-reference.

| File in tests/acceptance/puppeteer | LOC | SHA-256 |
| --- | ---: | --- |
| boundaries.ts | 36 | 93B110863540E245333489964938F7E5B68380FE0B2FA497EBAE72E372D829C9 |
| boundaries.unit.spec.ts | 41 | C314F53DB4F34E565293D1251D31472BB029550FB7357D9DC2A17C2F8C5604A4 |
| files.ts | 36 | 9E16EE10F3121A1952AD3E24DC52E12CD1FF73395807A522856F40C996B159F8 |
| journeys.ts | 80 | 3386F61113006BF6B0126164CB8176B0EC8A627FDEBF8E1FC4E4E7E39C192CA2 |
| run.ts | 68 | CEF56562B0F1699197C33024D9913E2FA19F8A61F31E0F5BD85984A1F6AAE5A7 |
| ui.ts | 53 | 9AE049032B7FC829E80FF485993793BA8433E7ABDAC366E07BF8DA6FC05330D7 |
