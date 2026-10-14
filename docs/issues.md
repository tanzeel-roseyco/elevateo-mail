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


## RES-406 evidence and responsibility ledger (2026-10-14)

Nadia OFF-406: official-document research and practical original mailroom proposals complete for documentation checkpoint; runtime/independent acceptance IN PROGRESS. Source baseline observed c3ecd1f. Root owns missing REA skill supply, sanitized Accounts/Unibox/Gmail evidence, integration approval and review assignment; Mira/Rowan own proposed UI/backend slices, Soren all container execution, Elara acceptance. Details and sequenced proposed tickets: [research report](research/instantly-gmail-rea.md). No GitHub child issues created. Correction: requested REA conformance cannot be claimed without skill content; authenticated Copilot is coordinator-reported, not independently inspected. Provider quotas/account consent history remain unknown. No tests/builds/installs/mail performed by Nadia.


RES-406 continuation correction (2026-10-14): skill supplied/read, historical missing-skill blocker resolved. Partial root Orca Accounts semantic observation received; native macOS provider unavailable on root Windows and separate Chrome launch automatically rejected, no bypass. Full runtime/Gmail coverage, independent review, application verification and root Obsidian mirror remain pending. MailroomGateway/routes source mapping reveals no health/consent/suppression/send API; contract and scenarios are proposals for Mira/Elara/Rowan, not implemented capabilities. Primary citations reopened by Nadia; no tests/builds/live mail. See research continuation history and citation audit.
