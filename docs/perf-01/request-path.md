# PERF-01 request-path inventory: Rails health/readiness, Puma, image runtime flags

Status: inventory and baseline design only. No source, test, compose or frontend file was changed; this file is the only artifact written. Nothing was executed: no Docker, SSH, `bundle`, tests or benchmarks. Every number below is read from the checkout or is a documented framework default marked "verify in-container"; there are no measurements yet.

## 1. Identity and scope

- Agent name `request-path`, PERF-01 team; lead is the Fable 5.1 coordinator.
- Model id observed in this agent's system prompt: `claude-fable-5-1` (Claude Fable 5.1).
- Checkout `C:\Users\Tanzeel\Code and projects\Elevateo Mail - Backend Performance`, branch `perf/fable-5-1/backend-speed`, HEAD verified `5785eba47f3709debb2815c8d86608f7e62d02f3`.
- Start 2026-10-12T06:44+11:00 (first host clock read 06:45:05+11:00 after the initial document reads). Finish: see the last line of this file.
- Teammate files `docs/perf-01/backend-contracts.md` and `docs/perf-01/design-adversary.md` were read as input only after my own inspection; where they overlap I cite them instead of repeating.

## 2. Files inspected (physical line ranges, complete files unless noted)

| Group | Files |
| --- | --- |
| Brief and governance | `docs/backend-performance-task.md` 1-61; `AGENTS.md` 1-22; `.planning/STANDARDS.md` 1-50; `.planning/consultations/results/be-01/decisions.md` 65-75 (B01-07) |
| Controllers and config | `app/controllers/application_controller.rb` 1-8; `health_controller.rb` 1-36; `config/application.rb` 1-28; `boot.rb` 1-2; `environment.rb` 1-2; `routes.rb` 1-4; `database.yml` 1-14; `config.ru` 1-2; `Rakefile` 1-2; `bin/rails` 1-4 |
| Dependencies and image | `Gemfile` 1-15; `Gemfile.lock` 1-306; `Dockerfile` 1-13; `.dockerignore` 1-4; `compose.yaml` 1-222 (api service 168-185, shared env 6-21); `ops/compose.r1-test.yaml` 1-65 |
| Typing | `Steepfile` 1-12; `sig/heartbeat.rbs` 1-8; `sig/tenancy.rbs` 1-34 |
| Other | `lib/elevateo/config.rb` 1-65; `test/be_01_r1/test_helper.rb` 1-30; AIDEV anchor search over `apps/server` (17 anchors, none in controllers or `config/`) |

Absent files that shape this inventory: no `config/puma.rb`, no `config/environments/*.rb`, no `config/initializers/*`, no `public/`, no `sig/rails_seams.rbs` (referenced by `Steepfile` line 9-10), no RBS for `Elevateo::Config` or either controller.

## 3. Request-path inventory

**Process launch.** compose runs `bin/rails server -b 0.0.0.0 -p 3000` with `RAILS_ENV=development` (`compose.yaml` 12, 173). `bin/rails` loads `config/boot.rb` (`bundler/setup`) then `rails/commands`; `config.ru` runs `Rails.application`. The image copies source at build time (`Dockerfile` 10) and compose mounts no source volume, so the running code can never change without a rebuild.

**Web server.** Puma 7.2.1 (`Gemfile.lock` 173) with no `config/puma.rb`, so Puma's built-in defaults apply. As documented for Puma 6.x: single mode (0 workers, no `preload_app`), threads min 0 / max 5 on MRI, `persistent_timeout` 20 s, `queue_requests` on. Puma 7 changed some scheduling defaults (keep-alive fairness in particular); verify in-container from the Puma boot banner already printed to the api container log (`Min threads: N, Max threads: M`) and from `Puma::Configuration.new.default_options`. The ActiveRecord pool is `ELEVATEO_DB_POOL` default 5 (`database.yml` 8); with max 5 threads that pairs exactly, and the pairing is implicit, not documented.

