# FE02 post-run repairs: bounded adversarial review

Date: 2026-10-14. Task: `task_0a4550301173`; dispatch: `ctx_225f917bf856`.
Reviewer: Codex (GPT-6 identity supplied by session); exact model variant and reasoning-effort setting are not exposed to this worker and are not independently verified. No claim to a named Fable/Astra identity.

## Verdict

No confirmed defects in the assigned 349 physical lines. CORE-01 is statically addressed: an otherwise-bound applied receipt must advance beyond the original attempted expected version. The inspected regressions exercise equal/lower versions and preservation of later local edits. Note-retry assertions now distinguish a persistently unavailable browser fixture from a component-level failure-then-success scenario. This is a bounded static finding, not application acceptance or a runtime pass.

Defect count: **0**. Defect density: **0 / 349 × 1,000 = 0 defects/KLOC**. Numbered defects: none established within this assignment.

## Coverage and integrity

Source root: `C:/Users/Tanzeel/Code and projects/Elevateo Mail - Fable FE01 R1`.
Whole-file SHA-256 values matched supplied pins before source inspection and again before reporting. Only the listed implementation/test ranges were displayed and reviewed; reading file bytes for hashing/counting was metadata-only.

| File | Inspected inclusive ranges | Reviewed LOC | Whole-file LOC | SHA-256 |
| --- | --- | ---: | ---: | --- |
| apps/web/src/domain/draftOperation.ts | 120–239 | 120 | 239 | `2c4cbb9031e31b269e7ea0ea386174b816bd4ede09de2dccbbd64c01f70f78fa` |
| apps/web/src/domain/draftOperation.test.ts | 1–75, 213–314 | 177 | 359 | `701ffe0500913f960947c77f3d7dde28c39070e39c0eb9867ebc98c0a228d346c` |
| apps/web/e2e/collaboration.spec.ts | 166–184 | 19 | 259 | `2ce9f901f33ab03569c552ec2a9293bfd61f9508eb63e9d6d25ae5d6ea9833cf` |
| apps/web/src/features/thread/CollaborationPanels.test.tsx | 173–205 | 33 | 256 | `d7b8ffc781b7ad00eb7083c1ff84ba854b7052c867b858c360b373796b56ab4d` |

Four review passes: 120, 177, 19, and 33 physical lines; 349 unique lines overall, with no overlap. Applicable root AGENTS.md and .planning/STANDARDS.md were read in both workspaces; no nested apps/docs AGENTS.md was found by file-name discovery. Authorized narrative context: `docs/completion/fe02-core01-repair.md` and `docs/completion/fe02-note-retry-repair.md` in the source root. Narrative claims do not substitute for inspected dependencies or executed tests.

## Checklist and evidence

- Receipt monotonicity: lines 134–141 bind operation, mailbox, draft and detailed expected version, then reject applied `version <= attempt.payload.expected_version`. The comparison uses the original command, not newer editor state. Tests 257–280 construct otherwise-bound equal/lower receipts, so identity mismatch cannot accidentally satisfy those regressions.
- Uncertain command retention: reconcile 204–205 returns the same buffer for mismatched receipts. Tests 267–279 assert buffer identity, unchanged saved/editable content, the original attempt and payload references on replay, and zero newly minted IDs. Replay generation itself is outside coverage.
- Valid receipt with later edits: reconcile 207–208 updates saved version/content and clears status while preserving editable content through object spread. Tests 282–291 assert original acknowledged text, newer editor text and remaining dirtiness. Stale lookup on idle state is asserted at 310–312; the guard also checks the active operation ID.
- Failure semantics: inspected failure classification preserves uncertainty for refused replays and unknown outcomes, and separates initial definitive rejection. Complete error-taxonomy correctness depends on the uninspected gateway contract.
- Note recovery: component test 178–200 expects an initial error, frozen input, zero notes before retry, two equal submissions, equal note IDs, one fixture note and one matching visible note. Lines 202–205 assert a different ID for new intent. These are authored assertions, not observed execution.
- Honest browser scope: browser lines 166–182 describe persistent failure and deliberate abandonment; they no longer claim successful recovery or identity/deduplication observation. The alert assertion immediately after retry can observe the existing alert, so this slice alone does not establish completion of a second network call. Gateway-call counting is provided only by the separate component scenario, subject to its uninspected harness.
- Boundary cases: equal/lower and valid advancing versions, foreign binding, unknown/expired outcomes, conflict and later edits are represented. Null/untrusted receipts, NaN/infinite/unsafe integers, maximum version and empty-recipient validation are not established here; these typed reducers rely on boundary contracts outside coverage. No claim of runtime sanitization or authorization verification.
- Maintainability/performance: the added guard is constant-time and mirrors the direct-result invariant without adding abstractions or dependencies. Inspected comments explain binding and uncertainty decisions. No hot-path database calls or newly nested loops appear. Formatting/lint checks are delegated to root's tooling, not manually evaluated.
- Documentation: both repair narratives accurately separate authored changes from NOT_RUN evidence and defer aggregate state updates to root. Whole-project README/state consistency and module-wide AIDEV-anchor compliance are not certified by these bounded ranges.

## Design limits and unchecked dependencies

The guard compares receipt version with the attempted base rather than requiring equality to base plus one; this follows the supplied strictly-greater contract and avoids inventing a tighter backend invariant. Acceptance of a receipt is not permission to overwrite current editor text. The inspected reconcile path preserves that text, but UI consumers and cross-request scheduling remain unchecked.

The note scenario explicitly has zero stored fixture notes after its first failure. It exercises an unsuccessful initial submission followed by success, not a committed write whose reply was lost. It therefore does not establish backend deduplication, exactly-once storage, or behavior after an already-applied ambiguous write. No such backend guarantee is granted by this review.

Unchecked dependencies: draftOperation.ts 1–119 (including freeze/replay/edit helpers); other test ranges; data contracts and runtime schemas; error classifier; component implementation and harness; fixture gateway/state; browser load helpers; actual Rails authorization, operation ledger and transport. A greater-than guard alone does not reject NaN; safe numeric validation is an external boundary obligation, not verified here. No dependency was silently opened to settle these questions.

This was a bounded correctness review, not the dedicated whole-system design review. No Obsidian simulation, runtime tradeoff simulation, subagent, or external consultation was performed. Root owns further integration/design evidence.

## Runtime and handoff

**NOT_RUN:** lint, typecheck, unit/component tests, browser/E2E, application build, Docker, SSH, live UI and backend integration. The coordinator supplied historical 608 unit / 270 browser / 72 skip results from before these changes; they are not evidence for these hashes and were not independently verified here.

Root must run its authorized frozen-source checks and integrate this coverage into aggregate review/state records. Only this report was written; source, dependencies, services and commits were untouched.
