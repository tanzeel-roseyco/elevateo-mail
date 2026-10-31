# Adversarial implementation review

Reviewed against `.planning/STANDARDS.md` and the owner brief. Source changes were reviewed as bounded diff chunks (at most 200 source lines per review batch); metadata and repeated context are excluded from the density denominator. This is a code review, not a claim of build, test, or visual success. Those gates are owned by the coordinating agent.

## Findings

- **D1, medium, fixed on reread:** palette guard missed arbitrary Tailwind hex and rgba/hsla literals and exempted the entire styles directory. Revised regex, negative fixtures, and exact token-file allowlist address the identified bypasses. Tests were not executed by this reviewer.
- **D2, medium, pending at review:** `ui/Modal.tsx:51` maps a translucent backdrop to opaque `bg-surface-2`. Restore `bg-overlay` to retain underlying task context and match Sheet/Drawer.
- **D3, medium, pending at review:** `features/inbox/MessageRow.tsx:94` renders the unread dot in white on the white unread-row surface. Use `bg-fg` or a contrasting accent token. Bold text survives, but the existing functional unread cue disappears.
- **D4, medium, pending at review:** `features/email-finder/EmailFinderPage.tsx:114` gives active and inactive navigation modes identical gold borders; only a very subtle neutral fill indicates selection. Add a distinct border thickness or weight/indicator so selection remains robust.
- **Comment maintenance, low:** CodeBlock still describes a fade after replacing the gradient with a solid fill. Separator describes stronger contrast for `strong` although both branches now use the same token. Update these explanations with their corresponding code corrections.

## Follow-up disposition

D1–D4 were reread after correction: exact guard exemptions and negative fixtures, translucent Modal overlay, dark unread dot, and active finder border/text weight are present. CodeBlock and Separator comments now match implementation; stronger separators use gold. No substantive findings remain open by code inspection. Added three regression cases in existing primitive, inbox and finder test suites; execution is delegated to the Docker gate and is not claimed here.

Additional bounded iOS review: ElevateoApp lines 14–22 and 73–82 (19 lines) apply inherited field/list/light-surface styles and a compact gold TextField boundary; ReplyComposerView lines 57–62 (6 lines) outlines the editor without changing bindings, validation or disabled state. These are plausible SwiftUI APIs for the existing deployment target; Linux cannot compile or visually verify SwiftUI. Final review denominator including these 25 lines: 1,300 lines; four substantive findings / 1.300 KLOC = **3.08 defects/KLOC**, all four corrected by inspection. Regression additions are author-owned verification, excluded from independent-review density.

## Rubric outcomes

- The colour-only feature diffs preserve handlers, authorization checks, null/empty/loading/error branches, message text rendering, and request boundaries. No API or persistence schema changes found.
- Shared tokens and platform theme mechanisms are appropriate; the extracted tag palette deliberately preserves stored user data. No new dependencies or speculative abstractions found.
- Status text/icons remain alongside distinguishable semantic colour. Gold text was replaced with ink; important focus rings are centralized in unlayered CSS.
- Android, Tauri, Avalonia and SwiftUI changes are surgical. The SwiftUI logo asset is registered with the Xcode resources phase. Compile/runtime confirmation remains required from platform gates.
- Guard tests include semantic happy path, disallowed palette/dark examples, and contrast checks; actual rendering checks are required because token tests cannot catch invisible indicators or selection ambiguity (D3/D4).
- Lint/format checks are delegated to the web gate. Documentation synchronization and screenshots were in progress during this review and are not certified here.
- Obsidian was reported unavailable by the coordinator; no connection-based tradeoff simulation was claimed. Dedicated architectural review is recorded separately by the coordinator.

## Coverage

All changed source hunks listed below were read, together with `styles/index.css` lines 111–165, the complete new `designSystem.test.ts` (60 lines), `tagColours.ts` (8 lines), and both iOS asset catalog JSON files (18 lines). The separate design reviewer owns index.css lines 1–110, Button and Badge. Binary logo visual verification belongs to visual QA. Some small contextual reads were repeated to resolve findings; repetitions are excluded.