**Frameworks loaded.** `config/application.rb` 2-4 requires only `rails`, `active_record/railtie` and `action_controller/railtie`; the `rails` meta-gem installs actioncable/actionmailer/actiontext/activestorage/activejob but they are never required. `Bundler.require(*Rails.groups)` with `RAILS_ENV=development` requires the `:default` and `:development` groups: `rails`, `pg`, `puma`, plus `minitest` (the only development gem without `require: false`, `Gemfile` 12), which pulls `prism` and `drb` into the api process. That is boot time and resident memory, not per-request cost.

**Application configuration (`application.rb` 11-26).** `load_defaults 8.1`, `api_only = true`, `eager_load = false`, `autoload_lib(ignore: tasks)`, SQL schema format, `app_meta` migration tables, logger `ActiveSupport::Logger.new($stdout)` at `:info`, parameter filtering, `config.hosts.clear`, `secret_key_base` from env. Because no `config/environments/development.rb` exists, every other development setting is Rails' internal default, not the generated template: reloading on (`cache_classes` false), `reload_classes_only_on_change` true with `ActiveSupport::FileUpdateChecker`, `public_file_server.enabled` true, `consider_all_requests_local` false, `server_timing` off, `active_record.migration_error` unset. `load_defaults 7.2+` also sets `config.yjit = true`, which asks Rails to call `RubyVM::YJIT.enable` at boot when the interpreter supports it.

**Middleware stack (expected for api_only development; verify with `bin/rails middleware` in-container).** `Rack::Sendfile`, `ActionDispatch::Static` (present because `public_file_server.enabled` is true even though `public/` does not exist; it attempts a file lookup for every GET/HEAD), `ActionDispatch::Executor`, `ActiveSupport::Cache::Strategy::LocalCache::Middleware`, `Rack::Runtime`, `ActionDispatch::RequestId`, `ActionDispatch::RemoteIp`, `Rails::Rack::Logger`, `ActionDispatch::ShowExceptions`, `ActionDispatch::DebugExceptions`, `ActionDispatch::ActionableExceptions`, `ActionDispatch::Reloader` (present because reloading is on), `ActionDispatch::Callbacks`, `Rack::Head`, `Rack::ConditionalGet`, `Rack::ETag`, `Rack::TempfileReaper`. `HostAuthorization` is omitted because `config.hosts` is empty. No cookies, session, flash or CSRF middleware. `ActionController::API` adds only the API module set (rendering, rescue, instrumentation, strong parameters, conditional GET, default headers).

**Per-request work on every route today.** (1) Puma parse and thread hand-off. (2) `Static`: one or two filesystem lookups against a missing `public/`. (3) `Reloader`: `Rails.application.reloader.check!` runs the registered file watchers (class reloader over autoload paths, routes reloader, i18n reloader); each `updated?` globs its directories and stats every watched file. With no source mount this work can never find a change. (4) `RequestId`: sanitize or generate a UUID. (5) `Rails::Rack::Logger` plus `ActionController::LogSubscriber`: three `:info` lines per request (`Started`, `Processing by`, `Completed`) to `$stdout`, which Logger writes unbuffered, so three `write(2)` calls into Docker's json-file driver. (6) Controller dispatch, `render json:` (section 5). (7) `Rack::ETag` MD5 of the body and `Cache-Control` header on 200. None of this is wrong; items 2, 3 and 5 are the only per-request costs with no benefit in this deployment shape.

## 4. `/ready` analysis (`health_controller.rb` 10-35)

**Current behaviour.** Four checks run sequentially on the Puma request thread in the order database, auth, storage, mail_catcher. `check` yields and maps truthiness to a strict boolean, rescuing any `StandardError` (including `Net::OpenTimeout`/`Net::ReadTimeout`, which subclass `Timeout::Error < RuntimeError`) to `false`, so the `checks` map is always complete and no partial result or 500 can arise from a dependency failure. `http_ok?` opens a fresh TCP connection per check per request via `Net::HTTP.start(open_timeout: 2, read_timeout: 2)` and succeeds only on literal `"200"`. The response is rendered with `status: ready ? :ok : :service_unavailable`. `Elevateo::Config.current` is memoized immutable configuration (process-wide, read-only, pre-existing).

