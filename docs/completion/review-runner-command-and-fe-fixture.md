# Runner command boundary and FE fixture review

Reviewer: **Astra LOW (gpt-6-astra, LOW)**. The coordinator confirmed the observed terminal launch configuration through the blocking Orca question reply; identity is based on that execution provenance, not inferred from source.

Task: `task_0000f4d0139e`; dispatch: `ctx_04825b137441`. Read-only adversarial review using the supplied full rubric and applicable AGENTS.md / .planning/STANDARDS.md. Only this report was written. Runtime: **NOT_RUN**. No Docker, host application tests, SSH, server, installation, commits, subagents, or ultrareviews were used. Formatting is delegated to linters.

## Coverage and hashes

All supplied whole-file SHA256 hashes matched before source inspection and again before report creation. Physical LOC includes blank lines and comments. Each review pass was at most 200 physical lines; aggregate unique implementation/test coverage is **356 LOC**.

| Source | Inspected inclusive ranges | Reviewed LOC | Whole-file SHA256 |
| --- | --- | ---: | --- |
| `C:/Users/Tanzeel/Code and projects/Elevateo Mail - BE02 Codex/ops/tests/be02/run.py` | 1–176 | 176 | `6e6153361eded04525e93e72a04480e39aa98f32f7951553e6bdf0f5de7e2287` |
| `C:/Users/Tanzeel/Code and projects/Elevateo Mail - BE02 Codex/ops/tests/be02/docker_task.py` | 1–123 | 123 | `fd37788e2e7afce717d20b0872682676f8f03f98e7bfb3d6d120f6bf97d935d1` |
| `C:/Users/Tanzeel/Code and projects/Elevateo Mail - Fable FE01 R1/apps/web/src/domain/draftOperation.test.ts` | 49–68, 258–294 only | 57 | `9ace8db6acd9684d564aa9e70417eac658c33e035c2263889510f6acadee3328` |

The FE file has 361 physical lines; its other 304 lines were not inspected. Passes covered 176, 123, and 57 lines respectively. Policy/documentation context and hash/count metadata are excluded from implementation LOC.

## Runner findings

**1. MEDIUM — cleanup failure bypasses secret-file finalization and result evidence.**

Evidence: `run.py:63–64` writes the generated credentials to `.env.runtime`; `run.py:155` invokes `cleanup(task)` without a local exception guard. The following unlink at line 156 and result write at lines 164–165 are skipped if that call raises. The outer `finally` does not protect its own remaining statements from an exception. Thus an otherwise completed test run can terminate without `result.json`, retaining the private credential file. File permissions limit exposure but do not satisfy disposable-secret cleanup.

External-contract confirmation: the coordinator explicitly reported that cleanup catches individual deletion exceptions, but its final `task.write('cleanup.json', ...)` can raise an I/O error outside that protection; cleanup has no guaranteed nonthrowing boolean contract. This is coordinator-supplied evidence, not an inspection of cleanup.py. A permissions or storage failure while writing cleanup evidence can therefore trigger this path even where removal of the environment file would still succeed.

Minimal repair: guard the cleanup invocation, conservatively retain `clean=False` on exception, and put environment-file removal in a nested `finally` so it is attempted regardless of callback outcome. Record a redacted cleanup error and failed/unknown cleanup status where evidence remains writable; do not convert a callback exception into cleanup success or overwrite the original test failure. Ensure result finalization is attempted independently of cleanup callback failure. Add a Docker-run regression that injects a cleanup callback exception after secret-file creation and verifies unlink is attempted, overall failure is reported, and writable result evidence records cleanup failure. Add a deletion-error case to prove it cannot yield a successful cleanup claim. These tests were neither inspected nor run in this assignment.

Runner defect count: **1 / 299 LOC = 3.34 defects/KLOC**.

## Runner checklist and design limits

