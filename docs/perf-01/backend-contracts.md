# PERF-01 backend contract and coupling inventory

Status: inventory and baseline design only. No source, test, compose or frontend file was changed. Nothing here was executed; every statement comes from reading the checkout at the frozen base.

## Identity and scope

- Agent name: `backend-contracts` (PERF-01 team, lead: Fable 5.1 coordinator).
- Model id as observed in this agent's system prompt: `claude-fable-5-1` (Claude Fable 5.1).
- Checkout: `C:\Users\Tanzeel\Code and projects\Elevateo Mail - Backend Performance`, branch `perf/fable-5-1/backend-speed`, HEAD `5785eba47f3709debb2815c8d86608f7e62d02f3`, working tree clean except the untracked task brief.
- Start / finish (host clock, UTC): 2026-10-11T19:21:05Z / 2026-10-11T19:27Z approximately.
- Rules followed: host-side read-only inspection; no Docker, SSH, `bundle` or tests; only this file written.

## Files inspected (line ranges)

| File | Lines | Why |
| --- | --- | --- |
| `apps/server/config/routes.rb` | 1-4 | the only two routes |
| `apps/server/app/controllers/application_controller.rb` | 1-8 | error envelope |
| `apps/server/app/controllers/health_controller.rb` | 1-36 | `/health`, `/ready` bodies, statuses, timeouts |
| `apps/server/config/application.rb`, `boot.rb`, `environment.rb`, `database.yml`, `config.ru`, `Rakefile`, `Steepfile` | all | framework defaults, pool, typing targets |
| `apps/server/lib/elevateo/config.rb` | 1-65 | URL allowlist, `outbound_hold`, env boundary |
| `apps/server/lib/elevateo/heartbeat.rb`, `bin/worker`, `bin/worker-health` | all | worker liveness contract |
| `apps/server/lib/elevateo/tenancy.rb` | 1-62 | tenancy invariants (unused by any route today) |
| `apps/server/Gemfile`, `Gemfile.lock` | all | pins: rails 8.1.4, puma 7.2.1, pg 1.7.0, rack 3.2.7, json 3.0.2, minitest 6.0.6, minitest-mock 5.27.0 |
| `apps/server/Dockerfile`, `compose.yaml`, `ops/compose.r1-test.yaml`, `scripts/dev` | all | image, healthchecks, test launch pattern |
| `apps/server/test/be_01_r1/*.rb` (8 files, 732 lines), `ops/tests/*.rb` (6 files, 426 lines), `ops/tests/*.sql` | all | regression harness |
| `apps/server/db/migrate/*` (2 files) | all | schema/RLS behind readiness DB check |
| `docs/backend-performance-task.md`, `AGENTS.md`, `.planning/STANDARDS.md` 17-37, `docs/contracts-and-reliability.md`, `docs/architecture.md`, `docs/evidence/be-01.md`, `docs/evidence/be-01-r1.md` 86-125, `.planning/consultations/results/be-01/decisions.md` 60-84, `state.md`, `documentation.md` 60-92, `README.md` 5-15 | | governing brief, standards, accepted decisions, evidence |

Observed absences that matter: no `config/environments/*`, no `config/initializers/*`, no `config/puma.rb`, no `public/` directory, no `sig/rails_seams.rbs` although `Steepfile` line 10 refers to it, no RBS for `Elevateo::Config` or the controllers although Steep targets check them, no OpenAPI file anywhere outside planning prose.

## Contract table

All responses are produced by `render json:` in an `ActionController::API` app, so the content type is `application/json; charset=utf-8`. Request correlation comes from the default `ActionDispatch::RequestId` middleware: it echoes a client `X-Request-Id` after stripping characters outside `[\w\-@]` and truncating to 255, otherwise generates a UUID, and sets the response `X-Request-Id` header. Items marked "framework default, confirm" are expected from Rails 8.1 defaults but have never been captured at this base; the benchmark runner's first baseline capture should pin them.

