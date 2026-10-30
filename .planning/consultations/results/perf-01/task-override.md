TASK OVERRIDE: PERF-01 backend performance design consultation

This packet replaces the five initial planning tasks in the shared brief with ONE bounded task. Answer only PERF-01. The common constraints of the shared brief still apply. Tools are disabled; you cannot read paths. Everything you need is reproduced below under SOURCE headings with path and commit.

## Task identity

- Task ID: PERF-01, "Fable 5.1 backend performance team".
- Repository: tanzeel-roseyco/elevateo-mail. Frozen base commit 5785eba47f3709debb2815c8d86608f7e62d02f3 (BE-01 security-repair source checkpoint). Delivery branch perf/fable-5-1/backend-speed in an isolated checkout.
- Requirement: make the existing backend and the frontend-serving backend fast within the brief's invariants, with measured evidence, or deliver a truthful no-change conclusion. No frontend edits.
- Governing brief: SOURCE docs/backend-performance-task.md. Accepted constraints: SOURCE .planning/consultations/results/be-01/decisions.md and docs/decisions/0002-local-architecture.md.

## Current status at consultation time (facts, not claims of success)

- A six-teammate inventory has been completed read-only (SOURCE docs/perf-01/*.md). Zero application source lines have changed.
- A draft benchmark harness exists under ops/perf/ (design described in SOURCE docs/perf-01/benchmark-runner.md). It is frozen, uncommitted, unverified and has never been executed on any host. It refuses to run without a coordinator reservation of the shared host fleet-02. Two bounded coordinator reviews found and repaired eleven defects in it (ownership-scoped stop trap, bounded tunables and deadline, fail-closed stop/inspect/inventory, explicit unavailable rows, bounded Docker timeouts). No benchmark has run. No baseline exists.
- The base exposes only GET /health and GET /ready, four FORCE-RLS tables, a tenancy wrapper with no caller outside tests, and an idle heartbeat worker. No first-party frontend exists at this base. No mailbox API exists and none may be invented for this task.
- The design gate you are part of (separate Fable 5, Opus 5.5 and Fable 5.1 opinions, then Astra MAX synthesis) has not started before this packet. The team's own analysis, including its design-adversary, does not satisfy it.
- No speed improvement is claimed anywhere. Benchmark execution and performance acceptance are pending.

## Candidate classes under consultation

The inventory converged on these pre-measurement verdicts (details and reasoning in SOURCE docs/perf-01/README.md section 4 and docs/perf-01/design-adversary.md section 4):

| Class | Candidate | Team's pre-measurement verdict |
| --- | --- | --- |
| A | Supporting indexes for RLS policy subqueries | no-change (one-page tables; predicates already PK/UNIQUE-covered) |
| B | app.context_uuid as SQL-standard-body STABLE function, dropping SET search_path | evidence-gated; IMMUTABLE forbidden |
| C | Reducing Tenancy.with_context round trips or cache clears | forbidden (invariants) |
| D | /ready parallel fan-out or readiness cache | no-change / forbidden; the unbounded DB check and held lease are correctness items recorded separately |
| E | Minimal config/environments/development.rb (reloading off, eager load on, static off, same RAILS_ENV) and explicit config/puma.rb threads tied to the DB pool | strongest candidates, worth measuring; blocked behind contract tests, baseline and this gate |
| F | YJIT verify-then-maybe-enable; frozen /health body; log level | verify first / minor / experiment only |
| G | Worker: tmpfs for /tmp and ruby --disable-gems health probe (Compose-only) | worth measuring; interval/window/shell-check changes rejected |
| H | Truthful no-change conclusion | expected for A, B, C, D |

## Cleanup script: four confirmed coordinator findings (facts for your review; no model opinion is supplied)

The task-owned cleanup script (SOURCE ops/perf/cleanup.sh; the findings below were confirmed against revision SHA-256 f135397cf049a5a94221d7e34fc9e8a4cdc8f8743787fa1b7143894839d2db1d, 147 lines; the SOURCE heading records the revision actually included, which may already carry repairs in progress) received a bounded coordinator review. Four unique defects were confirmed; repairs with Docker-only regressions are queued to the script's owner and are not yet verified:

- C1 (high, volume step): the "synthetic fixtures only" proof is `grep -c` on the run manifest with errors suppressed; a missing or unreadable manifest yields an empty count, the `= 0` comparison is false, and the volume falls through to `docker volume rm`. Required repair: structured, fail-closed proof (manifest exists, parses, status complete, project matches, synthetic_only true; any uncertainty retains).
- C2 (high, build-cache step): "cache IDs absent at preflight and present at cleanup" on the default/global builder does not establish task ownership on a shared host and can prune another workload's cache. Required repair: task-specific builder ownership proven by name/label, or retain all unattributable cache.
- C3 (high, pulled-image step): "image absent at preflight" does not prove exclusive creation; a shared pinned image pulled by another workload in the interval could be removed. Required repair: retain shared pulled images without exclusive creation evidence recorded by this run.
- C4 (medium, throughout): docker list/inspect failures are hidden inside loops and pipelines (`wc`, `awk`, `sort`), so a failed listing reads as "nothing to clean" and the cleanup can report a successful empty result. Required repair: capture and check each command's status before parsing; fail closed on uncertainty.

Design simulations of these scenarios are analytical only; no Obsidian connection exists. No destructive execution is authorized and none has occurred. Your questions 3 and 5 below should treat these as open items: judge whether the required repairs are sufficient and what else a shared-production-host cleanup must prove before deleting anything.

## Questions to answer independently for PERF-01

1. For each class A through H: verdict support, change or defer. Distinguish a prerequisite blocker from an optional improvement. Is the team's pre-measurement verdict sound, and what evidence would overturn it?
2. Measurement plan: are the five proposed primary metrics (/health P50 and allocations, /ready healthy P50, idle worker cgroup CPU, container RSS, boot time), the matrix (passes x endpoints x keep-alive/new x tiers 1/4/16 x reps, pass 2 as unmodified repeat), the percentile sample minimums and the shared-host caps adequate to support or refute each candidate? What is missing or unnecessary? Is a Ruby stdlib client inside the server image an acceptable load generator, and when would it invalidate results?
3. Safety on a shared production host: identify any remaining way the harness design could stop, remove or starve a non-task resource, leak credentials into evidence, or report a false "clean" or "complete". Propose the regression that would catch it.
4. Ordering and gates: contract tests for /health and /ready before any request-path change; the Steep typing gap (missing sig/rails_seams.rbs); classifying /ready connect_timeout and lease release as correctness work rather than performance. Agree, change or defer, with reasons.
5. Invariants: does any candidate risk transaction-local identity, immutable principals, nested-context protection, FORCE RLS, least-privilege roles, parameterized queries, no-secret logging, the error contract, worker hold, egress denial or capture-only mail? Give a concrete failure sequence for the riskiest candidate and a regression check.
6. Honest limits: what can and cannot be concluded about "frontend-serving backend speed" when no frontend consumer or mailbox API exists? State what should be deferred to later tasks rather than optimized now.

Use the shared brief's required answer format for this single task. Target 1,000 to 1,500 words. Label every proposed test as not run. Do not claim measurements. Do not fabricate execution metadata; the coordinator records runtime identity separately.

## Packet contents and omissions disclosed

Included in full with path, commit and SHA-256 headings: the ten mandated current documents (documentation.md, .planning/POLYGLOT_ARCHITECTURE.md, .planning/CLIENTS_AND_CLI_CONNECTORS.md, .planning/AGENT_ORCHESTRATION.md, .planning/MAIL_ACCOUNTS_AND_ACTIVATION.md, .planning/TASK_BACKLOG.md, .planning/research/reuse-market-scan.md, docs/component-adoption.md, docs/contracts-and-reliability.md, docs/local-completion-plan.md); the accepted architecture constraints (docs/decisions/0001-mailbox-ownership.md, docs/decisions/0002-local-architecture.md, the accepted decision record D-01..D-10, .planning/STANDARDS.md); the PERF-01 brief and the seven inventory documents; ops/perf/cleanup.sh; and the complete current backend source (routes, controllers, lib, worker scripts, config, Dockerfile, Gemfile, Steepfile, both migrations, compose.yaml).

Deliberately excluded to keep this opinion independent: every earlier model opinion and synthesis (initial-plan and BE-01 opinion texts, synthesis.md, BE-01 decisions.md). The BE-01 refinements you need are restated in docs/decisions/0002-local-architecture.md "BE-01 foundation refinement". Also omitted: the other harness scripts (run-baseline.sh, lib.sh, preflight.sh, sample.sh, transfer.sh, load.rb, compose.perf.yaml, tests), whose design and repair history are described in SOURCE docs/perf-01/benchmark-runner.md and docs/perf-01/README.md; and the test suites under apps/server/test and ops/tests, summarized in SOURCE docs/perf-01/backend-contracts.md. If a conclusion depends on an omitted file, say so.
