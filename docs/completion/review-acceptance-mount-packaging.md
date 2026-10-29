# R3 mount-packaging source review

Date: 2026-10-14. Task: task_73abfb4af7bf; dispatch: ctx_bdd2b67f7160.
Reviewer: Codex (GPT-6 family per session instructions); exact backend model variant and reasoning-effort setting are not exposed to this worker, so neither is asserted.
Runtime: **NOT_RUN**. No Docker, host application tests, SSH, server, installs, commits, or subagents were used. Style is delegated to linters.

## Coverage and identity

One source read/review pass, 162 unique physical implementation/test lines total:

| File | Exact range | LOC | Verified SHA256 |
| --- | --- | ---: | --- |
| ops/local/acceptance-integration-r3-20261014/stage-and-unit.py | 1-137 | 137 | c13395ad5171c50420e75fee59212a68e5963fd90c502b87ada73810dfde1960 |
| ops/local/acceptance-integration-r3-20261014/launch.py | 1-25 | 25 | 8149a54026ae6edf648f68838b71c3cd2ad9cbc935acfd751d4f640e14aa3ffe |

Both complete-file hashes matched before inspection and again before reporting. No implementation outside these ranges was inspected. Root AGENTS.md and .planning/STANDARDS.md were read; no nested AGENTS.md was found under ops or docs by the scoped filename search. Large historical project state/documentation output was truncated; no claim of exhaustive historical-document review is made.

## Verdict and defect

The fixed empty tmp/log directories address the described regular-files-only archive omission at source level. One MEDIUM test-oracle defect remains; this is not evidence that the current explicitly read-only bind is writable.

1. **MEDIUM — positive source-read-only oracle also passes for a writable bind.** stage-and-unit.py:17,43,48-50,104,110-112. Staging runs as UID 1001, sets directories to 0755, and runs the container as UID 10001 with all capabilities dropped. Therefore `touch .unexpected-write` fails for discretionary permissions even if `readonly` is accidentally removed from the bind at line 106. The shell treats any failure as proof of source immutability, suppresses its cause, and can print MOUNTS_OK under the wrong topology. Minimal repair: check the actual /workspace/apps/server mount's read-only flag from inside the probe (for example Linux mountinfo), or require the failed write's specific EROFS errno rather than any failure. Add a writable-bind discrimination control that fails this positive oracle despite the same ownership/modes. Preserve frozen source hashes and do not chmod application source merely to make the test discriminatory.

Defects: **1** across **162** reviewed physical LOC; density **6.17 defects/KLOC** (1 / 162 * 1000). No style-only findings counted.

## Checklist

- Archive extraction: pinned archive digest and exact byte size, 420 expected entries, duplicate raw-name rejection, regular-files-only validation, absolute/traversal rejection, bounded member sizes, per-member digest checks, exclusive file creation, and normalized file modes are present. Fresh SOURCE.mkdir and no archive links prevent archive-provided symlink traversal under the intended trusted-parent contract. This is source reasoning, not archive-content verification.
- Fixed directories: exactly apps/server/tmp and apps/server/log are created exclusively; verify checks both are real non-symlink empty directories and checks the exact regular-file hash map. Existing/conflicting paths fail rather than being silently accepted.
- Positive/negative cases: tmpfs writes to both destinations are asserted; missing-log and missing-tmp each require exit 125, read-only-filesystem stderr, and the corresponding absolute mount path. Neither negative accepts merely an arbitrary nonzero exit. Positive source immutability has defect 1.
- Boundary/empty/max behavior: empty or wrong-size manifest inventory fails; missing or malformed records fail closed by exception/assertion. Archive members have a 32 MiB ceiling, archive size is pinned, and calls have timeouts. Safety checks assume Python assertions are enabled; deployment interpreter flags/environment are outside this assignment.
- Mount/resource ownership: explicit default context and Unix socket gate, retained pinned image inspection, no network, read-only root/source, UID 10001, dropped capabilities, bounded memory/CPU/PIDs, and tmpfs limits are present. Cleanup checks name, task label, allowed read-only bind source/destination and mount types before force-removing the inspected ID. Finally blocks clean after attempted runs and verify name absence; no volume/image/build-cache removal or broad prune occurs.
- Cleanup/error limitations: cleanup failure deliberately stops reporting success; exceptions can prevent unit-results.json emission, and launch timeout can prevent integration-exit.json emission. Outer failure reconciliation and descendant containment cannot be established from this slice. Static names/labels presume exclusive task ownership; external writers/races are not eliminated here.
- Prerequisite reuse: source_files equality with R2 is intentional and does not itself claim a new unit run. The wrapper requires one successful prior result and prior container absence, then records prior_prerequisites separately from the three new cases. Supplied 51+12+14 and 3/18/16 results are coordinator context, not independently verified passes. Neither source manifest contents nor prior evidence authenticity is reviewed.
- Launch gate: three successful entries, container absence, and current regular-file hashes precede the frozen runner invocation; nonzero child exit is propagated. Launch does not itself recheck directory topology, relying on staging and exclusive source custody; external deletion between steps remains a design limit.
- Maintainability: bounded one-shot staging/probe helper and small launcher; useful AIDEV comments explain archive and mount coupling. No duplicated domain backend, unnecessary abstraction, database hot loop, or unrelated feature expansion was observed. Python functions have explicit return/parameter annotations; full typechecker conformance is NOT_RUN.
- Documentation: this report is the only changed file. Broader README/state/code-reviews aggregation belongs to the coordinator under the report-only scope.

## Design limits and unchecked dependencies

Analytical counterfactual: with the supplied ownership and modes, a writable bind still rejects UID 10001's write, which explains defect 1 without running the application. Keeping explicit empty directories outside the regular-file manifest is a small repair; source-file equality appropriately preserves prerequisite reuse, while separate directory assertions cover the newly introduced topology. No Obsidian connection or runtime design simulation was used; this is not an Obsidian-backed design review.

Unchecked: context.tar contents and supplied archive digest beyond the literal in source; manifest.json and R2 manifests/results; the claimed unchanged 414 application files; frozen be02/run.py and its process-tree cleanup; Docker/OCI version-specific error text; parent staging permissions and interpreter invocation; root's watchdog and independent cleanup; integrated Rails, browser, native, connector, and production behavior. No test passes, live readiness, or complete cleanup are inferred from code.