**Latency bounds.** Healthy path: one Postgres round trip plus three local HTTP calls with TCP setup and teardown each, sequential, so roughly the sum of four local calls (low single-digit milliseconds expected on a Docker bridge; unmeasured). Unhealthy path: each HTTP check costs up to 2 s connect plus 2 s read, so three slow HTTP dependencies cost up to about 12 s, and the worst case the lead quoted (four checks at 4 s) only applies if the database wait were also bounded at 4 s. It is not: `database.yml` sets no `connect_timeout` and the `SELECT 1` has no client-side read bound, so a frozen (not refused) database stalls the request until the OS TCP timeout. DNS resolution happens before `open_timeout` applies; Docker's embedded resolver answers fast (NXDOMAIN for a stopped container), so in practice it is quick but it is not bounded by the stated timeouts.

**Which "down" is which.** Stopped container: name no longer resolves, `SocketError` immediately, fast `false`. Paused container (`docker pause`): the kernel still completes the TCP handshake and queues the request, the frozen process never answers, so `read_timeout` fires after 2 s. Black-holed address (firewall drop): `open_timeout` fires after 2 s, but producing it needs host firewall changes that are not acceptable on fleet-02. The benchmark should use stop for the fast path and pause for the slow path, both on task-owned containers only.

**Overload coupling (the real hazard).** A slow `/ready` pins its Puma thread for the whole sequence and holds the leased ActiveRecord connection across the HTTP waits (design-adversary (d) reaches the same point). With max 5 threads, five concurrent `/ready` probes during a multi-dependency outage occupy every thread for up to 12 s, so `/health` queues behind them, the compose healthcheck (5 s timeout, `compose.yaml` 174-178) fails, and after 10 retries the api container is marked unhealthy. A dependency outage therefore degrades liveness reporting. This is the behaviour the overload workload in section 8 (W6) must capture before anything is proposed.

**Options and what could go wrong.**

| Option | Contract and invariant check | Benefit | Failure cost |
| --- | --- | --- | --- |
| A. Bounded concurrent HTTP checks: three plain `Thread`s joined against one deadline, unfinished check counts as `false`; DB check stays on the request thread | Shape, booleans, completeness, 200/503 mapping, no tokens and no side effects all preserved; ordering is not a contract. Threads must never touch ActiveRecord or autoload (`net/http` and `Elevateo::Config` are already loaded on the request thread) and must rescue internally with `report_on_exception = false` | Unhealthy worst case for HTTP checks drops from about 12 s to about 4 s; healthy path drops from sum to max of three local calls | Three short-lived threads per request (bounded by Puma threads to 15 at once), new concurrency code in a security-adjacent boundary, RBS needed, and the thread still pins a Puma thread for up to 4 s so starvation is reduced, not removed |
| B. Shared monotonic deadline passed sequentially: each later check gets the remaining budget, a check starting after the deadline returns `false` without running | Same shape; fail-closed preserved. But a `false` can now mean "not checked", which hides which dependency is down | Same 4 s bound without threads | Misleading operator signal; the lead's "deliberate failures must stay" rule is met only in status, not in per-check truth |
| C. Lower per-check timeouts (for example 1 s / 1 s) | Shape preserved; contract item 8 in backend-contracts forbids raising, not lowering | Linear reduction of worst case | More false `not_ready` under neighbour load on the shared host; flapping |
| D. Cache readiness for N seconds | Violates the no-global-state rule and B01-07 "safe real dependency checks"; masks outages | n/a | Not proposed |
| E. Persistent keep-alive connections to auth/storage/mailpit | Connection objects shared across threads and requests are global state; half-open and stale-connection handling would be new complexity | Saves three handshakes per `/ready` | Not proposed |

