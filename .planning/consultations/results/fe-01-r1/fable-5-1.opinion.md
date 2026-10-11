Opinion from a fresh, tools-disabled session on the byte-identical common packet. Runtime model identity is recorded by the coordinator, not asserted here. Nothing was executed; every test below is proposed and not run.

**Verdict overall: change, not defer.** The repair can stay one bounded read checkpoint with the four GET contracts and existing pins. Two prerequisite blockers precede any writer: a decided session representation (section 2) and a decided reset/append outcome shape (section 3), because both cut across files owned by different writers.

**1. Ownership**

Verdict: support with changes. The LOW data-foundation then Fable lifecycle split is faithful to both roles because the write sets are disjoint and the only coupling is the already-frozen error model in `src/data/errors.ts`.

Files without an unambiguous owner in the brief:

- `src/dev/fixtureMain.tsx` and `dev-fixtures.html`: assign to Fable.
- `tsconfig.json` and `package.json` for FE-R15 and FE-G01: coordinator only.
- `docker/test.Dockerfile` and `apps/web/README.md` for FE-D01/D02: coordinator.
- `src/app/session.test.tsx`: Fable for FE-R13 and the rewritten behavior tests; LOW only adds the shared setup file. Two writers in one test file would otherwise be implied.
- `src/data/conformance.test.ts` and `contract.test.ts`: LOW.

Recommendation: because the paths are disjoint, stages A and B can be authored concurrently in separate checkouts with coordinator-serialized integration. The brief's "no concurrent writer" only needs to hold per file. Simpler alternative: keep strict serialization and accept the wall-clock cost. Objection to my proposal: if LOW's transport fix changes which error code body-read aborts produce, Fable's pager tests written in parallel may assert the wrong code. Mitigation: freeze now that caller cancellation is `aborted`, deadline is `timeout`, and body failure is `network`, all already present in the error model.

Acceptance: each dispatch lists exact paths; the integration commit shows no file touched by two writers.

**2. Session**

Verdict: change. Current `src/app/session.tsx` has three defects beyond the listed ones that the same representation fixes.

Demonstrated from the pinned source:

- Focus and visibility call bootstrap with no eligibility check. From the unauthenticated state this silently re-enters authentication, and from the error state after a second 409 it bypasses the guard (FE-R16).
- Every bootstrap, including a background refresh, calls scope invalidate and then stores a new session object. The memoized context changes identity, so Shell and both pagers abort and restart on every refresh. Unchanged-context overlap therefore completes only by restart, and accumulated "Show more" pages are discarded every 30 seconds. With the 30-second timer added for FE-R04, a read slower than the interval never finishes. This is the starvation case in scenario 2.
- Routine success clears the recovery allowance.

Minimal representation: one discriminated phase with the allowance inside it.

```
loading | ready {session, recoveryUsed} | recovering | retry_required {message}
| unauthenticated | error {message}
```

Rules: automatic refresh is eligible only in ready, visible, with no refresh in flight, and at least 30 seconds since the last. Timer, focus and visibility all call one function that applies these rules, so a burst yields at most one request. On refresh success, compare actor id, organization id, context id and authorization version to the current session. If identical, do not invalidate the scope and do not replace the session object. If different, invalidate and replace. A current 409 moves ready to recovering and runs one bootstrap; a second current 409 moves to retry_required. Only explicit retry leaves retry_required, unauthenticated or error, and only explicit retry or a genuinely changed identity resets the allowance. A current 401 from any phase clears to unauthenticated and invalidates the scope.

This selects Option A from scenario 2. Option B is rejected because the pinned code shows it already degenerates to restart storms.

First-render privacy (FE-R05): render the protected subtree under a key built from the four identity fields, with mailbox state living in the keyed child. Identity replacement remounts the child, so no render can show the previous actor's mailboxes. Hiding by phase already covers loss, since Shell returns early outside ready. Simpler alternative: an owner-key check at render time inside Shell. Rejected because every future protected view must repeat it. Tradeoff: remount resets drawer state and focus; the dialog fix in section 4 restores focus to the menu button anyway.

Acceptance (not run): a controllable gateway with deferred promises drives all cases through a real read request rendered in Shell. Required cases: timer tick, focus and visibility burst in retry_required produce zero session calls; two current 409s produce exactly two session calls then retry_required; unchanged refresh overlapping a slow mailbox read ends with the mailboxes rendered and one read request; changed refresh drops the old page and starts one new read; a stale 401 under the previous generation leaves actor B rendered; the replacement render after A to B contains no A mailbox name, asserted on the first committed DOM after the session change; unmount leaves zero active timers under fake timers.

Evidence limit: none of this grants backend authority; context headers remain consistency data.

**3. Pagination and transport**

