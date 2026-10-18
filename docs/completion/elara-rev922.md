# Elara REV922 bounded source review

Reviewer/runtime: Elara, Orca runtime `80fd7f05-8c59-444a-83d8-7ecea07e715b`; source-only, 2026-10-14. No tests, builds, Docker, source edits, credentials or live mail.

## Exact packet and accounting

| Segment | Immutable commit and path | Exact lines read | Unique versioned source LOC |
| --- | --- | --- | ---: |
| A | Mira `a7b55af027f3880d223777efa35bc01f44c20efa`, `apps/web/src/features/thread/CollaborationPanels.test.tsx` | Zero-context diff against its first parent: 26 added and 10 removed lines, hunks near new lines 7, 22-32, 122-124, 136-143, 166, 170-171 | 36 |
| B | Theo `8e5fa432d96478d0da2bf7ddfdfb05a3bccb1db8`, `apps/server/test/administration/assignee_options_http_test.rb` | Lines 1-63 at the named candidate worktree | 63 |
| C | Lyra `f0cd5a2b837d1ea484c4f04f3934b7561616ee93`, `apps/web/src/features/thread/AssigneePicker.test.tsx` | Lines 1-50 and 105-132 at the named candidate worktree | 78 |

Total: **177 unique versioned source LOC**. Each read and the aggregate stayed <=180 LOC. No other source or implementation was inspected. REV915's 441-line observation remains invalid and is not counted here. Candidate commit IDs identify each segment; cross-worktree integration and runtime identity are not inferred.

## Findings by segment

- **A, Mira:** The changed assignment test replaces arbitrary typed-member entry with a mailbox-scoped option list, asserts that opening the picker calls `listMailboxAssigneeOptions` with the current context/authorization version, mailbox and `{ limit: 50 }`, then chooses the returned user. It also adapts the formerly-eligible fixture to selection through that list. The new `assigneePage` fixture includes context, authorization version, mailbox and a terminal cursor. This changed slice does not itself prove the rendered option validates a foreign or revoked user after listing, nor does it establish stale eligibility at assignment time; those require the unchanged surrounding assertions and server boundary, which were outside this packet. No confirmed defect in the changed lines.
- **B, Theo:** The HTTP test setup uses a fake connection that records exact database bind values. Lines 46-60 assert 200, no-store, mailbox binding, UUID-only response with no email, signed session/context/authorization tuple, cursor progression and terminal second-page cursor. Lines 61-63 set an empty result and dispatch the empty continuation, but the corresponding assertions fall after line 63 and were intentionally not read. Fresh-session, revoked, foreign, malformed cursor, and max-limit assertions are not evidenced by this slice. No confirmed defect in lines 1-63.
- **C, Lyra:** The fixture resets its mocked list, feature gate and mutable session/context before each test. Lines 105-132 start a pending old-context read, change context and authorization version, rerender, assert the old signal is aborted, open a new picker with a new-context option, resolve the old read and assert the old option is absent. This is a meaningful late-response isolation oracle. The test uses a mocked protected request and does not demonstrate actual network cancellation or backend authorization. Empty, foreign, pagination, revoked and maximum-list tests may exist outside these lines, but are not claimed here. No confirmed defect in the inspected lines.

## Rubric, design tradeoff and limitations

The reviewed changes have focused fixtures and legible names; the short helper and mocks avoid duplicated setup in the displayed slices. A's context-bearing response and C's late-response check address state and authority changes at the UI boundary; B's no-store and UUID-only assertions address disclosure. The bounded packet does not establish complete functional correctness, input sanitization at the server, permission enforcement for final assignment, empty-state rendering, pagination exhaustion, stale eligibility on mutation, or behavior under large lists. The tests include happy and failure/concurrency oracles within this view, but their full suites and product documentation were not inspected. No obvious hot-path query or nested-loop issue appears in the test slices; implementation performance was not reviewed. Design tradeoff: deriving choices from a mailbox-scoped options endpoint narrows arbitrary user entry, while final mutation must still independently recheck eligibility. C's abort assertion protects presentation from stale data but does not replace server authorization.

Defects confirmed: **0 / 177 LOC = 0 observed defects per KLOC** in this packet. This is bounded source coverage only, not runtime PASS or acceptance of the underlying feature. Remaining review context can be assigned as a separate <=180-LOC packet; Soren alone may run fleet-02 Docker tests.
