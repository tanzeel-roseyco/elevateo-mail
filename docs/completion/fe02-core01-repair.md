# FE02 CORE-01 repair — applied lookup receipts must advance the version

Date: 2026-10-14. Worker: Fable 5 frontend owner (Orca task `task_8b3a33dbd22d`, dispatch `ctx_46de667536bd`).
Repairs finding CORE-01 from `Elevateo Mail - Local Completion/docs/completion/review-fe02-recovery-core.md`:
an otherwise-bound `applied` ledger receipt with `version <= attempt.payload.expected_version` was
accepted by `receiptBinding` and discharged an uncertain attempt via `reconcile`, acknowledging
unproven content and possibly regressing the saved version.

## Change

One guard added to `receiptBinding` in `apps/web/src/domain/draftOperation.ts`, mirroring the
existing `resultBinding` direct-result rule:

- `applied` receipts whose `version` is not strictly greater than the ORIGINAL attempt's
  `expected_version` are now a `mismatch`. Comparison is against `attempt.payload.expected_version`,
  never the buffer's current saved version, so a valid receipt for attempt A that precedes a later
  operation B still binds.
- On mismatch, `reconcile` returns the buffer unchanged: the attempt stays `uncertain` with its
  original operation id and frozen payload, and saved/editable content is untouched.
- The function's doc comment and an inline comment were updated to state the new invariant
  (tagged CORE-01). No other source lines changed; no API/schema/backend changes; no new
  dependencies; prior repairs preserved. No AIDEV anchors exist in the domain module (verified by
  grep); none were added or removed.

## Regression tests added (`apps/web/src/domain/draftOperation.test.ts`, `reconcile` block)

1. Parameterized: bound `applied` receipts reporting version **2 (equal)** and **1 (lower)** against
   an attempt with `expected_version: 2` → `receiptBinding` returns `mismatch`; `reconcile` returns
   the identical buffer; status stays `uncertain` with the same attempt; `savedVersion` stays 2,
   `savedContent` stays `'hello'`, editable content stays `'edited'`. Replay after the rejected
   receipt resends the exact original attempt object and payload with zero new ids minted.
2. A validly advancing receipt (version 3) applied after a later local edit resolves the attempt to
   idle at version 3, acknowledges the attempt's ORIGINAL payload (`'edited'`) as saved, keeps the
   newer editor text (`'typed after timeout'`), and leaves the buffer dirty.
3. Existing coverage retained unchanged: direct-result advancement rejection
   (`resultBinding`/`applySaved` mismatch cases), wrong-identity/mailbox/draft/expected-version
   receipt mismatches, expired/unknown handling. All records used are otherwise schema-valid so the
   tests reach the semantic check.

## Verification

- Static: full read-through of both files after edit; guard placement after the identity and
  expected-version checks; comments updated in the same change. Scope limited to the two owned
  files plus this report.
- File evidence (SHA-256, physical line count):
  - `apps/web/src/domain/draftOperation.ts` — `2c4cbb9031e31b269e7ea0ea386174b816bd4ede09de2dccbbd64c01f70f78fa`, 239 lines (was 234).
  - `apps/web/src/domain/draftOperation.test.ts` — `701ffe0500913f960947c77f3d7dde28c39070e39c0eb9867ebc98c0a228d346c`, 359 lines (was 323).
- Runtime: lint, typecheck, unit tests, builds, Docker/fleet runs, browser/E2E — all **NOT_RUN** by
  this worker per dispatch constraints (root owns Docker/fleet runtime). No commits made. Aggregate
  README/state/code-reviews updates are left to root integration.