Position: no fan-out for speed by default (agreeing with design-adversary (d)); the healthy-path gain is a few milliseconds on a path that compose does not even probe. If the lead wants a bounded unhealthy path, A is preferable to B because every reported boolean stays real. Bounding the database wait (`connect_timeout`) and not holding the lease across HTTP (`ActiveRecord::Base.with_connection`) are correctness items, to be measured before and after with W5-W7, and ownership must be settled with `database-path` (section 10).

## 5. `/health` analysis (`health_controller.rb` 6-8, `application_controller.rb` 3-8)

The action is `render json: { status: "ok" }`. Rendering path: `ActionController::Renderers` json renderer calls `to_json` on the hash (skipped only when a `String` is passed), ActiveSupport walks the tree via `as_json` (symbol key to string) and then `JSON.generate` from json 3.0.2's C generator; content type is set to `application/json`. Allocations per request come from: the Hash and its generated String, `ActionDispatch::Request`/`Response` and header hashes, the `ActiveSupport::Notifications` payloads and `Event` objects for `start_processing` and `process_action`, the three log strings and their formatter output, the request-id UUID, `Rack::ETag`'s digest, and the Reloader/Static filesystem lookups (strings for globbed paths). The controller body itself is the smallest share. `rescue_from StandardError` is not on the happy path and costs nothing until an exception occurs. `ActionController::API` already excludes cookies, session, flash and CSRF; the remaining removable middleware costs are `Static` and `Reloader`, both configuration, not controller, changes.

**Measuring allocations without a new dependency.**

1. Already available: Rails' `Completed 200 OK in Xms (... | Allocations: N)` line is written for every request at `:info`. Parsing the api container log from a short c=1 run gives per-request controller-scoped allocations and server-side duration for free. It excludes middleware outside `process_action`.
2. Whole-stack, in-process: a one-off Ruby script run in a task-owned container of the same image, `app = Rails.application; env = Rack::MockRequest.env_for("/health")`, warm 100 calls, `GC.disable`, read `GC.stat(:total_allocated_objects)`, call N times, read again, divide. Includes every middleware, excludes Puma HTTP parsing and the socket. `rack` is already in the bundle.
3. GC pressure during load: `GC.stat(:minor_gc_count)` and `(:major_gc_count)` deltas over a run via `bin/rails runner` are not possible against a different process; instead compare RSS from `docker stats` and the `GC:` time field Rails 7.2+ adds to the `Completed` line.
4. Attribution if needed: `ObjectSpace.trace_object_allocations` from the `objspace` standard library in the script from item 2, one-off only. No rack-mini-profiler, no memory_profiler.

## 6. Image and runtime flags (`Dockerfile` 1-13, `compose.yaml` 6-21, 168-185)

