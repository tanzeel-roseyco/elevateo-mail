# FE-405 attempt5 — draft validation accessibility

IN PROGRESS, source authored and independently reviewed; runtime NOT_RUN.

Mira owns apps/web only. Exact frozen Cassian837e668 was fetched from its verified bundle into preserved refs and merged with9a0f75c as231d35d, preserving both parents. Both documentation histories were retained. No canonical contracts or generated types changed. Latest task_b9e0ccc5f6a3/ctx_a9df73deec58 authorization accepted; its newer frozen source receipt was not yet present when this patch was prepared.

Observed in source: all three draft controls set aria-invalid, but Subject had no error description and To/Message referenced hints only. The patch connects conditional error IDs already rendered by Field. Corrected values remove error references; hints stay present. No shared Field abstraction was needed for three fixed controls. Save validation, domain state, owner retention, gateway calls and authorization remain unchanged. No extra validation or hot-path loops added.

Regression: all three controls exceed their existing maximum, reference their rendered alert, disable saving, then accept empty correction and remove stale description IDs. To/Message retain hints. Save becomes enabled and no gateway save occurs. Empty draft contents remain permitted by the accepted contract; this introduces no sending feature.

Independent source review SPEC-40505 and dedicated practical design SPEC-40506 each reviewed editor356–386 (31), test277–302 (26), Field7–17 (11):68 unique physical LOC,0 confirmed defects,0/KLOC per assignment. Full user rubric checked: purpose, null/empty/max, state effects, scope/complexity, names/duplication/comments, meaningful regression, docs, input/auth and performance. Context inspection does not imply expanded coverage. Review agents ran no tests. Changed implementation is3 lines; new test26 lines. Formatting remains subject to fleet ESLint, not manual lint claims.

Soren requested exact immutable source gates: npm run check:api, npm run lint, npm run typecheck, npm test -- src/features/drafts/DraftEditorPage.test.tsx src/features/inbox/InboxPage.test.tsx; full frontend coverage/build if serialized budget allows. Use the existing isolated frontend container procedure and record separate exits and exact cleanup. No host tests/build/dependencies or worker Docker used. git diff --check is source whitespace inspection only.

Elara was asked promptly via append-only inbox for isolated frontend scope, excluding QA infrastructure. Actual diagnostic targets: login→inbox→search→new draft; keyboard focus on invalid Subject/To/Message must announce the corresponding error while To/Message retain their hint; correction must clear the error; 375x812 and1440x900, light/dark. Actual screenshots/accessibility tree/keyboard and performance findings must carry integrated SHA, viewport, steps and evidence paths. Browser, assistive technology and performance claims remain unverified. Prior5ec1851 test and bundle measurements are historical only.

No observer, fixture runner, QA infrastructure, backend, contract or transport edits. No live mail or release. Root mirrors canonical obsidian.md; local vault untouched.
