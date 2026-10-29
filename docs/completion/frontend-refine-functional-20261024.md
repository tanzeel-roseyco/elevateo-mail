# Bounded functional review — 2026-10-24

Task `task_f2589e160aec`, dispatch `ctx_a66d269bdc82`. Read-only source review; only this report was created. No host tests, Docker jobs, application execution, nested agents or source edits occurred.

## Coverage and result

Reviewed 146 physical lines including blank lines/comments: `apps/web/src/ui/useBottomNotice.ts` 1–25 (25), `apps/web/src/ui/useBottomNotice.test.tsx` 1–59 (59), and `apps/web/src/app/Shell.tsx` 255–316 (62; requested range ended at 330, but file ends at 316). No other implementation was reviewed. Project standards and current documentation headers were consulted as context.

**Concrete defects: 0. Defect density: 0 / 146 × 1,000 = 0 defects/KLOC.** This is bounded static approval, not runtime or visual acceptance. Root retains ownership of source changes and central `code-reviews.md` accounting.

## Functional assessment

- Lifecycle and Strict Mode: hook lines 9–23 capture the element and inset for each effect setup, measure before paint, and disconnect/remove the matching observer, listener and property during cleanup. Setup → cleanup → setup recreates the measurement and observer correctly. Null refs return safely. An inset change cleans the old property before measuring the new one.
- State interaction: each declared inset has a separate CSS property; removing simulation cannot erase fixture state. Shell line 300 mounts/unmounts the simulation component with `session.simulation_mode`, so ordinary removal invokes cleanup. The hook has no application data writes or asynchronous state updates. Whole-session sign-out behavior outside the assigned range was not verified.
- Wrapping: hook lines 13–17 measure actual element border-box height, observe size changes and include a window-resize fallback. Shell line 311 permits flex wrapping and includes safe-area padding in the measured element. CSS consumption and real rendering are outside this source packet; their correctness is not established here.
- Accessibility: Shell lines 258–260 and 293 provide a skip target with programmatic focus support. Notice line 311 supplies `role="status"`; text is rendered through React, with no raw HTML or focus capture. Actual announcement timing, contrast, zoom and unobscured keyboard focus require browser/manual evidence.
- Simplicity/performance: one element, observer and listener per mounted notice; constant-time geometry reads and one style write per notification. No network, permissions, database, external-input parser or collection limits are introduced in this packet. No unjustified abstraction or duplicated domain logic was identified.
- Tests: the three source tests cover changing measured height, teardown, independent inset ownership, missing ResizeObserver and post-unmount window resize. The first test's “sign-out” wording represents direct component unmount, not integrated authentication behavior. Comments explain measurement and ownership intent; whole-feature documentation synchronization is outside this bounded review.

## Regression recommendations and evidence limits

1. `useBottomNotice.test.tsx:15–59`: add a StrictMode wrapper case asserting inset after effect replay, active observation after replay, and no residual inset/listener after final unmount. Current source is replay-safe, but the tests do not directly protect this requirement.
2. `useBottomNotice.test.tsx:5–7`: rerender the same notice with `fixture` changed and assert the old inset disappears and the new inset is measured. Existing two-root coverage does not exercise dependency switching.
3. `Shell.tsx:300–314`: in fleet Docker browser coverage, toggle simulation on/off while fixture mode remains mounted, then sign out. Assert actual bottom geometry and restored offsets, not only CSS strings. At narrow width and browser zoom, verify wrapped notice text, docked controls, sidebar reachability and keyboard focus remain unobscured; inspect polite status announcements with assistive tooling where available.

The hook assumes a unique mounted owner for each inset and an element present on initial effect setup. The assigned Shell caller satisfies the element-presence assumption. Concurrent duplicate owners, conditional ref attachment, and CSS variable definitions cannot be established from this packet; they are integration preconditions, not counted defects. Without ResizeObserver, content-only height changes are not observed until window resize; the assigned static notice does not establish a concrete failing path.

## Source binding

SHA-256 of complete files at review time (Shell review remains restricted to the range above):

- `useBottomNotice.ts`: `1195D7B6F54FBB89691988FC123064CE88BF1671AB1E561DBF056E9F3917E032`
- `useBottomNotice.test.tsx`: `B9EED9CFB4D23664CEB19EFEDD44557DA5FFBB58DC3D05E32063DE1BC7B8CDE6`
- `Shell.tsx`: `8B837B9045458D913732C0DA277355CF08A450F037414622C6DDE82CECDDB382`