The table gives new-side hunk starts/counts and reviewed added+removed lines. Findings count is **4 substantive defects** (plus two comment notes); the denominator includes both sides of the changed source, so this is review-density rather than repository defect density.

| File | Reviewed new-side hunks (start,count) | Changed lines |
|---|---|---:|
| apps/android/MainActivity.kt.in | 7,3, 16,6 | 10 |
| apps/ios/Elevateo.xcodeproj/project.pbxproj | 21, 37, 82, 159 | 4 |
| apps/ios/Elevateo/Sources/ElevateoApp.swift | 14,4, 40,26 | 30 |
| apps/ios/Elevateo/Sources/LoadState.swift | 25, 48,2 | 5 |
| apps/ios/Elevateo/Sources/MailboxListView.swift | 35 | 2 |
| apps/ios/Elevateo/Sources/ReplyComposerView.swift | 69, 99, 105, 112, 119, 126, 132 | 14 |
| apps/ios/Elevateo/Sources/SignInView.swift | 9,0, 16,4, 24, 37, 45, 51,0 | 14 |
| apps/ios/Elevateo/Sources/ThreadDetailView.swift | 47, 171, 177, 186, 191, 196 | 12 |
| apps/ios/Elevateo/Sources/ThreadListView.swift | 39, 137, 141, 151 | 8 |
| apps/native/src-tauri/src/lib.rs | 194,2 | 2 |
| apps/web/src/app/SearchBox.tsx | 46, 48, 62 | 6 |
| apps/web/src/app/Shell.tsx | 266,2, 271, 327 | 8 |
| apps/web/src/app/Sidebar.test.tsx | 63, 65 | 4 |
| apps/web/src/app/Sidebar.tsx | 48, 50, 91, 129, 159, 166 | 12 |
| apps/web/src/app/UserMenu.tsx | 32, 34,2 | 6 |
| apps/web/src/app/WorkspaceSwitcher.tsx | 89, 91,2, 95, 97, 107, 122, 126, 141, 147, 153, 156 | 24 |
| apps/web/src/dev/fixtureMain.tsx | 59 | 2 |
| apps/web/src/features/assistant/AssistantPanel.tsx | 245, 247,2, 272, 283, 295, 318, 335, 342, 346, 356 | 22 |
| apps/web/src/features/auth/AuthCompletePage.test.tsx | 90 | 2 |
| apps/web/src/features/auth/AuthCompletePage.tsx | 86,2, 100,2, 132 | 10 |
| apps/web/src/features/auth/SignInPage.sso.test.tsx | 62,2, 73, 160 | 8 |
| apps/web/src/features/auth/SignInPage.tsx | 131,2, 135, 260,2, 273, 277, 279, 290,2, 293, 400, 419 | 26 |
| apps/web/src/features/drafts/ComposeWindow.tsx | 27, 34 | 4 |
| apps/web/src/features/drafts/DraftAttachments.tsx | 66, 68, 81 | 6 |
| apps/web/src/features/drafts/DraftEditorPage.tsx | 335,2, 350,2, 395, 412, 441, 450, 461, 466, 468, 471,2 | 26 |
| apps/web/src/features/drafts/DraftsPage.tsx | 96, 105,2, 110, 127,5, 137,2, 145 | 24 |
| apps/web/src/features/email-finder/EmailFinderPage.tsx | 20, 110, 114, 120, 122, 129,2, 132 | 16 |
| apps/web/src/features/email-finder/FinderForms.tsx | 60 | 2 |
| apps/web/src/features/email-finder/FinderResults.tsx | 10, 17,2, 32, 36,2, 54, 56,2, 59, 68,2 | 24 |
| apps/web/src/features/help/HelpRoutes.tsx | 52, 101, 104,3, 143, 192,3 | 18 |
| apps/web/src/features/inbox/FolderNav.tsx | 61,2, 135, 148, 151, 159, 163, 205 | 16 |
| apps/web/src/features/inbox/InboxPage.tsx | 315, 319, 322, 340, 365, 377, 431, 433, 451 | 18 |
| apps/web/src/features/inbox/MessageRow.tsx | 1,2, 67,3, 82, 84, 94, 99,2, 103, 105, 107,2, 111,2, 189, 192,4 | 42 |
| apps/web/src/features/inbox/SnoozeMenu.tsx | 28 | 2 |
| apps/web/src/features/inbox/UnifiedInboxPage.tsx | 249,2, 252,2, 269, 277, 313,2, 321 | 18 |
| apps/web/src/features/members/AdministrationPage.tsx | 134, 138, 141,4, 146, 149,4, 163,2, 166, 172,2 | 32 |
| apps/web/src/features/members/MembersPage.tsx | 178, 199, 214, 233, 238, 243, 270, 272 | 16 |
| apps/web/src/features/members/PersonalSettingsPage.tsx | 132,2 | 4 |
| apps/web/src/features/outreach/CampaignRunsPage.tsx | 84,3, 90,5 | 16 |
| apps/web/src/features/outreach/ConsentEvidenceForm.tsx | 48,2, 53, 55 | 8 |
| apps/web/src/features/outreach/OutreachPages.tsx | 102,4, 135, 149, 182, 184, 220,7, 228, 249, 251, 309, 319, 322, 338,8, 362, 373,2, 384 | 66 |
| apps/web/src/features/outreach/RunComposer.tsx | 56,6, 64,2, 69, 71,2 | 22 |
| apps/web/src/features/outreach/SequencePage.tsx | 91,6, 98, 101,2, 109,2, 112 | 24 |
| apps/web/src/features/search/SearchPage.tsx | 110, 112, 118, 140 | 8 |
| apps/web/src/features/send/BouncesPage.tsx | 121, 127, 134,2, 138 | 10 |
| apps/web/src/features/send/SendReviewPage.tsx | 124, 127, 133,2, 139, 153,2 | 14 |
| apps/web/src/features/send/SendStatusPage.tsx | 272,2, 276, 282, 284, 290,4, 297,3, 302, 304 | 28 |
| apps/web/src/features/send/SuppressionsPage.tsx | 104, 110, 115,2, 118, 120 | 12 |
| apps/web/src/features/settings/ConnectionsPage.tsx | 254, 257, 311, 364, 369, 380, 385, 391, 398, 413, 511,2, 517, 530, 550, 568,2, 573,2 | 38 |
| apps/web/src/features/settings/DeveloperApiPage.tsx | 59,2, 119, 123,2, 147 | 12 |
| apps/web/src/features/settings/IntegrationsPages.tsx | 89, 93,2 | 6 |
| apps/web/src/features/settings/TagsPage.tsx | 20,2, 80, 87, 92, 145, 174, 180 | 21 |
| apps/web/src/features/settings/WebhooksPages.tsx | 70, 79, 83, 85, 152, 160 | 12 |
| apps/web/src/features/settings/WorkspacePages.tsx | 48,2, 172, 174, 230, 233 | 12 |
| apps/web/src/features/thread/AssigneePicker.tsx | 114, 118, 123, 125, 141,2, 144 | 14 |
| apps/web/src/features/thread/AssignmentPanel.tsx | 71,4, 76, 85, 101, 103 | 16 |
| apps/web/src/features/thread/NotesPanel.tsx | 131,5, 137, 144, 147,2, 156, 181, 183 | 24 |
| apps/web/src/features/thread/ReadStateControl.tsx | 45 | 2 |
| apps/web/src/features/thread/ThreadPage.tsx | 306, 308,2, 312, 321, 345, 352, 377, 389,2, 392, 403, 407, 410, 413, 425, 427, 436, 471,2, 477 | 42 |
| apps/web/src/ui/Avatar.tsx | 26 | 2 |
| apps/web/src/ui/BrandMark.test.tsx | 9,5, 16 | 10 |
| apps/web/src/ui/BrandMark.tsx | 1,2, 5, 19 | 14 |
| apps/web/src/ui/Breadcrumbs.tsx | 19, 21, 23 | 6 |
| apps/web/src/ui/Card.tsx | 9, 26,2, 42, 47,2 | 12 |
| apps/web/src/ui/CodeBlock.tsx | 1, 33, 44,2, 48,3 | 14 |
| apps/web/src/ui/Drawer.tsx | 38, 45 | 4 |
| apps/web/src/ui/Field.tsx | 1, 7, 24, 27, 29, 49, 54, 56, 60, 66 | 26 |
| apps/web/src/ui/GetHelpMenu.tsx | 21 | 2 |
| apps/web/src/ui/Menu.tsx | 156, 170, 189, 216, 223, 258, 262 | 14 |
| apps/web/src/ui/Modal.tsx | 1, 51, 56, 60, 62, 64, 66 | 14 |
| apps/web/src/ui/PageHeader.tsx | 30, 33, 51,2 | 8 |
| apps/web/src/ui/Pagination.tsx | 18 | 2 |
| apps/web/src/ui/Separator.tsx | 1, 5 | 5 |
| apps/web/src/ui/Sheet.tsx | 24 | 2 |
| apps/web/src/ui/Table.tsx | 17, 25 | 4 |
| apps/web/src/ui/Tabs.tsx | 7, 10,4, 85 | 12 |
| apps/web/src/ui/Text.tsx | 9, 13, 17, 21, 24 | 10 |
| apps/web/src/ui/Toast.tsx | 67,2, 71, 74 | 8 |
| apps/web/src/ui/Tooltip.tsx | 1, 30 | 4 |
| apps/web/src/ui/primitives.test.tsx | 101, 104, 111,2 | 8 |
| apps/windows/src/Elevateo.Windows/App.axaml | 4,13, 18,31 | 47 |

