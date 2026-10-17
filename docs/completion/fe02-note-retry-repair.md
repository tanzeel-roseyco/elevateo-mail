# FE02 note-retry evidence repair — honest title + gateway-boundary regression

Date: 2026-10-14. Worker: Fable 5 frontend owner (Orca task `task_aebef410a63e`, dispatch `ctx_ecc12e411325`).
Addresses defect 1 (medium, test-coverage evidence) from
`Elevateo Mail - Local Completion/docs/completion/review-fe02-dark-repair.md`: the e2e note-retry
test claimed same-id/appears-once guarantees its assertions never observed.

## Why no fixture extension was needed

The fixture script mechanism applies ONE outcome per operation per document load
(`fixtureGateway.ts` `resolve`/`scripted`; `fixtureMain.tsx` reads the hash once per load), so an
e2e uncertainty-to-success sequence cannot be expressed without extending accepted script
semantics — which would have required asking root first. It was not required: the fixture gateway's
own AIDEV-NOTE sanctions per-method overrides in tests, and a gateway-boundary
uncertainty-to-success regression already existed in
`apps/web/src/features/thread/CollaborationPanels.test.tsx` (wrapped `createThreadNote` records
every submitted `ThreadNoteInput`, fails once with 503, then delegates to the stateful fixture).
That regression was retitled and strengthened rather than duplicated. No backend guarantee is
inferred from the fixture; these remain client-policy checks.

## Changes

1. `apps/web/e2e/collaboration.spec.ts` (259 lines, was 254; SHA-256
   `2ce9f901f33ab03569c552ec2a9293bfd61f9508eb63e9d6d25ae5d6ea9833cf`)
   - Lines 166–184: the persistent-outage test is renamed to exactly what it proves —
     `a persistently unconfirmed note stays frozen for retry and can be deliberately abandoned` —
     and a comment states that the scripted outcome repeats for every call in the document, that no
     retry can succeed here, and where the same-id/exactly-once guarantees are actually proven.
     Assertions unchanged; the scenario is kept because it covers a distinct failure path.
   - No other test, helper, or CORE-01-adjacent line touched.

2. `apps/web/src/features/thread/CollaborationPanels.test.tsx` (256 lines, was 248; SHA-256
   `d7b8ffc781b7ad00eb7083c1ff84ba854b7052c867b858c360b373796b56ab4d`)
   - Lines 173–205 (notes describe block): the existing regression is retitled
     `uncertainty then success: the retry resends the SAME note id and payload and exactly one note
     results`, tagged to review defect 1, and strengthened with an explicit `note_id` equality
     assertion across the two boundary-observed submissions and an on-screen exactly-once count of
     `<pre>` elements carrying the note text (message bodies also render in `<pre>`, so the count
     filters by the note's exact text). Existing payload deep-equality, fixture-state length-1, and
     fresh-id-for-different-note assertions retained.

## Expected test behavior (authored, not executed)

- A retry that changed the attempt id would fail both `h.notes[1]).toEqual(h.notes[0])` and the new
  `note_id` equality; a duplicate visible note would fail the length-1 state and DOM counts.
- The renamed e2e test passes under the unchanged persistent-outage script and makes no
  identity/deduplication claim.

## Verification

- Static only: full read-through of both edited files and of `fixtureGateway.ts` /
  `fixtureMain.tsx` / `collaborationState.ts` to confirm script semantics and the existing
  gateway-boundary pattern. AIDEV anchors searched; none modified or removed.
- **NOT_RUN** by this worker per dispatch: lint, typecheck, vitest unit/component suites
  (including the strengthened CollaborationPanels test), Playwright browser projects, builds,
  Docker/fleet/SSH. Root owns all execution. No commits, subagents, ultrareviews, or aggregate
  state/README/code-reviews edits.
- CORE-01 repair (`docs/completion/fe02-core01-repair.md`) and all concurrent work untouched.
