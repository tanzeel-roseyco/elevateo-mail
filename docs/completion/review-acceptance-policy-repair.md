# Bounded acceptance policy repair review

Task `task_d689227fb055`; dispatch `ctx_c73aaa6b1fa1`; 2026-10-14.

Verdict: no confirmed defects in the assigned ranges under the supplied caller contract. Runtime **NOT_RUN**. This is source review, not application acceptance or an all-runner guarantee.

Reviewer identity: Codex, GPT-6 family as identified by session instructions. Exact deployed model variant and reasoning-effort setting are not exposed to this worker; no Astra or effort-level attestation is claimed.

## Coverage and identity

All implementation paths below are relative to `C:/Users/Tanzeel/Code and projects/Elevateo Mail - BE02 Codex`. SHA-256 values were checked before source inspection and rechecked before report creation; all matched the supplied pins.

| Pass | File | Inspected physical lines | Reviewed LOC | Whole-file SHA-256 |
| --- | --- | --- | ---: | --- |
| 1 | ops/tests/be02/acceptance_cleanup.py | 1–123 | 123 | 9a5996ccd0224fa412b803d033be4660ab1830cc684d9d06d6d3f243eede29da |
| 1 | ops/tests/be02/test_acceptance_policy.py | 1–72 | 72 | eab59f7ae46ed466b2580042f3af8fa4d18968b84c9823254b12689586127410 |
| 2 | ops/tests/be02/test_finalization.py | 1–42, 118–147 | 72 | 803c1e9b138d9380e1562f0d3bcf1a3a015b1ff5096dac3c301a19f393d3670c |
| 3 | ops/tests/be02/run.py | 37–81 | 45 | 9b739d525d2d8913adfa0fa70c49a3e36c5359c58b69e384fe9e3fda68399df1 |

Pass sizes: 195, 72, 45 physical lines; 312 unique implementation/test lines total. Whole-file line counts are respectively 123, 72, 161 and 205; unassigned lines were not inspected. Line 147 of test_finalization.py is only a method declaration, not reviewed coverage of that test's body.

Context: applicable root AGENTS.md and both projects' .planning/STANDARDS.md; supplied review rubric and dispatch contract; docs/completion/acceptance-runtime-repair.md. Broad project README/state/documentation output was truncated and is not claimed as fully reviewed. No nested AGENTS.md was found beneath the BE ops directory.

Public engine fixture `ops/local/acceptance-preflight-20261014/inspect-policy.json` in the coordinator root matched SHA-256 `482060f8ddbcc7c7ebaf20c0c600457e0942cec3910aa4550819384527e060a0`. Its reported colon-form enabled privilege option, inline JSON seccomp, tmpfs string, 3 GiB memory, 2 CPUs, 512 PIDs and 1 GiB shared memory align with the browser policy. This is supplied fixture evidence, not a probe performed by this worker.

## Checklist and findings