| Item | Runtime per-request cost? | Note |
| --- | --- | --- |
| `BUNDLE_DEPLOYMENT=0` | No | Bundler resolves against `Gemfile.lock` at boot either way. It permits lock rewrites at install time, a reproducibility concern, not speed. `BUNDLE_FROZEN=1` would be a correctness change outside PERF-01. |
| `build-essential libpq-dev libyaml-dev pkg-config` left in the runtime layer | No | Image size and surface; affects pull/build time on fleet-02 (iteration speed), never request latency. Worth noting, not a performance proposal. |
| No `BUNDLE_WITHOUT`; development/test gems installed | Boot and RSS only | `minitest` (and transitively `prism`, `drb`) is required at api boot. Changing this would break `bundle exec rails test` in the same image (`ops/compose.r1-test.yaml` 41, 51); leave it. |
| `RAILS_ENV=development` with no environments file | Yes | `ActionDispatch::Reloader` plus file watchers run on every request; `ActionDispatch::Static` stats a missing `public/` on every GET. Both are pure cost because the image has no source mount. `DebugExceptions`/`ActionableExceptions` cost only on errors, and `consider_all_requests_local` is false so no debug page is served. |
| `eager_load = false` | First requests only | Lazy autoload adds latency to the first hit of each constant; warmup hides it in benchmarks but not in real cold starts. Eager load trades a longer boot (tolerated by the 10 s x 10 healthcheck) for a hot first request. |
| Log level `:info` to stdout | Yes | Three unbuffered writes per request into dockerd's json-file driver. At high request rates this is also host disk and dockerd CPU on a shared machine (section 8, log guard). Lowering it is an operator-signal change, not a free win. |
| `config.hosts.clear` | Removes a middleware | Deliberate for the internal network; preserve, and design-adversary item 9 asks for a why-comment. |
| YJIT | Possibly already on | Official `ruby:3.4.x` images are built with YJIT support, and `load_defaults 8.1` enables it at boot when available. Verify with `bin/rails runner 'p RubyVM::YJIT.enabled?'` in a task-owned container of the baseline image. If false, `RUBY_YJIT_ENABLE=1` in the api environment is a one-line measured change. Memory: YJIT reserves executable memory lazily (tens of MiB cap by default) and typically raises RSS by a double-digit percentage; measure with `docker stats`. |
| `MALLOC_ARENA_MAX` unset | Memory, not speed | glibc arenas per Puma thread can inflate RSS; `MALLOC_ARENA_MAX=2` is a common memory-only tweak. Mention for completeness; jemalloc would be a new dependency and is not proposed. |
| compose healthcheck boots a Ruby interpreter every 10 s | Background CPU | Noise source for CPU measurements; design-adversary (f) covers the probe itself. Do not change the probe command. |

## 7. Proposed bounded slice (PROPOSAL only; every item needs the design gate and a measured baseline first)

Precondition shared by all items: the health/readiness contract tests proposed in `backend-contracts.md` exist and pass on the baseline image, and the Steep gap (section 10, item 3) is resolved or explicitly waived, because any controller edit is currently untypeable.

| # | Change | Expected benefit | Failure cost | Invariant check | Measured by | Gate |
| --- | --- | --- | --- | --- | --- | --- |
| P1 | New `config/environments/development.rb` (3 settings with why-comments): `config.enable_reloading = false`, `config.eager_load = true`, `config.public_file_server.enabled = false`. `RAILS_ENV` stays `development`; test env untouched | Removes Reloader file-watch and Static lookups per request; hot first request. Low-millisecond to sub-millisecond per `/health`, the largest plausible request-path win at this base | Longer boot; a future developer who adds a source bind mount loses reloading until they flip the flag; eager load surfaces load-order bugs at boot (good) | Bodies, statuses, headers byte-identical for `/health`, `/ready` healthy and each single-dependency-down case, injected 500 and 404 (backend-contracts equivalence list); `Elevateo::Config` fail-closed path re-asserted | W1-W3 P50/P95 vs baseline beyond noise floor; boot-to-first-200 time; RSS | yes |
| P2 | Explicit `config/puma.rb`: `threads n, n` where `n` is read from `ELEVATEO_DB_POOL` (default 5) so threads can never exceed the pool; single mode; environment from `RAILS_ENV` | Deterministic, documented thread/pool pairing; min=max avoids thread spawn/trim churn under bursty probes. Throughput effect expected near zero if defaults already match | Pins a value that might differ from Puma 7 defaults (must be read first); a misread env var is a boot failure (validate as integer, fail closed) | No contract impact; pool must stay >= threads | Puma banner, W1 c=16 queueing P95, checkout timeouts count zero | yes |
| P3 | `/health` renders a frozen constant `'{"status":"ok"}'` string via `render json:` | Skips the `as_json` walk; bytes identical; a handful of allocations | None functional; trivially reviewable | Body bytes identical, content type unchanged, still dispatched through the controller (contract item 9 forbids a Rack bypass) | `Allocations:` field in the `Completed` line, W1 c=1 | yes (small) |
| P4 | `/ready` correctness bounds: `connect_timeout` in `database.yml` and `with_connection` around `SELECT 1` so the lease is not held across HTTP waits; optionally option A fan-out | Bounded worst case on a frozen DB; pool not drained by slow readiness; optional 12 s to 4 s | New config key; `with_connection` semantics in Rails 8.1 must be confirmed in-container; fan-out adds threads | Shape, booleans, completeness, no cache, no tokens, fail-closed | W5-W7 before/after, W6 `/health` latency during a `/ready` storm | yes; ownership shared with `database-path` |
| P5 | Verify YJIT; add `RUBY_YJIT_ENABLE=1` only if `RubyVM::YJIT.enabled?` is false | CPU-bound middleware path speeds up | RSS growth (measure) | None | W1 throughput at c=4; `docker stats` RSS | yes if a change is needed |
| P6 (not proposed, experiment only) | Make `config.log_level` env-configurable with an allowlist, to quantify logging cost by A/B | Quantifies item 5 of section 3 | Reduces operator signal if adopted | n/a as experiment | W1 c=4 throughput with `:info` vs `:warn` | yes before any adoption |

