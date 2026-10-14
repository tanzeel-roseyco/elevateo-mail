# INT-401 source handoff

Status: source preservation/integration complete; application IN PROGRESS and UNTESTED.

## Observed evidence

- First unified baseline: b0d73327ed8f9c6dc033d65102f8107d1ecc9e33; executable-mode correction: 1b6269fb97cde180af614a6514fead4789c167d5.
- 19 Git checkouts captured, 18 valid HEAD refs preserved, 12 no-Git source exports captured.
- 45,507 source-file entries verified against SHA-256 manifests; zero mismatches.
- 580 final overlaid source files verified against selected source hashes; zero mismatches.
- Three canonical generated API declarations match; OpenAPI and fixtures match. Three tooling files absent from BE02 retained from base.
- Original 100755 executable modes restored on four paths. One artifact defect found/fixed; code review coverage is not claimed.
- Source-only bundle verified by Git as complete history; no prerequisite commits needed.
- Original checkout files/indexes untouched by capture. BE01 Repair has no resolvable HEAD and only .git; not repaired.

## Deliverables and responsibility

Fresh branch: integrate/cassian-unified in Cassian 20261014 checkout. Root integrates this branch and mirrors obsidian.md. Ignored bundles are under .local-audit/INT-401; use unified-ready.bundle from the latest follow-up rather than the initial baseline. preserved-histories.bundle retains source HEAD histories; per-checkout archives retain separate binary staged/unstaged patches, Git index modes, untracked classifications, snapshots and hashes. Follow int401-preservation-manifest.json and int401-overlay-manifest.json for provenance.

Six linked tickets and branch ownership are in AGENTS.md and docs/issues.md. Soren alone schedules fleet container jobs. Rowan repairs R3 private schema creation. Mira and Elara own frontend and acceptance/actual visual checks; Nadia owns runtime research. Root was asked to route dedicated Linus provenance and Ada design review; their results are pending.

## Limits and retained artifacts

Application lint, typecheck, unit/integration tests and UI validation are NOT_RUN for this baseline. No local dependencies/builds/Docker resources were created. No live sends, warmup, account or DNS activation; no public release. Snapshot hash checks and Git bundle verification are archival checks only.

A failed initial no-Git export capture copied part of results-fe01r10 into ignored audit storage before source-only filtering was corrected. Automatic approval review rejected removal of that exact task-created runtime copy (stated reason: blocked by policy); it remains under .local-audit/INT-401/folder-Elevateo Mail - FE Validation 20261012-r10/snapshot/results-fe01r10. It is outside the source manifests/bundles and not committed; original evidence was never deleted. No cleanup retry or broad prune was attempted.
