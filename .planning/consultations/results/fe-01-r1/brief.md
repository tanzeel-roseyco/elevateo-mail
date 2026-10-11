# FE-01-R1: repair the first frontend read checkpoint

Status: **frozen design brief for independent opinions; no repair implementation dispatched**.

<!-- AIDEV-NOTE: This repair stays within the accepted read checkpoint; source and runtime evidence must freeze together. -->

## 1. Purpose and authority

Repair the authored FE-01 shell, mailbox list, inbox and plaintext reader under [repair issue #8](https://github.com/tanzeel-roseyco/elevateo-mail/issues/8) until the existing bounded read checkpoint can meet its accepted verification gates. Preserve the approved architecture and current API. Full [FE-01 issue #4](https://github.com/tanzeel-roseyco/elevateo-mail/issues/4) remains open for later behavior and real backend integration. The unaccepted checkpoint is [draft PR #7](https://github.com/tanzeel-roseyco/elevateo-mail/pull/7).

The user's autonomous local-completion authorization permits preparation and the existing review workflow. It does not remove the mandatory fresh, independent exact `claude-fable-5`, `claude-opus-5-5` and `claude-fable-5-1` opinions, followed by an actual `gpt-6-astra` MAX synthesis before this repair batch is dispatched. This brief is a proposal for those opinions, not their outcome. The coordinator owns the final input packet, model/session evidence, dispatch and acceptance records.

Read the project AGENTS.md, README, state, documentation, `.planning/STANDARDS.md`, `.planning/AGENT_ORCHESTRATION.md`, the consultation procedure, and accepted FE-01 decisions/synthesis/dispatch. The immutable common packet must contain the actual governing and affected-source bodies required by that procedure, not merely these path references. No opinion may see another opinion before its own response is complete.

## 2. Exact checkpoint and current evidence

The authored source is in `C:/Users/Tanzeel/Code and projects/Elevateo Mail - Fable FE01/apps/web`, branch `frontend/fable/fe-01`, authored by exact `claude-fable-5` from base `ce95e89f505ff7354f558a1c932faec54f5ac377`. Its immutable **unaccepted** repair base is `d7eac0791fd6483e47677fe8faa26c70a6522485`; the worktree was clean when captured.

The first source manifest predates coordinator CRLF-to-LF normalization of eight staged text files overall. Its original diagnostic-source entries are preserved. The new `checkpoint-manifest.json` records final committed bytes and all 38 listed files match. Comparing authored source entries identifies only `apps/web/package.json` and `apps/web/package-lock.json` as changed bytes; restoring CRLF exactly reproduces their initial hashes. Other normalization affects evidence/documentation: the compiler log was converted from UTF-16 to UTF-8, and the unit/bundle extract has ANSI and trailing whitespace removed. Raw evidence remains outside Git. These are explicitly distinct evidence snapshots, not claims that byte hashes stayed unchanged.

| Evidence | SHA-256 or result |
|---|---|
| `docs/evidence/fe01-initial-review/source-manifest.json` | `141a3e23d1d19a091b279ed2df7b9a44a60b482c012829593ddce59c4ceaad7f` |
| `docs/evidence/fe01-initial-review/checkpoint-manifest.json` | `18b6a9daab7c3b370603bd9d93f16b19cad1d12ef759b99580d64703891244d9` |
| `docs/evidence/fe01-initial-review/review.md` | `47e59df52ed8e4945b9f49a2027a76260c2dbb8fb81a2057708f31b3e22c9639` |
| `docs/evidence/fe01-initial-review/compiler.log` (sanitized UTF-8) | `d31e2a5a261b1926b375c262b3f2d7d9cf7326a476322a7aa77923e2fbfca6ad` |
| `docs/evidence/fe01-initial-review/unit-bundle.txt` (sanitized) | `1b541fe25e540ef4956efa17e5b041beff9f1eac0af40abaa424ffe0e182c28c` |
| Committed `code-reviews.md` follow-up ledger | `7b7ee6be8fa9e50c2e7bad49193fec22cd00a0f4bed90a4e960f19ea24bb1d7a` |
| Coordinator runtime log, `C:/Users/Tanzeel/AppData/Local/ElevateoCoordinator/fe01-initial-unit.log` | `b2bd43c5f52cd37b592803b2aff9114da4465e26eb10597726b434fbc509f384` |
| Canonical `contracts/v1/openapi.json` | `94c5f31bc5d514fed420dcbcee2f6ce49bf4254e325000ea0794fe6a1140e8ca` |
| Docker API regeneration check | Passed with openapi-typescript 7.13.0. |
| Docker strict TypeScript check | Failed: four fixture operation-return TS2322 diagnostics and missing `node:url` declarations, TS2307. |
| Docker unit tests | 66 tests: 63 passed, 3 failed in `src/app/session.test.tsx`; retained rendered roots produce multiple `status:ready` elements. |
| Diagnostic Docker `vite build` | Passed, 148 modules; JS 373.92 kB / gzip 115.76 kB, CSS 18.99 kB / gzip 4.71 kB. This does not satisfy the failed typecheck/build gate. |

The frozen initial review and subsequent compiler, runtime and design follow-ups together identify **17 code/test defects, 2 documentation defects and 1 missing lint gate: 20 findings over 2,133 unique non-generated authored lines**. Code/test defect density is **7.97 per 1,000 lines**; all-finding density is **9.38 per 1,000 lines**. Do not count each of the three failing tests as a separate cleanup defect or re-count overlapping review slices.

The committed `code-reviews.md` follow-up is authoritative for added findings after the frozen initial report. Its exact snapshot/hash belongs in the common packet. This preparation re-read session/scope/gateway in a bounded 181-line design slice and Vite/session-test/reader-test setup in a separate bounded 183-line diagnostic slice; it is not a new whole-application review. Consultation source excerpts are design context, not additional adversarial code-review coverage.

## 3. Findings to close

Paths below are relative to `apps/web`. Line references identify the original authored checkpoint; the final manifest must map them to the committed repair base.

| ID | Priority | Required correction and reproduction |
|---|---|---|
| FE-R01 | P2 | `src/data/http/transport.ts`: an already-aborted signal must prevent dispatch; assert fetch is never called. |
| FE-R02 | P2 | Transport body-read rejection, body-read abort and deadline expiry must use deliberate gateway errors, with reader/timer/listener cleanup. Cover the complete response lifecycle. |
| FE-R03 | P3 | Accept the canonical JSON media type with legitimate parameters; reject deceptive matches such as `application/jsonp`. |
| FE-R04 | P2 | `src/app/session.tsx`: refresh while active at least every 30 seconds, as well as focus/visibility, without concurrent refresh or hidden-tab polling loops. |
| FE-R05 | P1 | `src/app/Shell.tsx`: old-identity mailbox content must never render during identity loss/replacement, including the first render before effects run. |
| FE-R06 | P2 | Shell/Sidebar mobile modal: meaningful initial focus, contained Tab/Shift+Tab, inaccessible background, Escape dismissal and focus restoration. |
| FE-R07 | P2 | Shell mailbox continuation must recover from `cursor_invalid` once, then require explicit retry on another failure. |
| FE-R08 | P2 | `src/features/inbox/InboxPage.tsx`: an invalid continuation cursor resets to a replacement first page; stale accumulated rows must not survive the reset. |
| FE-R09 | P2 | Inbox continuation remains reachable for a valid empty page with a non-null cursor. Empty results and end-of-pagination are distinct. |
| FE-R10 | P2 | `src/features/thread/ThreadPage.tsx`: invalid message cursor recovery replaces accumulated messages, rather than appending a restarted first page. |
| FE-R11 | P3 | Opening a conversation and returning to the inbox preserve the selected all/unread URL filter. |
| FE-R12 | P1 | `src/data/fixtures/fixtureGateway.ts`: preserve operation-specific validated return types without unsafe assertions or parallel DTOs; the four compiler errors must disappear. |
| FE-R13 | P2 | `src/app/session.test.tsx`: `context_changed` fixtures use canonical HTTP 409; unauthenticated remains 401. Test the real status/code boundary. |
| FE-R14 | P2 | `src/styles/index.css`: repair dark-theme accent contrast; existing text pair calculates to 2.58:1. Measure the actual rendered states in the browser. |
| FE-R15 | P1 | Node declarations required by Vite configuration must be deliberately installed/configured; resolve TS2307 without relaxing strictness. |
| FE-R16 | P2 | Session automatic refresh must not bypass exhausted context recovery. After the second current `context_changed`, focus, visibility and the new timer cannot clear the explicit-retry requirement. |
| FE-R17 | P2 | Shared DOM test lifecycle must unmount and clean rendered roots between tests. Re-run the failing session tests and the full suite with isolation demonstrated. |
| FE-D01 | P3 | Dockerfile/README must stop claiming that a runtime production-fixture-isolation test already exists; replace the claim with actual evidence after implementing it. |
| FE-D02 | P3 | README dependency guidance must match the exact pinned manifest and lock. |
| FE-G01 | P2 gate | Add a small appropriate lint configuration and command; execute it in Docker. Formatting/style checks belong to the linter, not review agents. |

FE-R17 is corroborated by empty `setupFiles`, omitted Vitest globals, no cleanup hook in the session suite and a reader hook that restores mocks only. Vitest defaults globals to false, which prevents libraries relying on global hooks from automatically cleaning up. Prefer an explicit shared `afterEach(cleanup)` setup while preserving explicit Vitest imports; final selection belongs to synthesis. [Vitest globals](https://vitest.dev/config/globals), [React Testing Library cleanup](https://testing-library.com/docs/react-testing-library/api/#cleanup).

Coverage gaps below are acceptance work, not additional unconfirmed defects. The suspected navigation-generation defect was retracted; the compiler did not report a Vite `test` property error. Do not resurrect either without new evidence.

## 4. Unchanged scope and contract limits

Only these canonical GET operations are in scope: `/v1/session`, `/v1/mailboxes`, `/v1/mailboxes/{mailbox_id}/threads` and `/v1/threads/{thread_id}`. Their schema, authorization meaning, generated API types and examples remain coordinator-owned and read-only during repairs. No backend, shared Compose, provider, desktop/native, sending, drafts, collaboration, attachments, login/logout, global store or new API implementation belongs in this batch.

| Boundary | Required existing limit or behavior |
|---|---|
| Page caps | 50 mailboxes, 50 thread summaries, 20 messages; defaults, query encoding and validation follow the schema. |
| Response byte caps | Session 16 KiB; mailboxes 128 KiB; summaries 256 KiB; thread detail 2 MiB; errors 4 KiB. Count serialized UTF-8 bytes before JSON parsing; do not trust Content-Length. |
| Request lifecycle | Same-origin relative `/v1` destination, same-origin credentials, no-store caching, rejected redirects, AbortSignal propagation, 10-second deadline through body consumption. |
| Session | Server-held session cookie; current context/version headers on other GETs; no browser-stored tokens, content or caller-selected authority. Session GET does not authenticate or refresh login. |
| Status semantics | Current 401 clears session first; current 409 permits one recovery; absent and inaccessible 404 render the same generic unavailable state. Stale success and stale errors are ignored. |
| Cursors | Opaque, scoped, expiring; `cursor_invalid` resets once; no invented offsets. Empty pages may contain continuation cursors. |
| Rate limiting | Canonical `rate_limited`, bounded Retry-After delta seconds 1 through 300; no automatic busy retry loop. |
| Message rendering | Plain text only, no HTML/Markdown/autolinks or remote loads; null placeholders, zero messages and truncation flags remain visible and accessible. GET does not mark read. |
| Fixture isolation | Separate visibly labelled dev/test entry only; no production fixture import, route or API-failure fallback. |

Reuse existing accepted components and dependency versions. Preserve exact core pins: Node 24.21.0/npm 11.19.0, React/DOM 19.3.0, react-router 7.18.4, Vite 7.3.6, TypeScript 5.9.3, Zod 4.6.5, Vitest/coverage-v8 4.1.11, openapi-typescript 7.13.0, Playwright 1.64.0. Radix dialog/alert-dialog 1.1.23 is already approved if used; do not add a different modal framework.

The coordinator selects and verifies exact supporting Node-type/lint dependency pins, licenses, compatibility and lockfile changes, with a one-line reason per dependency. Do not silently change core pins or install an entire historical dependency set. The repair should not require a production dependency beyond an actually used approved dialog primitive.

## 5. Design invariants for the consultation

### 5.1 Session and request ownership

Define explicit eligibility for automatic refresh. It is allowed only in the appropriate active ready state; it cannot re-enter authentication, recovery-exhausted or unavailable/error states automatically. Explicit retry begins a new bounded recovery attempt. Repeated focus/visibility/timer events share one schedule and cannot multiply concurrent session requests.

A current first `context_changed` clears protected content and reboots session once. A second current context error preserves an explicit-retry state despite successful elapsed time, focus or visibility events. User retry is distinguishable from ordinary freshness polling. Do not reset the recovery allowance as an accidental side effect of routine session success.

Actor, organization, context, authorization version, selected mailbox and filter determine whether a result is still usable. Monotonic generation checks apply to success and failure. Abort old work to release resources, but do not treat cancellation as the freshness proof. Current 401 clears protected state and cancels relevant pending work; an old 401 must not clear a replacement actor.

Identity loss or required rebootstrap must hide protected content at render time, not only clear it later in an effect. A small keyed session subtree or explicit ownership check is preferable to duplicating permission logic throughout pages; weigh the options in the opinion. Neither client capabilities nor generation checks substitute for backend authorization.

An unchanged-context freshness response must not strand active loaders. Either preserve their still-valid request ownership or deliberately restart them when ownership advances. Demonstrate completion under overlapping refresh/read requests. A changed-context response invalidates old data immediately and starts the appropriate new load. Timers, listeners and controllers must be cleaned on unmount and replacement.

### 5.2 Pagination and transport

Treat reset and append as explicit outcomes of the current load. One invalid cursor permits a single fresh first-page request whose results replace accumulated content; another invalid cursor is surfaced for manual retry. Keep the selected URL filter. Mailbox, summary and message cursors stay independent and scoped to their current context. Preserve accepted summary deduplication by ID and do not invent snapshot guarantees.

All transport failure phases must settle through the existing typed error boundary. Preserve already-classified errors; distinguish caller cancellation, deadline expiry, network/body failure, invalid media type, oversize and invalid schema according to the existing error model. Enforce incremental byte limits even with missing or dishonest length headers. Cancellation and reader/timer/listener cleanup must occur on every termination path.

Extract shared logic only where it removes actual duplication in the three existing pagers or error lifecycle without hiding resource-specific behavior. A general cache, query framework or pagination engine is outside the repair's need.

### 5.3 Accessibility and evidence

Use the existing dialog primitive or a deliberately tested native equivalent rather than partial modal semantics. The narrow layout must support real keyboard traversal with no background interaction and predictable restoration. Preserve Ledger styling while correcting measured light/dark text and focus contrast. Disclose empty/loading/error/retry states in the actual UI.

Tests must observe behavior through request resolution and rendered UI. A manually invoked session handler or programmatic focus assertion alone does not prove cancellation, first-paint privacy, cursor reset or keyboard navigation. Keep production and fixture evidence separate and accurately named.

## 6. Proposed repair ownership and sequence

This section explicitly reconciles Fable frontend ownership with the existing Astra LOW reproduce-first repair workflow. Opinions may refine the boundaries; neither role is silently removed. No writer starts until MAX synthesis accepts a concrete dispatch.

| Stage | Proposed owner and bounded responsibility | Write boundary and handoff |
|---|---|---|
| A: freeze and verification foundation | Coordinator owns exact input/issue/base, supporting dependency resolution, generated checks and lock. Actual Astra LOW reproduces and fixes narrow transport and operation-return defects plus their tests, and shared test isolation if accepted. | LOW: existing `src/data/http/transport.ts`, `src/data/fixtures/fixtureGateway.ts`, directly related data tests, and a named small test setup file. The coordinator integrates the setup reference into Vite config. No concurrent writer. |
| B: frontend lifecycle and interaction | Exact Fable 5 retains frontend authorship: accepted session design, Shell/Sidebar rendering, three pagers, URL filter, contrast, user-facing states and meaningful component/browser regression tests. | Fable: `src/app/**`, `src/features/**`, `src/styles/index.css`, narrowly needed UI primitives, `e2e/**`. Data files are read-only unless the coordinator explicitly transfers an affected file after stage A. |
| C: acceptance harness and documentation | Coordinator integrates the minimal lint/Node types, Docker/browser commands and production-fixture proof; Fable can author explicitly assigned harness files. Coordinator owns all process execution, dependency lock, Git and shared state/docs. | One named writer per config/test file. Low-level fixes are delivered with reproduction evidence and Fable reviews their frontend integration. Shared docs stay coordinator-only. |
| D: independent review and fix loop | Fresh adversarial code reviewers and a dedicated design reviewer; narrow reproduced follow-up repairs use actual Astra LOW. Any new architectural assumption returns to MAX plus fresh required opinions. | Every assignment names at most 200 changed/context lines; complete changed-source coverage is recorded. No author's self-review substitutes for independent acceptance. |

Session and Shell changes are intentionally kept with one frontend writer because their render-time privacy and request lifetime are coupled. All stage assignments are within one bounded repair checkpoint and share the accepted contract. Use dedicated clean checkouts per implementation writer, record exact parent commits and serialize integration; do not let agents edit the same working tree or file concurrently.

Each dispatch is issue-backed, gives exact writable paths and a 30-minute first checkpoint, and records the actual requested and runtime model/session. Consultations use the three required independent processes. Implementation uses file read/edit only where required by the original frontend dispatch; the coordinator owns subprocesses, Docker, package installation, Git, network and browser execution. Never authorize live mail or provider credentials. No Devin work or new spend is required by FE-01-R1; preserve its existing separate $10-only authorization.

## 7. Required verification matrix

Execute application checks inside Docker only. No host application tests, builds or localhost fallback are authorized by this brief. Browser and server can communicate over a task-owned Docker network; the canonical isolated HTTP-cookie exception must remain explicit. Use the accepted pinned build and browser image digests from the original FE-01 dispatch. Record actual tool versions, commands, exits and source hash for each run.

| Gate | Required evidence before accepting this repair |
|---|---|
| V1: build and static checks | API regeneration unchanged; strict typecheck, appropriate lint, unit suite and production build all pass from the committed repair source in the pinned Docker environment. The diagnostic bundle is not a substitute. Exact resolved dependency/lock and vulnerability audit results are retained. |
| V2: transport boundaries | Pre-abort prevents dispatch; post-header abort, body rejection and full-lifecycle timeout are classified; exact/over-limit incremental UTF-8 bodies, absent/lying Content-Length and 4 KiB error limits; valid JSON parameters/deceptive MIME; redirects; malformed JSON/schema; canonical error codes including `request_invalid`; bounded Retry-After; paths/query encoding, headers, credentials/cache and signals for all four operations. |
| V3: session transitions | Deferred actual requests across actor/context/mailbox/filter changes; no old DOM on identity change; current 401 clears and aborts while stale 401 is ignored; first 409 reboots once, second waits for explicit retry; timer/focus/visibility cannot bypass that wait; no timer concurrency/unmount leak; unchanged-context overlap completes and changed-context overlap rejects stale results. |
| V4: pagination | All three pagers reset only once; reset replaces existing rows/messages, preserves filter and ignores late old pages; second invalid cursor exposes retry. Empty-with-cursor continues; true terminal empty state is distinct; zero-message detail works; summary duplicates do not duplicate rows; mailbox/summary/message cursors cannot cross contexts. |
| V5: contract/schema cases | Canonical valid/null/empty examples plus exact-limit/limit-plus-one Unicode, required/unknown fields, malformed identifiers/timestamps and nested nulls; operation-specific fixture types. Fixture and controlled HTTP adapters run the shared applicable conformance table. Clearly separate fixture limitations from real API proof. |
| V6: test isolation | Explicit DOM cleanup and timer/mock restoration where needed; the previously failing session cases pass individually and in the full suite, with no retained roots/listeners. New session timer tests leave no active timers. Do not replace singular queries with plural queries to conceal contamination. |
| V7: production isolation and hostile content | Actual production import/output evidence excludes fixture modules/data/entry. Serve the production artifact in Docker and force API failure: no fixture fallback appears. Browser-level hostile plaintext checks show inert text and no unexpected remote subresource/network requests. |
| V8: actual visual/accessibility QA | Inspect the running application at desktop and 390 px with populated mailbox/inbox/reader, light/dark, loading/empty/error/unavailable/retry, and long/null/truncated text. Retain screenshots and trace/assertions for overflow, actual Tab/Shift+Tab/Enter/Escape, skip link, modal initial/contained/restored focus and background exclusion, readable contrast and reduced-motion behavior. Capture the accepted 50-row interaction measurement with method/environment. |
| V9: independent review | Adversarial <=200-line assignments cover every changed non-generated source/test/config file and affected couplings; dedicated design review exercises the accepted scenarios. Run style checks through linters. Re-review fixes and record defect count, unique reviewed lines, density, disposition and exact final source hash. |
| V10: truthful handoff | Coordinator synchronizes root README Current state, state/documentation and relevant planning/evidence records in the implementation commit. App README describes commands/dependencies and what was actually tested. Real Rails integration and the remainder of FE-01 remain visibly open. |

The coordinator removes task-owned disposable containers, images and caches immediately after required tests/preview, including failure paths. Inspect ownership/mounts and preserve other workloads, databases, uploads, credentials and the nine previously retained persistent volumes. Initial cleanup removed the task-owned 332 MB Node image, with zero containers and zero build cache reported; prior Playwright/Python images remain. Latest host free space is about 1.68 GB; supported trim reclaimed zero bytes, and lack of administrator rights/Optimize-VHD prevents compaction. Further Docker acceptance may need headroom resolution. Resource shortage cannot be represented as a passing gate or justify deletion of unrelated data.

## 8. Analytical tradeoffs and opinion prompts

The companion [tradeoff scenarios](tradeoff-scenarios.md) supply traceable state/request timelines. **Obsidian is not callable in this environment**. These are analytical simulations, not claims of connected Obsidian execution; retain that limitation in synthesis. Browser and Docker tests must supply empirical evidence later.

Each independent opinion addresses these sections with targeted recommendations, accepted alternatives, failure cases and the smallest sufficient repair. Do not reply with a whole-plan approval only.

1. **Ownership:** Is the serialized LOW data/test-foundation then Fable lifecycle/UI split faithful to both mandated roles, and are any affected files missing an unambiguous owner?
2. **Session:** Which minimal representation makes automatic-refresh eligibility, one-time recovery and explicit retry obvious? Does it prevent old-identity first paint without stranding unchanged-context loads?
3. **Pagination/transport:** Are reset/append ownership and full-body deadlines correct at all boundaries? What is the smallest shared logic warranted by actual duplication?
4. **Accessibility:** Does an approved existing dialog primitive remove risk with less maintained logic than a manual focus trap? How will the chosen approach prove keyboard and background behavior?
5. **Verification:** Does this matrix close the concrete findings and missing accepted evidence without replacing real HTTP/browser observations with direct handler calls? Is the explicit shared cleanup sufficient without enabling global APIs?
6. **Scope/cost:** Can the repair remain one bounded read checkpoint with the existing pins and four GETs? Flag any proposal that would need another design gate, backend change or spending authorization.

## 9. Freeze and dispatch checklist

- [x] Coordinator supplies the initial app commit SHA and normalized file manifest, with original manifest preserved and normalization-only source diff verified.
- [x] Final compiler/unit/bundler logs and the updated 20-finding ledger are retained and hashed; sanitized evidence is distinguished from raw external logs.
- [ ] Coordinator records this brief's final hash, the complete common-packet hash, every included body/hash and any disclosed omissions. Include the actual affected source and the governing bodies required by the consultation procedure.
- [ ] Fresh exact Fable 5, Opus 5.5 and Fable 5.1 opinions complete against that same packet/base, with independent session/runtime identity and exit evidence.
- [ ] Actual Astra MAX records accepted/adapted/rejected recommendations and dissent, resolves the section-specific questions, and approves an explicit owner/path/sequence/test plan.
- [ ] Coordinator dispatches the first bounded repair stage with issue, base, paths, time/cost/concurrency limits and stop conditions. No app write is authorized by an unchecked draft.

This brief creates no implementation success claim, launch, deployment, merge or provider activation. Any new runtime failure that changes the design must be added to the frozen inputs and assessed before dispatch, not quietly appended after independent opinions have begun.
