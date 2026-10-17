# PERF-01 — Opus 5.5 independent opinion

**Scope:** PERF-01 only, at base `5785eba`, using the supplied packet. Nothing was run. Every test below is **proposed and not run**. I could not see `run-baseline.sh`, `lib.sh`, `load.rb`, `compose.perf.yaml` or the tests. Where a finding depends on those files, I say so.

## Q1 — Candidate classes A–H

**Verdict: support the team's verdicts, with two changes.**

| Class | Verdict | Notes / what would overturn it |
|---|---|---|
| A indexes | Support no-change | Overturned only by a real BE-02 query reading `mailbox_memberships` by `(organization_id, user_id)` at non-trivial cardinality. Tier-3 data is diagnostic and must not count. |
| B inline `context_uuid` | **Change: defer out of PERF-01** | It edits the single security-critical function for a gain no route can observe yet. Revisit in BE-02 if real list queries show the function's self-time above roughly 20% of execution. |
| C tenancy round trips | Support forbidden | Nothing here should be measured as a candidate. Measure the three-round-trip floor once, as a planning input. |
| D fan-out / cache | Support | The connection lease and `connect_timeout` belong to separate correctness work (Q4). |
| E dev env file + `puma.rb` | Support; optional improvement, not a blocker | Split into **E1** (environment file) and **E2** (`puma.rb`) and measure each separately. E2's benefit is determinism, not speed: if the boot banner already shows 5/5 threads, it delivers zero speed gain. Ship it only as documented pairing, never as a speed claim. |
| F YJIT / frozen body / log level | Verify only | If YJIT is already on, the YJIT item is closed. The frozen body is a few allocations and lands below the noise floor; drop it unless the `Allocations:` field moves materially. |
| G tmpfs + `--disable-gems` | Support measuring | Expect "not distinguishable" on a shared host. A no-change outcome is acceptable. |
| H no-change | Support as the default expectation | |

**E1 precondition check (proposed, not run).** Turning eager loading on runs Zeitwerk eager load over `lib/elevateo`. `config.rb` defines both `Config` and `ConfigError`, so the check must confirm that eager load does not raise. It must also confirm that the test environment is unchanged, since there is no `test.rb`.

## Q2 — Measurement plan

**Verdict: change.** These are prerequisite fixes before any candidate comparison.

1. **Noise floor is too narrow.** Pass 2 repeats pass 1 inside the same stack, so it measures only within-stack noise. Every candidate runs in a new project with a new build, which adds between-stack variance that pass 2 never sees.
   - Add a second **unmodified baseline project A′**.
   - Interleave the projects as A, B, A′, B′.
   - Set the floor at max(within-stack delta, A versus A′ delta).
2. **Idle worker window conflicts.** The runner uses 120 s × 3 samples; design-adversary required at least 10 minutes. At one probe per 5 s, 120 s holds only about 24 probes, too few for a CPU difference measured in fractions of a percent. Adopt the 10-minute window for class G, and only for runs that test G.
3. **Missing workloads.** Add request-path W6 (a `/health` client running during a `/ready` storm with dependencies paused) to the baseline. It is the only scenario where a user-visible failure exists. Without it, the D correctness work has no before/after evidence.
4. **Boot time needs a definition.** Measure from `docker start` to the first 200 from `/health`, five cold starts per image. Report median and range.
5. **Cut unnecessary cells.** The new-connection × tier-16 cells on `/ready` mostly measure TCP handshakes and Puma queueing that no candidate affects. Keep them in the baseline once, and drop them from candidate runs.
6. **Ruby load client: acceptable, with one rule that would otherwise invalidate results.** The client must run from the **baseline image digest** in every run, not from the candidate's image. Otherwise any candidate that changes Ruby flags or environment (YJIT, eager load affecting shared files) changes the client as well as the server.
   - Results for a tier are client-limited, not server capacity, if `perf-load` CPU is at least 0.9 of its cap while the API is clearly below its own cap.
   - Report such cells as client-limited, not as server capacity. If a candidate's only effect falls in those cells, the result is inconclusive.

**Acceptance checks (not run):** the manifest records the client image digest separately from the server digest; the A′ delta is reported for every primary metric; W6 shows `/health` P50 and maximum latency during the storm.

## Q3 — Shared-host safety

**Verdict: change. The required C1–C4 repairs are necessary but not sufficient, and two of them should be replaced by a simpler rule.**

**Simplest safe alternative: remove the risky flags entirely.**
- Remove `--remove-build-cache` and `--remove-pulled-images` from the script. Always retain pulled images and build cache, and record them in the manifest as retained.
- The host has 256 GB free and the cost is about 4–5 GB. That is a far better trade than any ownership proof on a shared default builder.
- Doing this closes C2 and C3 completely instead of depending on correct attribution logic.
- If removal is ever needed, use a dedicated named builder (`perf01-<hex>`) that is removed as a unit. That requires the buildkit image, which is a new dependency and needs approval.

**Gaps that remain after the repairs:**