Verdict: change.

Reset/append: in both pagers the inner retry inherits the outer append flag, so a reset merges with stale rows (FE-R08, FE-R10). Shell's mailbox loop has no reset at all (FE-R07). Make the inner load return an explicit outcome, `{ page, reset: boolean }`, and apply `reset ? replace : append`. The smallest shared piece justified by real duplication is one helper that performs a page fetch with one cursor reset and returns that outcome, used by all three pagers. Each pager keeps its own cursor, collection and dedup. For the Shell loop, a mid-loop invalid cursor restarts the accumulation from an empty array once; a second failure surfaces the sidebar error with retry.

FE-R09: show the continuation control whenever next cursor is non-null, independent of item count, and distinguish the empty text for "empty page, more may follow" from the terminal empty state. FE-R11: thread links and the back link must carry the filter search parameter; the reader reads it and writes it back.

Transport: the pinned transport already holds the timer across body consumption, so deadline coverage is correct; the gap is classification and cleanup (FE-R02). Move all post-fetch work into the same catch that maps controller signal reason to the typed error, rethrow existing gateway errors, and classify anything else as network. In the bounded reader, cancel the reader in a finally when not done. Check an already-aborted caller signal before dispatch and throw `aborted` without calling fetch (FE-R01). For FE-R03, split the media type at the first semicolon, trim, lowercase and compare for exact equality.

Objection: a reader rejection after abort may surface as a native AbortError rather than the signal reason in some runtimes; classify by checking the controller's aborted flag first, not the error class. Acceptance (not run, fake timers): post-header stall past 10 seconds yields `timeout` and the reader was cancelled; chunk then rejection yields `network`; caller abort mid-body yields `aborted`; pre-aborted signal yields `aborted` with fetch never called; Content-Length 10 with a limit-plus-one stream yields `oversized`; `application/json; charset=utf-8` passes and `application/jsonp` fails.

**4. Accessibility**

Verdict: support the approved primitive. The current drawer has only role and aria-modal; the brief correctly calls that partial semantics (FE-R06). Radix Dialog 1.1.23 supplies initial focus, containment, outside hiding, Escape and restoration with less maintained logic than a hand trap. The coordinator must verify its transitive lock additions, since it pulls several sibling packages. Simpler alternative: native `dialog` with showModal, which gives containment, inertness and Escape with zero dependencies but needs manual restoration and route-close handling, and its support in the pinned jsdom is uncertain. Decide on the browser proof, not on unit tests.

Contrast (FE-R14): add a dark-theme override for the accent text token, roughly a light gold in the e0bb4a range, which also fixes the focus outline since it reuses that token. Measure light and dark, including accent text on the soft accent background used by active sidebar items.

Acceptance (not run, Playwright at 390 px): open drawer with Enter; the first focused element is inside the dialog; pressing Tab repeatedly never focuses the main region; Enter on a background link does not navigate; Escape closes and focus is on the menu button; selecting a mailbox closes the drawer and focus is not on a hidden node. Contrast measured from computed styles, not from CSS constants.

**5. Verification**

Verdict: support with one change. The matrix closes the 20 findings if the session tests are rewritten to originate errors from rendered reads, as section 2 requires; the pinned tests call the handler directly and would pass without proving cancellation or privacy.

FE-R17: one setup file with explicit imports and `afterEach(cleanup)` plus `vi.useRealTimers()` is sufficient without enabling globals. Keep singular queries; the retained-root symptom must disappear, not be hidden. FE-R13: the helper hardcodes status 401 for both codes; parameterize status.

FE-R12: type the fixture resolver as a function taking the operation's Zod schema and returning its output type, called with the concrete schema per operation. No cast, no parallel DTO. FE-R15: pin `@types/node` and typecheck the two config files under a separate Node-targeted tsconfig so DOM code does not gain Node globals.

Order under the 1.68 GB limit: run V1 through V6 in the Node image, remove it, then V7 and V8 with the pre-existing Playwright image serving the built artifact. Do not hold both task images at once.

**6. Scope and cost**

Verdict: support. No backend, contract, provider or new design gate is needed. The only production dependency addition is the approved dialog primitive. Flag for a new gate only if synthesis chooses Option B, since that would need a backend-visible refresh semantic. No Devin or new spend is required.

**Top three recommendations**

1. Fix refresh identity comparison and scope invalidation together; this one change resolves FE-R04, FE-R16 and the starvation case.
2. Return an explicit reset outcome from one shared page helper across three pagers.
3. Rewrite session tests to drive errors through rendered reads before counting V3 as closed.

**Hard contradiction:** the brief requires both a 30-second refresh and preserved in-flight reads, but the pinned refresh path invalidates every consumer. Only Option A satisfies both.
