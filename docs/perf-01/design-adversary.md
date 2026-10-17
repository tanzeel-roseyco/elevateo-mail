# PERF-01 design-adversary review: inventory and baseline tradeoff model

Status: independent analytical review of the frozen base. No source, test, compose or frontend file was changed. Nothing was executed; no Docker, SSH, tests or benchmarks ran. This file is the only artifact written.

## 1. Identity, independence statement and Obsidian status

- Agent name `design-adversary`, PERF-01 team; lead is the Fable 5.1 coordinator.
- Model id observed in this agent's system prompt: `claude-fable-5-1` (Claude Fable 5.1).
- Checkout `C:\Users\Tanzeel\Code and projects\Elevateo Mail - Backend Performance`, branch `perf/fable-5-1/backend-speed`, HEAD verified `5785eba47f3709debb2815c8d86608f7e62d02f3`, tree clean except the untracked brief.
- Start approximately 2026-10-12T06:20+11:00 (first tool call; first recorded host clock read was 06:23:09+11:00 after the initial document reads). Finish 2026-10-12T06:46+11:00.
- Independence: I implement nothing and will never approve a slice I authored. `docs/perf-01/backend-contracts.md` appeared during this work and was read as input only; where it corroborates an observation below I say so, and I do not treat it as authority.
- Obsidian: a deferred-tool search for "obsidian" returned no tool, and no MCP server or connector of that name is listed in this session. The requested Obsidian connection is unavailable. Every scenario below is analytical reasoning, not an Obsidian execution, and must not be reported as one.
- Design gate: the task-specific Fable 5, Opus 5.5 and Fable 5.1 opinions plus Astra MAX synthesis are not satisfied by anything this team writes, including this file. I will restate this in every review I deliver.

## 2. Sources read (physical line ranges, all complete files unless noted)

| Group | Files and lines |
| --- | --- |
| Brief and governance | `docs/backend-performance-task.md` 1-61; `AGENTS.md` 1-22; `.planning/STANDARDS.md` 1-50; `.planning/consultations/results/be-01/decisions.md` 1-84; `tradeoff-scenarios.md` 1-20; `docs/decisions/0002-local-architecture.md` 1-18; `docs/evidence/be-01-r1.md` 1-127 |
| Rails app | `app/controllers/application_controller.rb` 1-8; `health_controller.rb` 1-36; `lib/elevateo/config.rb` 1-65; `heartbeat.rb` 1-36; `tenancy.rb` 1-62; `bin/worker` 1-15; `bin/worker-health` 1-5; `bin/rails` 1-4; `config/application.rb` 1-28; `boot.rb`; `database.yml` 1-14; `environment.rb`; `routes.rb` 1-4; `config.ru`; `Dockerfile` 1-13; `Gemfile` 1-15; `Steepfile` 1-12; `sig/tenancy.rbs` 1-34; `sig/heartbeat.rbs` 1-8 |
| Schema and roles | `db/migrate/20261012000001_create_app_foundation.rb` 1-85; `20261012000002_restrict_api_read_membership.rb` 1-65; `ops/db/bootstrap.sql` 1-90; `ops/supabase/db/99-roles.sql` 1-8 |
| Compose | `compose.yaml` 1-222; `ops/compose.r1-test.yaml` 1-65 |
| Tests | `test/be_01_r1/tenancy_test.rb` 1-226; `test_helper.rb` 1-30; `authority_guards.rb` 1-60; `authority_guards_test.rb` 1-75; `baseline_scenarios.rb` 1-126; `baseline_driver.rb` 1-96; `membership_migration_test.rb` 1-107; `worker_role_test.rb` 1-13; `ops/tests/heartbeat_test.rb` 1-36; `egress_test.rb` 1-132; `egress_assert.rb` 1-102; `secrets_test.rb` 1-120; `db-fixtures.sql` 1-16; `membership-catalog.sql` 1-29 |
| Teammate input | `docs/perf-01/backend-contracts.md` 1-129 (input, not authority) |

Not read: `Gemfile.lock` beyond the Gemfile, `ops/bin/generate-secrets.rb`, egress shell wrappers, `third_party/upstream`. None bear on the candidate classes.

## 3. What actually exists to optimize

