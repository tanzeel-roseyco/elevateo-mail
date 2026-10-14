# Mira OFF405 R10 / ADV782 — raw recipient regression repair

IN PROGRESS / source authored, runtime NOT_RUN, independent source/design review PENDING. No application tests, builds, Docker or dependencies executed.

Exact parent e88273b6a838413acc18aa22545cf8638bb3e326, canonical ancestor 94d32db7fa6d626be371361ec01d055a5f497dbb. New fix/mira-r10-raw-reversion worktree preserves original mira HEAD1fae, untracked assignment and R9 worktree/history. R9 accepted source ADV779289LOC0 / ADV780186LOC0, 146 changed LOC remains intact; R9 runtime NOT_RUN.

Read actual ../reports/soren-r8-frontend/gates/unit.txt first (the checkout-relative path was absent). Actual 31 files:30 PASS/1 FAIL;623 cases:621 PASS/2 FAIL. Padding and blank-line cases fail at line801 waiting for unloadfalse after explicit displayed-text reversion; no save occurred. This is historical R8 evidence, not R9/R10 verification.

Observed source chain: shared seed includes null/null then named recipient. formatRecipients renders null/null as empty first line. parseRecipients drops empty lines. Changing To updates both exact raw text and parsed buffer.content.to; displayed-text reversion does not restore null/null in buffer.savedContent.to. isDirty compares arrays exactly, isDraftIntentDirty also compares raw text, write-through retains dirty intent, provider correctly keeps its existing beforeunload registration. Thus the failing cases were not raw-only and their expected clean canonical fixture was incorrect. No swallowed state or registration-removal defect identified by source inspection.

Minimal repair changes only focused test file: each raw-only case removes the null/null entry from its own freshly created harness before render and asserts parse/format equality to that saved baseline. Assertions for raw guard, no save, exact listener removal, retained formatting after save and explicit reversion remain. New regression uses unchanged shared seed: displayed-text reversion still changes normalized recipients, remains dirty/guarded and leaves server array untouched; confirmed save advances version, but old raw blank line stays guarded until explicit canonical reversion. Product source, shared seed, actor/logout purge, reload notice and durable recovery unchanged. F2 OPEN; no durable recovery claim.

Review assignments (full INT-401 rubric; root assigns independent source and dedicated design review):
- A: DraftEditorPage.test.tsx785-822 (38), draftIntent.tsx20-28 (9),77-97 (21), DraftEditorPage.tsx154-162 (9),365-381 (17), draftOperation.ts63-84 (22), collaborationState.ts95-110 (16),139-146 (8), test47-58 (12):152 physical LOC including bounded baseline context.
- B: DraftEditorPage.test.tsx824-854 (31), draftIntent.tsx20-28 (9),77-97 (21), DraftEditorPage.tsx154-162 (9),365-381 (17), draftOperation.ts150-159 (10), collaborationState.ts95-110 (16),139-146 (8), test47-58 (12), test735-740 (6):139 physical LOC. Aggregate291<=400; shared context overlaps nonadditive. Changed source38 (37 additions/1 removal), reviewed coverage/defects/density pending.

Future Soren-only gates: exact integrated focused DraftEditorPage unit suite then normal frontend gates; preserve current independent jobs/cleanup, no rerun94d requested. Root batches R9+R10+Rowan after reviews. New source predicts one additional test (no runtime count claimed). Static git diff --check and bundle verification recorded in external immutable receipt.

Requested gpt-6.1-sol/low/Fast/YOLO; actual GPT-6-based Codex session, exact model/effort/billed tier not independently attested. Approval policy never/unrestricted filesystem. Only owned project obsidian append; actual vault root-only. No live mail, release, paid resources or tests here.
