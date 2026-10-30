# BE01 C1 repair: bounded design review

**Result: 0 confirmed defects in 145 assigned physical lines; defect density 0.00 defects/KLOC** (`0 / 145 * 1000`). **D1/C1 are closed by static inspection of the assigned repair; this worker's testing remains NOT_RUN.** Separately, the coordinator supplied a log reporting all eight isolated Docker regression cases passed, recorded below as external evidence. This is not whole-packet acceptance or independent proof of cleanup.

Task: `task_5a7ea86cdb03`; dispatch: `ctx_fcf5353484dd`. Governing inputs: current coordinator `AGENTS.md`, `.planning/STANDARDS.md`, the full supplied adversarial rubric, this bounded dispatch, and `docs/completion/be01-controls-review.md` for the original C1. The dispatch's one-report/static-only limits control this review. Formatting belongs to linters.

Only this report was written. No source edits, tests, Docker, SSH, commits, extra agents, paid sessions, or historical code rereviews were performed. Local file reads and SHA256 calculations are artifact inspection, not application or regression execution.

## Exact coverage and integrity

Source root: `C:/Users/Tanzeel/Code and projects/Elevateo Mail - BE01 R1/docs/evidence/repairs/be01-bootstrap-tools`.

| File | Assigned and reviewed lines | Physical LOC | Observed SHA256, matching dispatch |
| --- | --- | ---: | --- |
| `invoke.sh` | 1-47 | 47 | `e83b0d8d7dd42f8e99f5e80bc78dd5007b6e81e1d03cded9bc13376d705fb056` |
| `invoke-regression.sh` | 1-51 | 51 | `54a9ebeba4282b387b8febab2bd21c8c10732a90a3539adbab51f63dbca1effc` |
| `reconcile.sh` | 1-47 | 47 | `fba0bb0fe6cbc561531ce8e4b539645e755d4751d15444b4fe3f821cfdbb283c` |
| **Total** | **Single bounded assignment** | **145** | **All three hashes match** |

Counts include comments and blank lines. No coverage is attributed to inventory, parent/finalizer code, other fixtures, packaging, or earlier reviews. The original C1 is an existing defect being checked for closure, not a new defect counted against this repair.

## Exit precedence and C1 disposition

Let `P` be the saved parent exit, `R` the reconciliation subprocess exit, `Wp` the parent-status write exit, and `Wi` the invocation-status write exit. Lines 39-43 of `invoke.sh` implement:

```text
P != 0                 -> P
P == 0 and R != 0      -> R
P == 0 and R == 0
  and (Wp != 0 or Wi != 0) -> 1
otherwise              -> 0
```

At lines 32-38, each status write is the left operand of an explicit failure-capturing OR list. A returned write/redirection error therefore records its status instead of triggering errexit before reconciliation or the final exit. Reconciliation is attempted at line 35 after the parent result has been saved, regardless of the first status-write result; its own failure is captured before the second write. The child script retains its own `set -euo pipefail` and timeout entry point.

Lines 45-46 make the final diagnostic write best effort with `|| :`, after exit selection. Ordinary stderr write/redirection failure cannot replace that selection. Required status evidence remains mandatory: if parent and reconciliation both succeed, either required status-write failure selects 1. A failed optional diagnostic alone does not turn otherwise-successful work into failure, which is consistent with its stated best-effort role.

**C1: STATICALLY CLOSED for both original manifestations.** The repair prevents a failed parent-status write from skipping the reconciliation call and prevents either status write from replacing a saved nonzero parent status, including 124. Initial placeholder writes at lines 16-17 remain fail-fast before the parent is invoked; they are outside the original post-parent failure sequence.

**D1: STATICALLY CLOSED on the same obligation.** In the Orca reply to `msg_0c859f5a5c2d`, the coordinator confirmed that D1 is the same first-failure precedence/mandatory-reconciliation defect as C1, independently identified by the prior design review. The calculations below cover its requested parent124/status-failure, parent0/status-failure, reconciliation-failure and diagnostic-failure cases. No unrelated historical D1 or other source range was reopened.

## Theoretical failure simulation

These are calculations from the assigned control flow, **not executed tests**. Numeric write failures of 1 are representative; other nonzero write results have the same final-exit behavior. A real reconciliation may itself fail because the same filesystem error affects its evidence output; the nonzero-parent rule still applies.