Two routes (`/health`, `/ready`), an idle worker loop, a tenancy wrapper with no production caller, four tiny FORCE RLS tables with three synthetic mailboxes, and no frontend in this checkout. "Frontend-serving backend" at this base means only the health/readiness request path and the per-call cost every future tenant-scoped request will pay. Any proposal that invents business routes, caches or queues to have something to measure is out of scope by the brief. A truthful no-change conclusion is a legitimate outcome and, for most classes below, the one I expect.

## 4. Tradeoff model per candidate class

Verdict scale: worth-measuring (a bounded candidate may be proposed after baseline), no-change (expected correct outcome at this base), forbidden (violates an invariant regardless of measurement).

### (a) Supporting indexes for RLS policy subqueries

Coverage check against the existing policies (`20261012000001` lines 52-70) and keys:

| Policy predicate | Existing index that covers it |
| --- | --- |
| `own_org_membership`: `user_id = ctx AND organization_id = ctx` | PK `(organization_id, user_id)`, both equality |
| `member_organization` EXISTS on memberships by `(organization_id, user_id)` | same PK |
| `visible_mailbox`: `organization_id = ctx` on mailboxes | UNIQUE `(organization_id, id)` and `(organization_id, address)` lead on `organization_id` |
| `visible_mailbox` EXISTS on `mailbox_memberships` by `(mailbox_id, user_id)` plus `organization_id` filter | PK `(mailbox_id, user_id)`; the extra filter touches at most one row |
| `own_mailbox_membership`: `user_id = ctx AND organization_id = ctx` | none; PK leads on `mailbox_id` |
| FK `mailbox_memberships (organization_id, user_id)` referencing side | none; relevant to cascade deletes only |

| Dimension | Analysis |
| --- | --- |
| Benefit | At three mailboxes and one membership the planner will choose a sequential scan whatever indexes exist; the table fits in one page. Zero measurable read benefit at any realistic PERF-01 cardinality. The only semantically motivated index is `(organization_id, user_id)` on `mailbox_memberships`, which serves `own_mailbox_membership` and the FK cascade path once tables hold thousands of rows. |
| Failure cost | One more index per insert on a table with no runtime writer in this slice. Migration adds a third version to a lane whose rollback behavior is tested only for migration 2. `CREATE INDEX CONCURRENTLY` cannot run in a transaction and would force `disable_ddl_transaction!`, breaking the per-migration rollback property; a plain `CREATE INDEX` on a one-page table is the only acceptable form. |
| Semantics | An index never changes RLS results; policy quals are applied as security quals regardless of plan. `app.context_uuid` is not LEAKPROOF, so it cannot be pushed beneath the security barrier. |
| Timing leak | Plan shape can change the latency difference between "row exists but denied" and "row absent". Today's sequential scan already exposes table size through timing; an index scan narrows but does not eliminate that. At this scale it is sub-microsecond and not a change in exposure class. Record, do not act. |
| Invalidation/revocation | None: indexes carry no authority. Dropping a membership row behaves identically. |
| Concurrency/overload | Nil at this scale. |
| Verdict | **no-change** for PERF-01. Note the missing `(organization_id, user_id)` index on `mailbox_memberships` as a schema observation for BE-02 when real cardinality and a write path exist. |

### (b) `app.context_uuid` volatility or language change (plpgsql STABLE to inlinable SQL)