| Path | Method | Status | Body schema (exact keys, types) | Headers that matter | Source |
| --- | --- | --- | --- | --- | --- |
| `/health` | GET | 200 always | `{"status":"ok"}` only; `status` string | `Content-Type` json; `X-Request-Id`; `ETag` and `Cache-Control: max-age=0, private, must-revalidate` added by `Rack::ETag` on 200 (framework default, confirm) | `health_controller.rb:6-8`, compose api healthcheck `compose.yaml:175` depends on code 200 |
| `/ready` | GET | 200 when all four checks true; 503 otherwise | `{"status": "ready" or "not_ready", "outbound_hold": true, "checks": {"database": bool, "auth": bool, "storage": bool, "mail_catcher": bool}}`; exactly three top-level keys, exactly four check keys, every check value a JSON boolean (never null), `outbound_hold` always `true` because `Config#parse_hold` rejects anything else at load | as above; on 503 no ETag (framework default, confirm) | `health_controller.rb:11-22`, `config.rb:42-45` |
| any route, unhandled `StandardError` inside an action | any | 500 | `{"code":"internal_error","message":"Internal error","request_id":"<id>"}`; exactly three string keys; exception class is logged as JSON, exception message never reaches body or log | `X-Request-Id` equals body `request_id` | `application_controller.rb:4-7` |
| unknown path or wrong method (for example `POST /health`) | any | 404 | NOT the error envelope: `ActionDispatch::PublicExceptions` returns `{"status":404,"error":"Not Found"}` for an `Accept: application/json` client, otherwise an empty `text/html` body with `X-Cascade: pass` because `public/404.html` does not exist | `X-Request-Id` still set | routing error handled by `ShowExceptions`, outside `rescue_from` |
| worker liveness | `ruby bin/worker-health` exit code | 0 healthy, 1 otherwise | reads `/tmp/worker.alive`, at most 20 bytes, digits only, age 0..5 s inclusive; rename-published | compose healthcheck interval 5 s, timeout 3 s, retries 3, start_period 30 s | `heartbeat.rb`, `compose.yaml:191-196` |
| worker startup log | stdout line | n/a | `{"event":"worker.idle","outbound_hold":true,"dispatch":"disabled"}`; worker refuses to start unless hold is true | | `bin/worker:6-8` |

Readiness semantics worth pinning as behavior, not just shape:

- Checks run sequentially in the order database, auth, storage, mail_catcher; every check always runs, there is no short-circuit, so the `checks` map is always complete even when `status` is `not_ready`.
- Each HTTP check is `GET <url>/health|/status|/livez`, plain HTTP only (the config allowlist forbids https), `open_timeout` 2 s and `read_timeout` 2 s, success only on literal code `"200"`. Worst case today is roughly 12 s of HTTP waits plus the DB wait. Any exception inside a check becomes `false`, never a 500.
- The database check is `SELECT 1 == 1` on the API role connection; `database.yml` sets no `connect_timeout`, so a black-holed DB host would hang on the OS connect timeout rather than 2 s (refused connections fail fast). This is a latency-visible gap for the request-path or database-path owner, not a shape change.
- `Elevateo::Config.current` is memoized on first call. The API process first calls it on the first `/ready` request, so a config defect surfaces there as a 500 envelope rather than at boot (the worker calls it at boot). `database.yml` separately calls `Config.load!` at boot, so most keys are validated twice.
- Readiness reports no secret detail and issues no tokens or objects, as B01-07 requires.

## Frontend coupling findings (honest)