## 8. Workload spec for benchmark-runner

**Tool.** Primary: a small Ruby script using `net/http` from the existing server image, run as a separate task-owned service on the internal `runtime` network (no published ports, no egress), with `Thread`-based concurrency, keep-alive via one `Net::HTTP.start` per thread, per-request `Process.clock_gettime(Process::CLOCK_MONOTONIC)` timings written as CSV to stdout or a task-owned volume, and a body assertion on every response (`{"status":"ok"}`, or the `/ready` key set) counted as an error on mismatch. No new dependency. Limitation: the client competes for CPU with the server on the same host; if client CPU reaches one core at c=16 while throughput stops scaling from c=4, the client is the bottleneck and the c=16 numbers are reported as client-limited. Only then is a pinned-by-digest load generator (`oha` or `wrk`) justified as a cross-check, recorded as a tooling dependency with its digest.

**Resource caps (conservative, to be reserved with Codex).** api `cpus: 1.0`, `mem_limit: 512m`; load generator `cpus: 1.0`; dependencies at their defaults. Record host load average before and after each run.

**Common protocol.** Warmup 10 s discarded (covers lazy autoload and YJIT compile); measured window 30 s; 3 repetitions per cell; baseline A and candidate B interleaved A B A B A B; plus one extra unmodified baseline A' for the noise floor. Percentiles only where samples allow (design-adversary bar: P50 at 200+, P95 at 1,000+, P99 at 5,000+), otherwise medians and ranges. Record image digest, source SHA, dirty-diff hash, Puma banner, `RubyVM::YJIT.enabled?`, `bin/rails middleware` output and the resource caps once per image.

