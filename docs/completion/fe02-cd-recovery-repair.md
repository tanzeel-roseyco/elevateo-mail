# FE-02 C/D draft-recovery repair (design findings 1–7) + frozen-run test repairs — owner report

Dispatch `task_f2dd28671576` / `ctx_739a50131342`. Target: `apps/web` on `review/ultra/frontend-reader`.
Inputs: the coordinator's design review `review-fe02-cd-22-design.md` (seven confirmed defects, accepted
D05 amendment) and, by scope extension (`msg_7faba0ed813c`, `msg_324bed2cd902`, `msg_ff5a82afacba`), the
frozen lint-fix stage evidence `ops/local/fe02-cd-lintfix-stage-61df9aa3e3e748f2a34d002b73632d55/evidence/`
(4 unit failures, 4 browser failures, one GUI capture gap).

**Runtime status: NOT_RUN.** Nothing was executed on the host (standing ruling: application checks run
only in root-owned containers). Root owns freezing, review and the fleet rerun. This report does not
self-certify anything; it lists what changed, what each regression asserts, and bounded review slices.

## 1. Repairs by finding

| # | Defect (short) | Repair | Where |
| --- | --- | --- | --- |
| 1 | Context recovery destroyed unsaved text, raw recipients and the unresolved attempt (the editor is inside the recoverable subtree) | New in-memory `DraftIntentProvider` mounted between `SessionProvider` and the router. Entries are keyed by `actor\norganization\nmailbox\ndraft` and hold `{ buffer, recipientsText }` only: parsed content, raw To text, exact immutable attempt (operation id, frozen payload, expected version), never proof/tokens/server copies. The editor writes through while dirty or non-idle and clears on clean idle; a save outcome is committed to the store as well as to the screen, so an unmounted editor's in-flight attempt still settles (stale → uncertain) and a buffer found in `saving` on reattach is settled the same way. Retained intent is re-presented only after a successful current authorized read of the same owner (or the expected pre-create 404 under `?new=1`); unavailable/failed reads present nothing and keep it. Dropped on `unauthenticated`, `signing_out`, `no_organization` and on any actor/organization change. No browser persistence, cross-tab or offline framework. | `src/app/draftIntent.tsx` (new), `src/app/App.tsx`, `DraftEditorPage.tsx` (`ownerKey`, write-through effect, `commitSaveOutcome`, `load` reattach, `settleInterruptedSave`) |
| 2 | A refused retry (400/404) was shown as "Nothing was saved", erasing the unresolved history | `saving` now carries `replay`. A refusal during a replay keeps the attempt `uncertain` with `refusal: 'request_invalid' \| 'not_available'` and copy that says it proves nothing about the earlier invocation; only a FIRST request's refusal is `rejected`. Retry and lookup remain available for the same id. | `src/domain/draftOperation.ts` (`beginSave`, `applySaveFailure`) |
| 3 | Invalid newer local edits blocked the exact retry | `save()` validates the live text only for a fresh save; with a pending replay (`pendingReplay`) it resends the frozen payload regardless of the current text. The invalid text stays local and flagged; a fresh save stays disabled. | `DraftEditorPage.tsx` `save()` |
| 4 | A 404 on the recovery read rebased/adopted to version 0 / empty content | Unavailable or failed recovery reads change nothing: text, attempt, base version and the conflict/unusable panel stay; a status note says so and that this answer proves nothing about the attempt. Only a successful current read enables rebase/adopt. | `DraftEditorPage.tsx` `resolveConflict()` |
| 5 | "Keep my text" on a consumed server copy replaced the local text (unconditional adopt) | Consumed + rebase keeps buffer, raw recipients and attempt, marks the editor consumed (all writes disabled, the rebase button disappears) and explains; only the explicit "Discard my text" replaces them. | `DraftEditorPage.tsx` `resolveConflict()`, panel rendering (`canWrite`) |
| 6 | A stale lookup/recovery left `resolving` permanently true | Busy state is a per-request token (`busyToken`/counter): every completion, stale included, releases only its own token; a renewed context's `load()` resets it; a later request's busy state cannot be cleared by an older completion. Same pattern for `busyUser` in `MembersPage` (`writeTokenRef`). | `DraftEditorPage.tsx`, `MembersPage.tsx` |
| 7 | Reconciliation accepted a receipt with the wrong binding/version | `receiptBinding` requires operation, mailbox and draft to match always and `expected_version` for applied/conflict records; `reconcile` ignores mismatches and the editor shows a bounded protocol note (attempt stays unresolved). `resultBinding`/`applySaved` require the save result's draft and operation to match and `version > expected_version`; a mismatched schema-valid result turns the attempt uncertain instead of a fake success. | `src/domain/draftOperation.ts`, `DraftEditorPage.tsx` `checkOutcome()` |

