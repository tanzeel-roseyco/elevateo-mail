# PERF-01: Fable 5.1 backend performance team

Status: prepared task brief, not execution or performance evidence.

## Assignment and provenance

The user explicitly requests a Fable 5.1 CLI coordinator with a minimum of six actual teammates to make the backend and the frontend-serving backend fast, submit a branch to Codex, and let Codex review/fix/approve it. Do not touch the frontend. This explicit task assignment supersedes the historical Devin-only author routing for this task; it does not waive engineering, consultation, security or verification gates.

- Repository: `tanzeel-roseyco/elevateo-mail`.
- Frozen starting commit: `5785eba47f3709debb2815c8d86608f7e62d02f3`.
- Isolated checkout: `C:\Users\Tanzeel\Code and projects\Elevateo Mail - Backend Performance`.
- Delivery branch: `perf/fable-5-1/backend-speed`.
- Lead runtime must report `claude-fable-5-1`; do not silently substitute a model.
- Use an interactive CLI agent-team session, not print mode ordinary subagents. Create at least six named teammates, record actual team/member/session identities, assignments and completed outputs. All six must do substantive work; a list of proposed teammates does not satisfy the request.

Read `AGENTS.md`, `README.md`, `state.md`, `documentation.md`, `.planning/STANDARDS.md`, `.planning/README.md`, `.planning/AGENT_ORCHESTRATION.md`, `LOCAL_BUILD_PROMPT.md`, `docs/local-completion-plan.md`, `docs/decisions/0002-local-architecture.md` and `.planning/consultations/results/be-01/decisions.md`. Current source is an incomplete security-repair foundation checkpoint. Older `.planning/BACKEND-STANDARDS.md`, `docs/product-master-plan.md` and `docs/backend-blueprint.md` do not exist at this base; do not pretend to have read them. Current standards and accepted decisions supersede their stale references.

Inventory and baseline research can begin immediately. Task-specific independent Fable 5, Opus 5.5 and Fable 5.1 opinions plus actual Astra MAX synthesis remain an implementation-design gate. Report the proposed bounded optimizations and measured baseline to Codex so it can coordinate that gate; do not invent completed opinions or claim this preparation brief is their acceptance. Existing accepted BE-01 architecture is a constraint, not blanket acceptance of a new architecture.

## Scope and non-negotiable invariants

Allowed implementation scope is existing `apps/server` backend, narrowly related `ops`/Compose settings, backend test/benchmark scripts and task documentation. The frontend's backend means server request/database/serialization work serving UI needs. It does not permit any UI, frontend state, fixture gateway or browser-build edits. Do not change `apps/web`, root frontend `src`, frontend packages/assets/styles, frozen wire contracts, `third_party/upstream`, another checkout or another agent's branch. Do not invent missing mailbox APIs, caches, queues or features just to have something to optimize: current base exposes only health/readiness and foundation mechanisms. Describe limitations honestly.

Preserve transaction-local identity, immutable principals, nested-context ownership protections, FORCE RLS, current authorization, least-privilege roles, parameterized queries, no-secret logging, validation/error contracts, worker hold, runtime egress denial and capture-only mail. Never disable safety checks or change semantics to improve a benchmark. No global identity/cache state; no new dependency without demonstrated need and documented justification. Prefer measured simple changes. Do not alter production services, DNS, credentials, provider accounts, live sending, purchases or public deployment. Do not resume Devin or spend its remaining credit.

## Six actual teammates and ownership

The lead coordinates and integrates; give writers disjoint explicit files before any edits. Inspection may overlap, writing may not. Each teammate sends findings and evidence to the lead.

1. `database-path`: inspect existing schema/RLS/query plans and realistic data cardinalities. Own only a specifically approved migration/query slice after baseline evidence and design gate. Never remove authorization or fabricate business queries.
2. `request-path`: inspect existing Rails health/readiness/connection handling, allocations and serialization. Own an explicitly assigned controller/config slice, preserving response contracts and deliberate failures.
3. `worker-path`: inspect idle worker/heartbeat scheduling, CPU/wakeup and filesystem costs. Own only approved worker/heartbeat files; retain liveness detection, bounded shutdown and outbound hold.
4. `backend-contracts`: inspect backend responses and frontend-serving coupling read-only, propose backend-only improvements, and own backend contract/regression tests. No frontend edits and no frozen-contract changes.
5. `benchmark-runner`: sole owner of remote Docker execution and new benchmark scripts. Coordinate serialized baseline/candidate runs on fleet-02, record raw evidence and exact cleanup. Other teammates send test requests to this teammate rather than launching competing workloads.
6. `design-adversary`: dedicated independent deep-design/tradeoff reviewer. Review bounded slices using the full rubric below; model both benefits and failure costs, invalidation/revocation/concurrency/overload cases. This teammate must not approve its own implementation. Record theoretical and practical tradeoff scenarios; Obsidian execution requires an actually available connection. If unavailable, report the gap and preserve analytical scenarios without claiming Obsidian execution.