| Id | Endpoint and state | Connection | Concurrency | Duration | Purpose |
| --- | --- | --- | --- | --- | --- |
| W1 | `/health`, all up | keep-alive | 1, 4, 16 | 30 s x3 | Latency floor, below-thread-count, overload queueing (16 > 5 threads) |
| W2 | `/health`, all up | new connection per request | 1, 4 | 30 s x3 | Accept and handshake cost; closest to how the compose probe behaves |
| W3 | `/ready`, all up | keep-alive | 1, 4 | 30 s x3 | Healthy readiness latency; sum-of-checks path |
| W4 | `/ready`, mailpit stopped | keep-alive | 1 | 30 s x1 | Fast-fail path; expect 503 with `mail_catcher: false` only |
| W5 | `/ready`, mailpit paused; then auth and storage paused together | keep-alive | 1, 4 | 60 s x1 each | Slow path (2 s read timeout); the two-paused case shows the sequential sum where fan-out would matter. Few samples: medians and ranges only |
| W6 | W5 state plus c=5 `/ready` storm, while a separate c=1 `/health` keep-alive client measures | keep-alive | 5 + 1 | 60 s x1 | Thread starvation: does `/health` latency rise to seconds? Compose probe would fail at 5 s |
| W7 | `/ready` with db paused | single requests, client timeout 30 s | 1 | 3 requests | Characterize the unbounded DB wait; unpause immediately after |
| W8 | Behavioral equivalence captures: `/health`, `/ready` healthy, each single-dependency stop, injected 500 (if the contract test's stub is reused), `GET /nope` | single | 1 | once per image | Byte-level body, status and header capture before/after any candidate |

**Metrics per run.** Client: P50/P95/P99/mean/max, throughput, error count by class (non-matching status, body mismatch, connection error). Server: `docker stats` at 1 s for the api container (CPU%, RSS), `Completed` line duration and `Allocations:` from a dedicated short c=1 run of 1,000 requests, api log bytes per run, boot-to-first-200 time per container start.

**Guards.** Set `logging: { driver: json-file, options: { max-size: "50m", max-file: "3" } }` on the api service in the perf overlay so a hot `/health` loop cannot fill the shared host disk; capture the allocation-parsing run before rotation can occur. Use `docker stop`/`docker pause`/`docker unpause` only on containers in the task's own Compose project. Stop any run if host load affects neighbours.

## 9. Invariants that must not change

- `/health` 200 with exactly `{"status":"ok"}`; `/ready` exactly `{status, outbound_hold, checks{database,auth,storage,mail_catcher}}`, booleans only, complete map, 200 only when all true, 503 otherwise; errors `{code,message,request_id}` with `request_id` equal to `X-Request-Id`; `Content-Type` json. Full checklist in `backend-contracts.md` section "Contract-break checklist".
- Deliberate failures stay: fail-closed `Elevateo::Config` (hold forced true, allowlisted internal URLs, provider prefixes rejected), 503 on any dependency failure, no short-circuit, no readiness cache, no tokens or objects created by readiness, exception class only in logs, never messages, URLs or values.
- Per-check HTTP timeouts not raised above 2 s + 2 s. Lowering is a design decision, not a free change.
- No global identity or cache state; no new application dependency; `config.hosts.clear` retained; compose healthcheck commands, intervals and expected codes unchanged.
- AIDEV anchors: none exist in `app/controllers` or `config/`; `Gemfile` 13 (minitest-mock) and `compose.yaml` 183 (role-specific credentials) must be preserved by any Gemfile or compose edit. New non-obvious settings get an AIDEV-NOTE under 120 characters.
- Strict typing: any controller or config change must be covered by RBS and pass Steep, which today it cannot (section 10, item 3).

## 10. Open questions for the lead

1. Ownership: `connect_timeout` in `database.yml` and the lease release around `SELECT 1` sit between `request-path` and `database-path`. I propose `request-path` owns the controller line and `database-path` owns `database.yml`, reviewed together.
2. Is P1 (minimal `config/environments/development.rb`) inside "narrowly related config" scope, or does it need a recorded decision first? design-adversary asks the same (their Q1).
3. `Steepfile` checks `app/controllers` but `sig/rails_seams.rbs` does not exist and no controller RBS exists, so the typing gate cannot pass for P3 or P4 as the repository stands. Who resolves this pre-existing gap, and is it inside PERF-01?
4. Is `docker pause`/`unpause` of task-owned dependency containers acceptable on fleet-02 for W5-W7? It is reversible and scoped to the task project, but it is a state change on a shared host.
5. If the Ruby client proves to be the bottleneck at c=16, is a digest-pinned load-generator image an acceptable tooling dependency?
6. Confirm that P6 (log level) stays an experiment only unless Codex records a decision on operator signal.
7. Confirm that W8 captures by benchmark-runner, not the contract tests, are the authority for byte-level before/after equivalence.

Finish: 2026-10-12T06:55+11:00 (host clock).