D05 amendment honoured: an expired, unknown, unavailable (404) or refused outcome alone never re-keys the attempt or proves rollback; a fresh operation id is minted only by `rebase` after a successful current read (deliberate new intent). Session/generation checks in `useProtectedRequest` are unchanged.

Additional editor hardening in the same slices: retry/rebase require `canWrite` (compose authority, proof, not consumed); the lookup note moved out of the alert into a `role="status"` line so it survives panel changes.

## 2. Frozen-run failures (scope extension)

| Evidence | Cause | Fix |
| --- | --- | --- |
| `unit-test.log` 113: `Shell.test.tsx:354` "multiple elements with the text: Fixture inbox" | The header search form's mailbox `<option>` repeats the display name | Target the rail link: `getByRole('link', { name: 'Fixture inbox' })`. Same assertion intent (A's loaded rail), semantic selector |
| `unit-test.log` 476/490: `collaborationState.test.ts:156` and `:225` `membership_conflict` on self delete | After the actor's self-demotion the READER is the last manager; the tests then deleted the reader, which §8 must refuse. Production behaviour is correct; the tests contradicted their own earlier last-manager assertion | Tests now assert the refusal of the last-manager removal (state: thrown code; gateway: rejects with `membership_conflict` 409), then remove the demoted ACTOR (version 4, `member: null`, rotated authorization version), then the absent-member no-op and the stale-revision refusal |
| `unit-test.log` 464: `draftOperation.test.ts:204` rebase "new id" equalled the old id | Test fixture: `saving()` minted OPS[0] from its own `ids()` and the rebase assertion minted from a fresh `ids()` that also returned OPS[0] | The id source is positioned past OPS[0]; the test asserts the domain called it (`count() === 2`) and the new id is OPS[1] ≠ old |
| `browser-test.log` 112/149/224/261: `visual-states.spec.ts:315` `mailboxes-empty` expected 0 links, got 1 | The mailbox navigation now contains the global Search entry (BE-02 D) | Count mailbox links by route (`a[href*="/mailboxes/"]` = 0), pin exactly one `Search` link, and keep total links = 1. A stray mailbox row, a missing or duplicated Search entry still fails |
| `msg_ff5a82afacba`: `cd-narrow-members.png` was the Search page; conflict/uncertain PNGs showed only the top of the alert | Capture after the overflow loop; the shell's `main` scrolls internally so `fullPage` cannot reach the alert | `collaboration.spec.ts`: every capture is project-qualified (`e2e/.results/<project>-cd-<route>.png`) and taken after a route-specific ready assertion (`CD_ROUTES` table: Drafts heading, `Saved version 2`, reader heading, `Roster revision 1`, Search heading). Narrow loop captures each of the five routes (`narrow-<route>`). New dark-theme test captures the five routes plus a dark conflict editor. Editor captures (`captureEditor`) lend the page an 1800 px viewport, scroll the alert into view and assert it is in the viewport, so fields, alert and recovery controls are in one image; the uncertain flow captures both the attempt and the post-lookup state |

Old capture names (`cd-drafts.png`, `cd-draft-conflict.png`, `cd-draft-uncertain.png`, `cd-members.png`, `cd-search.png`, `cd-reader-collaboration.png`, `cd-narrow-members.png`) no longer exist; the evidence collector should glob `e2e/.results/*-cd-*.png`.

## 3. Regressions (what each test asserts)