Initial changed-line denominator: 1134. Additional explicitly reviewed source: 141 lines. Initial denominator: 1275 lines. The follow-up iOS review adds 25 lines, for a final denominator of 1300 lines and 3.08 substantive defects/KLOC. D1–D4 and comment notes are resolved by inspection; Docker regression execution remains with the coordinator.

## Final bounded supplement

Read-only review coverage: `apps/web/e2e/design-system.spec.ts` 1–114; `docs/design-system.md` 1–52; `apps/windows/src/Elevateo.Windows/App.axaml` 1–50; `apps/ios/Elevateo/Sources/ElevateoApp.swift` 1–79; `apps/web/playwright.config.ts` 1–28. Each review batch contained fewer than 200 source lines. This supplement reviewed 271 source/config lines plus 52 documentation lines, with overlap against earlier coverage; it does not change the earlier 1300-line denominator. New confirmed defects: 0 (0/KLOC for this supplement). No tests were executed by this reviewer.

- Browser coverage includes all requested named screens and empty/loading/error states, with desktop 1440 and narrow 390 projects available. Five fixture screens explicitly emulate an OS dark preference. Screenshots are artifacts for human inspection, not screenshot baseline assertions. Overflow and light-scheme assertions are actual checks.
- The suite does not click approve, send, cancel or discovery controls. Known exercised API routes are synthetic, and unknown v1 routes return a synthetic 404. It does not implement a general external-network deny policy, so this is an inspection of the current flows rather than a universal no-network guarantee.
- Rendered axe contrast runs only when `ELEVATEO_AXE_SCRIPT` is set. Without it, passing checks establish root token ratios only. Those ratios cannot establish composed element contrast, focus contrast on every surrounding surface, or disabled/opacity behavior. Executed evidence must identify axe-enabled runs; zero violations does not imply zero incomplete/manual-review results. Documentation correctly states token checks alone are insufficient.
- Avalonia tradeoff: application resources and broad styles provide a surgical centralized palette without editing existing functional view work. More specific Fluent pseudo-state/template selectors and local values can override broad styles; the selected-item template selector is deliberately more specific. Resource/build validation cannot establish hover, focus, disabled and selected rendering on Windows. Keeping the native Fluent interaction behavior is preferable to replacing templates without visual validation, but native visual acceptance remains unverified.
- SwiftUI tradeoff: environment-level styles consistently reach descendants while preserving bindings, actions and disabled semantics. Custom styles replace automatic button appearance (including any future destructive role treatment), so future role-bearing controls need explicit danger styling. A source search found no current `role:` declarations in iOS Sources. The field style uses SwiftUI's custom TextFieldStyle hook, and root list/background modifiers are plausible for the configured modern SDK; Linux core tests cannot compile or prove the SwiftUI result. No new state ownership or networking was introduced.
- Design documentation accurately distinguishes platform mechanisms and limits, keeps gold out of body text, preserves status meanings, and specifies updating native mirrors with CSS tokens. Its token table and guard claims align with the previously reviewed contrast tests and token enforcement.