1. **Credential leakage into evidence.** `hostconfig.txt`, any full `docker inspect` and any `compose config` output contain `.Config.Env`, which holds `POSTGRES_PASSWORD` and `API_DB_PASSWORD`. Whether this happens depends on `run-baseline.sh`, which I could not see.
   - Regression: before writing `SHA256SUMS`, check every evidence file against each value in `ops/local/.env` using `grep -F`. Fail with exit 7 if any value appears. Test it with a seeded fake secret in the fake-docker suite.
2. **Anonymous volumes.**
   - If an image declares `VOLUME`, its container mounts an anonymous volume. The mount allowlist then retains the container forever, which is safe, but the cleanup can never succeed.
   - `docker rm` without `-v` orphans anonymous volumes silently and the cleanup still reports clean.
   - Fix: record anonymous volume names before removal, and report them as retained so the cleanup is never "clean" while they exist.
3. **The evidence-directory argument is trusted.** A `manifest.json` copied from a different run could satisfy the synthetic-only proof. C1 must also require that the manifest's run id is listed in this project's `owned-containers.txt`.
4. **User counts can fail open.** `users=$(docker ps … | wc -l)` reads 0 when `docker ps` fails, and 0 permits removal. This is a C4 instance in the image and volume steps; make it fail closed with its own regression case.
5. **Disk I/O starvation.** CPU and memory are capped, but disk I/O and log volume are not. The overlay must set json-file log rotation on `api` and `perf-load`; this needs verifying, since I could not see the overlay. Also sample `iowait` in `host.csv`.
6. **False "complete".** The manifest status must also become `incomplete` when any sampler row is `unavailable` during a measured window, or when a host-quiet abort occurs.

**Regressions (not run), on the fake-docker suite:**
- (a) Missing or foreign manifest: all volumes retained, non-zero exit.
- (b) `ps` failure during the image step: image retained.
- (c) Seeded secret in `hostconfig.txt`: exit 7.
- (d) Anonymous volume present: reported as retained, non-zero exit.

## Q4 — Ordering and gates

**Verdict: support, with one refinement.**

- **Contract tests first: agreed, as a hard prerequisite** for any change to the request path or its configuration.
- **The Steep gap does not block E1, E2 or G.** Steep checks `app/controllers` and `lib/elevateo`, not `config/` or Compose. It blocks only controller edits (F's frozen body and the D fix). Do not let it stall measuring E.
- **Correctness items: agreed that `connect_timeout` and the connection lease are correctness work.** Recommend moving them to a separate FIX task with their own three opinions. The lease change touches connection semantics next to tenancy; mixing it into a performance branch would blur both the evidence and the review.

## Q5 — Invariants

**Verdict: E1, E2 and G are invariant-neutral if tested. The riskiest class is B, which is why I recommend deferring it.**

**Failure sequence for B:**
1. A later "cleanup" changes the inlined SQL function to `IMMUTABLE`, or a reviewer accepts a string-bodied `LANGUAGE sql` without `SET`.
2. Rails' generic plan, used after the fifth execution, folds `context_uuid('app.org_id')` from principal A into the cached plan.
3. Principal B, on the same pooled connection, reads org A's mailboxes.
4. FORCE RLS and transaction-local identity are still nominally intact, so nothing fails loudly.

**Regression (not run):**
- On one connection, alternate principals A and B for at least 12 prepared executions each, and assert each principal's exact row set every time.
- Assert in a catalog test that `pg_proc.provolatile = 's'` for `context_uuid`.

**E1 risk:** the safety checks in `Elevateo::Config` must not drift. Re-assert in the test suite that startup fails when the outbound hold is false or a provider-prefixed variable is present.

**G risk:** if `--disable-gems` breaks `require "securerandom"`, the health probe always fails. `scripts/dev up --wait` would then fail, which is visible. Run the stall, stale-file and fresh-file health checks before adopting it.

## Q6 — Honest limits

What PERF-01 **can** conclude:
- Health and readiness latency.
- Fixed per-request framework overhead (reloader and static-file middleware).
- Boot time and cold first-request latency.
- Idle worker cost.
- The tenancy wrapper's round-trip floor.

What it **cannot** conclude:
- Anything about speed as perceived by a frontend: list or thread payloads, serialization at real size, pagination, N+1 queries, RLS cost at real cardinality, interaction latency (INP), or desktop or mobile cold start.

**Defer to later tasks:**
- BE-02: per-request authentication and session checks, the index (A), and the inlined function (B).
- FE-02 and DESK-01: a real-client performance budget (interaction latency, time to first thread).
- OPS-01: ten-user sizing.

Say in the deliverable: "No frontend-perceived speed claim is possible at this base."

## Top three cross-task recommendations

1. **Never remove build cache or pulled images** on the shared host; retain them and record them in the manifest.
2. **Use a second unmodified baseline project A′** for the noise floor, and **pin the load client to the baseline image** in every run.
3. **Add an evidence scan for secret values**, plus fail-closed user counts, before the first remote run.

## Hard contradictions

- **Idle worker window:** the runner's 120 s conflicts with design-adversary's 10 minutes. Resolve it in synthesis.
- **Unmodified repeat:** the brief requires an unmodified repeat, but the current pass-2 design cannot estimate the between-project noise that every candidate comparison depends on.