- Resource boundary: exact integer memory/CPU/PID values reject missing, boolean, unlimited, lower and higher values. Browser/Grid use 3 GiB/2 CPUs/512 PIDs and 1 GiB shared memory; web uses 128 MiB/1 CPU/64 PIDs; seed uses 768 MiB/1 CPU/256 PIDs.
- Tmpfs boundary: exact destinations/options preserve browser /tmp and seed /tmp plus Rails tmp/log ownership options. Web accepts absent/null/empty tmpfs as no mounts. Seed's intentionally unsized Rails mounts remain frozen; this review does not strengthen or endorse that design beyond the accepted contract.
- Security: enabled no-new-privileges must occur exactly once with the expected option count. Browser seccomp is parsed and compared with the task's approved dictionary; missing approval, extra options, disabled privilege controls and altered policy fail closed. JSON parse errors propagate rather than accepting malformed policy.
- Ownership and container isolation: nonzero integer recorded UID/GID required; configured users, image, read-only root, caps, network, logging and allowed bind sets checked. Unknown service fails before removal. Exact names/IDs/labels remain caller responsibilities under the supplied contract.
- Private cleanup: directory identity, owner, mode, consumer checks, regular files, allowed names and single links are checked before unlinking; symlinks and unexpected entries are rejected. None/missing directories return without deletion, and empty directories remain removable. No recursive removal is used.
- Credential boundary: non-seed environments reject privileged key names and recorded secret values; only exact documented public Grid defaults are exempted. Secret inventory completeness and engine-generated environment validity remain dependencies.
- Regression sufficiency for the bounded policy repair: four authored methods cover positive browser/Grid and web/seed policy, security omission/disable/conflict/permissiveness, changed limits and tmpfs, and missing approved policy. This is a reasonable minimal regression set for the repaired validation logic, not complete ownership/cleanup coverage.
- Maintainability and performance: small dedicated helpers; explicit service mapping and comments explain frozen contracts and deletion conservatism. No new architecture or dependency justified by this repair. Consumer Docker calls scale with private entries; the intended two-file directory is small. Style/formatting and static typing execution are delegated to coordinator tooling.
- Documentation: handoff records authored/NOT_RUN status, frozen seed limits, observed engine representation and integration obligations. Shared review ledger and state synchronization belong to root; this worker edits only this report.

Numbered defects: **none confirmed**. Policy segment: **0 defects / 195 LOC = 0.00 defects/KLOC**. These numbers measure findings in bounded inspection, not an absence-of-bugs guarantee.

## Separate result-only regression review

The coordinator-added test at test_finalization.py:128–145 corrects the old case's masking limitation: the old test at 118–126 fails both source and result writes, so it cannot independently establish that a result-only write failure changes an otherwise successful status.

The new test delegates non-result writes to the real task writer, injects OSError only for result.json, and asserts FAILED, the exact result-write failure reason, successful source evidence contents, absent result artifact, credential-file deletion and one cleanup invocation. The shared finish helper checks secret absence in stdout, returned failure and generated JSON. Thus the test would catch removal of the result-exception FAILED transition at run.py:78 while source verification succeeds.

The inspected finalizer independently attempts log diagnostics, cleanup, credential removal, source evidence and result evidence. The result-write exception changes the return status and adds a generic nonsecret message. This narrowly addresses the supplied last-LOW regression gap; no test pass is inferred and no complete runner certification is made. In particular, cleanup_passed is a separate returned field; aggregate success enforcement outside these ranges was not inspected.

Separate segment: **0 confirmed defects / 117 LOC = 0.00 defects/KLOC**. Combined assignment: **0 / 312 LOC = 0.00 defects/KLOC**.

## Design limits and unchecked dependencies

Exact engine strings deliberately favor rejecting unfamiliar representations over accepting equivalent but unobserved forms. Parsed seccomp comparison tolerates JSON formatting while relying on the caller's authenticated approved dictionary. No broad normalization or extra abstraction is recommended from this bounded evidence.

The supplied contract states runtime initializes acceptance_seccomp from hash-checked pinned approved JSON before every validation and callers check exact resource identity. Those implementations, Compose configuration, Task methods (including write/redact/docker/project_containers), cleanup implementation, remaining runner/test lines, source hashing, environment construction and full integration were not inspected. No additional contract was needed for this bounded verdict.

Filesystem checks and unlink operations are not atomic against a hostile concurrent same-owner process. This review assumes task-owned private files and exclusive cleanup as intended; it does not claim race-resistant deletion under adversarial host mutation. Likewise typed Docker-engine inspect output is the boundary: arbitrary hostile Python object types are not certified. Whole-application authorization, native clients, frontend behavior and acceptance evidence parsing are outside scope.

No deep architecture change or recommendation was made, and no Obsidian tradeoff simulation was performed. A dedicated overall design review remains coordinator-owned.

## Execution status

Tests, lint, typecheck, Docker, SSH, servers and UI verification: **NOT_RUN**. No source edits, dependency installs, commits, subagents or fleet mutations. No Docker resources created/deleted and no space reclamation claimed. Coordinator still owns Docker regression execution, actual-inspect integration and shared ledger updates.