- There is no first-party frontend at this base. `apps/web`, root `src`, `packages`, `contracts` do not exist. A repo-wide search excluding `third_party/upstream` found zero `.js/.ts/.tsx/.vue/.html/.css/package.json` files and no `fetch(`, XHR or axios caller. Mentions of `/health` and `/ready` outside `apps/server` are documentation, compose healthchecks and the Opus 5.5 BE-01 opinion.
- `docs/architecture.md` marks `apps/web`, `contracts/` and `packages/contracts` as illustrative and says they do not exist yet. `state.md` refers to a frontend inventory in a different checkout at commit `4322cfb`; nothing from it is present here.
- What the eventual UI will need, per `docs/contracts-and-reliability.md` lines 9-20: `/v1/mailboxes`, cursor-paged threads, thread detail, draft create/patch with versions, send returning 202 plus job id, send-job status, cancel, Resend webhook, connector-grant revoke, stable error codes, non-enumerating 404s, 401 for auth failures. None of these routes, models, domain services or serializers exist. The four `app` tables exist but no controller reads them and `Elevateo::Tenancy.with_context` has no caller outside tests.
- Consequence: "frontend-serving backend speed" at this base is limited to (1) `/health` and `/ready` latency and allocation, (2) framework and connection defaults (Puma defaults with no `config/puma.rb`, `ELEVATEO_DB_POOL` default 5, reloading and static-file middleware enabled because no environment file turns them off, `eager_load` false), (3) JSON rendering defaults, and (4) the per-call cost of the tenancy wrapper (two `clear_query_cache`, an `uncached` block, BEGIN, one `set_config` round trip, COMMIT) that every future tenant-scoped request will pay. The only UI-relevant contract elements that exist today are the error envelope and `outbound_hold`, which the Opus 5.5 opinion identified as what a future "held" banner depends on.

## Existing regression harness inventory

Launch pattern (`ops/compose.r1-test.yaml`, overlay on `compose.yaml`): `R1_PROJECT` must be a fresh `be01r1-<UUID>` Compose project name; the server image is `${R1_PROJECT}-server:repair`; volumes are named `${R1_PROJECT}-db-data|db-config|storage-data` with label `elevateo.r1.project`; services sit on the internal `runtime` network with no published ports. Profile `r1` holds `r1-fixtures` (psql as `supabase_admin`, loads `ops/tests/db-fixtures.sql`: two orgs, three users, three mailboxes, one private membership), `r1-api-test` (role `elevateo_api`, process `api`, pool `R1_DB_POOL` default 5, `bundle exec rails test test/be_01_r1/tenancy_test.rb`) and `r1-worker-test` (role `elevateo_worker`, `rails test test/be_01_r1/worker_role_test.rb`). `RAILS_ENV=test` with the same allowlisted URLs as development. Per `docs/evidence/be-01-r1.md`, none of these suites has ever run; execution status is "Not run" for every row.

| File | Role | Covers |
| --- | --- | --- |
| `test_helper.rb` | api or worker | `RestrictedRoleTest` base: asserts restricted session/current user, no superuser flags, no owned objects, no privileged membership; deliberately avoids `rails/test_help` so the process never gains schema authority |
| `authority_guards.rb` / `authority_guards_test.rb` | api | shared catalog guards and synthetic-CTE unit stimuli for them |
| `tenancy_test.rb` | api | 12 tests: RLS visibility per principal, claims scoped to the owned transaction, rollback cleanup, frozen principals, ambient-transaction rejection, nested/frame/connection mismatch, executor query cache isolation, malformed claims, bounded 4-thread pool concurrency |
| `worker_role_test.rb` | worker | worker cannot SELECT any `app` table |
| `membership_migration_test.rb` | migrator (no compose service defined yet) | up/down/up of migration 2, injected failure rollback, unexpected grant option abort |
| `baseline_driver.rb` / `baseline_scenarios.rb` | api, standalone script | T1-T3 baseline-versus-repair reproduction driver emitting JSON lines |
| `ops/tests/heartbeat_test.rb`, `secrets_test.rb`, `egress_test.rb` (+ probe, assert, listener, shell wrappers) | plain Ruby, no Rails | heartbeat window and atomic publish, secrets file lifecycle, egress denial semantics and wrapper failure protocol |

Gaps relevant to PERF-01: no request-level test touches `/health` or `/ready`; nothing asserts the 503 path or the exact `checks` map; nothing asserts the `{code,message,request_id}` envelope or `X-Request-Id` echo; nothing asserts `outbound_hold == true` over HTTP; nothing characterizes the 404 shape; no compose service exists for the migrator suite; no test exercises Steep, which has an incomplete `sig` tree. These are the holes any performance change to the request path could fall through unnoticed.

## Proposed owned test files and exact assertions (PROPOSAL only, nothing written)

