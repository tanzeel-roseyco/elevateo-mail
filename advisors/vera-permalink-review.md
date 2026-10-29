# ADV-025 — Vera permalink review

Commit: e120b308d7d54cb4824eb9f49406c7b716e3f21a. Read-only application review; no tests executed.

## Coverage

- ThreadPage.tsx at commit: lines 13, 25–55, 59, 69, 90–180, 194–198, 225, 239: 132 LOC.
- ThreadPage.test.tsx at commit: lines 26–27, 189–239: 53 LOC.
- lib/ids.ts at commit: lines 1–30: 30 LOC.
- Four removed ThreadPage.tsx lines in the exact zero-context diff: 4 LOC.
- Total: 219 distinct source-version lines. Largest source batch: 153 displayed lines (includes one duplicate line). Under 200/read and 400/assignment.

## Defect

1. Medium — ThreadPage.tsx:165. Changing the focus effect dependency from state.status to the entire state refocuses the heading/selected message on every continuation state update, including the immediate loadingMore=true update. Clicking Show more messages therefore moves keyboard focus away from that control before its request finishes, and again on completion; it also steals focus if the user moves elsewhere while waiting. Preserve initial ready focus and selected-ID navigation focus, and focus a later-page selection when it first becomes available, without refocusing an already available selection on unrelated state changes. Regression tests should assert that continuation does not steal focus from an unrelated control or repeatedly refocus an already loaded message.

Defects: 1. Defect density: 1/219 = 0.457% (4.57 defects/KLOC).

## Verified and pending

URL selection is validated before reads; query links preserve the unread back filter; missing messages remain pending until deliberate bounded continuation and become unavailable at the final page. Read denial removes message content. Mailbox/thread ownership remains keyed and aborts old requests; query-only selection changes reuse the loaded conversation. No save/send operation was introduced.

Inspected tests cover direct selection/focus, clicking a permalink, later-page selection, malformed IDs, terminal unknown IDs, and conversation read denial. Browser history/reload, deletion after a loaded page, and revocation after initial success are not specifically exercised by these added tests. Existing traversal-budget implementation, full gateway validation, actual UI behavior, and Docker test execution are outside this bounded review. Formatting delegated to the project lint pipeline.
