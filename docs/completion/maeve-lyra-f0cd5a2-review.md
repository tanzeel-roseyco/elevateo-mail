# Maeve bounded review: Lyra assignee picker

Target: `completion-lyra-fe808` exact `f0cd5a2b837d1ea484c4f04f3934b7561616ee93` over `7380436b`; the latter introduces the picker over its parent. Reviewer runtime identity: Codex `gpt-6-sol` from Orca worker-show. This is static source review only; no host or fleet application test was run by Maeve.

## Coverage

| Versioned source | Lines read | Why |
| --- | --- | --- |
| `apps/web/src/features/thread/AssigneePicker.tsx` at `f0cd5a2b` | 1–156 | complete picker state, request, paging and render |
| `apps/web/src/features/thread/AssignmentPanel.tsx` at `7380436b` versus its parent | changed diff hunks around 1–16, 25–26, 58–78, 95–119, including removed typed UUID UI | integration with existing assignment action |
| `apps/web/src/features/thread/AssigneePicker.test.tsx` at `f0cd5a2b` | 51–104 | unavailable, opt-in paging, retry and mailbox late-reply cases |
| `AssignmentPanel.tsx` at `f0cd5a2b` | targeted `ids`/`useId` references at 5, 28, 71–72 | ruled out an apparent unused-ID concern |

Core reviewed code: 156 picker LOC + 39 changed AssignmentPanel LOC (including removed parent code) + 54 test LOC = **249 LOC**. Approximately 20 unchanged context/reference LOC were also read, giving about **269 unique versioned code LOC**, below the 280 target; every read was at most 180 LOC. The full test setup at lines 1–50, context-change test at 105–132, option port implementation/validation, and unchanged assignment mutation body were omitted for a separate bounded reviewer. The final commit itself changes three picker lines; those lines were included.

## Result

**Zero confirmed defects in 249 covered core LOC: 0 defects/KLOC.** Source shows the directory opens only on an explicit click, requests a 50-item page with a cursor, deduplicates returned user IDs, rejects a non-advancing cursor, and renders only ID-based labels. The prior arbitrary typed UUID field is removed. The picker invalidates and aborts pending reads on mailbox, session actor/org/context/version or port availability changes; an epoch check ignores late replies even if transport ignores abort. A disappeared port shows a visible unavailable message. Loading, empty, error/retry and close controls are present, with status/alert roles for loading/errors. AssignmentPanel still calls its original `assign` function with the selected ID, so the unchanged V1 write path remains the revision authority; this review did not independently inspect that path or its conflict test.

The design keeps the option list as a separate opt-in read rather than bundling PII or inferred names/roles into assignment. It delegates page DTO validation to the adapter and keeps a scope check at the component seam. This division is reasonable for the current feature; the omitted port must be reviewed to prove UUID format and page bounds at runtime. No null/empty/max-limit bug was confirmed within the reviewed component: `actorId` and `currentAssigneeId` accept null, empty page is explained, and the request limit is fixed at 50. Large multi-page lists could grow in component memory; no product maximum or observed bottleneck is established here.

Tests in the reviewed subset cover unavailable port, opt-in and paginated happy path, empty/error retry, and late mailbox reply. The omitted 105–132 section must be checked separately for authorization-context and port-disappearance assertions. Runtime UI, accessibility behavior and assignment revision conflicts remain unverified by this source review. No acceptance or release claim follows.
