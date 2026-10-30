# Transport preflight stop and dependency-order correction

No transport test/build/staging occurred. The 30-minute transport lease is relinquished after successful read-only follow-up reconciliation; root independent acceptance remains requested. No task Docker resources were allocated or removed. All frozen execution bytes and original failed evidence are preserved.

## Actual evidence

Remote audit: `/home/tanzeel/elevateo-mail-tests-20261012-ultra/be01-transport-audit-d473c069-e5cb-4e3c-ab87-c33590c41d5e`.
Local evidence: `C:/Users/Tanzeel/AppData/Local/Temp/be01-transport-preflight-d473c069-e5cb-4e3c-ab87-c33590c41d5e`.

- Original preflight SSH/process=1: canonical52 passed; two of ten inherited pins differed. This is a prerequisite failure, not test failure.
- Original reconciliation SSH/process=1: whole formatted image-list comparison stopped at reordered rows. Its downstream checks did not run. Original files remain intact.
- Separate follow-up SSH/process=0: `followup.status`, `followup-components.status`, `followup.log`. Exact retained image/base Id/RepoDigests/labels and four volume identity fields match; builder Name/Driver/node endpoints match; successful full container inventory has no services-check task; all six file destinations plus module directory absent, including dangling links; canonical52 passes. No task ID was allocated. Parent/test/cleanup statuses are NOT_RUN, not zero.
- Available bytes before272155332608; after272171724800; raw shared-host delta +16392192. No attributable reclaimed space claimed.
- Four volumes `be01services-6f1401a6-071b-475a-8c27-1a3de66edc4b-{config,data,state,storage}` remain untouched. App `sha256:7d755994b0456f71886c92ec548e55b64f58d0c8a579c14cde401f23b715b0f8` and pinned Ruby/BuildKit remain. No recovery/service/image deletion occurred.

## Dependency defect and exact proposed delta

Deployed services manifest is b20a69471069c9e8c24d241c327fb1457c55982d175756b3623bd15036e7cbc3; app manifest is2da812bb3a95fabdad927a7ed9d5c7fb1e03d4fac0601ca66100c80938f48466. Package52a8c974 instead requires capability-repaired ad4773807748c99d23c763f2a6203a4cde276c68cca09ea6f9f030380252235d/e00f1937002e6efef78b3a7dd1e733f351955377e95fe43fdbddc1036c3245ef. These are known unstaged repairs, not canonical corruption.

Current ordering creates a cycle: mocked transport validation requires repaired capability manifests; capability staging follows retained-resource recovery; recovery requires mocked transport validation. The copied nested service authentication is unnecessary: parent only builds the separately pinned tools Dockerfile/checks, sources resource helper/cleanup/runtime, and runs transport checks/regression. Runtime never invokes real recovery; regression replaces the recovery invocation and authentication with mocks. Baked services checks are copied as authenticated build bytes but are not invoked by this parent.

Review proposal (execution files remain frozen until this delta is accepted):

1. In parent-run.sh and checks.sh, replace their check_sources manifest list with only `ops/tools/be01-transport-check/package.sha256 ops/tests/fleet02-egress-source.sha256`. Keep explicit failure returns and external package hash authentication. Add AIDEV note that mocked transport has no service/app dependency; real recovery retains separate historical oracle checks.
2. Remove only unused manifest entries for services/package.sha256, services/dependencies.sha256, tests/be01-services/package.sha256, services-app/package.sha256 and lane-c-app/app.sha256 from the new transport package. Keep original exact tools Dockerfile/checks, helper, cleanup, canonical52 manifest, runtime, transport and regression pins. Refresh only changed parent/checks self-pins and new package/archive hashes after implementation/review; never repin to deployed older service manifests. Historical archive85042689/package52a8c974 remain evidence.
3. Bounded regression prerequisite: mocked checks authentication succeeds with only these exact transitive inputs, fails on each used-file drift and canonical-source drift, and does not require service/app manifests. Existing transport cases remain unchanged. Execute only in Docker after review and fresh allocation. This new dependency-boundary regression is not yet authored or run.

## Valid next order / gates

Implement/review the narrow dependency patch and boundary regression; create new authenticated six-file delivery (or explicitly reviewed additional regression member), then fresh transport-only allocation and one capped tools/mock test plus independent cleanup. Only PASS permits separately allocated historical volume recovery, then separately reviewed image disposition. Capability eight-file old-pin staging remains a distinct subsequent allocation, with its original source/ownership prerequisites. Full Auth/private Storage/restart acceptance remains pending. No capability staging is smuggled into transport validation.

## Review accounting

Historical wiring correctness130LOC zero; completed design201LOC (130 wiring+71 repaired regression) zero, overlaps/nonadditive. Regression correctness71 zero after single original LOW SIGPIPE defect (both reviewers found same defect). Analytical design only; Obsidian unavailable. No runtime PASS. This new dependency-order finding is outside those static acceptance claims; proposed delta requires review.

Root subsequently accepted follow-up statuses/log via SSH0; spent allocation CLOSED. Proposed dependency correction now implemented locally and frozen (NOT_RUN), with exact hashes/review slices in be-01-services-transport-dependency-freeze.md. Original evidence and archive unchanged.