| Dimension | Analysis |
| --- | --- |
| Benefit | Removes plpgsql call overhead (microseconds per call) for the three to four calls per candidate row. In a sequential-scan filter the function still executes per row even when inlined, because `current_setting` is STABLE and is not constant-folded. With three rows the whole saving is below any timing resolution the benchmark runner can defend. |
| Inlining preconditions | PostgreSQL inlines a SQL function only if it has no `SET` clause, is not SECURITY DEFINER and is not more volatile than its body. The current `SET search_path = pg_catalog` would have to go. A SQL-standard body (`BEGIN ATOMIC` or `RETURN ...`) binds `pg_catalog.current_setting` and the `uuid` cast at definition time, which preserves the search-path defense without the SET clause. Any proposal must use that form and prove it with `pg_get_functiondef` plus an `EXPLAIN (VERBOSE)` showing the inlined expression. |
| Volatility trap | Declaring the function IMMUTABLE, or anything that lets the planner fold it, is catastrophic: Rails uses prepared statements, generic plans persist across transactions on a pooled connection, and a folded tenant UUID would be baked into a plan reused for another principal. STABLE or VOLATILE only. This is the single highest-severity failure cost in the whole candidate list and it is silent. |
| Wrong-time evaluation | STABLE is only safe because `set_config` runs in a separate prior statement. If anyone combines this with (c) "merge set_config into the first query", the STABLE assumption is violated inside one statement and results are undefined. The two classes are mutually exclusive. |
| "Malformed raises" invariant | `nullif(current_setting(s, true), '')::uuid` raises `invalid_text_representation` on malformed input and yields NULL for NULL or empty, matching lines 9-12 of the migration. `tenancy_test.rb` 164-174 covers the raise; a replacement needs the same test plus explicit NULL and empty cases through a policy. |
| Migration risk | `CREATE OR REPLACE FUNCTION` keeps the OID so the four policies stay valid; rollback must restore the exact plpgsql body. Runs as owner; FORCE RLS does not affect DDL. |
| Verdict | **no-change** at this foundation. Technically defensible later, but it edits the single security-critical function for an unmeasurable gain and needs the full design gate. If the lead still wants a microbenchmark, it may be run as evidence only, with no code change proposed from it. |

### (c) Reducing Tenancy round trips (`tenancy.rb` 26-60)

Current per-context cost: `clear_query_cache` (in-process hash clear, no round trip), `uncached(dirties: true)` (flag flip), lazy `BEGIN` materialized by the `set_config` statement (two round trips: BEGIN then SELECT), the caller's queries, `COMMIT` (one round trip), `clear_query_cache` again. Floor is three network round trips on a local Docker network, roughly a few hundred microseconds total.

| Idea | Why the current code exists | Failure cost | Verdict |
| --- | --- | --- | --- |
| Merge `set_config` into the first business query | Claims must be visible before any policy evaluates (B01-04). Inside one statement PostgreSQL does not guarantee that a VOLATILE `set_config` in a select list or CTE runs before the scan; STABLE `current_setting` may be evaluated once with the pre-set value. Also there is no business query to merge into. | Undefined authority per row; interacts fatally with (b). | **forbidden** |
| Replace parameterized `set_config` with `SET LOCAL` | `SET` cannot take bind parameters, so values would be interpolated. | Violates "no interpolated SQL"; UUID regex mitigates but the invariant is explicit. | **forbidden** |
| Drop the entry `clear_query_cache` | AIDEV-NOTE line 4: claims and cached rows must share one owned transaction. Entry clear discards rows cached before authority existed in this executor scope. | Saves a hash clear, not a round trip. Removes a defense against a future caller that reads before entering context. No measurable gain. | **no-change** |
| Drop the exit `clear_query_cache` | After COMMIT the executor cache is re-enabled; anything cached by raw paths or by Rails internals during the frame would now be served to the next principal in the same request thread. T3 in `baseline_scenarios.rb` 89-125 exists because exactly this leaked. | Cross-principal row reuse. | **forbidden** |
| Drop `uncached(dirties: true)` and rely on clears | Reads inside the frame would populate the cache; nested `with_context` with the same principal is allowed and would then read cached rows legitimately, but a sibling raw query after the frame would too. | Same T3 class of leak. | **forbidden** |
| Pipeline BEGIN and set_config (pg pipeline mode) | ActiveRecord has no pipeline support; this is a new mechanism beneath the adapter. | New dependency surface, no demonstrated need, violates "no new dependency without need". | **forbidden** |
| Pooled-connection reuse of claims | `set_config(..., true)` is transaction-local; `assert_cleared` at `tenancy_test.rb` 23-28 and the concurrency test at 198-225 prove the pool returns clean connections. Any "keep the transaction open across requests" optimization would be a global identity state. | Principal B inherits A's claims. | **forbidden** |

Concurrency and overload: the wrapper's correctness under a 4-thread pool is already tested; the only overload-relevant cost is holding a pool connection for the frame duration, which is inherent to transaction-local identity. Verdict for the class: **no-change**, with a measured microbenchmark allowed only to document the floor for BE-02 planning.

### (d) `/ready` concurrency or timeout budgeting (`health_controller.rb` 11-35)

