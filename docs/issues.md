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

Correction: initial Windows overlay staging lost executable modes on four scripts; canonical indexed modes restored in follow-up. One artifact defect found and fixed, no runtime pass implied. Archive SHA-256 verification is recorded separately in int401-archive-verification.json. Source review and dedicated design/provenance advisor results remain pending with root; do not treat import as review of all application code.


## INT-401 followup corrections

INT-401 bounded repair (2026-10-14): restored canonical BE02 compose.yaml, 37 nested BE01 tooling files, three evidence-script dependencies and eight Backend Performance docs. 629 overlay hashes match; 63 static dependency checks leave one inherited frozen-manifest hash conflict, plus scripts/dev seed/check name absent Compose services. Linus ADV-729 reviewed 172 source lines, confirmed two integration defects (11.63/KLOC); repairs are statically observed, independent re-review and all runtime/visual checks remain pending. Application IN PROGRESS; root owns testing and GitHub issues. See docs/completion/int401-repair.md.

R3 actual log reports `PG::InsufficientPrivilege: ERROR: permission denied for database postgres` at CreateAppDraftsOperations#up, during CREATE SCHEMA app_drafts_private AUTHORIZATION elevateo_owner. This is a database CREATE privilege failure at schema creation; Rowan must establish the correct minimal repair and regression. Cassian restores provenance only. Root creates GitHub issues; no external issue writes by Cassian. Fleet model startup failed for five jobs; root owns compatibility/relaunch, not an application failure.


## INT-401 versioned tool followup

INT-401 current-tools followup: new versioned BE01 runner authenticates 43 current dependencies, preserving all frozen records unchanged. POSIX/PowerShell dev commands are bootstrap/up/migrate/stop; unsupported seed/check removed. ADV-729 preceding independent review: 68 unique LOC, 0 new repair defects (0/KLOC), 2 inherited blockers (29.41/KLOC). Followup independent review and fleet Docker tests pending; application IN PROGRESS.

Created issue roster: #10 INT-401 Cassian OFF-401; #11 OPS-402 Soren OFF-402; #12 BE-403 Rowan OFF-403; #13 QA-404 Elara OFF-404; #14 FE-405 Mira OFF-405; #15 RES-406 Nadia OFF-406 (https://github.com/tanzeel-roseyco/elevateo-mail/issues). Root owns issues and testing. Five workers execute in named SSH-backed Orca terminals on fleet-02, supervised through append-only report/control files. Task-local Codex 0.160.0 model probe succeeded READY exit0 after 0.156.1 rejected gpt-6.1-sol; LOW/service_tier fast requested, billed tier not audited. Base c3ecd1f integrates all five lanes. Windows REA failed unsupported_provider (macOS utilities required); root uses supported Orca Computer Use with distinct evidence claims. No further ultrareviews/paid Devin. Root-owned Obsidian vault untouched. See docs/completion/int401-current-package.md.
