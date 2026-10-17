# Backend findings ledger

Original cloud review completed with exit 0 at `2026-10-11T19:28:27.5137951Z`, against frozen HEAD `5785eba47f3709debb2815c8d86608f7e62d02f3` and intended base `eedc43b736791e7e41656d405f10caf3d4164e01`. Re-read existing coordinator `ultrareview-backend.json` and `ultrareview-backend-exit.json`; no review was invoked. The final JSON contains exactly one nit, not the subsequent runtime or bounded-review defects.

## Original ultrareview finding

| Finding | Exact source paths | Disposition and next action |
| --- | --- | --- |
| BE-CLOUD-01: repeated membership predicates (nit) | `ops/db/bootstrap.sql:33-81`; `apps/server/db/migrate/20261012000002_restrict_api_read_membership.rb:38-47,56-61`; `ops/tests/membership-catalog.sql:10-16` | Not refactored; maintenance risk retained deliberately. Bootstrap, migration and independent oracle enforce different lifecycle contracts. No behavioral defect established. Parent reports R3b membership/catalog transitions and negative probes passed. On a future policy change, update and review all three contracts together and rerun transition/negative checks. |

Original-review totals: **1 nit retained with rationale; 0 behavioral defects established; 0 cloud findings claimed fixed.** The suggested deduplication remains unimplemented, not silently closed as a code fix. No further ultrareview is authorized.

## Related repairs (different provenance)

| Finding/source | Status | Next action |
| --- | --- | --- |
| Noexec fixture and PowerShell pipeline, `ops/tests/egress_test.rb` | Fixed. Parent Docker shell/noexec checks passed; Linux PowerShell passed 9/48/0 with exact cleanup; native Windows unverified. Original Devin failure's precise cause remains unproven. | Keep source frozen; native Windows and actual PowerShell orchestration remain separate. |
| SQL CASE parsing, `ops/tests/membership-catalog.sql` | Fixed; parent R3b catalog transition/negative checks passed. | Keep validated source frozen. |
| Transaction ownership/unwind, `apps/server/lib/elevateo/tenancy.rb`; regression `apps/server/test/be_01_r1/tenancy_test.rb` | Fixed; parent R3b pool1/pool5 each 12 runs, 698 assertions, no failures/errors/skips. | Keep validated sources frozen. |
| Worker privilege oracle, `apps/server/test/be_01_r1/worker_role_test.rb` | Fixed without extra grants; parent R3b 1 run, 25 assertions, no failures/errors/skips. | Keep validated source frozen. |
| Cleanup probe timeout, `docs/evidence/scripts/be-01-r1-fleet02-resources.sh`; regression `ops/tests/fleet02_runner_regression.sh` | Fixed; prior static closure and parent synthetic Docker passes recorded in repair status. | Preserve exact-ownership cleanup; do not reinterpret original psql exit 3 as cleanup failure. |
| Readiness race and JSON-stream acceptance, `ops/tests/egress-check-fleet02.sh`; regression `ops/tests/fleet02-egress-readiness-regression.sh` | Fixed statically; latest parent re-review 152 LOC, 0 remaining defects, 0/KLOC at hashes in Lane C handoff. Synthetic Docker and actual Lane C subsequently passed. | Keep validated package frozen. |
| Ineffective negated comparison, `ops/tests/fleet02-egress-regression.sh` | Explicit failure repair statically closed: parent profile/context re-review 127 LOC, 0 defects, 0/KLOC. | Synthetic Docker passed; keep package frozen. |
| Context selection allegation, `ops/tests/fleet02-egress-compose.sh`; driver `docs/evidence/scripts/be-01-r1-fleet02-compose-egress.sh` | P2 formally withdrawn: original 162 LOC, 0 confirmed defects, 0/KLOC. Explicit context is hardening only. Operation-specific deadline checks added in `ops/tests/fleet02-egress-context-regression.sh`. | Context static re-review closed (combined 127 LOC, 0 defects); Synthetic Docker passed. Never count withdrawn P2 as fixed defect. |

Current package hashes and parent commands: [Lane C handoff](be-01-r1-lane-c.md). Historical evidence and limitations: [repair status](../backend-ultra-repair-status.md). Actual Compose Lane C and Linux PowerShell Lane P passed; see be-01-r1-lane-c-hostname.md and be-01-r1-lane-p-result.md. Broader B01 acceptance, native Windows and Lane P2 remain pending. This documentation sync ran no tests, Docker, push or ultrareview.
