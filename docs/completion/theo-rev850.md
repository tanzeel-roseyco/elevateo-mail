# REV850 Tessa seeded visual fixture source review

Exact owner commit: `e567213e8dbdc2521d0b77b6ec7eb7806244c17c` in `completion-tessa-qa816`. Cassian `e54ba5e` and `1bbee7e` have visual-spec blob `a8c3000d601d769398eac06d78e2db348db3c45c`, which differs from Tessa's `be23c68714534b19333f6fdd8a4a0ea053cfd308`; the integration version was not source-reviewed here, so exact transfer needs a focused delta check. Reviewer identity actually reported by Orca: Theo, Codex `gpt-6-sol`, local source-review terminal, dispatch `task_5d28310540df` / `ctx_d21032a18f03`; billed tier unverified. No Docker, app tests, browser, network service, live credentials, or mail operation was run.

## Exact source-read ledger

Each read was at most 180 lines. Unique versioned source inspected: **348 LOC**, below the 350 task cap and 400 hard cap.

| Exact `e567213e` path | Inclusive lines | Unique LOC | Purpose |
| --- | --- | ---: | --- |
| `apps/web/e2e/visual-states.spec.ts` | 1–105, 160–210, 360–480 | 277 | Changed fixtures, hostile ready oracle, matcher and capture flow; exact diff first |
| `apps/web/src/data/contract.ts` | 300–345 | 46 | Assignment and notes DTO validation |
| `apps/web/src/features/thread/NotesPanel.tsx` | 130–146 | 17 | Ready/no-alert text and region semantics |
| `apps/web/src/features/thread/AssignmentPanel.tsx` | 77–81, 85–86 | 7 | Unassigned text and named region |
| `apps/web/src/features/thread/ThreadPage.tsx` | 162 | 1 | Singular message count label |

The targeted commit changes 19 added and 4 removed source lines in the visual spec: **23 changed LOC, 0 confirmed defects, 0/KLOC**. The 348 LOC are review context, not 348 changed LOC; overlapping diff lines are counted once. `rg` location listings and owner prose were navigation/evidence, not additional code review coverage.

## Assessment

**Tessa owner source review passes with no confirmed defect; integrated source and runtime are unverified.** The thread-detail regex now ends at the ID, so assignment and notes subresources cannot consume a thread-detail reply. Their dedicated route predicates still match query-string requests because matching uses `URL.pathname`; route setup occurs before navigation. Empty assignment (null assignee, version 0, null timestamp) and notes (empty items, null cursor) match the strict DTO fields. The ready hostile scenario now gives one message and `message_count=1`; default and cursor cases derive a noncontradictory count from fixture length and whether a further page exists. `Unassigned`, `No notes yet.`, and the singular count verify both panels reached ready state; zero region alerts guards against error screens before capture. The hostile script remains rendered as text, with script/img/iframe absence checked. The scenario runs in light and dark for each admitted project, including narrow viewport; the reduced-motion project deliberately uses representative rows.

No new production state, authorization, API implementation, duplicated domain rule, hot-path query, or external-input surface is added by this fixture-only patch. Function and matcher names communicate intent; comments explain prior wrong-route and screenshot failures. The fixture tests include ready, empty, loading and error paths in the surrounding scenario set. Owner documentation records the earlier failed eight screenshots and labels this repair source-only. Source inspection cannot prove rendered screenshots, absence of overflow, actual route timing, or real-auth browser acceptance. Soren must execute the exact integrated descendant in fleet Docker and Tessa must inspect its new private PNGs; earlier `f210b5bf` images remain failed-ready evidence.