## Encoding regression follow-up

Coordinator gate6 reported one failure among 1211 tests caused by mojibake in the finder loading labels. Restored four original Unicode ellipses in `EmailFinderPage.tsx`. Auditing every added line of the full tracked diff against its removed baseline identified eleven further newly corrupted sequences: `ElevateoApp.swift` (1), `MessageRow.tsx` (5), `CodeBlock.tsx` (2), `Modal.tsx` (1), and `documentation.md` (2). Restored their original ellipses, section signs, en/em dashes and middle dots using explicit UTF-8 byte decoding/writing. The three regression-test diffs contained no such corruption. A subsequent full added-diff scan found no remaining mojibake markers. No host tests were run; the coordinator owns the Docker rerun.

This is one additional confirmed encoding defect affecting fifteen occurrences, fixed by inspection. Including this later finding, the earlier 1300-line review sample has five substantive defects, or 3.85 defects/KLOC; its denominator is unchanged. The previously reported four-defect density describes the initial review, not the final defect count.

## Browser harness execution follow-up

The visual-QA worker's execution exposed two harness defects that the initial static pass missed: the draft-actions capture targeted a review link unavailable to that fixture's capabilities, and the empty-inbox case used `view=archive` rather than the application's `filter=archive` parameter. The worker corrected the selector to the existing `Save changes` button and the URL to `filter=archive`. Neither correction clicks a mutation control or changes application code. Readiness assertions remain mandatory, so the earlier failures were visible rather than silently capturing the wrong screen.

