# BE01 C1 repair: bounded correctness review

**Static result: C1 addressed.** A1 and A2 contain **0 confirmed defects over 225 assigned physical lines**, or **0.00 defects/KLOC**. This worker's testing, syntax checks, lint and runtime verification are **NOT_RUN**. A later coordinator-supplied log separately records eight regression passes; broader testing remains pending. This is not whole-packet acceptance or execution authorization.

Task `task_ddc1adef0d24`; dispatch `ctx_429163dadcc7`. Source root: `C:/Users/Tanzeel/Code and projects/Elevateo Mail - BE01 R1/docs/evidence/repairs/be01-bootstrap-tools`. Only this report was written. This worker performed no source edits, target-script execution, host tests, Docker, SSH, commits, agents or paid sessions.

## Scope and coverage

Applied the supplied full adversarial review rubric, current coordinator `AGENTS.md` and `.planning/STANDARDS.md`, and the original C1 in `docs/completion/be01-controls-review.md`. The narrower dispatch controls permitted reads and writes; no historical source review was repeated. Formatting belongs to linters. RUNBOOK prose and manifest/archive metadata supplied context; hashing other packet artifacts does not count as source-code review.

| Assignment | Reviewed ranges | Physical LOC | Confirmed defects | Defects/KLOC |
| --- | --- | ---: | ---: | ---: |
| A1 | `invoke.sh:1-47`; `invoke-regression.sh:1-51` | 98 | 0 | 0.00 |
| A2 | `freeze.py:1-127` | 127 | 0 | 0.00 |
| Total, disjoint coverage | Three assigned files only | **225** | **0** | **0.00** |

A1 findings were finalized before opening A2. Neither assignment exceeded 200 LOC. Counts include blank and comment lines and do not reuse prior review coverage. Density is confirmed defects divided by assigned physical LOC, multiplied by 1,000.

| Assigned file | Observed SHA256, matching the dispatch exactly |
| --- | --- |
| `invoke.sh` | `e83b0d8d7dd42f8e99f5e80bc78dd5007b6e81e1d03cded9bc13376d705fb056` |
| `invoke-regression.sh` | `54a9ebeba4282b387b8febab2bd21c8c10732a90a3539adbab51f63dbca1effc` |
| `freeze.py` | `5bd6c536502728c077fb956da33b8f64581c075c54efd82f0add5a573b3d2fcc` |

## A1 findings: invocation and regression

**0 confirmed defects / 98 LOC / 0.00 defects/KLOC.** The repaired post-parent block meets C1's stated control-flow requirements on static inspection:

- `invoke.sh:27-33` saves the parent's status before restoring errexit and explicitly captures the parent-status write failure. Redirection or `printf` failure therefore does not terminate the wrapper before reconciliation.
- `invoke.sh:34-38` attempts reconciliation independently of the first write result and captures reconciliation and invocation-status write failures separately.
- `invoke.sh:39-43` preserves every nonzero saved parent result, including 124. With parent zero, a nonzero reconciliation result wins; if both are zero, either metadata-write failure produces exit 1. No metadata failure can produce success in that otherwise-successful branch.
- `invoke.sh:44-47` guards best-effort stderr output and then returns the chosen status. A diagnostic write failure cannot replace the selected parent/reconciliation/evidence outcome.
- `invoke-regression.sh:8-9,24-41` exercises the actual suffix extracted from `invoke.sh`, including saving the parent status and restoring errexit, in a separate `bash -euo pipefail` process. Each case checks native exit, a reconciliation-attempt marker, and every status file that should remain writable. Creating a directory at the selected status-file path injects a real redirection error; it does not merely return a fabricated write status.
- Required configuration and private-evidence checks remain before parent work. Initial status writes at `invoke.sh:16-17` still fail before parent execution if initialization fails; that is distinct from C1's loss of an already-returned parent result. Comments explain the repaired precedence and diagnostic constraints. No additional abstraction or redesign is needed for this fix.

The authored cases are listed below as **static coverage, not this worker's executed results**. Every case also requires reconciliation to have been attempted. The coordinator's subsequent execution evidence is recorded separately below.

| Regression case | Injected parent/reconciliation | Write/diagnostic failure | Expected native exit | Worker execution |
| --- | --- | --- | ---: | --- |
| `parent124-parent-write` | 124 / 0 | Parent status | 124 | NOT_RUN |
| `parent124-invocation-write` | 124 / 0 | Invocation status | 124 | NOT_RUN |
| `parent0-parent-write` | 0 / 0 | Parent status | 1 | NOT_RUN |
| `parent0-invocation-write` | 0 / 0 | Invocation status | 1 | NOT_RUN |
| `parent124-reconcile1` | 124 / 1 | None | 124 | NOT_RUN |
| `parent0-reconcile1` | 0 / 1 | None | 1 | NOT_RUN |
| `all0` | 0 / 0 | None | 0 | NOT_RUN |
| `diagnostic-failure` | 124 / 0 | Invocation status and stderr `/dev/full` | 124 | NOT_RUN |

