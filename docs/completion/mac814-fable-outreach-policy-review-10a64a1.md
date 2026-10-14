# MAC-814 independent static review: FE-805 outreach session policy

Pinned source: Fable `10a64a1` (`apps/web/src/app/outreachSessionPolicy.ts` and test, feature registration). No owner source was changed. All seven reported unit failures remain unresolved outside this review; application tests and Docker builds were **NOT RUN** by this reviewer.

## Bounded coverage

- Policy module lines 1-58: 58 LOC.
- Focused policy test lines 1-59: 59 LOC.
- `apps/web/src/app/features/index.tsx` changed region with context, lines 1-48: 48 versioned LOC.
- `session.tsx` lines 245-330: 86 context LOC, plus 34 unique search-result context lines outside that range.

Total inspected: **285 unique versioned LOC**, below the 350 cap. Each tool call exposed at most 117 LOC. The full Outreach page catch/render logic, Shell tests, session provider outside the listed context, gateway transport and the seven failing tests were not read. This packet does not assert complete FE-805 acceptance.

## Findings

1. **Potential HIGH: stale failure still reaches page state.** `outreachSessionPolicy.ts` lines 21-35 calls `handleError(error, generation)` and always rethrows. `session.tsx` lines 296-322 explicitly returns `true` for a stale generation and for current `unauthenticated` or `context_changed` handling. The wrapper ignores that consumed result, so a page awaiting an old request still receives the obsolete failure after a newer context has been installed. If its catch sets local error state, the protected subtree can show a stale 401/context error. Fix by proving page-level catch discards consumed/stale errors, or design a central consumed-error outcome that cannot update local page state while preserving deliberate error semantics. Add a deferred-request regression across generation change and verify visible UI state. **Status:** static concern; page code not reviewed, so visible defect is unproven.

2. **MEDIUM: focused regression coverage is insufficient.** The 59-line focused test has current 401, ordinary rejection and synchronous throw cases. It does not cover a successful operation, stale 401, `context_changed`, simultaneous failures, or stable memoization through rerender. In particular, `it(...happy path)` at lines 28-38 actually exercises a rejecting 401. Add at least success, stale error after generation change, and current context-change tests, plus one route-level assertion that the page does not commit an obsolete error. **Status:** confirmed gap in the named test file; broader Shell tests were intentionally unread.

## Positive evidence and limits

The wrapper captures generation at call time, binds gateway methods to preserve `this`, routes synchronous throws and rejected promises through the central handler, and keeps optional methods absent when the raw adapter lacks them. The feature registration memoizes on the raw gateway, scope and handler, which is a sensible seam if those provider references are stable; this review did not verify reference stability at runtime. Input shape checks remain in the gateway/domain boundary; no duplicate validation was introduced here. There is no additional loop, database query or secret handling in this module.

Confirmed defect count: **1 test-coverage defect / 285 inspected LOC = 3.51 defects per 1,000 LOC**. Potential stale-state finding is tracked separately; counting both provisionally would be 7.02 per 1,000. No independent design-tradeoff or runtime review was performed. Acceptance remains gated on Fable's seven failing tests and Soren's exact fleet result.