| Dimension | Analysis |
| --- | --- |
| Current behavior | Four sequential checks, each HTTP check bounded at 2 s open plus 2 s read; worst case about 12 s of HTTP waiting plus the database wait. `check` converts any `StandardError` (including `Timeout::Error` subclasses) into `false`, so the `checks` map is always complete and no partial result exists. `database.yml` sets no `connect_timeout`, so a black-holed DB host is bounded only by the OS; the backend-contracts inventory reaches the same conclusion. |
| Benefit of fan-out | Healthy path drops from the sum of four local calls (single-digit milliseconds) to the max (low milliseconds). Unhealthy path drops from about 12 s to about 4 s. Only the unhealthy path is human-visible, and it is a failure path, not a throughput path. Compose probes `/health`, not `/ready`, every 10 s. |
| Failure cost | Three extra threads per request. Under a probe storm with dependencies down, each `/ready` pins its Puma thread for up to 4 s and three helper threads for the same time; thread exhaustion then starves `/health`, turning a dependency outage into a false liveness failure and a container restart loop. Helper threads run outside the Rails executor; they must never touch ActiveRecord. |
| Pool hold during HTTP | `ActiveRecord::Base.connection` leases the connection to the request thread until the executor completes, so the DB connection is held during up to 12 s of HTTP waits. With pool 5 and an unknown Puma default thread count this is the real overload hazard today, independent of fan-out. Releasing it with `with_connection` around the `SELECT 1` is a small, contract-neutral fix but is correctness work, not performance work. |
| No-cache rule | Caching readiness for N seconds is global state and masks a down dependency; forbidden by the brief and by B01-07 ("safe real dependency checks"). |
| request_id | Already set by middleware on the response header; the body contract omits it on success. Not a performance item; any addition is a contract change needing lead sign-off. |
| Verdict | **no-change** for fan-out. **worth-measuring** only for bounding the DB wait (`connect_timeout` plus not holding the connection across HTTP), framed as an overload-correctness fix with a before/after dependency-down test, not as speed. |

### (e) Puma, YJIT, eager_load, production-like flags

| Dimension | Analysis |
| --- | --- |
| Current state | `RAILS_ENV=development`, no `config/environments/*.rb`, no `config/puma.rb`, `eager_load = false`. Rails defaults for reloading, file watching and static-file middleware therefore apply in the api container; this is the one per-request cost at this base that is plausibly measurable on `/health`. `load_defaults 8.1` requests YJIT when the interpreter supports it; whether the pinned `ruby:3.4.11-slim` build has YJIT compiled in must be read from `RubyVM::YJIT.enabled?` inside Docker, not assumed. |
| Benefit | Disabling reloading removes a per-request `ActionDispatch::Reloader` plus file-update check; eager loading removes first-request autoload latency. Expect sub-millisecond to low-millisecond per request. Memory grows modestly with eager load and by tens of MB with YJIT; cold start grows by the eager-load time, which the api healthcheck (10 s interval, 10 retries, no `start_period`) tolerates. |
| Failure cost | Switching `RAILS_ENV` to `production` changes more than speed: `consider_all_requests_local`, logging formatters, `ActionDispatch::ShowExceptions` behavior, and it makes `Rails.env.production?` true inside a capture-only local profile, inviting future code to treat it as a live gate. The fail-closed `Elevateo::Config` still runs through `database.yml` ERB and at first `Config.current`, so the hold and allowlists survive any env switch; that must be re-asserted by test, not assumed. |
| Behavioral equivalence required | Identical bodies and statuses for `/health`, `/ready` healthy, each single-dependency-down `/ready`, an injected unhandled exception, and a 404, before and after. Identical log line shape for `request.error`. These tests do not exist yet (see section 5); they are a precondition. |
| Puma | Default thread count versus `ELEVATEO_DB_POOL=5` must be inventoried first; a thread count above the pool produces checkout timeouts under concurrency that would look like a regression of any candidate. Prefer an explicit, documented thread/pool pairing over tuning. |
| Verdict | **worth-measuring**: a minimal explicit configuration (disable reloading, enable eager load, keep `RAILS_ENV` and `ELEVATEO_MODE` semantics unchanged) is the strongest single candidate. `RAILS_ENV=production` rename is **no-change** unless the lead records a decision that accepts its semantic side effects. |

### (f) Worker heartbeat interval, tmpfs, lighter healthcheck (`heartbeat.rb`, `bin/worker`, `compose.yaml` 187-202)