Mechanism: in-process `Rack::MockRequest.new(Rails.application)` (rack is already in the bundle) against the full middleware stack, no listener, no network. Dependency failure is simulated without touching the network by building a second validated config with `Elevateo::Config.load!(ENV.to_h.merge("ELEVATEO_STORAGE_URL" => "http://storage:1"))`: `Config#internal_url` (`config.rb:52-58`) validates only scheme `http` and host `storage`, so port 1 passes validation and `Net::HTTP` gets an immediate connection refusal (or a fast DNS failure if the container is absent), which `check` turns into `false`. The degraded config is injected with `Elevateo::Config.stub(:current, cfg) { ... }` from `minitest/mock`, which the Gemfile already pins with an AIDEV note for exactly this style of use. Both files inherit `RestrictedRoleTest` so the authority guard still runs, and neither opens a transaction around a request.

`apps/server/test/perf_01/health_contract_test.rb`

1. `GET /health`: status 200; `Content-Type` starts with `application/json`; parsed body `== {"status" => "ok"}` (so no extra keys); `X-Request-Id` header present and matches `/\A[\w\-@]{1,255}\z/`.
2. `GET /health` with `HTTP_X_REQUEST_ID: "perf01-<hex>"`: response header equals the sent value.
3. `GET /health` with `HTTP_X_REQUEST_ID: "bad id!"`: header present, non-empty, matches the safe pattern and differs from the raw input (assert sanitization happened, not its exact output).
4. `POST /health` and `GET /nope`: status 404 only. Body deliberately not asserted because the 404 shape is a framework default, not a designed contract (see Open questions).

`apps/server/test/perf_01/ready_contract_test.rb`

1. Happy path (requires db, auth, storage, mailpit up): status 200; parsed body keys sorted `== %w[checks outbound_hold status]`; `status == "ready"`; `outbound_hold.equal?(true)`; `checks.keys.sort == %w[auth database mail_catcher storage]`; every value `[true, false].include?`; all true.
2. Storage down via the stubbed config: status 503; same exact key sets; `status == "not_ready"`; `outbound_hold == true`; `checks == {"database"=>true,"auth"=>true,"storage"=>false,"mail_catcher"=>true}`; `X-Request-Id` present. Repeat with `ELEVATEO_AUTH_URL => http://auth:1` and `ELEVATEO_MAILPIT_URL => http://mailpit:1` to prove each key flips independently and no other key changes.
3. Database down in-process: stub `select_value` on the test's checked-out adapter to raise `ActiveRecord::ConnectionNotEstablished`; expect 503 with only `checks.database == false`. An optional stronger variant is a separate compose service with `ELEVATEO_DB_HOST: db-absent` (that key has no allowlist) running a plain `Minitest::Test`, because `RestrictedRoleTest#setup` cannot run without a database.
4. Error envelope: `Elevateo::Config.stub(:current, -> { raise "synthetic readiness failure" })`; `GET /ready`: status 500; `Content-Type` json; body keys sorted `== %w[code message request_id]`; `code == "internal_error"`; `message == "Internal error"`; body does not include `"synthetic"`; `request_id == response["X-Request-Id"]`.
5. Not asserted on purpose: key order, byte-identical body, ETag or Cache-Control values, timing. Timing belongs to the benchmark runner.

Compose and execution: a new `ops/compose.perf01-test.yaml` overlay following the r1 pattern with `PERF01_PROJECT` (fresh `perf01-<UUID>`), image `${PERF01_PROJECT}-server:perf`, label `elevateo.perf.task=perf01`, services `perf01-api-contract-test` (api role, `bundle exec rails test test/perf_01/health_contract_test.rb test/perf_01/ready_contract_test.rb`) and the optional `perf01-ready-dbdown-test`. Before the happy-path run the runner brings up `db auth rest storage mailpit` with `--wait`, runs fixtures once, then the test service. Executed only by `benchmark-runner` on fleet-02; cleanup removes exactly the labeled containers and the perf image, never volumes it did not prove it created. Fallback if `rails test`'s `test:prepare` hook misbehaves under the restricted role (unverified, since r1 has never run): `bundle exec ruby -Itest test/perf_01/<file>`.

## Serialization notes

