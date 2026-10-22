# Bounded initializer recovery harness review — 2026-10-23

Task task_21b333463002; dispatch ctx_2bff13b9097f; implementation owner ctx_f5eab65ab665.
Static review only. No scripts/tests/builds executed, imported source/tests read, secrets accessed, or nested workers started. Only this assigned report was written.

## Exact packets and acceptance

| Packet | Range (inclusive; physical lines) | SHA-256 | Defects | Defects/KLOC | Verdict |
| --- | --- | --- | --- | --- | --- |
| build-runner.sh | ops/production/initialize/build-runner.sh:1–24 (24 LOC) | 024979fa5201fe6725c25b4a135f9eaec82f2d971c4fd02a2c79e7880cb2ecdf | 1 HIGH | 41.67 | NOT ACCEPTED |
| quality.sh | ops/production/initialize/quality.sh:1–5 (5 LOC) | b0464591f64e9d4ae6ccd12438b550d5c5216b84bac5032e856ec0d4dab3034f | 0 | 0 | No confirmed static defect; runtime unverified |

Total: 29 unique physical source lines, 1 actionable defect, 34.48 defects/KLOC. No aggregate current-source acceptance because the builder ownership guard fails. Hashes bind this verdict; successor edits require re-review.

## HIGH — existing builder can be destroyed (build-runner.sh:14–22)

The standalone `! docker buildx inspect "$builder"` does not abort under `set -e` when inspect succeeds: Bash exempts inverted command status from errexit. Thus an existing builder proceeds to trap installation; create then fails for the duplicate name, triggering EXIT cleanup, which unconditionally runs `docker buildx rm "$builder"`. This can stop/remove a builder and its cache that the current run did not create, violating task-scoped cleanup and preservation requirements. The shared lease does not establish ownership of resources left by a previous run.

Use an explicit existing-builder conditional that exits before installing destructive cleanup. Track task-owned creation and remove only the builder this invocation actually created; treat inspect errors separately from proven absence. Fleet regressions should seed a pre-existing builder and prove it remains untouched, then exercise successful creation and failed-build cleanup. These regressions were neither read nor run in this assignment.

Finding immediately delivered to coordinator as msg_76dc21164436 and implementation owner as msg_5d3aee0925c8.

## Mandatory rubric checklist and bounded observations

- Purpose/correctness, null/empty/missing inputs, limits: fixed paths avoid caller interpolation; missing source Dockerfile fails early. Existing-builder failure is unsafe as above. No external input parser is present in these packets.
- State/data impact and permissions: fixed shared flock serializes cooperating callers with bounded waits; cleanup ownership is defective. No database/Auth mutation appears in these files.
- Source versus build context: source is copied into the exact directory passed to buildx, and the manifest is computed from that copied directory. This avoids hashing the original while building a different ordinary directory. The source is a mutable fixed path; the generated manifest is not compared to an expected approved digest here. Exact reviewed-source provenance remains an external admission requirement, not proven by this script.
- Recovery/cleanup: cleanup inspects builder mounts before removal and uses an exact builder name. Successful image retention is an explicit next-consumer handoff at backend.id, not proof of final image cleanup. Neither later image cleanup nor independent absence is visible in scope.
- Design/complexity, single concern, duplication, naming, comments: two small single-purpose scripts; no unnecessary abstraction, hot-path queries or nested loops. The AIDEV note explains fallback intent. Builder-state ownership requires the minimal explicit guard above, not a generalized lifecycle framework.
- Final quality paths: read-only staging root is mounted at /source; working directory resolves to /source/ops/production/initialize. Strict mypy, Ruff, compileall, Bash syntax and ShellCheck target staged paths; unittest names test_source and test_admission only. test_tenant is statically checked but not run here; broader coverage cannot be inferred. Imported modules, referenced shell files, Dockerfile and tests were not inspected.
- Error/loading/empty handling: Bash strict mode propagates ordinary command failures; quality inner bash uses -e and sequential checks. No UI is in scope. No claim of coverage for timeout/signal/runtime failure paths.
- Tests/documentation: existing top-level documentation states initializer regressions passed historically and full integration remains pending. This does not verify these hashes or happy/failure regressions. Required recovery tests remain fleet-only and owner/coordinator-run.
- Security/performance: quality uses --rm, a fixed pinned image, readonly source and writable temporary tooling paths; package installation requires network and registry trust. No secrets or live activation appear in either packet. No confirmed performance defect in scope.

Context: AGENTS.md and .planning/STANDARDS.md reviewed, plus current README/state/documentation sections. The first broad context output was truncated; current sections were reread explicitly. Full mandatory supplied rubric applied to both packets; styling left to linters. No source-formatting critique or whole-application acceptance is claimed.
