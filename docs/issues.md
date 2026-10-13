# Wave responsibility and issue ledger

Status: IN PROGRESS; unified source checkpoint is untested.

| Owner | Responsibility | State |
| --- | --- | --- |
| Cassian OFF-401 / INT-401 | Preserve histories and staged/unstaged layers; integrate canonical source; provenance and policy | Overlay authored; archive capture in progress |
| Soren | fleet-02 mutation lease, container checks, isolated live/test Supabase | Root coordinates remote CLI transfer |
| Rowan | Backend correctness and migration repair | R3 cannot create app_drafts_private; unresolved |
| Mira | Frontend integration and actual visual QA | Requires unified baseline |
| Elara | Acceptance tests and truthful evidence | Requires fleet scheduling |
| Nadia | REA runtime/deliverability research | Independent preparation |

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