Reviewed the final `apps/web/e2e/design-system.spec.ts` lines 1–116 in one bounded batch, including both corrections and persistence of axe results to a JSON file before asserting violations. Cross-checked the archive parameter and saved-draft button label against their application declarations. Screenshot output creates the test output directory before JSON persistence; output names are static and per-test, and write errors propagate. The existing optional-axe and manual-inspection limitations still apply. No further confirmed issue was found. The visual-QA worker owns the subsequent Docker rerun and image inspection; this reviewer did not run tests.

Separate harness metric: two confirmed defects / 116 reviewed source lines = 17.24 defects/KLOC, both corrected by inspection. This is a separate overlapping sample and does not alter the application-review denominator or defect count above.

Final harness revision reviewed in one 120-line batch: four additional lines center the finder `Start lookup` and send-status `Cancel before dispatch` controls and save viewport screenshots. They do not click or invoke either action. The original full-page capture and axe checks still run first; the two extra viewport images add inspection evidence without claiming separate axe checks. The AIDEV anchor remains intact and a Unicode-corruption marker scan found no matches. No new defect; the expanded separate harness metric is two / 120 lines = 16.67 defects/KLOC. Execution and visual inspection remain assigned to the visual-QA worker.

## Existing browser assertion alignment

Reviewed `apps/web/e2e/read.spec.ts` lines 320–362 (43 lines) and `apps/web/e2e/sso.spec.ts` lines 20–39 (20 lines), 63 source lines in one bounded batch. The swatch assertion now requires zero decorative transition, and the keyboard-focus assertion requires the measured semantic gold while retaining the width/style checks and negative blurred-heading control. The synthetic animation still proves the reduced-motion override and is no longer described as an application Skeleton. No functional defect found. One comment defect remained: the reduced branch still claimed both properties animate without reduced motion despite the swatch now being static. The visual-QA worker corrected it to distinguish synthetic animation from the static swatch; the correction was reread. Separate sample: one documentation defect / 63 lines = 15.87 defects/KLOC, resolved. No application behavior changed and no tests were run by this reviewer.
