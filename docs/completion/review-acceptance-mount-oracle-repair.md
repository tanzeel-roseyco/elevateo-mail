# Mount oracle repair — independent bounded review

Disposition: one MEDIUM fixture-fidelity defect; topology repair is statically sound within the inspected construction. Runtime: **NOT_RUN**. Application readiness remains **NOT_READY**; the coordinator reports an unrelated R3 CREATE-schema permission failure.

## Provenance and coverage

- Dispatch: `ctx_fcc8d6c7b549`; task: `task_d754a12b2d61`.
- Requested identity: `gpt-6-astra`, LOW, through Orca. Actual reviewer identifies as Codex/GPT-6 in the supplied session instructions; exact model variant and effort are not exposed independently to this reviewer. Do not treat this report as independent attestation of the requested variant/effort; coordinator launch metadata must establish them.
- Sole implementation inspected: `ops/local/mount-oracle-repair.py`, lines 1–136, one 136-physical-line pass; 136 unique implementation/test LOC including embedded JavaScript, comments and blank lines.
- SHA256 verified before inspection and again before reporting: `b3cd8a3b071c194549cc8b6e5c40cf7450a185e2b1ca98fa3e72630034347fa3`.
- Context: supplied full adversarial rubric, root `AGENTS.md`, `.planning/STANDARDS.md`, and task brief. A combined read of README/state/documentation exceeded output limits; those documents were not fully inspected. No additional implementation was inspected. No nested instructions were found under the reviewed ops/docs paths; `.Codex` is absent.
- No tests, Docker commands, SSH, servers, installs, commits, subagents or source changes. Formatting is delegated to linters.

## Numbered defects

1. **MEDIUM — writable control does not reproduce the stated DAC permissions.** Line 18 sets umask 0077; the `mkdir(mode=0o755)` calls at lines 38 and 41 therefore create 0700 fixture directories, not 0755. The task identifies the real source as owner 1001/mode 0755, while the control is owner 1001/mode 0700. UID 10001 cannot even traverse the control root, so EACCES at lines 71–74 may arise from missing search permission rather than the source's missing write permission. This does not make the positive mountinfo test pass incorrectly, but it invalidates the promised same-DAC regression and the 0755 explanation at line 58 for the control. Minimal repair: explicitly chmod only the newly created fixture root and child directories to 0755 after creation, then assert their actual owner/mode against the intended source baseline before running the cases. Keep the private output parent private; Docker binds the fixture itself. Root should rerun the bounded four-case fixture after repair.

Defect count: **1**. Density: **7.35 defects/KLOC** (`1 / 136 * 1000`). No duplicate findings counted.

## Checklist and conclusions

- **Original false-pass risk:** addressed statically. The positive requires an exact mountpoint entry with `ro`, and exact child entries that are both `rw` and `tmpfs` (lines 62–83). A writable root cannot reach the positive marker; even DAC-denied writes take exit 66. Missing/duplicate entries throw. Exact stdout/exit matching prevents generic failure from passing the positive or writable control.
- **Wrong topology:** child bind mounts do not satisfy the tmpfs check. The probe is not a general mount-tree auditor: it does not reject additional descendants, prove the root's host source identity, or verify tmpfs size/ownership/security options. Those are fixed by the bounded Docker argument construction; this review does not certify externally supplied topology.
- **RW exception:** only `writable-control` omits `readonly` (lines 99–104). Its path is newly created under OUT. Application source is always passed read-only. Cleanup's allowed-source/RW mapping has exactly that same exception (lines 43, 50–52).
- **Cleanup:** inner and outer finally blocks attempt exact-name cleanup; successful inspection checks task label, destination, source and RW policy before removal by ID. Post-removal absence is checked. Timeout/errors propagate deliberately. Cleanup refuses unexpected mounts instead of deleting an unrecognized resource. A preexisting same-name container blocks execution. Concurrent unrelated use of this fixed name is outside the construction's assumptions.
- **Source immutability:** hashes and file sets are checked before cases, after completed cases, and on finalization; empty non-symlink tmp/log directories are checked. This is regular-file content evidence, not comprehensive metadata/symlink/hardlink immutability; `ops/local/` is intentionally excluded. The application bind itself is read-only in the positive case. No broader immutability claim is independently established.
- **Failure scenarios:** source drift, missing mountpoints, writable control and absent image/incorrect daemon are explicit failure paths. Four results are mandatory for an overall pass. Missing-log/tmp require exit 125 plus a read-only-filesystem error naming the corresponding target; actual daemon behavior was not run here.
- **Inputs and limits:** fixed host, UID/GID, daemon endpoint, image digest and resource/network restrictions bound this task. The manifest is local trusted input with deliberate assertion failure on malformed/mismatched data; no mail credentials or external product authorization paths are involved. Assertions require ordinary Python execution without optimization. Source hashing reads whole files and is appropriate only for the bounded frozen snapshot; no new hot-path concern is established.
- **Maintainability/documentation:** small helper functions and an AIDEV explanation keep responsibilities understandable. The 0755 explanation needs the fixture correction above. No broad refactor is warranted. Repository-wide documentation/test coverage is outside scope.

## Design and evidence limits

Analytical comparison only: a failed write conflates DAC denial with read-only topology; mountinfo separates those cases, while actual child writes verify usable writable scratch mounts. The chosen approach is suitable for this fixed harness and avoids changing the real source permissions. The control must still preserve the intended DAC baseline to demonstrate the precise original regression. No Obsidian simulation was performed; no connection or expanded design work was authorized in this bounded assignment.

Coordinator-reported four-case PASS exits 0/66/125/125, source unchanged, exact container absent, no image/volume/cache creation, and shared Node retention are **not independently verified** here. Fields recording zero resource creation and retained bases are construction-based declarations rather than inventory comparisons inside this file. Unchecked dependencies include the Docker daemon/runtime, retained image contents, frozen manifest/source metadata, outer fleet invocation and cleanup inventories, earlier packaging implementation, and R3 integration evidence. This report neither infers test passes from code nor closes application acceptance.
