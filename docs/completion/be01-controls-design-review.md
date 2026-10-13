# BE01 bootstrap controls: bounded adversarial design review

Date: 2026-10-13, Australia/Sydney. Task: `task_707cb23dde4a`; dispatch: `ctx_b9815b61116a`.

**Result: one medium defect in the new invocation wrapper.** An evidence-write failure after the parent returns can replace the parent's nonzero exit code and, at the first write, skip reconciliation. The remaining reviewed design separates test outcome from resource evidence appropriately, subject to the runtime and ownership limits below. This is static review evidence, not approval to allocate resources or acceptance of a runtime run.

Requested reviewer role: fresh GPT-6 Astra MAX adversarial design reviewer. This report does not independently attest the runner's model identity. No delegation or additional model session was started.

<!-- AIDEV-NOTE: This review covers only the pinned 191-line control slice; runtime acceptance remains separate. -->

## Scope and provenance

Reviewed checkout: `C:\Users\Tanzeel\Code and projects\Elevateo Mail - BE01 R1`.

All source paths below are relative to its `docs/evidence/repairs/be01-bootstrap-tools/` directory. The parent and fixture paths were resolved from `HANDOFF.md` before their source was read. The hashes are SHA-256 of each complete file; review coverage is limited to the listed inclusive ranges. Hashing a file does not mean its other lines were reviewed.

| File | Reviewed range | Assigned source lines | Complete-file SHA-256 |
| --- | --- | ---: | --- |
| `parent.sh` | 60–97 | 38 | `935ca15c749f8d2cae700086b685e986c0e927974637a0961b06b0f71501c762` |
| `fixture-run.sh` | 34–51 | 18 | `eab086e616fb869a0579a746458565bf121b224ecd10881561ab204634a77221` |
| `inventory.sh` | 1–52 | 52 | `32d626cbb2ebc980420337dc5c0359caa20f515d093c64c739c967663617599b` |
| `invoke.sh` | 1–36 | 36 | `aec7de4890e27c6271600bd78602f4311e1bfee1ea6e88e0d54fad07f35b9c26` |
| `reconcile.sh` | 1–47 | 47 | `fba0bb0fe6cbc561531ce8e4b539645e755d4751d15444b4fe3f821cfdbb283c` |
| **Total** | | **191** | |

All five source hashes matched the handoff. They remained unchanged at the final pre-report check, completed at approximately `2026-10-12 20:33:49 UTC`. No path or hash mismatch was found.

Requirements/context, without expanding the source assignment:

| Artifact | SHA-256 | Verification meaning |
| --- | --- | --- |
| `RUNBOOK.md` | `5a565d3b426bc851a34b75374c9732ed72e6a7eed1886546182215775f9f885c` | Matched the handoff; read as requirements. |
| `HANDOFF.md` | `ce32020c6560c6f58fc8e82cea8c289d6e49f99b996b1ce21e11fb3152df29b3` | Observed context-file hash, not a self-authenticating external trust anchor. |
| `review.sha256` | `248d9ea2a0f247483247d646b1d2d747f72697799b4386de9baee67915a6596b` | Matched the handoff's review-manifest digest. |

Local project instructions, the current-state portions of `README.md`, `state.md` and `documentation.md`, `.planning/STANDARDS.md`, and the planning/orchestration requirements informed the review. The full user-supplied adversarial rubric applies. No other application source was reviewed. Packaging, helper implementations outside the ranges, and the earlier finalizer regression source were not reopened or independently verified. References to their prior review are context, not additional coverage.

## Confirmed defect

### D1 — Medium: reporting failures override the captured parent result

**Location:** `invoke.sh:30–35`, specifically the writes at lines 31 and 34. **Status:** open; static finding, runtime reproduction `NOT_RUN`.