| Scenario | P | Wp | R | Wi | Diagnostic write | Calculated invocation exit | Reconciliation call attempted? |
| --- | ---: | ---: | ---: | ---: | --- | ---: | --- |
| Parent timeout result; parent-status failure | 124 | 1 | 0 | 0 | Succeeds | 124 | Yes |
| Parent timeout result; invocation-status failure | 124 | 0 | 0 | 1 | Succeeds | 124 | Yes |
| Otherwise successful; parent-status failure | 0 | 1 | 0 | 0 | Succeeds | 1 | Yes |
| Otherwise successful; invocation-status failure | 0 | 0 | 0 | 1 | Succeeds | 1 | Yes |
| Parent succeeds; reconciliation fails | 0 | 0 | 1 | 0 | Succeeds | 1 | Yes |
| Parent fails; reconciliation also fails | 124 | 0 | 1 | 0 | Succeeds | 124 | Yes |
| All required work/evidence succeeds | 0 | 0 | 0 | 0 | Succeeds | 0 | Yes |
| Invocation-status failure plus `/dev/full` diagnostic failure | 124 | 0 | 0 | 1 | Returns failure | 124 | Yes |
| Both metadata writes and reconciliation fail | 0 | 1 | 7 | 1 | Returns failure | 7 | Yes |
| Same compound failure with parent 124 | 124 | 1 | 7 | 1 | Returns failure | 124 | Yes |
| Only optional diagnostic fails | 0 | 0 | 0 | 0 | Returns failure | 0 | Yes |

The first eight rows correspond to the intended cases at `invoke-regression.sh:44-51`. The final three are additional analytical combinations, not additional fixture coverage.

## Regression seam and review checklist

| Area | Static assessment |
| --- | --- |
| Real repaired logic | Regression line 8 extracts the actual block beginning with `set +e` through EOF from `invoke.sh`; it does not copy the exit-selection implementation. Parent and reconciliation are stubbed while the repaired writes, status capture, diagnostics, and exit remain real code. |
| Errexit fidelity | Regression line 30 launches a separate `bash -euo pipefail` and captures its exit in the caller. The caller's OR list does not turn off errexit inside that separately started interpreter. The extracted block explicitly restores errexit after parent capture. |
| Deterministic status failure | The parent stub places a directory at the selected status-file path. Redirecting the repaired write to that directory must fail; the fixture does not depend on disk exhaustion or a privileged process ignoring chmod. This isolates the returned-error branch, not all physical filesystem failure modes. |
| Meaningful assertions | Each case checks both the final exit and the reconciliation-attempt marker. Surviving status files are checked for parent/reconciliation values and the captured parent-write result. The original early-exit defect would miss the marker or produce the wrong exit in the relevant cases. |
| Happy/failure coverage | Cases cover both status-file failures with parent 124 and parent 0, parent/reconciliation precedence, reconciliation-only failure, all-zero success, and a failing diagnostic sink. They satisfy the targeted happy path and likely failure-path design requirement on inspection. The coordinator-supplied log separately reports all eight passed; this worker did not execute them. |
| Permissions and boundaries | Invocation requires nonempty configuration, canonical source path, and a caller-owned evidence directory with mode 700; a private `mktemp` directory and umask 077 constrain new evidence. Hash verification precedes parent execution. Regression requires UID 10001, `/.dockerenv`, and no socket at `/var/run/docker.sock`. These are useful gates, not a complete proof of mount isolation or an immutable source tree. |
| Empty/missing evidence | Reconciliation checks the baseline completion marker; nullglob handles no parent run, and a count other than one becomes failure. Malformed task/fixture IDs stop reconciliation, and absent parent status or cleanup evidence becomes failure. Errors encountered while writing reconciliation evidence also return nonzero to the wrapper. |
| State coupling | Invocation preserves parent, reconciliation, and parent-write results separately when storage permits. Reconciliation success alone is not invocation success: the wrapper additionally enforces required metadata-write success. Consumers must use the wrapper exit and its status records together. |
| Cohesion and complexity | Separate status variables make the precedence explicit without a new abstraction. Reconciliation's bounded comparison list and existing inventory subprocess avoid introducing a second lifecycle or cleanup implementation. No new performance bottleneck, unnecessary framework, or confirmed duplication defect appears in the assigned slice. |
| Comments/documentation | The repaired AIDEV notes explain the ordering and diagnostic constraint; the fixture note explains the child-shell choice. This report records C1 disposition and execution limits. Broader runbook, manifest, state-file and code-reviews integration is coordinator-owned and not asserted from unreviewed files. |

