# Selenium acceptance bounded adversarial review

Status: static review complete; runtime NOT_RUN. One MED defect; 324 unique physical implementation/test LOC; 3.09 defects/KLOC (1 / 324 * 1000). No source edits, tests, Docker, SSH, servers, dependency installs, commits or subagents. Formatting is delegated to linters. This report is the only file modified.

## Identity and authority

Reviewer actual model/effort: gpt-6-astra / low, as attested by the coordinator from the Orca launch receipt and visible TUI; exposed worker system identity is Codex GPT-6. This report attributes runtime identity to that coordinator evidence. Task task_7a8a672f6860, dispatch ctx_17fd81d166fc.

Applied root AGENTS.md, supplied full adversarial rubric and .planning/STANDARDS.md. Context: docs/completion/acceptance-t3-handoff.md and docs/verification/scenario-matrix.md plus machine-readable matrix metadata. Root supplied the strict runtime nine-actor UUID seed, immutable sanitized recordCase contract, private app origin, no mocks/cookie injection, approved four scenario mappings, pinned Grid/browser tuple, sandbox topology and external deadline. These supplied dependencies were not independently inspected. README/state/documentation reads were output-truncated; no whole-document conformance is claimed. The task explicitly limits writes to this report, so aggregate code-reviews.md and project state updates remain coordinator-owned.

## Verified coverage

All six pins matched before source inspection and again after the two passes. Physical counts include blank/comment lines. No off-budget implementation or test files were opened.

| File under tests/acceptance/selenium | Inspected range | LOC | SHA-256 |
| --- | --- | ---: | --- |
| boundaries.ts | 1-34 | 34 | 82fdfbac5a412814b7a7de06de536e21a8fc16130272002d752fbe546dbeb817 |
| boundaries.unit.spec.ts | 1-61 | 61 | 1b9f9255f57ec2abc42085fbf07a26e28784f9ba50f66246dee4aae6ab8b0b64 |
| credentials.ts | 1-36 | 36 | 487aea4f62bb1016e47055b565836276fd0d19025f65126438af28648a5c323c |
| journeys.ts | 1-87 | 87 | 2f7e8402747afa1c4cb9c6d4fd4303f3a216d7112055ce3a67967e840558e0e4 |
| run.ts | 1-65 | 65 | bd4b8119457b13838332eebc9f0d94a2e4a21b586921438e7f3149927e26a342 |
| ui.ts | 1-41 | 41 | 89a384162df0234aed431495e6931127da69c706237fa32e5a42300484cc3ddc |

Pass 1: boundaries, boundary tests, credentials = 131 LOC. Pass 2: journeys, runner, UI = 193 LOC. Total unique = 324; neither pass exceeds 200. Metadata/hash/count rereads do not expand implementation coverage.

## Numbered defects

1. **MED — Password entry does not verify the destination origin after navigation.** `journeys.ts:12-16` navigates to the approved URL, waits for a generic Sign in heading, then fills actor email and password. WebDriver navigation follows redirects, and nothing in this sequence checks the final origin. Thus a redirect to another reachable origin with these labels receives credentials before any draft-route validation; AUTH/READ/logout have no final origin assertion either. Exact Grid allowlisting and browser-version checks protect the control endpoint, not the document receiving sendKeys. This is a missing enforcement of the stated app.test-only boundary, not evidence that a redirect or credential leak occurred. Private egress isolation mitigates exposure but the supplied contract does not establish rejection of all other internal origins. Minimal repair: check the current URL against the exact approved origin immediately before entering credentials, using a fixed sanitized rejection; assert approved origin at journey checkpoints where evidence depends on protected app UI. Add a regression with redirected sign-in DOM proving failure before email/password sendKeys and no secret/URL echo, alongside the approved-origin happy path. Root should retain network isolation because a point-in-time URL check alone cannot constrain subsequent browser navigation.

## Checklist and evidence

