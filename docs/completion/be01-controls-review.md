# BE01 bootstrap controls: bounded static review

Result: **1 confirmed MED defect; 137 assigned current-file lines reviewed; 7.30 defects/KLOC** (`1 / 137 * 1000`). The defect can replace a nonzero parent exit and skip reconciliation when writing status evidence fails. Runtime, lint, syntax checks and automated tests: **NOT_RUN**. This report is not execution authorization or whole-packet acceptance.

Task: `task_a68eddc12497`; dispatch: `ctx_f2a8b795213e`. Target: `C:/Users/Tanzeel/Code and projects/Elevateo Mail - BE01 R1/docs/evidence/repairs/be01-bootstrap-tools`. Only this report was written; no source edits, commits, agents, model sessions, Docker, SSH or remote actions were performed.

## Requirements and exact coverage

Applied the supplied full adversarial rubric, governing project AGENTS.md and .planning/STANDARDS.md, and the packet RUNBOOK.md/HANDOFF.md. The current dispatch narrows this task to static review and one report, overriding broader implementation/review workflows. README.md, state.md and documentation.md current checkpoints retain prior finalizer/regression closure and unproven runtime status. Formatting remains delegated to linters.

| File | Assigned current physical lines | Lines counted | SHA256 of complete file |
| --- | --- | ---: | --- |
| inventory.sh | 1-52 | 52 | `32d626cbb2ebc980420337dc5c0359caa20f515d093c64c739c967663617599b` |
| invoke.sh | 1-36 | 36 | `aec7de4890e27c6271600bd78602f4311e1bfee1ea6e88e0d54fad07f35b9c26` |
| reconcile.sh | 1-47 | 47 | `fba0bb0fe6cbc561531ce8e4b539645e755d4751d15444b4fe3f821cfdbb283c` |
| freeze.py | 76 and 116: external payload write and review-root inclusion | 2 | `0cb90f0e920940d747b825888b70b164c0bc2bee2bd23e36dd704253ad48777d` |

Coverage counts current assigned physical lines, including shell comments and blank lines, without adding prior reviews. Immediate freeze-hunk context was read for comprehension, not claimed as newly reviewed coverage. Parent, fixture finalizer, regression, deliver.py and the rest of freeze.py were not re-reviewed. The coordinator-supplied deliver61 + oldfreeze125 = 186 LOC / zero-defect result remains separate historical coverage.

The earlier freeze source was reconstructed **in memory only** by removing current line 76 and removing the added `"payload.sha256", ` element from current line 116. Its resulting SHA256 exactly matched the supplied prior reviewed SHA `b58db5b726ea05ddb251dac5f2dc51808daead9f94d71bb3c60e5b0930f9ee92`. This authenticates the two-line change boundary without reopening the other 124 unchanged current lines.

## Confirmed defect

### C1 — MED: status writes bypass reconciliation and parent-exit precedence

Location: **invoke.sh:30-35**, specifically the unguarded writes at **31** and **34** under restored `set -e`.

Failure sequence, derived statically:

1. The parent returns a nonzero result such as 124; line 29 correctly saves it.
2. The audit filesystem becomes unwritable or a status-file write fails with an I/O error.
3. If line 31 fails, errexit terminates invoke.sh with the write failure before line 33 attempts reconciliation and before line 35 returns the saved parent result. A parent 124 can therefore become invocation 1, with reconciliation unattempted.
4. If line 31 succeeds but line 34 fails, reconciliation has run, but the final status write still exits early and replaces the saved nonzero parent result. These are two manifestations of the same unchecked-write defect.

This violates RUNBOOK.md's explicit promise that invocation records the parent's return, attempts read-only reconciliation after a nonzero parent result, and preserves distinct status evidence. The independently supervised caller remains useful, but cannot recover the original parent exit from this wrapper's native exit when the status write also failed. The separate finalizer's prior fix does not cover this wrapper.

Minimal fix: explicitly capture failures from both post-parent status writes, always attempt the bounded reconciliation after saving `parent_exit`, and deliberately choose the final exit. Preserve any nonzero `parent_exit`; when the parent succeeded, fail for reconciliation or required evidence-write failure. Report evidence-write failures separately where possible, without allowing another diagnostic write to replace the chosen exit. No broader lifecycle redesign is required.

Required regression evidence, for a later authorized Docker-only run: a parent stub returning 124 with the parent-status write made unwritable; the same with only the invocation-status write failing; and parent/reconciliation both zero with a status-write failure. Check that reconciliation was attempted, original 124 survives both failure cases, and the otherwise-successful case becomes nonzero. Also retain the successful-write parent124/reconciliation1 and all-zero cases. **All are NOT_RUN here.**

## Other reviewed controls and limits

