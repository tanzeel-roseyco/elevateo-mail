# FE-01-R1 independent opinion — claude-fable-5 (requested and running model)

No implementation performed; design opinion only, based solely on the supplied packet. Proposed tests below are **not run**.

## 1. Ownership

**Verdict: support with one change (prerequisite clarification, not a blocker).**

The serialized split — Astra LOW on transport/fixtureGateway/test-foundation (stage A), then Fable on lifecycle/UI (stage B) — is faithful to both mandated roles and avoids concurrent writers. The coupling argument for keeping session + Shell with one frontend writer is correct: FE-R04/R05/R16 and the Shell mailbox loader share generation/ownership semantics (Shell's loader at `Shell.tsx` captures `scope.current()` and depends on session refresh behavior), so splitting them would create a contract between two writers inside one render lifecycle.

Two files lack an unambiguous owner and must be named before dispatch:

- **`src/app/session.test.tsx`** (FE-R13, FE-R17). Stage A gives LOW "directly related data tests" and the shared setup file, but FE-R13 is a session test fixture fix and FE-R17's reproduction lives in this suite. Recommendation: LOW owns the setup file and `vite.config.ts` setupFiles reference (via coordinator integration) only; Fable owns `session.test.tsx` content in stage B, including the 409 status fix, since Fable will rewrite those assertions for FE-R04/R16 anyway. Having LOW patch tests Fable immediately rewrites is wasted serialized work.
- **`src/data/contract.ts` / `errors.ts`** if FE-R02's "deliberate gateway errors" require a new error code or classification change. The brief makes data files read-only to Fable unless transferred; it should equally state LOW may not add error-model surface without coordinator sign-off, because `errors.ts` is consumed by every page Fable owns.

Strongest objection: stage A→B serialization means Fable rebases on LOW's transport changes; if LOW's FE-R02 classification choices are wrong, Fable discovers it mid-stage-B and the loop returns to A. Simpler alternative: one writer (Fable) for everything, coordinator reviewing data-layer diffs separately. Tradeoff: loses the mandated LOW reproduce-first role; I do not recommend it, but it is the honest cheaper path if LOW throughput is a constraint.

**Acceptance checks:** dispatch record names exactly one writer per file including the two files above; LOW hands off with reproduction evidence per finding; Fable's stage B base commit includes all stage A fixes. Evidence limit: I cannot verify LOW availability or its effort budget from this packet.

## 2. Session

**Verdict: change — adopt an explicit eligibility predicate plus a keyed protected subtree; prerequisite for FE-R05/R16.**

Minimal representation: extend `SessionState` with a distinct `recovery_exhausted` state (currently folded into generic `'error'`), and replace the two refs (`rebootstrapUsedRef`, `lastRefreshRef`) with one guard function `canAutoRefresh(state)` that returns true only for `status === 'ready'`. All three automatic triggers (focus, visibility, the new ≥30 s active timer for FE-R04) call the same scheduled `maybeRefresh()`, which checks the predicate, the interval, and an in-flight flag before dispatching — satisfying FE-R16 and the shared-schedule invariant without a state library. `refresh()` (user action) is the only transition out of `recovery_exhausted` and the only resetter of the one-shot recovery allowance. Crucially, routine session success must **not** clear `rebootstrapUsed` when it arrived from an automatic trigger (current code clears it on every non-409 bootstrap at `session.tsx` — the exact FE-R16 bypass).

First-render identity privacy (FE-R05): prefer a **keyed subtree** — key the Shell's protected children on `(actor.id, organization.id, context_id, authorization_version)` — over per-page ownership checks. It makes identity lifetime structural: a replacement identity remounts, so no effect-timing window can show actor A's mailbox names. The scenario-3 cost (remount resets navigation/focus) is acceptable because an identity change *should* reset view state; key no wider than that tuple so mailbox/filter changes do not remount the shell. Per-page checks are the rejected alternative: smaller diff, but every future protected view must remember the check — exactly the duplicated-permission-logic risk the brief flags.

Unchanged-context overlap (scenario 2): choose **Option A** — preserve request ownership when the refreshed session's identity tuple is unchanged. The existing components already implement this shape: `scope.invalidate()` is the only ownership-advancing act, so the fix is to make `bootstrap` *not* invalidate when the response matches the current identity (compare before committing), or invalidate only on confirmed change. Option B (always restart consumers) multiplies requests every ≤30 s under the new timer — a polling-driven reload storm. Failure case for A: a server-side permission change that doesn't rotate `authorization_version` goes unnoticed until the next 409; that is the backend contract's promise to keep, not the client's.

**Acceptance (V3, not run):** timer/focus burst in `recovery_exhausted` issues zero requests; duplicate current 409s cause one rebootstrap; slow read started before an unchanged-context refresh completes and renders; deferred actor-A success/401 after replacement by B does nothing; rendered DOM asserted at the first post-replacement paint (render-output test, not effect-timing). Residual uncertainty: whether invalidate-on-unchanged-refresh currently strands Shell's `loadAll` loop is inferred from code, not reproduced.

## 3. Pagination / transport

**Verdict: support the brief's direction; smallest shared extraction is a reset-outcome helper plus a transport lifecycle wrapper.**

Reset-as-replace (FE-R08/R10, scenario 4): the root cause is the outer `append` boolean surviving the internal `cursorResetUsed` retry in both pagers. Fix by making the recovery path set a `mode: 'replace'` for its retried request (or having `run` return `{page, wasReset}` and computing `existing` from that), preserving the URL filter which already flows from `searchParams`. FE-R07 extends the same one-reset rule to Shell's mailbox continuation loop, which currently has none. The duplication across the three pagers is real but small; extract only a tiny `resolveCursorFailure` policy (one reset, then surface for manual retry) — **not** a generic pagination hook, since Shell accumulates-to-completion while Inbox/Thread are user-driven, and their cursors/collections must stay independent. FE-R09: render the continuation control from `nextCursor !== null`, independent of `items.length` (current code nests it under `items.length > 0`).

Transport (FE-R01/R02/R03, scenario 5): wrap the **entire** lifecycle — dispatch, header receipt, `readBounded`, JSON parse — in one classification/cleanup boundary. Currently the timeout's `clearTimeout` sits in `finally`, but body-read rejections and aborts during streaming escape as native errors because only the initial `fetchImpl` call is caught. Required: pre-aborted signal check before dispatch (throw `aborted`, assert fetch never called); abort reason propagation from body-read failures into the existing typed codes (`aborted`/`timeout`/`network`), preserving already-classified `GatewayError`s; reader cancel + listener removal on every exit. The 10 s deadline must cover body consumption — it structurally does since the controller aborts the stream, but the resulting rejection must classify as `timeout`, which today it does not. FE-R03: parse the media type (split on `;`, exact `application/json` or `+json` structured suffix if the coordinator wants it, with parameters allowed), rejecting `application/jsonp`.

Simpler alternative: fix each pager inline with no shared helper — three near-identical five-line blocks; acceptable, and I'd accept synthesis choosing it, but the shared policy is the better review surface.

**Acceptance (V2/V4, not run):** fake-timer tests for pre-abort, post-header abort, stalled body past deadline, lying Content-Length over-limit; reset-replaces-rows with filter preserved and late old pages ignored; empty-page-with-cursor shows continuation; second `cursor_invalid` shows retry with no automatic request. Evidence limit: no runtime reproduction of FE-R02 escape paths exists in the packet; it is a static finding.

## 4. Accessibility

**Verdict: support the approved Radix dialog for the drawer (FE-R06).** The current drawer has none of the required semantics (no initial focus, no trap, no inertness, restoration absent; Escape handling exists). Radix dialog 1.1.23 is already approved and provides focus containment, background inertness, Escape, and restoration as maintained behavior — strictly less logic than a hand-built trap, which must handle focusable-element mutation and visibility edge cases that are easy to get subtly wrong. Cost: one actually-used dependency the coordinator must lock and license-check. Simpler alternative: native `<dialog showModal>` — genuinely viable in current browsers and dependency-free, but needs manual focus-return and styling work and a deliberate test matrix; since Radix is pre-approved, prefer it. Proof is behavioral, not structural: Playwright tests performing **real** Tab/Shift+Tab/Escape keypresses at 390 px, asserting focus stays inside, background links are unreachable/inactive, focus returns to the invoking menu button, and route-selection close doesn't strand focus. FE-R14: fix the dark-mode `--accent-text` value (e.g., a lighter gold ≥4.5:1 against `#25262a`), then **measure rendered contrast in the browser** in both themes — the token is shared by focus outlines and active nav, so verify all uses.

## 5. Verification

**Verdict: support the V1–V10 matrix; it closes the 20 findings; two sharpenings.**

Mapping is complete: V1→FE-R12/R15/G01/D02, V2→R01-R03, V3→R04/R05/R13/R16, V4→R07-R11, V6→R17, V7/V8→R06/R14/D01 plus accepted gaps. The matrix correctly demands behavior through request resolution and rendered UI rather than direct handler calls — the existing `session.test.tsx` pattern of invoking `handleError` directly is exactly what V3 must replace with deferred-promise/rendered-DOM tests. Sharpenings: (a) V8's keyboard evidence should require Playwright `keyboard.press` sequences, since the current `read.spec.ts` uses clicks and programmatic `.focus()`; (b) V6 should assert zero active timers after unmount explicitly (the new FE-R04 timer makes leak-free unmount a fresh risk).

FE-R17: the explicit `afterEach(cleanup)` in one named setup file, with globals kept disabled and explicit Vitest imports, is sufficient and correct; enabling globals changes the environment for no gain, and per-file cleanup will be forgotten. The guard "don't swap singular queries for plural to hide contamination" belongs in the reviewer checklist verbatim. FE-R12: fix via a generics-preserving resolver (per-operation schema lookup typed by a mapped type), not assertions or parallel DTOs; the four TS2322s disappearing in Docker is the proof. FE-R15: add `@types/node` (coordinator-pinned) to `tsconfig` types — do not relax strictness.

Honest limit: V7's production-serve-with-forced-API-failure and V8's visual runs need Docker headroom; ~1.68 GB free is a real execution risk. That is an acceptance *execution* blocker to surface, never a gate to weaken — state "blocked on host space" rather than substituting the diagnostic bundle.

## 6. Scope / cost

**Verdict: support — the repair fits one bounded read checkpoint.** Everything in the 20 findings is solvable within the four GETs and existing pins. New inputs are dev-only: `@types/node`, a lint toolchain (FE-G01 — flat-config ESLint with TypeScript support is the obvious small choice; coordinator pins/licenses it), Testing Library's cleanup (already a dependency), and Radix dialog (pre-approved, now actually used — technically a production dependency, but the brief's approved exception). Nothing requires backend change, contract mutation, a new design gate, or spend; no Devin session is needed and the $10 authorization stays untouched. **Flag:** if synthesis instead chose native `<dialog>` *and* someone proposed polyfilling older browsers, that would be new scope — reject the polyfill. The only near-boundary item is section 2's unchanged-context ownership policy: it refines accepted session semantics without touching the wire contract, so it stays inside this gate, but synthesis should record it explicitly so a future reviewer doesn't mistake it for an undocumented contract change.

## Top three cross-task recommendations

1. **Resolve test-file ownership (session.test.tsx) before dispatch** — it is the one genuinely ambiguous owner in the stage table and sits on the critical path of both stages.
2. **Make Option A (identity-compare, no gratuitous invalidate) + keyed protected subtree the recorded session decision** — it resolves FE-R04/R05/R16 and scenarios 1–3 with one coherent mechanism instead of three patches.
3. **Require real-keyboard and deferred-promise evidence wording in V3/V8** — the current tests' direct-call and programmatic-focus patterns are the main way this repair could "pass" without proving the invariants.

**Hard contradictions:** none found between the brief, the accepted FE-01 decisions, and the contract. One tension worth recording: the new 30 s active-refresh timer (FE-R04) combined with Option B-style invalidation would violate scenario 2's no-starvation requirement — resolved by choosing Option A, as above.

(~1,540 words. All proposed tests labelled not run; no runtime, visual, or Rails integration evidence is claimed.)