Add bounded review assignments as needed to cover every changed code area; each assignment contains at most 200 lines, exact file/ranges/hash and relevant surrounding context. Keep styling/formatting to linters. Do not run Claude `/ultrareview` or `claude ultrareview`: the user's global maximum of two is managed exclusively by Codex.

## Measurement and Docker-only execution

All application tests, dependency installation, build and benchmarks run inside Docker on SSH alias `fleet-02` (port/config already installed locally). Do not start local Docker or run application tests on Windows. Host Git, SSH, archive transfer and read-only inspection are allowed. `fleet-01` and its workloads are out of scope.

fleet-02 hosts existing production workloads. Before creating resources, inventory only relevant exact names/IDs and preexisting image availability. Create a unique task directory, Compose project and `elevateo.perf.task=perf01` label. Use exact names and isolated networks; no published ports, privileged mode, Docker socket mounts, host networking or production mounts. Runtime mail-bearing services use the accepted internal-only network; dependency downloads happen during the build phase. Never run a global Docker prune, stop/restart existing services or delete unowned images/caches/volumes. Cap CPU/memory and benchmark concurrency conservatively; stop load if it affects neighboring services. The benchmark runner must coordinate resource reservations with Codex before its first remote test.

Use exact repository pins. Record image IDs/digests, lockfiles, source revision and dirty-diff hash. Synthetic data only; ignored generated credentials remain outside evidence. Readiness/token tests must not contact real email providers. Test at least empty/small/representative bounded workloads, valid and denied principals, reused connections and relevant concurrent failures.

Baseline before editing; candidate on identical fixtures, image/toolchain, resource caps and workload. Record warmup, repetitions, sample count, timing method, P50/P95/P99 where sufficient samples exist, throughput, errors, CPU/RAM, query counts/plans and any worker wakeup/IO metric relevant to the specific change. Explain external load/noise and do not claim statistically supported percentiles from inadequate samples. Include an unmodified repeat to estimate noise. Report regressions and correctness failures, not only best runs. A microbenchmark is not whole-application speed evidence. No absolute 'maximum speed' claim.

Immediately after required tests/preview, remove exact task-owned disposable containers and unneeded newly created images/cache. Inspect mounts before deletion. Preserve persistent data and any shared/preexisting resource. Delete disposable volumes only after proving exact ownership and synthetic-only contents; never `down -v` indiscriminately. Record retained artifacts and cleanup. Do not compact or shut down VPS Docker or unrelated workloads.

## Required review prompt (verbatim)

Does this code work? Verify that the code actually fulfills the purpose of the feature or bug fix. Check if the author considered null inputs, empty lists, and max limits. Ensure that changes to state or data structures don't inadvertently break other parts of the entire system. Ensure the developer isn't over-engineering or building things they might need in the future but don't actually know they need now. Check that new classes or functions aren't trying to do too much. Look out for duplicated logic that should be extracted into a shared utility or service. Ensure variable, function, and class names communicate their intent clearly. Check that comments explain why something exists, not just what the code does. Look for deeply nested loops or convoluted conditionals that could be simplified to help future developers read it easily. Confirm that unit and/or integration tests are included and directly cover the changed logic or new feature. Ensure the tests cover both the happy path and failure scenarios. Check if the author has updated relevant documentation. Make sure external inputs are sanitised and permission/authorisation checks are properly enforced. Watch out for unnecessary loops, repeated database queries in hot paths, or operations that could cause bottlenecks.

## Delivery and acceptance

Search existing AIDEV anchors before touching files, preserve/update their intent, add concise why-comments for non-obvious changes. Keep strict typing/RBS and boundary validation. Cover meaningful happy/failure paths and every fixed defect with a regression; run applicable lint, typecheck, unit and real-PostgreSQL integration checks in Docker. Security foundation failures are blockers, not optional performance tradeoffs. Record preexisting failures separately and provide raw evidence.

Maintain `code-reviews.md`: exact reviewed ranges/revision, defects/severity/fixes, total reviewed LOC and defects per 1,000 LOC with the denominator and deduplication method. Record dedicated tradeoff review. Update README Current state, state.md and documentation.md together with implementation commits; state performance and test limits precisely.

Submit a local committed branch to Codex with commit SHA, changed-file list, six teammate identities/contributions, baseline/candidate commands and raw artifacts, measured effects with uncertainty, regression results, security checks, review ledger, remaining blockers and cleanup manifest. Do not merge, publish, deploy, send mail or self-approve. Codex independently reviews/fixes and decides acceptance. If no defensible optimization exists in this narrow foundation, deliver evidence and a truthful no-change conclusion instead of speculative complexity.
