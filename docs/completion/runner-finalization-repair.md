# Runner finalization repair handoff

Task `task_e63836baec17`, dispatch `ctx_5d1c97fb79be`. Bounded repair of the confirmed MED finding in [the runner review](review-runner-command-and-fe-fixture.md), within the accepted test expansion. Requested role: Astra LOW; this handoff does not independently attest runtime model configuration.

Runtime: **NOT_RUN**. No host tests, Docker execution, SSH, builds, dependency installation, ultrareview, subagents or commits were performed. Root owns independent review, fleet execution, cleanup reconciliation, aggregate code-reviews.md and broader state documentation. Unrelated working-tree changes were preserved.

## Frozen source

Paths below are relative to `C:/Users/Tanzeel/Code and projects/Elevateo Mail - BE02 Codex`. LOC means physical lines including blanks/comments, measured with PowerShell Get-Content count; hashes are whole-file SHA256.

| File | LOC | SHA256 |
| --- | ---: | --- |
| `ops/tests/be02/run.py` | 205 | `9b739d525d2d8913adfa0fa70c49a3e36c5359c58b69e384fe9e3fda68399df1` |
| `ops/tests/be02/test_finalization.py` | 142 | `97d43b6c926e15d43b600541582a1475ec3ace28e83da22e86512c46f59567ed` |

Original runner reviewed hash: `6e6153361eded04525e93e72a04480e39aa98f32f7951553e6bdf0f5de7e2287`, 176 LOC. New production finalization occupies runner lines 37-81; main calls it at line 194. Suggested bounded review assignments: runner 1-105, runner 106-205, tests 1-142; no assignment exceeds 200 lines. Dedicated design review remains root-owned.

## Behavior

- A single typed `finalize` function is the actual main-finally path, allowing direct tests without running Docker commands. Its independent cleanup budget remains 240 seconds.
- Cleanup callback exceptions leave `cleanup_passed=false`; a nested finally always attempts `.env.runtime` unlink. Unlink failure also forces cleanup false and overall failure. Cleanup returning false retains the existing main exit predicate: success requires both passed tests and cleanup true.
- Service-log diagnostic write failure cannot bypass cleanup. Source verification/write failure cannot bypass the independent result write. Any of these evidence failures forces overall failure; result write failure returns failed status and emits only a fixed non-sensitive message.
- Original test failure text is retained before appended finalization errors, with Task.redact applied before result serialization. Cleanup/unlink exception strings and service-log diagnostics are redacted; diagnostic-write/source exception details use type names only. No raw exception text is printed.
- A successful resource cleanup is still reported true if only an evidence write fails; tests status is failed, so the overall exit remains nonzero. Cleanup evidence itself remains owned by cleanup.py, which was not modified. If result storage is unwritable, the write is attempted but durable result presence cannot be promised.
- The existing best-effort post-result space measurement remains outside this repair. Process termination that prevents Python finally execution and failures before entering main's existing try/finally are outside this bounded finding.

## Authored regression evidence

Nine stdlib unittest cases call actual `run.finalize` with real temporary-file I/O and actual Task.write/redact. Docker cleanup/compose and source hashing are patched; selected filesystem/evidence operations inject deterministic faults. Cases cover success, cleanup exception preserving an original test failure, cleanup exception after successful tests, unlink failure, service-log diagnostic write failure, source-evidence write failure, unwritable result evidence, cleanup returning false, and unarmed cleanup. Assertions check secret absence from returned diagnostics, captured stdout and written JSON, secret-file removal or explicit retained-file failure, independent result evidence, and failure status.

Pending command **inside the root-authorized Python Docker container**, with frozen BE source mounted at `/workspace`:

```sh
python3 -B -m unittest discover -s /workspace/ops/tests/be02 -p test_finalization.py -v
```

Root selects the reviewed pinned Python image, read-only source mount, writable disposable temporary directory, no-network execution and exact task-owned cleanup. No image pull/build or fleet allocation is authorized by this document. Root must also run its runner/fleet checks and applicable lint/type checks; no test pass, syntax-check pass or runtime cleanup success is claimed here.

## Defect accounting and acceptance

Historical confirmed finding: 1 MED over 299 reviewed runner/command LOC, **3.34 defects/KLOC**, as recorded in the source review (combined runner/FE review: 1/356, 2.81/KLOC). This repair is authored, not independently verified closed. No new independent review count or defect density is claimed. The 347 total source/test LOC above are file inventory, not newly completed adversarial-review coverage. No deep design change or Obsidian simulation was undertaken.

Only these two BE files and this Coord handoff were changed by this dispatch. Independent static acceptance and all runtime evidence remain pending; the application is not declared complete or publishable.
