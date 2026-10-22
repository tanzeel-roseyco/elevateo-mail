# Final staging security repair review — 2026-10-23

Dispatch: `ctx_db37cb168938`; task: `task_dfa05d05ecd4`. Static, bounded adversarial review only. No source edits, tests, builds, secrets, cloud/DNS access, nested workers or commits.

## Exact coverage

| File under ops/production/initialize | Physical lines | SHA-256 (matched) |
| --- | --- | --- |
| stage-final.sh | 1–20 | 9bf2da53229af1e64b48202539f5d091bed6ac61ddad238c60c95b27817147e3 |
| test_stage.sh | 1–32 | c6374d263235dfad989b222342acff2746a513b0f3bb13b1e3e2452e24bb4b3b |
| quality.sh | 1–5 | 2aa03257ee65aaf74cfa1ce67f0cbea54445ce2edb07648ed48c62a67479876a |

57 unique physical LOC, including blanks/comments; each packet below 200 lines. Required AGENTS.md, .planning/STANDARDS.md and README/state/documentation context consulted. No imported implementation or additional tests inspected.

## Finding

**MEDIUM — Existing hard-linked output files escape the disposable snapshot write boundary.** `stage-final.sh:12–18,20` rejects symbolic links and nonregular files, but a hard link to an outside regular file satisfies both checks. If the migration destination is hard-linked to an outside sentinel, `cp` overwrites that same inode; if the manifest is hard-linked, shell redirection truncates the shared inode. Stage-root ownership, canonical path checking and the cooperative lock do not reject these existing aliases. This requires a preexisting same-filesystem hard link to a writable external file; it is not a demonstrated remote exploit.

Reject existing multiply linked output files before either write, or publish fresh owned output inodes by safely replacing directory entries. Add separate destination and manifest hard-link regressions that require rejection (or safe replacement) and preserve the outside sentinel. The inspected test covers symbolic links only. This is one underlying defect across two output sites, not two defects.

Confirmed defects: **1 MEDIUM**; density: **17.54 defects/KLOC** (1 / 57 × 1000). No stylistic findings.

## Rubric checklist and evidence

- Purpose/security boundaries: checks reject preexisting root, ancestor-directory, source, destination and manifest symlinks, including dangling final-file symlinks. Required directories must exist; the staged migration digest is pinned before copying. Residual hard-link finding above prevents unconditional write-confinement acceptance.
- Null/empty/max inputs: fixed paths and pinned digest avoid unbounded user input; missing required directories/source fail closed. No list/API boundary or app authorization change in these ranges.
- State/coupling: source digest verification precedes copy; manifest generation follows it. Locking is cooperative; hostile concurrent filesystem mutation is not proven safe by check-then-use shell operations. No separate race defect counted without a stated competing-writer threat model.
- Design/complexity/reuse/naming: small linear scripts with clear phase ordering and bounded loops; no unnecessary abstraction, duplicated domain logic, queries or hot-path bottleneck identified. Comments explain confinement intent; that intent remains incomplete for hard links.
- Tests: source includes a baseline copy comparison and five negative symlink cases, with an outside sentinel preservation assertion. These are executable regression definitions, not evidence they passed. Missing hard-link coverage belongs to the finding.
- Quality integration: quality.sh invokes syntax checking, ShellCheck and the actual staging regression inside a disposable Docker container with a read-only source bind. Its other commands/imports were not inspected. No lint/type/unit/integration success inferred from command presence.
- Documentation: consulted central context describes protected initialization and coordinator-owned live activation. Only this assigned review report changed; central code-reviews.md/state synchronization remains coordinator-owned.

## Limits and delivery

No runtime receipt was assigned or independently reviewed; all execution results remain unverified here. No production readiness, whole-project approval or dedicated design-review completion is claimed. Narrow repair options above do not establish a broader architecture tradeoff decision or Obsidian simulation.

Finding sent immediately through Orca to the coordinator and owner dispatches `ctx_6594097677c5` and `ctx_f5eab65ab665` (messages `msg_d706a03a388a`, `msg_1f6410676964`, `msg_136fdd275712`). The initial finding is preserved above as historical evidence; its source repair is reviewed below.

## Authorized final repair rereview

Coordinator requested final rereview before settlement. Owner supplied the following exact successor packets; both hashes independently match:

| File | Physical lines | SHA-256 |
| --- | --- | --- |
| stage-final.sh | 1–21 | f7372d9503ac776005ddf209cafbe9b552cc90696b30342cf9c2c3639be07c42 |
| test_stage.sh | 1–34 | 591182d5e9e5eb957aebacf8618e58b614ce99aaad9d23e63b0c1dbb8edb4cef |

quality.sh remains the previously reviewed 5-line packet per owner receipt. Final source coverage is 60 physical LOC; conservatively counting both full revised packets again gives 112 cumulative versioned LOC, below 400, with no packet above 200.

The new stage-final.sh line 15 requires link count 1 for every existing source/destination/manifest regular file before writes. Both previously described outside-inode aliases therefore fail admission. The revised test adds actual-helper hard_destination and hard_manifest cases, requires failure and checks the outside sentinel after each case. The baseline and five symlink regressions remain intact. The **MEDIUM finding is closed statically**, with **zero new defects / 60 final LOC = 0 defects/KLOC**; original discovery density remains 1 / 57 = 17.54/KLOC and is not erased. No independent execution occurred; owner reports fleet Docker regressions still awaiting the lease. Check-then-use defenses continue to assume cooperative serialization and no hostile concurrent filesystem writer. Exact-source runtime evidence and final acceptance remain coordinator-owned.