- `render json: hash` calls `Hash#to_json`, which ActiveSupport routes through `ActiveSupport::JSON.encode`: an `as_json` tree walk (keys to strings) followed by `::JSON.generate` from the `json` gem. `json` is not pinned in the Gemfile; it is locked transitively at 3.0.2 through activesupport and already has the fast C generator. `escape_html_entities_in_json` is on by default, so `<`, `>`, `&` would be written as `\u003c` etc.; none of today's payloads contain them.
- Cost: `/health` serializes one key and `/ready` three keys plus a four-key map. That is tens of microseconds and a handful of allocations, against roughly four network round trips in `/ready` and the full middleware stack in `/health`. Serialization is not where the time goes.
- Position: no new JSON dependency (Oj or similar) is justified by any payload at this base. Bypassing ActiveSupport with a prebuilt string via `render body:` or `JSON.generate` would be contract-neutral but unmeasurable at whole-request level and would change escaping behavior; do not do it without a benchmark showing it matters. Frozen constant bodies for `/health` are the only serialization change that is both safe and plausibly visible, and only if the request-path owner measures it.

## Contract-break checklist (for the design-adversary and lead)

Any candidate that does one of the following is a contract break and needs explicit lead sign-off, not a performance justification:

1. Renames, removes or adds a top-level key in `/health`, `/ready` or the error envelope, or a key inside `checks`.
2. Changes a value type: `outbound_hold` must stay a JSON boolean and always `true`; every `checks` value must stay a boolean, never null or a string reason.
3. Changes a status code mapping: 200 only when all four checks pass, 503 for any failure, 500 only for unhandled exceptions, `/health` 200 unconditionally.
4. Short-circuits readiness on the first failure or returns partial `checks` (the map must stay complete), or caches a readiness result across requests (no global cache state is allowed by the brief).
5. Lets an exception message, URL, host, credential or environment value into a body or log line.
6. Drops or stops echoing `X-Request-Id`, or stops sanitizing it.
7. Changes `Content-Type`, or changes the 404 shape without a recorded decision.
8. Reorders or parallelizes checks in a way that changes which failures are visible (ordering itself is not a contract; completeness and boolean truth are), or raises any timeout above the current 2 s plus 2 s per HTTP dependency.
9. Bypasses the controller for `/health` (for example a Rack-level short circuit): body identical, but `/health` would no longer prove Rails dispatches requests and `rescue_from` logging would be skipped. Treat as a semantic change for design review.
10. Weakens the worker liveness window (0..5 s), the 20-byte heartbeat bound or rename-publish; changes the `worker.idle` log line.
11. Touches tenancy semantics: ambient-transaction rejection, nested frame identity, cache clearing, frozen principals, or the `set_config(..., true)` transaction-local claims. These are frozen security contracts even though no route uses them yet.
12. Changes `Elevateo::Config` validation (allowlists, forced hold, provider-prefix rejection) or the default DB role/pool wiring in a way that lets a wrong configuration start.
13. Changes any `compose.yaml` healthcheck command, interval or expected code that depends on the above.

## Open questions

1. Should the 404 shape be brought under the `{code,message,request_id}` envelope via a catch-all route or `exceptions_app`? It is a contract addition, not performance work; I recommend recording it as out of PERF-01 scope and leaving the proposed test to assert status only.
2. Who owns a `connect_timeout` for the DB connection in `database.yml` and the resulting bounded `/ready` worst case? Contract-neutral, latency-visible, probably database-path or request-path.
3. Reloading and static-file middleware are active in the api container because no `config/environments/*.rb` exists and `RAILS_ENV=development`. Disabling them is contract-neutral and likely the largest `/health` win, but it is the request-path owner's slice and needs a measured baseline first.
4. `Steepfile` references a missing `sig/rails_seams.rbs` and `Elevateo::Config` has no signature; the typing gate for any new controller code cannot pass until that is resolved. New test files are outside Steep targets.
5. The migrator suite has no compose service; adding one is harmless but outside PERF-01 unless a migration slice is approved.
6. The `rails test` launch path has never executed under the restricted roles; the first fleet-02 run should treat a launch failure as harness evidence, not as a product defect.
