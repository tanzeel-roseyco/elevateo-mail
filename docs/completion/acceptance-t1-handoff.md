# T1 Playwright source handoff

Status: AUTHORED ONLY; runtime, typecheck, lint, unit tests, browser tests and visual QA are **NOT_RUN**. Root owns independent review and Docker execution. This dispatch changed only `tests/acceptance/playwright/**` and this report; no package, lock, shared contract, frontend, backend, topology or credentials were changed. No commits, containers, SSH, subagents or live activation were performed.

## Integration contract

- Add exactly `@playwright/test@1.64.0` and its matching browser installation to root's acceptance package/lock and Docker image. Existing dependencies consumed unchanged: `zod@4.6.5`, TypeScript `5.9.3`, `@types/node@24.19.2`; existing planned Node `24.21.0`. Root must confirm availability and the pinned reporter API during Docker typecheck, not substitute versions silently.
- Include `playwright/**/*.ts` in the acceptance TypeScript compilation. Browser entry is `tests/acceptance/playwright/playwright.config.ts`; unit source is `boundaries.unit.spec.ts`, excluded from browser discovery by the `.e2e.ts` testMatch. Execute compiled unit source with Node's test runner inside Docker; invoke Playwright with this explicit config. No package/script edits were authorized here.
- Supply unchanged shared config/seed/report interfaces, canonical private output directory and its `cases` child. Native output lives under `native-private`; root should provision private permissions/umask and retain it privately. Screenshots use exclusive mode-0600 files and an in-worker byte budget. Root still enforces total run storage/resource limits and reconciles collection/startup failure or killed processes with expected paths.
- Set lane `playwright_real`, profile `internal_http`, origin exactly `http://app.test`. One worker, retries zero, one engine per run; separately validated `ACCEPTANCE_BROWSER` accepts only chromium/firefox/webkit, default chromium. Use a new immutable output/run for each engine. Do not override workers, projects, retries, reporter or trace/video flags from the CLI. No webServer, route fulfillment, cookie/storageState injection or fixture UI exists here.
- Mount the frozen credentials JSON as a regular secret file at the agreed location. Loader uses O_NOFOLLOW, fstat, a bounded 16-KiB read and strict nine-alias schema; all passwords must have 12..256 characters and nonblank content. Errors discard input values and filesystem exception details. Supported Auth admin seeding remains root-owned; browser credentials are entered through the actual sign-in controls.
- Root serves built production FE plus real Auth/Rails/PostgreSQL. Seeded primary thread must be visible on the first mailbox list page and contain `seed.data.marker` in a plaintext message. Primary composer must be able to create drafts; newly created drafts must appear on the first list page. Tests create two independent disposable drafts and intentionally do not delete database state.
- Ensure no external live transport and no verbose browser/proxy authentication diagnostics. The reporter suppresses raw errors; traces/video/automatic screenshots are off. Explicit screenshots contain ready thread content or the generic unavailable state, never sign-in forms. Framework-native output remains private; independently inspect pinned Playwright's failure attachments before exporting any artifact.

## Exact path mapping and limits

Ten runnable sampled cases plus sixteen explicit unavailable paths are authored. These are partitions of matrix paths, **not full scenario or all-216-partition coverage**. No case has passed yet.

| Matrix path | Authored partition / concrete checks |
| --- | --- |
| SCN-AUTH-001-P | Manager password login receives 200 and seeded authorized mailbox renders. Server-internal Auth exchange count is not independently inspected. |
| SCN-AUTH-001-F1 | Wrong password at desktop 1280x800 and narrow 390x800: 401, generic alert, empty password, retained email, aria-invalid, no account control. Expired challenge variant remains untested. |
| SCN-AUTH-007-F1 | Initially no-membership identity receives login 404/no-organization UI and stays denied on protected deep link. Mid-session membership loss is not exercised. |
| SCN-AUTH-003-P | Real logout, protected reload sign-in gate, real session endpoint 401, no stale thread links. |
| SCN-READ-002-P | Seeded plaintext thread, reload, back-to-list. Exact multi-message order, scroll/list position and independent database no-mutation checks remain outside this sampled partition. |
| SCN-READ-002-F1 | Foreign thread ID under authorized mailbox returns 404, generic unavailable heading, no prior plaintext; screenshot after error readiness. Deleted/revoked variants remain untested. |
| SCN-DRAFT-001-P | Composer creates new editable draft, PUT receipt ID/version checked, exact subject/recipient/body survives list/reopen/reload through actual GET. |
| SCN-DRAFT-008-P | Independent new composer draft checks list summary and reopened editable values/version. Consumed-state and pagination partitions remain untested. |
| SCN-GUI-006-P | Reader thread navigation, back/forward/reload at both widths within one record; ready heading focus and two screenshots. |
| SCN-GUI-006-F2 | Production `/dev-fixtures.html` and `/src/dev/fixtureMain.tsx` must return 404/410 without redirect. Callback token inspection is NOT_RUN, not implied by this partition. |

