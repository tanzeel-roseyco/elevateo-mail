# FE-01-R1 independent opinion (Opus 5.5 focus: UX, platform, performance)

This is a design opinion only. I ran nothing. My identity here is the requested assignment, not runtime evidence. All tests below are proposed and **not run**. Contrast figures are calculations to be measured in the browser. I read only the supplied packet and did not see `fixtures.json`, `Async`/`Badge` internals beyond the excerpts, or the lock bodies.

## 1. Ownership

**Verdict: support, with an explicit owner table as a prerequisite.** A serialized split (LOW data/test foundation first, then Fable lifecycle/UI) is faithful to both roles. Session and Shell must stay with a single writer.

These files have no unambiguous owner yet:

| File | Proposed owner | Reason |
|---|---|---|
| `tsconfig.json` (`types` needs `node` for FE-R15), `package.json`/lock, ESLint config, `docker/test.Dockerfile`, `apps/web/README.md` (FE-D01/D02/G01) | Coordinator | Stage C names "harness" files without listing them |
| `src/app/session.test.tsx` | Fable | FE-R13 (409) and the rewritten R3 tests live under `src/app/**`, so not LOW, even though FE-R17's setup file is LOW's |
| `src/data/conformance.test.ts`, `src/data/errors.ts` | LOW | No new error codes are needed: `aborted`, `timeout`, `network` and `malformed` already exist, so `errors.ts` should stay read-only unless reproduction proves otherwise |
| `src/test/setup.ts` (new) | LOW authors | Coordinator wires `setupFiles` in `vite.config.ts` |
| "Narrowly needed UI primitives" | Fable | Name them: at most `src/ui/Async.tsx` (empty-vs-terminal copy) and a new `src/ui/Drawer.tsx` |

**Strongest objection:** two handoffs mean Fable cannot test session behavior against real transport errors until stage A lands.

**Simpler alternative:** give Fable everything and keep LOW for stage D fixes only. That is faster, but it drops the mandated reproduce-first LOW role on concrete reproduced defects (R01–R03, R12, R17). I reject it.

## 2. Session

**Minimal representation.** Use a discriminated state plus one identity key and one recovery flag:

```
type SessionState =
  | {status:'loading'}
  | {status:'ready'; session; key}          // key = actor|org|context_id|authz_version
  | {status:'unauthenticated'}
  | {status:'recovery_exhausted'}           // second current 409
  | {status:'error'; message}
recoveryAllowanceRef: 'available' | 'spent'
inFlightRef: AbortController | null
```

**Automatic-refresh eligibility.** A single predicate governs it: `canAutoRefresh = status==='ready' && visible && !inFlight && now - last >= 30s`. Three triggers call one `maybeRefresh()`: a visibility-gated 30 s interval (paused while hidden), `focus` and `visibilitychange`. Nothing else may call `bootstrap`.

- A timer/focus burst therefore yields at most one request.
- `recovery_exhausted`, `unauthenticated` and `error` can never refresh automatically.
- Only `retry()`, a distinct user transition, sets the allowance to `available` and boots again.

**Exhausted 409 under all triggers.** The second current `context_changed` goes to `recovery_exhausted` and aborts in-flight work. The predicate then rejects the timer, focus and visibility triggers, so FE-R16 is closed structurally rather than by a guard in each handler.

Duplicate 409s from parallel loaders arrive under the same generation. The first one consumes the transition, and later ones see status `loading` and are ignored. A stale-generation 409 is ignored by `isCurrent` and cannot spend the replacement's allowance.

**When the allowance resets (my refinement).** It must not reset on a routine session GET success. Otherwise the current bug, where `bootstrap(false)` resets the guard, returns. But never resetting it means one 409 in the morning and one in the afternoon would strand a user who was stable for hours. My proposal is to reset it to `available` only after a protected read succeeds under the post-recovery key. That proves the new context was usable. It is client-only and changes no contract.

