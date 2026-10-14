# INT-401 bounded source repair

Status: requested restoration complete; application IN PROGRESS, independent repair review and runtime/visual checks pending.

## Source and dependency evidence

Restored one BE02 Codex compose.yaml, 37 BE01 R1 nested tooling files, three BE01 evidence-script dependencies and eight Backend Performance docs/perf-01 files. Original files remain untouched. Manifest records exact path/source/SHA-256; 629 overlay hashes match. Existing canonical frontend API/identity files were not replaced. Corrected .audit-integrate.py to select ops/tools top-level be01-* roots, including their descendants; file scopes now include Compose and performance documentation. A committed copy is int401-source-overlay.py, an offline provenance helper, not an application runtime or acceptance test. It was not rerun across the full tree during this repair.

63 static dependency checks: all audited manifest/Compose paths exist; one historical hash mismatch remains. ops/tools/be01-services-tools/package.sha256 expects be01-services/package.sha256 hash 3044a0e2df4daa6cf5372e1edd90c609f5ed9d91a2b874842e97710d09694787; canonical original now has ad4773807748c99d23c763f2a6203a4cde276c68cca09ea6f9f030380252235d. Those two original package snapshots cannot both authenticate the same file. Preserved both records without rewriting their expected evidence. Root must choose paired tool-version strategy before that historical runner can pass. Canonical scripts/dev also names seed/check services absent from canonical Compose; restoration resolves its missing file, not every inherited lifecycle behavior. No domain/auth/tenancy code was changed.

## R3 and design reconciliation

Actual R3 026-migrate.log line 91 executes CREATE SCHEMA app_drafts_private AUTHORIZATION elevateo_owner; lines 99-111 report PG::InsufficientPrivilege: ERROR: permission denied for database postgres in CreateAppDraftsOperations#up. Database CREATE authority, not access to an existing private schema, is the observed failure. Rowan owns minimal role/ownership repair and regressions. Historical acceptance did not run to completion. Root owns testing strategy: real login/mailbox/thread/draft/reload; tenant and session invalidation; draft conflict/lost ACK; private Storage isolation and restore. Ada's hash/contract versus lifecycle distinction is preserved.

## Review accounting and routing

Linus ADV-729: 172 source LOC, two confirmed integration defects, 11.63 defects/KLOC. Narrow scope only, no whole-app review claim. Both restored/corrected; independent repair re-review pending. Ada ADV-714 dedicated design advice received, no additional measured LOC/defect count. See code-reviews.md. Root creates GitHub issues.

All five fleet jobs failed model startup (HTTP400 gpt-6.1-sol unavailable under old CLI/account); root fixes compatibility before relaunch. Actual SSH-backed terminals: Soren term_84ff2389-6b75-487c-a6bd-26332aaab8ee; Rowan term_f6e2b920-a4cd-4d3a-8efa-57650fb24560; Elara term_ce5b29e8-eeb6-4369-8dc6-4bd64002dacd; Mira term_13c1ee6d-bc7e-47b2-9a70-c8a6a331b99c; Nadia term_8412c601-dcfd-407e-981d-47f2a479eb11. Manual report/control supervision, no remote Orca dispatch claims.

## Records and transfer

Mirrored root vault obsidian.md verbatim into project obsidian.md with the prior Cassian record appended and latest repair notes; vault untouched. No local app tests/builds/install or Docker mutations. Ignored partial runtime copy retained; no cleanup retried. Incremental bundle .local-audit/INT-401/unified-incremental.bundle excludes prerequisite d2de43b438ad9fb5f003d3e808a6181dbd827632; recipient must already possess that commit. Final clean SHA and actual bundle size/verification are supplied through coordinator messages.

Commands: source-only copy/hash inventory using Python; Git mode comparison against original ls-files --stage (zero additional executable modes required); git diff --check; git commit; git bundle create/verify. These are source/artifact checks, not application tests.

Vault mirror source SHA-256: 8c3f23f3faa77245d0396bfcc13a23c5f6fe653e9d4cc29533d21c28a3d8594e
R3 log SHA-256: bf3f3fadef2e7e55d5400bc05e85939f3af553f423b706e48a92f076966db1b1