| Area | Static assessment / limit |
| --- | --- |
| Command boundary | Docker argv uses subprocess argument lists rather than shell interpolation. Explicit Linux host, immutable server-image syntax, local socket context, and ambient remote Docker checks are present. Actual Docker behavior is NOT_RUN. |
| Deadline | Every Docker command is bounded by the smaller of its command allowance and the remaining monotonic budget. Exhausted budgets fail. Cleanup receives a separate 240-second budget. Python hashing/filesystem operations are outside the subprocess deadline; no end-to-end wall-clock guarantee is claimed. |
| Arming | Namespace/builder/image checks precede `armed=True`; mutating compose/build calls follow it. Coordinator confirms Acceptance construction only validates/registers/reads, and resource creation occurs in Acceptance.run after arming. Constructor implementation was not inspected. |
| Builder isolation | Per-project builder/cache/tag names, explicit builder selection, pinned BuildKit reference and memory/CPU driver limits are visible. Cleanup ownership checks and actual resource removal remain outside coverage. |
| Source pinning | Before/after hash maps and source-change failure paths exist. This detects endpoint snapshot differences, not transient edits reverted during a run; it relies on the root's frozen-source discipline. External build-context completeness and image provenance were not verified. |
| Secrets | Private umask, evidence directory and environment-file permissions are present. Quiet mode directs both output streams to DEVNULL before disk writes; normal logs pass through redaction. Generic write() is not a redacting API, so external callers must honor its contract. Defect 1 affects final secret removal. |
| Empty/null/error paths | inspect([]) returns an empty list. Command failures and timeouts deliberately raise; optional server-image/acceptance paths are explicit. Malformed Docker JSON/objects fail through exceptions rather than being treated as successful checks. Full external schema validation is not established. |
| Credential separation | Runtime inspection rejects enumerated cross-service/privileged variable names on API and worker containers. This is not proof of all application authorization rules or credential values. |
| Complexity/performance | Task centralizes command/evidence behavior without an obvious need for new abstractions. Logs are captured in memory and hashing reads whole files; no measured maximum-volume or performance claim is made. |
| Tests/documentation/comments | AIDEV comments explain source-mount, timeout and secret-output decisions. Runner failure-injection tests are outside the assigned scope; test sufficiency and documentation synchronization are not certified. |

The exception-safe finalization recommendation is an analytical tradeoff: a small nested guard preserves failure evidence and attempts secret deletion without redesigning the runner. No Obsidian simulation was performed; no deep architecture approval is claimed. Root retains dedicated design and runtime review ownership.

## FE fixture notes

**No confirmed defect in the 57 assigned lines.** `applied()` at lines 55–65 returns `Extract<DraftOperation, { outcome: 'applied' }>` and constructs that member directly. This supplies the discriminated member type to the spread at line 266 without an unchecked `as` cast. The parameter-table `as const` preserves literal cases; it is not a cast used to conceal fixture incompatibility.

The equal-version (2) and lower-version (1) cases preserve expected_version 2 and the same bound operation. Assertions still require mismatch, the original buffer and uncertain attempt, unchanged saved version/content, preserved local edits, and replay of the original attempt/payload without minting an ID. The advancing version 3 case still requires idle status and acknowledgement of the original saved payload while newer editor text stays dirty. These assertions preserve the intended regression semantics in the visible ranges.

The actual DraftOperation declaration, uncertain() setup, receiptBinding/reconcile/beginSave implementations, imports and remaining tests were deliberately not inspected. The coordinator reported prior independent core/test review and the earlier TS2322; neither prior acceptance nor successful compilation is independently established here. The narrow return annotation is statically consistent with the supplied repair purpose, but typecheck and runtime rerun remain **NOT_RUN**.

FE defect count: **0 / 57 LOC = 0.00 defects/KLOC**.

## Completion status and unchecked dependencies

Combined findings: **1 confirmed MEDIUM defect / 356 unique LOC = 2.81 defects/KLOC**. No source changes or fixes were made. Review complete; runner repair and Docker regression/rerun evidence remain required. This report does not approve the whole application or publication.

Unchecked dependencies include cleanup.py and its ownership/removal implementation (contract only supplied by root), acceptance_runtime and argument validators (constructor contract only supplied by root), compose files, Dockerfiles, image provenance, Docker/buildx versions, source packaging, guard/HTTP/worker suites, FE core/types/setup and remaining tests, and the in-progress DynamicUID/CfT archive repairs in other modules. Root owns all fleet execution, independent cleanup reconciliation, code-reviews.md aggregation, and broader documentation updates. No test pass is inferred from code.