**Unchanged-context overlap: select Option A (preserve ownership).** The current `bootstrap` calls `scope.invalidate()` on every background refresh. Pages then drop their result while still showing `loading`, which is the stranding bug.

- A background refresh must not invalidate.
- On success, compare keys:
  - **Unchanged:** keep the same `session`/`context` object reference. `useMemo` keyed on `key`, not on the new object, so no effect reruns and no extra requests are made.
  - **Changed:** invalidate, abort, replace. The new `context` reruns the loaders naturally.

Option B (restart on every refresh) adds a request per open pane every 30 s on a ten-person team and risks starvation on slow detail reads. I reject it.

**First-render privacy.** Wrap the protected subtree (Shell content plus `Outlet`, not the router) in `<ProtectedBoundary key={key}>`. Render nothing protected unless `status==='ready'`.

- A key change unmounts `mailboxState` and page state in the same render, before any effect runs, which closes FE-R05.
- Add a cheap belt: tag `mailboxState` with `ownerKey` and render only if it equals `key`.

Remounting drops focus to `<body>`. After a replacement, move focus to `#main` and announce through a polite live region, e.g. "Session changed, content reloaded". Neither the key nor the generation is authorization; Rails still decides.

## 3. Pagination and transport

**Reset vs. append.** The caller passes `mode: 'replace' | 'append'`. The inner run returns an explicit outcome `{page, replaced: boolean}`. A `cursor_invalid` retry forces `replace`, so the stale outer `append` flag can no longer leak. This closes FE-R08 and FE-R10.

The shared logic should be one small helper, about 20 lines, because the three pagers duplicate exactly this:

```
fetchPageWithOneReset(fetch, cursor) -> {page, replaced}
```

On the first `cursor_invalid` with a non-undefined cursor it refetches once with no cursor. On a second failure it throws. It holds no cache and no state.

**Shell mailbox loop (FE-R07).** On reset, clear the local `mailboxes` array and restart once. If it fails again, show the existing error with explicit retry.

**Empty pages (FE-R09).** Render "Show more" whenever `nextCursor !== null`, including when `items.length === 0`. Use distinct copy:

- "Nothing on this page yet. Load more" when a cursor remains.
- The terminal "No conversations" only when the page is empty and `next_cursor === null`.

**Filter (FE-R11).** Thread links and Back carry `?filter=unread` when it is active.

**Transport.** Change `requestJson` as follows:

1. If `options.signal?.aborted`, throw `aborted` before creating the timer or calling fetch (FE-R01).
2. One `try` spans fetch, MIME check, `readBounded` and parse. In `catch`, rethrow an existing `GatewayError`. Otherwise, if `controller.signal.aborted`, throw `signal.reason` (`timeout` or `aborted`). Otherwise throw `network`.
3. Track the reader in a local variable; `finally` calls `reader.cancel()` if it is unfinished, clears the timer and removes the listener. The 10 s deadline therefore covers body consumption (FE-R02).
4. MIME check: `type.split(';')[0].trim().toLowerCase() === 'application/json'` (FE-R03).
5. Keep the existing incremental byte counting, and add a lying-Content-Length test.

Do not extract transport and pager code into a framework.

## 4. Accessibility

**Choice.** Use the approved Radix Dialog 1.1.23 (`Dialog.Root`/`Portal`/`Content`/`Title`) for the under-md drawer.