### Domain `src/domain/draftOperation.test.ts` (24 tests)
- `beginSave`: `saving` carries `replay:false`; a replay reuses the SAME attempt object/payload with `replay:true`, mints nothing, and the frozen payload is independent of later text.
- Save results: bound result applies; `another operation id` / `another draft` / `version not after expected` → `resultBinding` mismatch, attempt becomes `uncertain`, no saved-version/content change, `pendingReplay` still the same attempt.
- Replay refusals (400, 404, local malformed): `uncertain` with the matching `refusal`, message says nothing about the earlier attempt and never "Nothing was saved", same attempt resent under the same id with no new mint; the same refusal on a FIRST request is `rejected`.
- Receipt binding: applied and conflict records differing only in `mailbox_id`, `draft_id` or `expected_version` → mismatch, `reconcile` returns the same buffer; exact records bound; expired/unknown bound by mailbox+draft only, a record for another draft ignored.
- Existing applied/conflict/consumed/expired/unknown/rebase/adopt/dismiss cases kept; rebase id fixture corrected (section 2).

### Editor `src/features/drafts/DraftEditorPage.test.tsx` (25 tests)
Harness additions: held (externally settled) save, lookup and session replies that ignore the abort signal; switchable actor (`session_a`/`session_b`); `renderEditor` (editor directly under providers: batched same-identity lifetime) and `renderEditorInShell` (keyed-subtree lifetime). Rewritten false-positive tests:
- consumed conflict: keep-text retains subject AND raw To text, editor consumed/read-only, rebase button gone, save disabled, attempt still shown, server untouched; only Discard replaces (previously asserted badge+disabled only).
- expired lookup: a 404 on the read keeps the unusable id and text (no re-key); a later successful read then a save mints a fresh id.
- 409 during save: recovered editor keeps `Edited`, shows the attempt as uncertain with the restored note, exactly 2 session reads, no auto-resend, server still version 2, then lookup (unknown) and exact retry succeed with identical payload (previously asserted the text reverted to the server copy, i.e. codified defect 1).
New tests:
- recovery read 404 then 503 change nothing (text, conflict panel, `Saved version 2`, no `Not saved yet`); a successful read then rebases.
- invalid newer edits: retry enabled, resends frozen payload, invalid text stays flagged, fresh save disabled.
- lost reply then refused retry (400 and 404): attempt stays unresolved, no "Edit and try again", identical payload resent, lookup resolves the committed first invocation without a third send.
- mismatched lookup receipts (draft, mailbox, base version): status note, attempt unresolved, nothing applied; the real record then resolves it.
- batched same-identity recovery: surviving editor restores text, raw To text and the frozen attempt; the old request's late success is not applied (still version 2, still uncertain) and the ledger then resolves exactly that attempt.
- unmounting recovery under Shell with a held session: `Restoring session` frame has no editor and no context; remount restores the same intent; a late 400 for the old request is not a rejection; exact retry succeeds.
- cross-owner privacy: actor B after an identity change sees the server copy (no restored note, no unsaved badge); switching back to A also sees the server copy (intent dropped on identity change); no save was sent.
- busy tokens: a held lookup across a batched recovery leaves lookup/retry available; a newer held lookup stays `Checking…` while the older one completes with an applied record that applies nothing; the newer completion then clears it.

