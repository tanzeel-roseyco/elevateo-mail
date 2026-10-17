**PERF-01 opinion from Fable 5.1 (claude-fable-5-1), read-only, nothing executed.** Overall verdict: **support with changes**. The pre-measurement verdicts are sound. The prerequisite blockers are the contract tests, the design gate, the fleet-02 reservation and the cleanup repairs. Everything else below is optional improvement or a measurement-validity fix.

## 1. Per-class verdicts

| Class | Verdict | Blocker or optional | What would overturn it |
| --- | --- | --- | --- |
| A indexes | Support no-change | n/a | Only tier-3 plans, which are labelled non-product. Nothing at product scale can. |
| B context_uuid SQL body | Defer; evidence-only | Optional | Function self-time above 20% of statement time at tier 2 and a whole-request delta above the noise floor. Even then it edits the one security-critical function and needs the full gate. |
| C tenancy round trips | Support forbidden | n/a | Nothing. Each round trip and both cache clears carry an invariant. |
| D /ready fan-out or cache | Support no-change | n/a | Nothing for cache. Fan-out only if Codex accepts a bounded unhealthy path as a correctness goal. |
| E development.rb and puma.rb | Support measuring | Prerequisite: contract tests, baseline, gate | A delta below twice the pass-1 versus pass-2 noise floor yields no-change. |
| F YJIT, frozen body, log level | YJIT verify: support. Frozen body: defer. Log level: defer to Codex. | Frozen body is a controller edit blocked by the Steep gap. | YJIT already enabled makes that row no-change. |
| G tmpfs and --disable-gems | Support measuring, Compose-only | In-image checks first | Idle CPU and write bytes inside the host noise band. |
| H no-change | Support | n/a | Expected outcome for A, B, C, D and possibly F. |

**Recommendation on D, with an evidence gap.** The brief's correctness item assumes `connect_timeout` bounds the database check. It bounds only new connections. In workload W7 the pooled connection is already established, and a paused database leaves `SELECT 1` blocked on a socket read until TCP retransmit gives up. The bounded design needs `tcp_user_timeout` or a client-side read bound plus lease release, which is a different change with its own gate. Record D's correctness item as a separate task and do not fold it into the performance branch. Affected contract: the readiness 503 path and the pool-hold hazard in request-path section 4.

**Recommendation on E.** The r1 test pattern runs under `RAILS_ENV=test`, while the candidate adds only `config/environments/development.rb`. The contract tests would then never exercise the candidate middleware stack. Require the contract tests to run in the candidate image under the same `RAILS_ENV` as the measured api service, and capture `bin/rails middleware` output for both environments as evidence. Affected contract: the byte-identical equivalence list in backend-contracts.

**Recommendation on G.** Before proposing `--disable-gems`, benchmark-runner should also confirm the probe still exits 1 on a missing file and on a 21-byte file, since RubyGems-free boot changes nothing else but this is the only tested path. The tmpfs mount must be `mode=1777` because the process runs as uid 10001. Both checks are proposed tests, not run.

## 2. Measurement plan

The five primary metrics are adequate with two corrections.

- **Allocations metric contradicts candidate E.** The Rails `Allocations:` log field counts only inside `process_action`. Reloader and Static run outside it, so the log-based metric would show E as no change even if it works. The whole-stack `GC.stat` MockRequest method in request-path section 5 must be the primary allocation metric.
- **Between-project noise is unmeasured.** Pass 2 estimates noise within one stack. Baseline and candidate are separate projects at different times on a host with production neighbours and swap in use. Add an unmodified baseline project after the candidate so the comparison is A, B, A'. Treat any candidate delta inside the A versus A' band as indistinguishable.
- **Boot time needs repetition.** Report boot-to-first-200 over at least five container starts per image, median and range, not one start.
- **Unnecessary:** tier 16 new-connection runs on `/ready`. With five Puma threads they measure queue depth, which no candidate changes. Dropping them shortens each project.

**Ruby stdlib client.** Acceptable as a relative instrument if it is identical across runs. It is invalid when the client sits at its CPU cap while api is below its own cap, when the client runs the candidate image rather than the baseline image, or when both compete for the same physical cores under neighbour load. The second case is real: the client is built from the server image, so a candidate that touches the Dockerfile or `RUBYOPT` changes the instrument. Pin `perf-load` to the baseline image id for every run and record that id in the manifest.

## 3. Safety on a shared production host

The four required repairs are necessary and not sufficient. Remaining ways to harm a non-task resource or misreport:

