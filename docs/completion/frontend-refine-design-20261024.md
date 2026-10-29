# Bounded frontend design review — 2026-10-24

Task `task_d56460125d44`, dispatch `ctx_118b17cc2aca`. Read-only source review; only this report was written. Source edits, central review-ledger integration, tests and visual acceptance remain coordinator-owned. No nested agents, host tests, Docker jobs or deployment were performed.

## Scope and verdict

Reviewed **167 physical source lines**, including comments/blanks: `fixtureMain.tsx` 1–46 (46); `ComposeWindow.tsx` 1–49 (49); `FolderNav.tsx` 185–201 (17); `Toast.tsx` 60–83 (24); `useBottomNotice.ts` 1–25 (25); `styles/index.css` 252–257 (6), all under `apps/web/src/`. Requested endpoints beyond EOF were clipped. No other implementation source was reviewed. Working tree is dirty over HEAD `177c4d26883437dd3f10074fc6323da653778da5`; HEAD alone does not identify this candidate.

**One confirmed source-level defect, MEDIUM; density 5.99 defects/KLOC (1 / 167 × 1000).** Browser reproduction is pending. This is not whole-feature approval or a claim that existing tests pass.

## D1 — Fixture notice does not protect its own text from the bottom safe area

`fixtureMain.tsx:42` anchors the notice at the simulation inset, default zero, with only 8px bottom padding. `index.css:256` protects consumers of `--bottom-notices` using a maximum, but does not pad or raise the notice itself. On the explicitly supported completion/sign-in case without a simulation strip, a device exposing a 34px bottom safe area places the bottom of the fixture text approximately 8px above the viewport bottom, inside that unsafe region. The label can therefore be obscured by system UI even though compose controls reserve 34px. The permanent visible fixture-label requirement is not satisfied for this case.

Recommendation: make the lowest visible notice own safe-area padding and include it in its measured border-box height. When simulation exists, it owns that padding; when it does not, the fixture notice owns it. Preserve `max(safeArea, sumOfMeasuredNotices)` for controls once the measured sum includes this padding. Alternatively, offset the entire notice stack by the safe area and reserve `safeArea + measuredNoticeSum`; this is simpler but creates an empty bottom strip. Do not add safe-area padding independently to both stacked notices.

Validate with only fixture notice, both notices, and neither notice on a viewport with nonzero safe-area inset. Include completion/sign-in routes, portrait/landscape and wrapped labels. These are proposed checks, not executed results.

## Simulated design tradeoffs

The following are analytical layout scenarios, not browser or Obsidian simulations. Tool discovery exposed no Obsidian connection; no vault read/write or synchronization is claimed.

| Scenario | Measured fixed notices | Flow layout | Practical judgment |
| --- | --- | --- | --- |
| Desktop: 33px fixture + 33px simulation, safe area zero | Shared inset 66px; FAB bottom 90px, toast bottom 82px; compose ends above both notices | Automatically reserves 66px but changes shell sizing or reference positions | Keep measured approach for this bounded repair; all fixed consumers need the same contract |
| Narrow/zoomed view: each notice wraps to 49px | Observer updates combined inset to 98px without guessed line counts | Natural reflow is simpler and avoids a JS measurement dependency | Measured approach remains reasonable; verify actual text zoom and font-load reflow |
| Fixture only: 33px notice, safe area 34px | Current maximum is 34px, but label text remains in unsafe region | Flow still needs explicit safe-area padding | Fix D1 at the notice boundary, not by increasing only consumer offsets |
| Very short viewport: 240px tall, 98px notices | Desktop compose max height computes to 110px; 40px header leaves roughly 70px for scrollable body | Can scroll the overall document, but loses persistent window placement | Keep internal scrolling; prove footer reachability, focus and keyboard behavior in fleet browser checks |
| Several or unusually long toasts | Bottom anchored stack can extend above viewport; toast cards overlap the FAB/compose region | An in-flow status region avoids occlusion but shifts content | Do not redesign all overlays now; bound toast height/overflow if current behavior fails the acceptance scenarios |

## Checklist and residual uncertainty

- **Shared state/lifecycle:** typed property names constrain the hook; null refs exit safely; initial layout measurement precedes painting; observer and resize listener are removed on cleanup. StrictMode setup/cleanup/setup is consistent with one mounted owner per property. Multiple same-property owners would overwrite/remove each other's values; the documented singleton invariant is appropriate here, and no registry abstraction is warranted without an actual second owner.
- **CSS contract:** root-scoped custom properties are suitable for portals and avoid threading numeric props through unrelated components. The sum is non-circular: measured notice height does not depend on its own inset. Browser zoom/wrapping should resize the observed element. Without ResizeObserver, font/content changes without a window resize would not remeasure; supported-browser requirements are outside this packet.
- **Compose reachability:** `min-h-0`, internal vertical scrolling and header `shrink-0` are appropriate. Mobile ignores desktop minimise hiding, so rotating from minimised desktop does not intentionally hide the editor. Dynamic viewport units constrain desktop height, but mobile keyboard/visual-viewport behavior is not established by this source. Extreme small heights can exhaust available space and require actual testing.
- **Toast risk, not counted as a new confirmed regression:** supplied rendering has no max-height/scroll constraint. A single sufficiently long message or enough cards can put dismissal controls above the viewport. Queue limits and message constraints are outside the authorized snippet; do not infer they are absent. Ordinary bottom-right toast cards also geometrically overlap the FAB and compose footer, because sharing the notice inset only avoids notices, not other overlays. Check whether transient overlap meets the product's reachability requirement before expanding this repair.
- **Fixture labeling:** clear synthetic-data warning is permanently rendered, with pointer-events disabled so it does not intercept controls. The literal question mark separating the label is a minor copy polish issue, not a functional defect. Production exclusion and actual persistence semantics are asserted in comments but cannot be independently verified from these snippets.
- **Inputs/security:** React renders toast/title text as text; no raw HTML sink appears. Compose capability gating handles an undefined mailbox. Authorization enforcement and fixture query allowlisting belong to unreviewed downstream code and are not certified here.
- **Tests/docs:** the assignment contains no test source, so happy-path, failure-path and regression coverage cannot be confirmed. No automated or manual UI validation was run. Request fleet checks for notice removal/reinsertion, wrapping/zoom, nonzero safe area, mobile keyboard, compose maximise/minimise/rotation, and long/multiple toasts. Existing purpose comments describe the cross-file inset contract well; update them with whichever safe-area ownership rule is chosen.

## Source fingerprints at inspection

Full-file SHA-256 values identify the inspected files; they do not expand review coverage beyond the ranges above.

| File under apps/web/src | SHA-256 |
| --- | --- |
| dev/fixtureMain.tsx | F20FF5666F127A7FBBB1CE86DB4E4B6B2D1CC295AA80D992CE3444E9B189CC46 |
| features/drafts/ComposeWindow.tsx | 8A930E4A274E5887E0555CF993A479930DE112D6E11BB5A2A648306A94156808 |
| features/inbox/FolderNav.tsx | 4561137DA6FF92D932B178D34368099505C8764CCDAC1040222CA0479185B6D4 |
| ui/Toast.tsx | 6B7B9B4F5F1E9759CB22C9CB750E09EDB03FF126EE0564FA8B8C077509A3481B |
| ui/useBottomNotice.ts | 1195D7B6F54FBB89691988FC123064CE88BF1671AB1E561DBF056E9F3917E032 |
| styles/index.css | B1E47AC4C03233906749044943786AC99E7A471B6F1AD35B0756CEB6D0B3555B |