`unavailable.e2e.ts` records **not_run** (then marks framework tests skipped): AUTH-001-F2; AUTH-003-F1/F2; AUTH-006-P; READ-001-P/F1/F2; READ-002-F2; DRAFT-001-F1/F2; DRAFT-003-P/F1/F2; DRAFT-008-F1/F2; GUI-006-F1, all with their `SCN-` prefix. Reasons identify absent seeded partitions or real fault/barrier controls. Invitation/password-setting/acceptance GUI is explicitly NOT_RUN pending a separate one-time invitation seed. No fake fault responses are used. Other matrix paths are outside this dispatch and must be reconciled by root, not inferred as passing or implemented.

## Selectors and gateway assumptions

Read-only source inspected: FE `apps/web/src` in `Elevateo Mail - Fable FE01 R1`, especially SignInPage, Session, Shell, AccountSheet, InboxPage, ThreadPage, DraftsPage, DraftEditorPage and data contracts; BE02 routes/OpenAPI and existing read/draft/auth contracts; shared schemas and scenario matrix.

- Hash routes: `/#/mailboxes/{id}`, `/threads/{id}`, `/drafts`, `/drafts/{id}`. Seed IDs drive exact href selectors; thread links also require `data-thread`.
- Sign-in: heading/button `Sign in`; exact labels `Email address`, `Password`; role alert text `Sign-in was not accepted. Check the email address and password, or recover access.` No password expectation includes its literal value.
- Shell: `Account and sign-out` button; dialog `Account`; exact `Sign out` button; denied heading `No organization is available`.
- Reader: region `Conversations`; article `Conversation`; its level-one heading is focusable; plaintext `pre` contains the seed marker; link `Back to conversations`; heading `This conversation is unavailable`.
- Drafts: `New draft` button/heading, labels `Subject`, `To`, `Message`, `Save draft`, `Back to drafts`, `Saved version 1`; UUID route minted by actual frontend.
- Observe real POST `/v1/auth/login` (200/401/404), POST `/v1/auth/logout` (2xx), GET `/v1/session` after logout (401), GET `/v1/threads/{foreign}` (404), PUT `/v1/drafts/{id}` (200 JSON), subsequent GET same draft (200 JSON). Browser owns cookies/context/CSRF; tests do not copy tokens or authorization headers.
- PUT receipt is strictly parsed as `{draft_id, operation_id, version, state:'editable'}`. IDs and version are asserted in memory. GET content persistence is checked through actual rendered exact field values; response bodies/headers beyond content type are not exported. This is gateway/UI evidence, not an independent SQL oracle.

## Reporting and review boundary

Reporter calls unchanged `recordCase` once per finished test from final Playwright status, including setup/teardown failures. A pass requires completed assertion summaries plus final framework success. Actual framework start time and duration produce matching timestamps. Error objects, credentials, cookies and tokens are never copied into records. Publication failures force framework failure. Collection failures before discovery cannot emit unknown case IDs; root must reconcile expected inventory and framework status before sealing.

Four authored boundary unit tests cover strict synthetic credentials (missing/extra/null/blank/short/oversize), browser enum/default/rejection, and real receipt shape/non-JSON/version/state rejection. Filesystem mount behavior, reporter timeout/teardown publication and screenshot limits still require root's Docker integration validation. Review agents were prohibited for this dispatch; independent review and defect-density accounting remain root-owned, with no claim of review completion or zero defects.

Static self-inspection corrected pre-teardown publication and response-wait rejection handling before handoff. No executable validation was run on the host. Shared or concurrent root changes seen in git status were left untouched.

## Authored source inventory

SHA-256 and physical line counts below describe source only, not runtime evidence. Every module is below 200 lines.

| File | LOC | SHA-256 |
| --- | ---: | --- |
| auth.e2e.ts | 54 | 44d14d32bdd2aab2371be4c2f61b48cf5e39a4c0bd4feff0d8b4320b1eedcc7c |
| boundaries.ts | 43 | 9ed6af050c697b3083c23d4df3239d81bbe6a2c37c3247e6efb34b35f5747766 |
| boundaries.unit.spec.ts | 35 | cf00b1d8f3367c90291c951e60c03dc9e8c98164a69d85b14731ac4b4f72d0bf |
| cases.ts | 23 | e588cec7c78380d039dc94d0d79e41b46e815cf932f6391ebfb4a427faea5298 |
| draft.e2e.ts | 46 | 45f62ba8a546331949cb3edef8e23517ceb5267c45478f335d9e47606daa3d59 |
| playwright.config.ts | 19 | 6ab0276d1566aed629ee53aff4e5cc6572722bdfb397d88ff98448d6877c62fc |
| quiet-reporter.ts | 52 | c89d93bf78170ac286d6d6c83c59ccdc2d47e3f284010e24f4aad596709ef5e3 |
| read.e2e.ts | 51 | 771ed994d91926ed3e64d745cee58a07d99f54b70f9d380e641da3c28d8dff54 |
| support.ts | 54 | 9e12b651e8e0579cb9a75cac99d9b09be3d294f22eb036efc0c5a69e13b1aac0 |
| unavailable.e2e.ts | 22 | 7a9e882e53d03e4c24b951ae615a6809aaab6b0b119670d7de21609ccd7c8852 |