- It removes hand-maintained focus-trap, inertness and restoration logic.
- It behaves consistently in the WebView2 (C# Windows) and WKWebView (Tauri Mac) hosts that will reuse this UI.
- Route selection calls `onOpenChange(false)` and focuses `#main` rather than the trigger, because navigation changed context.

**Simpler alternative:** native `<dialog>.showModal()` adds no dependency and gives inert background and Escape. Focus restoration and scroll lock vary by engine and would still need tests per host. It is acceptable only if the coordinator declines the dependency.

**Contrast (FE-R14).** In dark themes, `--accent-text` needs its own dark value; something in the `#c9a227` family calculates to roughly 6:1 on `#25262a`. Also measure the active-item text on `--accent-soft` and the focus outline (≥3:1) in both themes.

**Motion.** Add none in R1. If the drawer animates at all, use ≤150 ms opacity/transform, which the existing reduced-motion CSS disables. Anime.js belongs to FE-02, and there is no C++/Qt/graphics need here.

**Proof (Playwright, 390 px, real keys):**
- Open with Enter; focus lands on the first mailbox link.
- N+1 Tabs and Shift+Tabs stay inside the dialog.
- `page.mouse.click` on a background link does not navigate.
- Escape closes the drawer and focus returns to the trigger.
- Choosing a mailbox closes the drawer and puts focus in `#main`.
- The skip link is reached by the first Tab.

## 5. Verification

The matrix closes the findings if session tests drive behavior through deferred gateway promises and rendered DOM, never `controller().handleError(...)`.

**Isolation (FE-R17).** One `src/test/setup.ts`:

```
import {afterEach, vi} from 'vitest'
import {cleanup} from '@testing-library/react'
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks() })
```

This is sufficient with globals disabled. Keep singular queries. The three failing session tests must pass individually and in the full suite.

**Required proving tests (not run):**
- **Exhausted 409:** after the second 409, `advanceTimersByTime(31_000)`, dispatch focus and visibility, and assert zero `getSession` calls and the retry UI. Retry produces exactly one call. Duplicate concurrent 409s produce one reboot. A stale-generation 409 leaves the allowance intact.
- **Overlap:** defer a `listThreads`, let an unchanged-key refresh resolve first, then resolve the read. The rows render. With a changed key, the late read is ignored and a new read starts.
- **First paint:** render A's mailboxes, then resolve B's session. In the very next render, A's mailbox name is absent (assert with a synchronous query inside `act`). A later A success or A 401 does not affect B.
- **Cursor reset:** rows from pages 1–2, then page 3 returns `cursor_invalid`. The DOM equals reset page 1 exactly, the filter stays unread, and a second invalid cursor shows retry with no further call.
- **Timeout through body:** a stream emits one chunk then stalls. Advancing fake timers 10 s rejects with `timeout`, and the reader is cancelled, the timer cleared and the listener removed (spied). A pre-aborted signal means fetch is called zero times.
- **Leaks:** after unmount, `vi.getTimerCount() === 0`.

Also record a 50-row INP/long-task baseline in the pinned Chromium image, with method and environment noted.

## 6. Scope and cost

**Verdict: stays one bounded read checkpoint.** It keeps the four GETs and the core pins, and needs no backend, contract or Devin work.

New dev-only dependencies:
- `@types/node`, for `vite.config` (FE-R15).
- ESLint plus `typescript-eslint` and the react-hooks plugin. The hooks plugin is the useful one, since stale-dependency bugs caused part of this batch.
- Radix Dialog is approved and is the only production addition.

Nothing I propose needs another design gate, including the allowance-reset refinement. Host free space of about 1.68 GB is the realistic blocker for running the Playwright image plus `node_modules`. Record it as an execution limitation, not a waived gate.

## Top recommendations, dissent, evidence limits

1. **Session state.** One eligibility predicate plus `recovery_exhausted` state, and identity-keyed refresh that does not invalidate on an unchanged key.
2. **Protected subtree.** A key-remounted subtree with an `ownerKey` belt and post-replacement focus to `#main`.
3. **Pagers and transport.** An explicit replace/append outcome with one shared reset helper, and a single transport classification/cleanup boundary.

**Dissent:**
- Resetting the recovery allowance only on explicit retry is too strict for long sessions; prefer reset after the first successful protected read under the new key.
- Do not route the drawer through a manual trap.

**Evidence limits:** analytical only. There is no Obsidian connection, no execution, and no visual or contrast measurement.