### Full Shell `src/app/membershipRecovery.test.tsx` (new, 2 tests)
Session and mailbox list derived from the fixture roster (rotated authorization version; capabilities from the actor's row; absent row → private mailbox absent, shared mailbox read-only); members list 404 for a non-manager.
- PRIVATE self-removal with a held bootstrap and a held FIRST mailbox list: after the write, the old generation is stale, context is null and `Loading session` is shown before the bootstrap answers; after release, 2 session reads, context carries the rotated version, a second mailbox list ran, the sidebar has only `Fixture inbox`, no Members/Drafts links, `Members are unavailable`; the old list's late success with full old capabilities changes nothing.
- SHARED self-removal: the mailbox link stays (current), Drafts/Members links gone, roster unavailable with the cannot-manage copy; the old list's late 503 produces no error state or retry button.

### Other
- `Shell.test.tsx`, `collaborationState.test.ts`, `visual-states.spec.ts`, `collaboration.spec.ts`: section 2.

## 4. Files changed (SHA-256 of final content, LOC)

| File | SHA-256 | LOC |
| --- | --- | --- |
| `apps/web/src/domain/draftOperation.ts` | `f1ffa6e3710f0d8bfbb67f62f1cb61a5e9b5f3312651c9233145bbd37e622b49` | 234 |
| `apps/web/src/app/draftIntent.tsx` (new) | `1e4f5639eb1b990918b8013002aeaaf6851f21c31c151a5757dc0b24e609769f` | 81 |
| `apps/web/src/app/App.tsx` | `575587a133d457cfc6bdcade7619e24584231f4579f953dedbeaa2eec5d04506` | 39 |
| `apps/web/src/features/drafts/DraftEditorPage.tsx` | `51157f0426f956deae55a9eaa35c705460cd814e336ebb2a9ab89ea7d815990a` | 439 |
| `apps/web/src/features/members/MembersPage.tsx` | `8c2409a2c0d2b83bb762b7680b2ee050dcbc3997c32eafc89e21c5f2cd4f1839` | 262 |
| `apps/web/src/domain/draftOperation.test.ts` | `5381b1929459582da2fc7d290fc72156d1cd7627504b0e2e8e2d969880858ba6` | 322 |
| `apps/web/src/features/drafts/DraftEditorPage.test.tsx` | `cc4512ba31005f4d4302beb3cceb50dbb3b4ccbb003937ce65b7354e232a0145` | 711 |
| `apps/web/src/app/membershipRecovery.test.tsx` (new) | `b56f1d582162cc156e821a2404261d315a7f22b8fe7ea613e766c920ff4c481f` | 195 |
| `apps/web/src/app/Shell.test.tsx` | `f45aeee55d668de150f355b23c80812a4f4f33d6f0167c72742f8bbf1cac875a` | 373 |
| `apps/web/src/data/fixtures/collaborationState.test.ts` | `276da8b0989fe4ef9cbac15dce24a0d3c64de4927061da2fd5464a0272c0ccaf` | 246 |
| `apps/web/e2e/visual-states.spec.ts` | `0c404aa6e2b4833619fae34b0ce8851c96f87302e9326fe4431b33e1e6753d14` | 465 |
| `apps/web/e2e/collaboration.spec.ts` | `d1115c5b04300da98400fc64b7a5f199f71732fdad9c2c35ebce5eaeac65d4e9` | 227 |
| `apps/web/README.md` | current-state entry updated |
| `docs/completion/fe02-cd-recovery-repair.md` | this file |

No backend, contract, generated, dependency, harness-config or fixture-source file was touched (the fixture state and gateway are unchanged; the Shell test derives roster-dependent answers inside the test). Nothing was committed. Source lines changed per finding stay within the ≤200-line review slices below.

## 5. Suggested review slices (≤200 source lines each)

1. `src/domain/draftOperation.ts` (234, pure) with `draftOperation.test.ts` §beginSave/applySaved/applySaveFailure.
2. `src/app/draftIntent.tsx` (81) + `App.tsx` + `DraftEditorPage.tsx` lines 1–200 (owner key, write-through, `load` reattach, `save`).
3. `DraftEditorPage.tsx` lines 200–439 (`checkOutcome`, `resolveConflict`, panels) + `MembersPage.tsx` busy token (≈12 lines).
4. `DraftEditorPage.test.tsx` 1–330 (harness, existing flows) and 330–711 (recovery suite) as two assignments.
5. `membershipRecovery.test.tsx` (195) + the four frozen-run test fixes + `collaboration.spec.ts` captures.
6. Design-tradeoff reviewer: the intent store boundary (memory holds intent, never authority), the replay/refusal semantics against D05, and the receipt-binding rule against be02-cd-contract §5.

## 6. Limits

- Everything above is static authorship; no lint, typecheck, unit or browser run happened here. Expect the usual first-run friction (selector timing, strict-mode duplicates) to be reported by root's rerun, not assumed absent.
- The Shell test models server-side capability refresh inside the test harness (roster-derived session/mailbox answers) because the fixture gateway's mailbox list is a static example; it proves client behaviour over that contract shape, not Rails.
- `captureEditor` relies on an 1800 px temporary viewport; if an editor state ever exceeds that, the in-viewport assertion fails loudly rather than silently cropping.
- Retained intent is process memory only: a full page reload still loses unsaved text by design (no browser persistence in this repair).