| Area | Static assessment and practical limit |
| --- | --- |
| Ordinary failure propagation | Inventory pipelines use pipefail, required gates are standalone under errexit, and child scripts run in separate Bash processes. The caller's `|| reconcile_exit=$?` does not disable the child script's own errexit. Successful status writes lead to the stated nonzero-parent precedence; C1 is the exception. |
| Empty and invalid inputs | Required variables/arguments fail when unset or empty. Fresh-directory creation fails on reuse. No-container inventories can be empty; the retained volume and three pinned image references are still required. Missing baseline completion, malformed task UUID/fixture ID and inventory failures cannot reach the final successful reconciliation write. |
| Object retention | Reconciliation compares container IDs and profiles, volume names and selected stable metadata, image IDs/tags/digests, builder registrations/endpoints and pinned image IDs. Any `cmp` failure makes reconciliation nonzero. The retained config must exist with no container mount references; invoke additionally compares its selected metadata with the historical object. These scripts perform no deletions or retained-volume content inspection. This is identity/metadata evidence, not volume-content or service-health proof. |
| Freshness | Inventory re-lists container, volume and image identities after inspection. This can detect ordinary membership changes, but is not an atomic Docker snapshot. Exclusive allocation and the independent review required by RUNBOOK remain prerequisites. Missing historical IDs are not manufactured by inventory equality. |
| Runtime bounds | Normal entry points request inventory 120s + 5s, reconciliation 180s + 5s and invocation 1800s + 30s; individual Docker calls request 10s + 3s. These are static command arguments, not measured termination guarantees. Container/volume/image lists each reject more than 300 entries. |
| Target/source gates | Inventory checks the named host, a context resolving to the local Unix socket and absence of Docker host/TLS overrides. Invocation and reconciliation check payload hashes before their subsequent work. These checks rely on the separately authenticated source and the intended absolute-path invocation described in RUNBOOK. |
| Freeze changes | Line 76 exports the same payload-manifest value used for the archive, and line 116 places that external copy under review.sha256. The two changes close the stated external-manifest delivery gap without changing the reviewed payload-generation logic. Out-of-band trust in review.sha256 is still required before execution. |
| Scope and maintainability | The scripts remain narrowly divided into inventory, invocation and reconciliation. No additional confirmed abstraction, duplication or coupling defect was established within this slice. |

Two observations are **not counted as confirmed defects**:

- The 300-entry guard covers containers, volumes and images, while the builder list has only the enclosing time bound. Clarify RUNBOOK's broad wording "at most300 objects per inventory," or add a builder count guard if that requirement is intended to include builders. No runtime builder count was obtained.
- `jq -S` sorts object keys but does not normalize container `Mounts` array order. If repeated Docker inspections return identical mounts in a different order, the byte comparison will conservatively fail. This is a potential false failure to exercise in the later fixture, not an observed Docker failure or permission to weaken identity comparisons.

## Integrity evidence

Read-only file hashing matched all **14** current review.sha256 entries, including the archive, with their manifest entries. The controls' hashes also match HANDOFF.md and delivery.json. This is local artifact consistency evidence; it does not independently establish the out-of-band review root or validate runtime behavior. Archive member contents were not re-extracted or re-reviewed.

| Artifact | Observed SHA256 |
| --- | --- |
| review.sha256 | `248d9ea2a0f247483247d646b1d2d747f72697799b4386de9baee67915a6596b` |
| payload.sha256 | `525b9604fad3ed804b8413d1d0bf2cfa1d065b303eb2f84a86db115bef08f991` |
| delivery.json | `224ad1d0d9476982a0ec63000c56b1773b284b88655aca155e520f0d4133c90c` |
| packet-1a738ff098d913c87431731e906e575c8d17c11623a33042b13a5318c8efa5c6.tar | `1a738ff098d913c87431731e906e575c8d17c11623a33042b13a5318c8efa5c6` |
| RUNBOOK.md | `5a565d3b426bc851a34b75374c9732ed72e6a7eed1886546182215775f9f885c` |
| HANDOFF.md | `ce32020c6560c6f58fc8e82cea8c289d6e49f99b996b1ce21e11fb3152df29b3` |

## Verification still required

The packet directory and RUNBOOK identify finalizer/status regressions and the existing bootstrap regression; they do not establish focused regression coverage for these new inventory/invocation/reconciliation controls. Those already-closed tests were not reopened. The new controls still need Docker-only happy-path and failure-path evidence covering C1, failed/truncated inventory commands, 300/301-entry boundaries, retained-resource changes, manifest mismatch, timeout termination and independent reconciliation after a failed parent. Formatting, lint, syntax and type checks were not run in this static-only dispatch.

**Disposition:** review assignment complete with C1 open; runtime **NOT_RUN**. No source repair, execution allocation, cleanup result, reclaimed-space measurement, test pass or whole-packet all-clear is claimed. Coordinator incorporation into code-reviews.md/state tracking is outside this worker's one-file write authorization.