The wrapper saves `parent_exit` at line 29, restores `errexit` at line 30, and then performs two unguarded evidence writes. A nonzero exit from either write can terminate the wrapper before its explicit parent-result precedence at line 35. Bash treats redirection failures as command failures, and its `errexit` behavior applies to these unguarded commands. See the [Bash exit-status rules](https://www.gnu.org/s/bash/manual/html_node/Exit-Status.html) and [Bash reference manual](https://www.gnu.org/s/bash/manual/bash.html).

Concrete analytical scenario: the parent returns `124` after a timeout; the audit filesystem fills during the run; rewriting `parent.status` at line 31 fails. The caller receives the reporting failure's exit code instead of `124`, and line 33 never attempts reconciliation even though the parent has returned. If only the later write at line 34 fails, reconciliation has been attempted but its separate result and the original parent exit are again displaced at the wrapper boundary. An empty or partial status file must remain unknown, not be interpreted as evidence of success.

This is a new failure path in the invocation control, distinct from the previously reviewed fixture finalizer. It violates the runbook's original-result preservation and post-parent reconciliation behavior. It can leave resource state unverified until the documented independent reconciliation is invoked; this review does not claim that a resource leak actually occurred.

**Smallest correct repair:** guard both post-parent reporting writes and retain a separate reporting-failure status. After observing the parent return, attempt the bounded reconciliation once even if a status write fails. At final exit, preserve a nonzero original parent status; when the parent succeeded, any reporting or reconciliation failure must make the invocation fail. Keep reporting and reconciliation results distinct where evidence remains writable, with best-effort diagnostic output if storage is unavailable. A full filesystem cannot be made to provide durable evidence by control flow alone. This needs no broader cleanup authority, automatic rerun, or new orchestration abstraction.

**Required regression cases, all `NOT_RUN`:** inject a failure specifically into the post-parent `parent.status` write after successful initial audit creation; repeat for `invocation.status`; use a parent returning `124` and verify that the wrapper returns `124` and attempts reconciliation exactly once. Also verify that parent success plus either reporting failure returns nonzero, and that normal parent failure plus reconciliation failure retains both outcomes without replacing the original parent exit. Run future tests inside the authorized Docker test environment. Missing coverage for this branch is part of D1, not a second counted defect.

| Severity | Confirmed defects |
| --- | ---: |
| Critical / High | 0 |
| Medium | 1 |
| Low | 0 |
| **Total** | **1** |

**Defect density: `1 / 191 × 1000 = 5.24 defects/KLOC`.** The denominator is the 191 assigned physical source lines, including comments and blank lines; it is not an executable-statement count or a defect estimate for the whole application. Runtime unknowns and accepted tradeoffs below are not counted as defects.

## Design tradeoffs and analytical scenarios

These are analytical scenarios derived from the assigned source and written requirements. They are not executed simulations. A readily available tool-catalog check exposed no callable Obsidian connection; no Obsidian simulation was performed.

### Shared-host ownership and evidence

The fresh before/after inventories are conservative: exact identity and selected metadata equality can catch surviving additions, removals, or metadata changes without deleting anything. Private evidence directories, a pinned local Docker endpoint, and independent read-only reconciliation support a useful separation between observation and mutation. The reviewed parent slice creates the task cache and builder, uses a restricted three-file build context, records image/builder identities, and launches the fixture. Its cleanup and ownership-helper internals remain outside this assignment.

The cost of whole-host equality is sensitivity to unrelated workloads. A foreign container created during the run can make reconciliation fail even when task cleanup was correct. That is an investigation signal, not authority to delete that container or restore the old host inventory. Task ownership must still be proven by the existing bounded lifecycle. The retained config volume and shared pinned base images must remain preserved; an inventory mismatch never expands ownership.

The retained config-volume comparison checks historical metadata and the inventory rejects consumers of that volume. It does not read or establish equality of the volume's contents. Similarly, container inventory deliberately omits transient state and `Config.Env`; equality establishes neither service health nor complete secret exclusion from every remaining metadata field. Keep private evidence handling and the narrower identity claim.

### Client exit, daemon lifetime, and snapshot limits

Timeouts bound client waiting; a terminated client is not itself proof that a daemon operation has finished. The parent uses `daemon_for` around bootstrap/build and `verify_builder` afterward, but those helper implementations are outside this assignment. Their cancellation or quiescence guarantees were not rederived here.

Inventory re-listing detects ordinary concurrent allocation/removal across the observation window. It is not an atomic Docker transaction: it cannot rule out an object appearing and disappearing between samples, data changes inside a retained volume, or a delayed daemon-side creation after the final sample. For example, if a timed-out creation were still queued, equal inventories taken before it materializes would describe that instant only. This conditional scenario is not evidence that the earlier reviewed helper permits it.

The practical boundary remains the runbook's exclusive allocation and independently established parent/daemon quiescence. A transport timeout or current inventory equality alone must not release that boundary. Reconciliation should report what it observed; adding opportunistic deletion, broad pruning, or an automatic retry would make shared-host ownership harder to establish.

### Independent reconciliation and result precedence

`reconcile.sh` starts with `UNKNOWN`, requires a completed baseline, performs a fresh bounded inventory, and compares independent observations. Missing or multiple task directories fail task-identity determination. A missing fixture record can legitimately mean the run failed before launching the fixture, so `UNKNOWN_OR_NOT_RUN` must stay explicit; it is not a fabricated container ID or proof that a fixture passed.

A reconciliation exit of zero can coexist with a nonzero parent result: resource-state equality and test success answer different questions. The copied parent/fixture statuses and parent cleanup summary must accompany that result. The previously reviewed finalizer's visible precedence still returns a failed fixture result before inspection/reporting failures, and makes verification/reporting failure fail a successful fixture. No new contradiction was found in that slice. D1 is specifically where the new outer wrapper fails to carry that precedence through an evidence-write error.

The split between inventory, invocation, reconciliation and fixture finalization keeps responsibilities small. The correct repair is local to result/report handling in `invoke.sh`; extracting a generic lifecycle framework would add coupling without resolving storage failure or daemon ownership.

### Bounds and throughput

The inventories cap containers, volumes and images at 300 entries each, inspect each object, and re-list identities. Their cost is linear in the number of objects; per-call and overall timeouts make a slow or changing host fail without a completion marker. The 300-entry cap is a safety limit, not a promise that all 900 inspections fit within the overall inventory timeout. The repeated lists are intentional race checks, not redundant optimization targets.

The documented outer budgets are compatible on paper: a before inventory of up to 125 seconds, the runbook's parent budget of up to 1380 seconds, and reconciliation of up to 185 seconds total 1690 seconds before other work, versus the invocation's 1800-second TERM deadline. That leaves 110 seconds of nominal slack, not a measured guarantee. Source checks, scheduling, storage stalls, process-group behavior and daemon completion still require the authorized runtime evidence; the outer KILL grace is not cleanup proof.

| Analytical case | Expected interpretation / smallest action |
| --- | --- |
| Parent succeeds, evidence writes succeed, reconciliation succeeds | Invocation may return zero; actual success still requires the recorded runtime evidence. |
| Fixture returns `124`; post-test inspect fails | Visible fixture finalizer preserves `124`; ownership remains unverified rather than successful. Prior finalizer tests were not rerun. |
| Parent returns `124`; reconciliation fails; writes succeed | Wrapper returns `124` and records reconciliation failure separately. |
| Parent returns `124`; either post-parent status write fails | D1: original exit is masked; first-write failure also skips reconciliation. Guard writes and preserve result precedence. |
| A Docker inspection errors or times out | No completed inventory; independent reconciliation must remain unknown/nonzero, never infer absence from partial files. |
| A list is empty, exceeds 300, or inspect cardinality is invalid | Empty optional populations are handled; required retained volume/pinned images still must exist. Over-limit or invalid observations fail before being accepted as a baseline. |
| An unrelated object appears during observation | Fail reconciliation conservatively; investigate without deleting foreign resources. |
| Client times out while daemon work may remain | Establish quiescence independently; a point-in-time snapshot alone cannot exclude later resource creation. |
| Outer invocation is killed or loses transport | Preserve unknown/native caller outcome; use the separately callable reconciler after the documented stop conditions. Do not silently rerun the parent. |
| Task directory is missing/ambiguous, or fixture never started | Task ambiguity fails; missing fixture records remain explicitly unknown/not run and do not imply test success. |

## Rubric and standards coverage

| Review area | Coverage and result |
| --- | --- |
| Purpose and correctness | All 191 assigned lines assessed against handoff/runbook lifecycle; D1 violates result preservation. No application feature acceptance claimed. |
| Null, empty and maximum inputs | Required variables/arguments, empty populations, inspect cardinality, UUID/container-ID validation, list caps, missing records and ambiguous task directories assessed. Full helper validation is outside scope. |
| State changes and system effects | Builder/cache/image/fixture ordering assessed; read-only comparison distinguished from deletion authority and persistent-data preservation. Cleanup internals not reopened. |
| Scope and overengineering | The separation between controls is proportionate. Recommended repair is bounded status handling, with no new backend, framework or automatic retries. |
| Responsibility, duplication and names | Controls have distinct responsibilities; selected names and status records communicate purpose. No concrete duplication defect found in this slice. |
| Comments and complexity | AIDEV explanations, ordering notes, status-precedence comments and simple loops/branches assessed. Snapshot claims require the quiescence limits stated above. No formatting review performed. |
| Tests: happy path and failures | Prior six-case finalizer coverage is handoff context only. New control branches and D1 need the stated Docker regressions; execution and coverage verification are `NOT_RUN`. |
| Documentation | RUNBOOK/HANDOFF describe preparation-only status, separate outcomes, independent reconciliation and preservation constraints. Runtime acceptance remains outstanding. |
| Input validation and permissions | Mandatory environment, canonical source path, private owned evidence directory, host/context restrictions, payload authentication and identity checks assessed where visible. No new credentials or permissions requested. |
| Error handling | Unknown initialization and failed-inventory handling are conservative. D1 exposes an unguarded post-parent error that breaks the required precedence. |
| Performance and limits | Linear bounded inspection and intentional re-listing assessed. Host size/latency can cause safe timeout; performance was not measured. |
| Standards conformity | Boundary validation, deliberate errors, task ownership, comments and scoped changes reviewed. D1 is an issue, not a suggestion; Docker testing and runtime proof remain pending rather than waived. |

## Verification limits and handback

- Runtime tests, execution of the reviewed shell scripts, Docker/SSH operations, application execution and remote mutations: **`NOT_RUN`**, as required by this review assignment.
- No runtime proof of daemon cancellation, surviving-resource absence, retained data contents, real host capacity, exit propagation through transport, free-space recovery or application/client behavior was obtained.
- No host tests, linting, typechecks or integration tests were run. Formatting is left to the required automated tooling; this review does not replace those checks.
- No Obsidian-backed simulation, model delegation, packaging re-review or reopening of closed findings occurred.
- Only this report was written in the coordinator checkout. No implementation, root documentation, Git operation, commit, push, frontend change or live activation was performed.

The review deliverable is complete. D1 needs a bounded repair and targeted Docker regression before this control lifecycle can be treated as statically cleared; all runtime gates remain separate and `NOT_RUN`.