- False PASS/outcome honesty: `run.ts:40-42` requires completed journey plus nonempty assertion list. Catch produces failed, quit failure overrides passed and stops later sessions; later entries become not_run. recordCase failure reaches fixed top-level stderr and nonzero exit. Immutable/sanitized sink behavior is a supplied T0 contract, not reverified here.
- Assertion strength: login checks account and seeded mailbox after reload; read checks seeded marker before/after reload and back navigation. Draft verifies UUID route/mailbox, list entry, exact subject/recipient/multiline body, saved version and same ID after full reload. Logout verifies sign-in plus absence of account/thread links after protected navigation/reload. These are sampled GUI assertions only: no independent SQL, Auth exchange count, cookie invalidation, heap, TLS, ordering, latency or full security proof.
- Fresh contexts/state: a new Builder session per journey; no shared driver, cookie injection, API bypass, operation retries or mock code. Browser quit is awaited before recording. Failed session creation stops later sessions because remote creation may have orphaned a session. Root cleanup/deadline remains essential.
- Limits/null/empty: strict Grid config and version bounds; null/missing capabilities fail mismatch; nine-actor credential schema rejects missing/extra/null/blank/short/oversized values; loader uses nonblocking no-follow open, regular-file stat, bounded actual read and finally close. Draft route enforces length, origin, root path, mailbox and UUID, and rejects outer query/userinfo. Public helpers rely on typed/internal call sites; seed validation is supplied by T0.
- Secret handling: credential parse/fs errors are replaced by fixed errors; runner discards raw WebDriver exceptions and capabilities; evidence contains validated version text and fixed descriptions, no raw URLs/passwords/bodies. Grid command logging and native stderr handling are external root obligations. Destination-origin gap is defect 1.
- Tests: the 61-line unit suite covers successful and invalid boundary configurations, capabilities, credential values and draft URLs. No runner lifecycle, UI polling, credential-file I/O or redirected-login regression appears within the assigned suite. Existing tests outside scope are unchecked, so this is a coverage limitation rather than a claim that none exist globally. Requested root Docker boundary passes are reported context, not independently verified here. GUI runtime remains NOT_RUN.
- Design/maintainability: small separated modules, bounded credential loop, sequential sessions, minimal abstractions and explanatory AIDEV notes. No database loops or hot-path query code in scope. Fixed label helpers are used with constant strings. Marker interpolation is safe under the coordinator-confirmed grammar below.
- Documentation: handoff honestly distinguishes UI assertions from independent durable evidence and records external cleanup/deadline requirements. Its authored 322-LOC inventory and old run.ts hash predate root's supplied 324-LOC pin; this is historical handoff metadata, not source drift. Scenario draft-lane membership is root-approved; matrix update/sealing remains coordinator-owned.

## Design limits and unchecked dependencies

Analytical tradeoff only: avoiding action retries prevents duplicate writes; stale read retry limit can produce false failures under prolonged UI churn rather than false success. Fixed diagnostics reduce debug detail to avoid credential-bearing WebDriver messages. Root's external process deadline is needed because transport/build/quit can block beyond DOM timeouts. Fresh sessions isolate browser state, but all journeys share seeded backend data and do not independently prove database isolation or persistence beyond the observed reload.

No Obsidian consultation, runtime simulation or dedicated architecture signoff was performed or claimed in this bounded assignment. Unchecked dependencies: T0 config/schema/report implementation, FE route and label contracts, Rails/Auth/Postgres behavior, dependency versions and WebDriver implementation, Grid image digest and raw binary, sandbox/seccomp identity, network enforcement, log policy, watchdog, orphan cleanup and actual browser rendering. Firefox configuration parsing is tested in source but Firefox runtime compatibility is unproven; the accepted deployment is Chrome.

Coordinator clarification received through the blocking Orca ask: shared/schema.ts constrains marker to /^ACCEPTANCE_[A-Z0-9_]{1,64}(?![\s\S])/, with current value ACCEPTANCE_T0_SYNTHETIC. Nonempty ASCII letters/digits/underscores exclude apostrophes and XPath metacharacters; journeys.ts:34 therefore has no identified XPath injection defect under this contract. This is supplied contract evidence, not an off-budget source read. Coordinator also attested actual gpt-6-astra low identity from the launch receipt and visible TUI.


Coordinator topology confirmation (msg_296757f47dcb): external egress is prevented, but Auth/API/Mailpit and other internal peers remain reachable at alternate origins; there is no browser-only-origin network policy. Coordinator confirmed defect 1 as a valid bounded MED finding.