## Design tradeoffs and residual limits

**Analytical simulation only:** the Obsidian connection is unavailable as stated in the dispatch. No Obsidian-backed simulation or persisted tradeoff result is claimed; this limitation does not block the bounded review.

| Choice | Benefit and cost | Judgment for this repair |
| --- | --- | --- |
| Explicit guarded post-parent writes | Maintains fail-fast initialization while locally capturing the few failures that must not prevent reconciliation or exit selection. Adds three small status variables. | Appropriate and sufficient for C1. |
| Nonzero parent before reconciliation/metadata failure | Preserves the actionable parent result such as 124; one exit code cannot simultaneously encode every secondary failure. Secondary records/diagnostics may themselves be unavailable. | Correct required precedence; do not reinterpret the retained parent code as reconciliation success. |
| Fail closed after parent/reconciliation success | Prevents missing required metadata from producing invocation success. Write failure is normalized to 1 when it is the remaining cause. | Correct and simpler than inventing a new exit taxonomy. |
| Best-effort diagnostic after exit selection | Allows reporting both write results without allowing a failing stderr sink to change the selected status. Diagnostics can be lost. | Appropriate for an optional channel. Required metadata remains separately enforced. |
| Extracted-code regression with stubs | Directly exercises the repaired block without Docker-host access or invoking real parent resources. Does not exercise initialization, actual timeout delivery, or real reconciliation/inventory behavior. | Meaningful focused regression seam; complementary integration evidence remains necessary. |

The reconciliation **attempt** is guaranteed for ordinary returned post-parent status-write errors while the wrapper continues running. It is not a guarantee that reconciliation finishes: its own output initialization may fail, or a supervisor timeout, termination, host loss, or process crash may stop execution. Reconciliation's assigned code records and compares evidence; it is not a replacement cleanup engine. This review neither requests nor authorizes shared-host cleanup.

The fixture's stderr case models an opened `/dev/full` sink returning a write error. It does not prove behavior for every signal or abnormal process termination. Its directory-based failures do not prove disk-full, partial-write, durability/fsync, or ownership-change behavior end to end. Simultaneous status failures are calculated above but not separately scripted. These are evidence limits, not additional confirmed defects in the specified C1 contract.

Regression isolation must still be provided by the authorized container launcher: the in-script check excludes only the named socket and does not audit every mounted path or alternate endpoint. No container isolation, resource cleanup, filesystem durability, source race protection, or actual deadline enforcement was executed or certified here.

## Verification and handoff

**Testing by this worker: NOT_RUN.** This worker ran no Bash syntax checks, linters, regression cases, real parent/reconciliation integration, Docker operations or native/actual-client checks. Static source inspection and matching file hashes are not execution evidence.

In its reply to `msg_0c859f5a5c2d`, the coordinator separately reported an isolated fleet Docker run and authorized reading [the result log](../evidence/c1-7f40572dce524d048714de86282abd25-result.log) as non-code evidence. The inspected file's SHA256 is `99eb93a40e0ddaf10b8ce849b46f49034298e82a0cbeb3a543b097bf246072ed`. It contains `invoke.sh: OK`, `invoke-regression.sh: OK`, all eight named `PASS` lines matching the fixture cases, `test_exit=0`, `cleanup_exit=0`, and an empty `remaining=` record. These are externally supplied execution results, not theoretical calculations or tests run by this reviewer. The log does not independently establish launcher/mount configuration or real inventory/reconciliation integration, and its cleanup claims were not independently verified here.

The coordinator can use this report as the dedicated 145-LOC design review and record **0 new defects / 0.00 defects per KLOC**, with **D1/C1 static closure**, reviewer testing **NOT_RUN**, and the supplied eight-case regression evidence kept distinct. Actual parent/reconciliation integration and any broader packet acceptance remain outside this bounded review; no additional framework or broad cleanup is recommended.