| Dimension | Analysis |
| --- | --- |
| Current cost | Worker: one wakeup per second, one `open(O_EXCL)+write+rename` per second into the container writable layer (overlayfs upper dir; `/tmp` is not tmpfs). Healthcheck: a full Ruby interpreter boot every 5 s to run `bin/worker-health`, which is tens of milliseconds of CPU and a transient process; this dominates idle CPU, roughly an order of magnitude above the heartbeat itself. The api healthcheck has the same Ruby-boot cost every 10 s. |
| Liveness bound | Window is 0..5 s inclusive; interval 1 s; healthcheck every 5 s with 3 retries, so detection of a stalled loop is roughly 15 to 20 s. Changing interval or window changes this bound, which the brief requires us to retain. A 2 s interval with a 5 s window tolerates only about 3 s of scheduler or GC stall on a shared host, risking flapping restarts under neighbor load on fleet-02. |
| Tamper and clock | Content timestamp and kernel mtime share one container clock, so skew is not a factor; the content form survives a stale file left in the writable layer across restarts because an old timestamp fails the window during `start_period`. A shell reimplementation of the check (stat/date) would duplicate the tested Ruby logic and lose `heartbeat_test.rb` coverage. |
| tmpfs for `/tmp` | Removes overlay inode churn and disk writes for a 20-byte file; cost is a compose change on the worker service only and a few KB of RAM. Rename-publish semantics are unchanged on tmpfs. Low risk, small but real IO benefit, measurable via container block IO counters. |
| Lighter healthcheck | Invoking Ruby with RubyGems disabled for `worker-health` keeps the exact tested code path while removing gem-index startup. Precondition: `securerandom` (a default gem) must still load without RubyGems in the pinned image; verify in Docker before proposing. Also applicable to the api probe. |
| Overload | Under CPU starvation the healthcheck itself is what times out (3 s), not the heartbeat; a lighter probe reduces that false-negative risk. |
| Verdict | Interval/window changes **no-change**. tmpfs mount and a lighter probe invocation **worth-measuring** (idle CPU from cgroup `cpu.stat`, block IO, and probe wall time over at least 10 minutes with an unmodified repeat). |

### (g) The "do nothing" conclusion

For (a), (b), (c) and the fan-out part of (d), no-change is the defensible outcome and I will treat proposals in those classes as needing extraordinary evidence. Only (e) reloading/eager-load, (f) tmpfs and probe invocation, and the overload-correctness part of (d) are worth a measured candidate. If their measured effect does not clear the noise floor in section 6, the correct deliverable is the baseline evidence plus a no-change conclusion, which the brief explicitly allows.

## 5. Baseline rubric observations on existing code (pre-existing, not performance proposals, nothing fixed)

| # | Observation | Rubric item | Severity |
| --- | --- | --- | --- |
| 1 | `/health` and `/ready` have no tests at all; the error envelope and 503 path are unasserted. Any request-path slice lacks a regression baseline. | tests cover happy and failure paths | blocker for request-path slices |
| 2 | `/ready` holds the leased DB connection across up to 12 s of HTTP waits (`health_controller.rb` 14-17); no `connect_timeout` in `database.yml`. B01-05 principle applied to the readiness path. | bottlenecks, max limits | P2 |
| 3 | `check` swallows every `StandardError` without logging which dependency failed or why; a programming error reads as "not_ready". Consistent with no-secret-detail, but zero operator signal. | error handling | P3 |
| 4 | `Elevateo::Config` is validated twice at boot (`database.yml` ERB `load!` and later `current`); api process defers `current` to the first `/ready`, so a config defect surfaces as a 500 there rather than at boot. Worker validates at boot. | duplicated logic, failure visibility | P3 |
| 5 | Heartbeat interval (`bin/worker` 13, `sleep 1`) and window (`heartbeat.rb` 31, `0..5`) are coupled constants with no shared definition or why-comment tying them together. | comments explain why | P3 |
| 6 | `Steepfile` 10 references `sig/rails_seams.rbs`, which does not exist; `Config` and controllers have no RBS. The typing gate cannot pass for any controller or config change. | docs updated, typing | P2 (pre-existing gap also noted by backend-contracts) |
| 7 | `mailbox_memberships` FK `(organization_id, user_id)` has no referencing-side index; cascade deletes from `organization_memberships` scan. No deleter exists in this slice. | repeated queries, future bottleneck | P3, BE-02 note |
| 8 | Puma defaults are unconfigured; thread count versus pool 5 is unknown. | max limits, bottlenecks | P2 (inventory needed) |
| 9 | `config.hosts.clear` disables host authorization; acceptable on the internal network but should carry a why-comment. | comments explain why | P3 |
| 10 | Nothing structurally over-engineered: controller, config and tenancy each do one thing; names are intent-revealing; AIDEV anchors at `tenancy.rb` 4 and 13, `heartbeat.rb` 10, `compose.yaml` 183, migrations and bootstrap are accurate and must be preserved by any slice. | over-engineering, naming | none |
| 11 | Inputs: the only external inputs are environment and `X-Request-Id`; env is allowlisted and fail-closed, request id is sanitized by middleware. No request bodies exist. | inputs sanitized, authz enforced | none |

