# REV934 Orion TEST929 suite manifest source review

Reviewer: Elara. Actual Orca runtime `80fd7f05-8c59-444a-83d8-7ecea07e715b`, 2026-10-14. Candidate Orion commit `1aebd99be9cee3efc80eba9d3105db33e0e318f0` in `completion-orion-native812`; source-only, no shell syntax check, application test, Docker run, or implementation edit. Context: Orion's `docs/completion/orion-test929.md` and current project instructions/standards.

## Exact bounded coverage

| Packet | Source lines inspected | Unique versioned LOC |
| --- | --- | ---: |
| Runner | `ops/tests/be02/test-suites.sh:1-53` at candidate tip | 53 |
| Outer runner | `ops/tests/be02/run.py:205-222` at candidate tip | 18 |
| Compose test service | `ops/compose.be02-test.yaml:192-211` at candidate tip | 20 |
| **Total** | Three reads, each <=200 LOC; parent script not inspected | **91** |

`git ls-files 'apps/server/test/**/*_test.rb'` was used only as a path inventory, not a source read or runtime test. It lists 139 tracked files in 12 directories: administration 8, attachment_gateway 3, attachments 6, be_01_r1 4, be_02 60, campaigns 8, inbound 11, outreach_sequence 5, qa817 11, requests 1, send_worker 9, sends 13. Static classification of these names gives **130 standard and nine dedicated**: four be_01_r1 suites plus attachment_gateway migration_acl and authority_database, attachments database, campaigns database, and send_worker mailpit_protocol. This matches Orion's inventory at the candidate tip; runtime `globstar` expansion was not executed.

## Findings

1. **Discovery and once-only classification:** `globstar` plus `nullglob` enumerates `test/**/*_test.rb` under the Rails working directory; the `case` has mutually exclusive exact dedicated branches before admitted directory branches. Each current tracked suite path therefore enters one standard or deferred array. Required BE02/request/send sentinel files and nonempty standard selection fail fast. A newly introduced directory ending in `_test.rb` reaches the explicit unclassified failure. This is source proof for the current tracked path set, not proof about untracked files, symlinks, shell/runtime state or future test names.
2. **Dedicated gate visibility:** The nine current dedicated suites are not silently counted as passed. Each is printed with a reason; `test-suites.sh` runs no dedicated suite. The separate role/state/Mailpit gates in Orion's report remain necessary. The broad `test/be_01_r1/*` rule will defer future R1 files too; it preserves the stated isolated-migration rationale but requires a maintained separate gate to avoid indefinite omission.
3. **Failure propagation:** Each Ruby process gets a 90-second `timeout`, Steep 180 seconds, and RuboCop 90 seconds. Any command nonzero increments `failed`; the final numeric comparison returns nonzero if any check failed. `set -euo pipefail` also fails setup errors, and unknown suite paths fail before checks. Per-file `RUN` output supports attribution. There is no fail-fast on an ordinary test failure, which preserves later evidence. No shell execution was done here.
4. **Environment:** `run.py:218` invokes the Compose `test` service with 480-second outer deadline after migrations. The service mounts source read-only, sets the API role/process and exposes admin, migrator, API, worker and task-database values. Orion's report explains why the nine dedicated suites need distinct state or credentials; those conditions are not satisfied by this standard service and are deliberately deferred.

## Rubric and design assessment

No confirmed defect in the inspected 91 LOC: **0 / 91 = 0 observed defects per KLOC**. The single classification loop and small arrays are clear, bounded by the test-file count and avoid duplicated directory-specific launch logic. The exact dedicated matches before general patterns prevent double selection; shell quoting protects paths in the loop, while an unknown path fails explicitly. Null/empty discovery is guarded; maximum suite count has no explicit cap, which is acceptable for a repository-owned manifest but makes duration grow linearly. This packet reviewed a test runner, not product authorization; the dedicated privilege and protocol suites must run before interpreting coverage. Comments explain process isolation and admission policy. No unit test of the runner was inspected in this packet, and candidate runtime, command availability, process launch overhead, shell version, lint completion and all 130 suites remain **NOT_RUN** by this reviewer. Product documentation was inspected in Orion's TEST929 report; central release documentation was outside scope.

**Release decision:** source classification and error propagation are suitable to submit to Soren's fleet gate, but there is **no runtime PASS or release clearance**. The 480-second outer limit for 130 independent Ruby launches plus Steep and RuboCop is an unmeasured timeout risk, not a proven defect; Ada's separate design review and Soren's exact fleet receipt should determine whether that limit is sufficient. The nine dedicated role/state/protocol gates remain separate required evidence. No live mail, DNS or production action is implied.