The suite's socket-free container/UID guard and per-case timeout are present. Injected parent 124 is not evidence of a real timeout. This suffix-only suite does not exercise inventory, historical-volume checks, a real parent, actual reconciliation internals or the wrapper's outer timeout.

## A2 findings: packaging

**0 confirmed defects / 127 LOC / 0.00 defects/KLOC under the documented Bash invocation contract.** `freeze.py:73-77` includes the new regression before constructing the payload manifest; `freeze.py:115-118` includes it in the external review root. The source-path boundary rejects traversal, backslashes and escaping links, pinned bytes must match directly or after the stated CRLF-to-LF normalization, and conflicting repeated source entries fail. The reviewed code retains explicit adapter repinning and fixed historical reconstruction checks. No new dependency or unrelated lifecycle change was introduced for C1.

Read-only artifact inspection, without running `freeze.py`, found:

- All **15** current `review.sha256` entries match their local artifact bytes. The observed review-root SHA256 is `58da993a0999ab4be276f2c85d31fe15d44d7737f2d799e78849bff74ba68dea`; this is local consistency evidence, not independent authentication of that root.
- The manifest names `packet-0a0230d80524551da50808cdec3406d26065273e323c0ce1d0ecf870ca8deb1f.tar`; its actual SHA256 matches the filename and review entry. It has 81 members, including exactly one `docs/evidence/repairs/be01-bootstrap-tools/invoke-regression.sh`.
- That regression member is a regular file with **2,174 bytes, 51 physical lines, LF endings, no CR bytes, no UTF-8 BOM and a final LF**. Its bytes are identical to the assigned workspace file and its SHA256 is `54a9ebeba4282b387b8febab2bd21c8c10732a90a3539adbab51f63dbca1effc`.
- The member's `delivery.json` hash, size, line count and workspace hash agree; `delivery_lf_normalized` is false. Its payload-manifest entry carries the same hash. External `payload.sha256` is byte-identical to the archive's manifest.
- **Executable-mode observation:** the regression tar member is **0644, without executable bits**, with UID/GID 0 and mtime 0. This follows `freeze.py:82,93` and the RUNBOOK's explicit files0644 policy. RUNBOOK invokes the regression through `bash`, which requires readable script bytes, not an executable bit. Direct `./invoke-regression.sh` is not supported by this packaging. No executable-bit verification is claimed.

The coordinator resolved the dispatch's executable-mode wording in the reply to `msg_4f4272f9c293`: record intentional 0644 interpreter invocation without a defect; the RUNBOOK's Bash command does not require executable bits. Packaging therefore meets the clarified mode requirement. No mode repair is recommended.

## Separate coordinator-provided execution evidence

After the static assignments, the coordinator reported an isolated fleet Docker execution and explicitly authorized reading [the result log](../evidence/c1-7f40572dce524d048714de86282abd25-result.log). The log contains `invoke.sh: OK`, `invoke-regression.sh: OK`, all eight case names above with `PASS`, `test_exit=0` and `cleanup_exit=0`. This is externally supplied execution evidence, not a test run by this worker or a conversion of static reasoning into a PASS.

The concise log does not contain the expected source-hash values or the full runner command. Exact local hashes are verified above; association of that log with the approved remote setup remains coordinator-owned. Its cleanup status is recorded without independently certifying removed identities or reclaimed space. No other execution artifacts were opened.

## C1 disposition and remaining evidence

**Close C1 as a static repair finding for the exact hashes above.** Its original unguarded post-parent writes have explicit failure capture, reconciliation is attempted, nonzero parent status survives, and otherwise-successful work fails closed on required metadata-write errors. The coordinator's separate eight-case regression log supports the intended outcomes, subject to the provenance limit above. This worker's tests remain **NOT_RUN**; applicable Docker lint/syntax/type checks, full invocation/inventory/reconciliation integration and real timeout behavior remain **pending/unverified by this review**. No whole-packet approval is asserted.

The mode requirement is resolved by the coordinator's explicit Bash/0644 clarification. Other source files and prior findings were not re-reviewed. Coordinator incorporation into `code-reviews.md` and state tracking is outside this worker's one-file write authorization.