## 6. Acceptance bar I will hold candidates to

1. **Noise floor first.** Baseline A and an unmodified repeat A' on identical image digest, fixtures, resource caps and workload. A candidate counts as an improvement only if its P50 delta exceeds both the A versus A' delta and two pooled standard deviations, with no P95 or P99 regression beyond the same bound. Percentiles are reported only with enough samples: P50 at 200 or more, P95 at 1,000 or more, P99 at 5,000 or more; otherwise report medians and ranges only. Worker candidates use cgroup CPU microseconds and block IO bytes over at least 10 minutes, repeated once unmodified.
2. **Suites must pass on the candidate image**: `tenancy_test.rb`, `worker_role_test.rb`, `authority_guards_test.rb`, `membership_migration_test.rb`, `baseline_driver.rb repair` (T1 to T3 all `REPAIR_PASS`), `heartbeat_test.rb`, `secrets_test.rb`, `egress_test.rb`, plus the new health/readiness contract tests before any request-path change is measured. Preexisting failures are recorded separately with raw output, never folded into a candidate's result.
3. **Invariants unchanged, checked by diff and by test**: policy text and `app.context_uuid` body unchanged unless the slice is explicitly about them; four tables still `relforcerowsecurity`; role attributes and grants unchanged (`membership-catalog.sql` fingerprints); `set_config(..., true)` parameterized; ambient-transaction rejection, nested frame identity, both cache clears and `uncached` intact; hold still forced; egress still denied; capture-only mail; no new global state; no new dependency.
4. **Slice shape**: at most 200 changed lines per review assignment, each with file, line range, and SHA-256 of the file at the reviewed revision, plus surrounding context. I review the diff against the frozen base and the final revision, not an intermediate.
5. **Every change carries**: a why-comment or AIDEV-NOTE if non-obvious, preserved existing anchors, happy-path plus at least two failure-path tests, and synchronized README Current state, `state.md`, `documentation.md` and `code-reviews.md` entries.
6. **Behavioral equivalence for configuration changes**: byte-identical bodies and identical statuses for `/health`, `/ready` healthy, each single-dependency-down `/ready`, an injected 500 and a 404, before and after, captured by the benchmark runner.
7. **Design gate**: Fable 5, Opus 5.5 and Fable 5.1 task-specific opinions plus Astra MAX synthesis are not satisfied by this team's analysis. Every review I write will state that the slice remains gated until Codex records those.
8. **Reject on sight**: any class marked forbidden above; any change whose only evidence is a microbenchmark presented as whole-application speed; any "maximum speed" claim.

## 7. Open questions for the lead

1. Is an explicit minimal Rails configuration (reloading off, eager load on, same `RAILS_ENV`) within the "narrowly related config" scope, or do you want a recorded decision before request-path drafts it? I recommend allowing it only after the contract tests exist.
2. Which metrics are primary given there are no business endpoints: `/health` P50 and allocations, `/ready` healthy P50, idle worker cgroup CPU, container RSS, boot time? I propose exactly these five and nothing else.
3. Please have benchmark-runner report from inside the image before any candidate: Puma default thread count, `RubyVM::YJIT.enabled?`, whether `securerandom` loads with RubyGems disabled, and the Rails 8.1 connection-lease behavior for `ActiveRecord::Base.connection` within a request.
4. Do you accept my position that the connection-hold and `connect_timeout` item in `/ready` is correctness work to be recorded separately, not counted as a performance win?
5. Confirm that the missing health/readiness tests are a blocker for any request-path slice, so backend-contracts' proposed tests land first.