1. **Paused containers cannot be stopped.** Workloads W5 to W7 pause task-owned containers. If the run aborts while one is paused, the exit trap's `docker stop` is refused by the daemon for a paused container. The frozen container keeps its memory on the production host and is recorded as retained. Regression, not run: the fake docker reports `.State.Paused=true` for an owned id and the trap must issue `unpause` before `stop`, with zero stops attempted on unowned ids.
2. **Secrets can enter evidence.** `docker inspect` of any task container exposes `.Config.Env`, which holds the generated database, JWT and secret-key values. The perf-sql container carries the api password. Rendered `compose config` output interpolates the env file. Regression, not run: before `SHA256SUMS` is written, grep the whole evidence tree for every value in `ops/local/.env` and fail the run on any hit. Record only the hash of `compose config`, never its text.
3. **Exit code does not match the documented contract.** benchmark-runner section 9 says the exit is non-zero whenever anything was retained. In the supplied revision, volumes retained for lack of the flag, pulled images retained by default and pre-existing images use `record`, not `retain`, so the script can exit 0 with task volumes still on disk. Either change the documentation or the script. A false "clean" is the result today.
4. **Mid-run host protection is absent.** The host-quiet guard runs before each 20-second run, and load average lags. Regression, not run: the sampler writes an abort file when load1 exceeds the cap during a run and the client checks it between batches.
5. **Capped worker changes what is measured.** At 0.25 CPU the probe's Ruby cold start may exceed its 3-second timeout, so the baseline worker can read unhealthy. Identical for both images, but record `.State.Health` per window and say so in the report.
6. **Build cache repair C2.** Name or label ownership requires a dedicated builder created by the task. Without that, retain all cache; the saving is small on a host with 256 GB free.

## 4. Ordering and gates

Agree: contract tests land and pass on the baseline image before any request-path change, with the same-environment requirement from section 1. Agree the Steep seams gap is a separate repair task. PERF-01 should limit itself to config and Compose candidates that Steep does not target, which leaves E, G and YJIT verification in scope and the frozen body out. Agree `connect_timeout` and lease release are correctness work, with the caveat that the proposed timeout does not bound the frozen-database case. Feasible order: reservation, harness guard tests, baseline A with in-image facts, contract tests, gate synthesis, candidate B, baseline A', cleanup.

## 5. Invariants and failure sequence

No supported candidate touches transaction-local identity, FORCE RLS, roles, parameterized queries, worker hold, egress or capture-only mail. E changes middleware only. G changes a mount and a probe flag. The riskiest candidate is B if a later implementer relaxes volatility.

Failure sequence for B: migration marks `context_uuid` IMMUTABLE for speed. Rails prepares the mailbox query and after five executions uses a generic plan. Principal A runs it on a pooled connection, the planner folds A's organization UUID into the plan. Principal B gets the same connection, sets its own claims, executes the generic plan and receives A's mailboxes. No error, no log line.

Regression, not run: in a one-connection pool, execute the same prepared statement six times as principal A, then as principal B in a fresh transaction, and assert B's row set. Add `provolatile = 's'` for `app.context_uuid` to the membership-catalog fingerprint so a volatility change fails the catalog check.

Failure sequence for E: a developer later adds a source bind mount, keeps `RAILS_ENV=development` and expects reloading. They edit a controller and see stale behaviour. Regression, not run: an AIDEV-NOTE in the environment file and a contract test asserting `Rails.application.config.enable_reloading` is false in the measured environment.

## 6. Honest limits

No frontend consumer or mailbox API exists, so "frontend-serving backend speed" is only health and readiness latency, framework defaults and the tenancy wrapper's fixed cost. Any result is a microbenchmark of a foundation, not product speed. Defer to BE-02 and later: the missing `mailbox_memberships (organization_id, user_id)` index, serialization choices, pool sizing from real query mixes and any request budget. Record the tenancy floor as planning input, not as an optimization target.

## Top three cross-task recommendations

1. Pin the load client to the baseline image and use the whole-stack allocation metric, otherwise E cannot be fairly judged.
2. Add the paused-container unpause step and the secret-grep gate to the harness before any remote execution.
3. Split the `/ready` timeout and lease work into a correctness task with a bounded design for established connections.

**Hard contradiction.** benchmark-runner section 9 promises a non-zero exit whenever anything is retained. The supplied cleanup script exits 0 with default-retained volumes and images. One of them must change before the script is trusted on fleet-02.
