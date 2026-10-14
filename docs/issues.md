# Wave responsibility and issue ledger

Status: IN PROGRESS; unified source checkpoint is untested.

| Owner | Responsibility | State |
| --- | --- | --- |
| Cassian OFF-401 / [INT-401](../.planning/wave-20261014/INT-401.md) | Preserve histories and staged/unstaged layers; integrate canonical source; provenance and policy | Baseline b0d73327 committed; archives captured |
| Soren / [OPS-402](../.planning/wave-20261014/OPS-402.md) | fleet-02 mutation lease, container checks, isolated live/test Supabase | Root coordinates remote CLI transfer |
| Rowan / [BE-403](../.planning/wave-20261014/BE-403.md) | Backend correctness and migration repair | R3 cannot create app_drafts_private; unresolved |
| Mira / [FE-405](../.planning/wave-20261014/FE-405.md) | Frontend integration and actual visual QA | Requires unified baseline |
| Elara / [QA-404](../.planning/wave-20261014/QA-404.md) | Acceptance tests and truthful evidence | Requires fleet scheduling |
| Nadia / [RES-406](../.planning/wave-20261014/RES-406.md) | REA runtime/deliverability research | Independent preparation |

No application tests, builds or lint checks have run for INT-401. Root approves integration; Ada ADV-714 reviews design/infrastructure and Linus ADV-729 reviews provenance. Detailed assignments live under .planning/wave-20261014.

## Preservation and decisions

- Local Completion d2de43b remains the base, acceptance tests and docs/completion authority.
- Fable FE01 R1 working apps/web is canonical, including generated API declarations.
- BE02 Codex working apps/server plus ops and scripts is canonical; preserve paired tenancy signatures/tests.
- Backend Performance working ops/perf is canonical; archive staged and unstaged patches separately.
- BE01 R1 unique ops/tests/be01-services and ops/tools/be01-* are retained.
- BE02 Auth differs in 17 files per Linus audit; do not overwrite the selected Codex tenancy implementation.
- BE01 Repair HEAD is unavailable; no destructive repair attempted.
- Contract schema/fixtures match; BE02 omits three contracts/tooling files retained from base.
- Older prototypes remain in preserved histories and ignored source snapshots rather than blanket overlays.

Evidence: docs/completion/int401-overlay-manifest.json; ignored .local-audit/INT-401 manifests, binary patches and source snapshots; refs/preserved/int401/*. Snapshot capture and archive verification are separate from runtime acceptance.

Archive capture completed for 19 Git checkouts (18 available HEADs) and 12 source exports without Git metadata. See int401-preservation-manifest.json for original revisions and separate patch hashes. Broken BE01 Repair contains only .git and no working source; preserve its error, do not repair. Original sources/runtime data remain untouched. Export results-* directories are omitted as runtime evidence, retained in originals. Archive helpers encountered Windows long-path limits on runtime exports; excluded runtime directories and used extended paths for source capture, then completed successfully.
