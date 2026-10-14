# ADV141 — immutable index authorization typing

Pinned final: 3f3562a600082b5eca0de28f7fa27da89d815f80; parent 2418a72cec584d4a3e0e1801f03b99305a3defb4; original index baseline 215080a4ed74a56f33c06113ea616170443a91f2. Source-only review; runtime identity/result NOT_RUN by this reviewer. No tests/builds/Docker/live operations or implementation edits.

## Coverage and defects

Baseline controller 1–61 (61 LOC), baseline RBS 1–11 (11), final controller 1–77 (77), final RBS 1–22 (22), final controller_authorization_test.rb 1–53 (53): **224 unique versioned LOC**, largest source packet 77. Paths are apps/server/app/controllers/v2/inbox_attachments_controller.rb, apps/server/sig/inbox_attachments_controller.rbs, and apps/server/test/attachments/controller_authorization_test.rb. Documentation packet and incremental numstat were also inspected.

**0 confirmed defects; density 0/224 = 0 per KLOC.** Parent/final unchanged files were not counted as another version read. No broader attachment/content acceptance is claimed.

## Callable and authority

The explicit ReadAuthorization class preserves the original lambda's exact organization/mailbox/thread/message and :read comparison, then invokes direct_message with the same frozen request tuple on every admitted call. It does not cache authorization, rescue denial, replace the reader result with assumed authority, or use a cast. Its nil return is the existing command-style successful authorization result, reached only after direct_message returns normally. A ThreadReads::NotAvailable exception interrupts the call before nil and remains mapped to the fixed not_available response by index.

RBS explicitly types constructor state and keyword inputs; the callable's void contract describes its discarded success result without suppressing Ruby exceptions. UUID path validation, cursor validation, default 50/max 50 list limit, protected_read scope and budget remain unchanged. Mismatched or nil caller fields cannot match the valid bound String tuple; missing keywords fail rather than authorize. NoStorage still rejects get, so this index-only snapshot introduces no private byte release path.

The direct_message implementation and its guarantee that denial raises rather than returns nil were not independently inspected. The new regression proves the callable propagates its expected exception contract, not that all underlying session/revocation paths implement that contract. Existing service invocation and actual read authority require Soren's focused/runtime gate.

## Regression and incremental decision

Matching reads assert nil twice and two exact reader calls, detecting accidental memoization or tuple drift. Each of five changed scope/capability fields must raise fixed not_available before any reader call. The new denial oracle makes the reader raise and requires the same exception plus one reader invocation; removing the reader call or swallowing its failure would fail this test.

Final 3f3562a6 is directly parented by 2418a72c. Its source numstat contains only eight added test lines; the other changes are review/documentation updates. Thus the final successor adds the denial oracle without changing production controller/RBS behavior relative to the frozen core's 2418 repair. This supports a narrowly scoped test successor; it is not a test PASS receipt.

## Design simulations

- Revocation between two admitted metadata calls: the callable re-enters direct_message each time. If the current reader denies on call two, failure propagates and the controller renders unavailable; no cached first authorization grants the second read. Actual database revocation timing remains unexecuted.
- Foreign message with otherwise matching organization: tuple comparison denies before the reader. Narrow scope avoids turning this helper into a general organization directory or capability broker.
- Current reader denial: exception leaves the callable before its nil success result. Index cannot turn that denial into a successful metadata result through this repair; NoStorage additionally prevents bytes in this snapshot.

A small explicit callable is justified here because it gives the checker named keyword types at a security seam. It owns one concern and retains the original bounded comparison/read sequence. Further abstraction or a new authorization protocol would add coupling without fixing this typing defect.

## Limits and next gate

Excluded: protected_read and inherited helpers, ThreadReads implementation/RBS, attachment Service/Repository, private gateway/content candidate, real database role/session fixtures, deployment routing and actual browser/runtime behavior. Full standards compliance, performance of underlying queries, empty-list service behavior and real typecheck success are outside this slice. Existing query count is unchanged: one direct-message check per callable invocation. Comments and packet explain the fresh-read coupling and inactive route.

Proceed with the final test successor and Soren's exact-source strict/focused tests. No source blocker found; do not activate content or claim byte/revocation runtime proof from this index review. Simulations are supplied for the root's Obsidian record only.
