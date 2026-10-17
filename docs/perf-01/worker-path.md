# PERF-01 worker-path inventory: idle worker and heartbeat cost model

Status: inventory and baseline design only. No file other than this one was edited. No Docker, SSH, tests or `bundle` were run. All numbers below are derived from reading source, Compose and Docker documentation semantics; none is a measurement.

## Identity & scope

- Agent name: `worker-path` (PERF-01 agent team, lead: Fable 5.1 coordinator).
- Model id as reported by my system prompt: `claude-fable-5-1` (Claude Fable 5.1).
- Start: 2026-10-12 ~06:44 (+11:00); clock sample at first shell call 2026-10-12T06:45:10+11:00. Finish: 2026-10-12T06:53:12+11:00.
- Base: `perf/fable-5-1/backend-speed` at `5785eba47f3709debb2815c8d86608f7e62d02f3`, working tree otherwise untouched by me.
- Scope: idle worker scheduling, heartbeat filesystem cost, healthcheck process cost. Out of scope here: any edit to `apps/server`, `compose.yaml`, `ops/`, `apps/web`, root `src`, `third_party/upstream`.

## Files inspected (line ranges)

| File | Lines | Relevant facts |
| --- | --- | --- |
| `apps/server/bin/worker` | 1-15 | Boots full Rails env (line 3), validates `Elevateo::Config.current` and `outbound_hold` (5-6), prints one JSON line, traps TERM/INT to a flag (10), `publish` then `until stop; sleep 1; publish; end` (11-15). |
| `apps/server/bin/worker-health` | 1-5 | Loads only `lib/elevateo/heartbeat` (no bundler, no Rails); exits 0/1 on `healthy?`. |
| `apps/server/lib/elevateo/heartbeat.rb` | 1-36 | `PATH=/tmp/worker.alive`, `MAX_BYTES=20`; AIDEV-NOTE line 10; publish = hex(12) temp name, `O_WRONLY|O_CREAT|O_EXCL` 0600, write, rename, unlink-on-failure; `healthy?` reads 21 bytes, requires `\A[0-9]{1,19}\z`, integer age in `0..5`, rescues `SystemCallError, IOError`. |
| `apps/server/sig/heartbeat.rbs` | 1-8 | Signatures for `publish`/`healthy?` with optional path and `now:`. Steepfile checks `lib/elevateo`. |
| `ops/tests/heartbeat_test.rb` | 1-36 | Rejects `""`, `"99\n"`, `"99garbage"`, `"-1"`, future (`101` vs now 100), stale (`94`), 21 chars; accepts age 5 and 0; asserts no temp-file leak; failed rename keeps previous value. |
| `compose.yaml` | 6-21, 168-202 | Worker: `command: [bin/worker]`, healthcheck `CMD ruby bin/worker-health`, interval 5s, timeout 3s, retries 3, start_period 30s, `restart: unless-stopped`, `RAILS_ENV=development`. No `tmpfs:`, no `read_only:`, no resource limits, no `/tmp` volume: `/tmp` is the container overlay upper layer. |
| `apps/server/Dockerfile` | 1-13 | `ruby:3.4.11-slim-bookworm` pinned by digest; `USER 10001`; chowns `/app/tmp /app/log` only; `/tmp` is the Debian base 1777 directory. |
| `apps/server/config/{boot,application,environment}.rb` | all | `bundler/setup`, `rails`, `active_record/railtie`, `action_controller/railtie`, `Bundler.require`, `eager_load=false`, logger to stdout. No DB connection is forced at boot. |
| `apps/server/lib/elevateo/config.rb` | 1-65 | Depends only on `uri`; validates env, hold, allowlisted role/password key, SMTP, internal URLs, forbidden provider prefixes. No ActiveRecord use. |
| `apps/server/Gemfile`, `Steepfile` | all | rails 8.1.4, pg, puma; steep/rubocop/minitest dev-only. No `listen`/file-watcher gem. |
| `.planning/consultations/results/be-01/decisions.md` | B01-06, B01-07 | Worker "starts and reports health but cannot dispatch"; no release path; no pretend send job; health is process liveness. |
| `docs/evidence/be-01-r1.md` | 23, 33, 58-64 | Review B3 covered heartbeat files; "actual worker stop/stall ... remain unverified"; source hashes recorded. |
| `scripts/dev`, `scripts/dev.ps1` | 9 | `up -d --wait ... worker` relies on the worker healthcheck for `--wait`. |

AIDEV anchors relevant to this path: `heartbeat.rb:10` ("Rename publishes a complete timestamp; liveness does not imply DB or job readiness"). Any change must keep atomic rename publish and must not make health imply readiness. Other anchors in `apps/server` are tenancy/test related and not touched by this path.

## Idle worker cost model (derived, not measured)

Steady-state loop, per tick (once per ~1 s; period is `1 s + publish duration + scheduler latency`, so it drifts slightly slower than 1 Hz):

| Step | Syscalls (expected on Linux, MRI 3.4) | Notes |
| --- | --- | --- |
| `sleep 1` | 1 blocking sleep (`clock_nanosleep`/`ppoll` family) | 1 voluntary context switch per tick. |
| `Time.now.to_i` | 0 (vDSO `clock_gettime`) | |
| `SecureRandom.hex(12)` | 1 `getrandom` | 12 bytes; also allocates 2-3 short strings. |
| `File.open(... O_CREAT|O_EXCL, 0600)` | 1 `openat` (+ 1 `fstat` typical for Ruby IO setup) | Creates a new inode in `/tmp` each tick. |
| `file.write` + block close | 1 `write` (10 bytes), 1 `close` | |
| `File.rename` | 1 `rename` | Replaces `/tmp/worker.alive`; frees the previous inode. |
| Total | ~6-7 syscalls, 1 wakeup, 1 inode create + 1 inode free, 1 dirent add + 1 rename | CPU per tick is on the order of tens of microseconds of Ruby plus kernel time; the only persistent loop cost that matters is the filesystem churn and the single wakeup. |

Per minute: ~60 wakeups, ~60 inode allocations/frees, ~60 directory modifications, 600 payload bytes.

Filesystem placement: `/tmp` is on the container's writable overlayfs upper directory (Compose declares no tmpfs/volume for it), which lives on the host's Docker data root (ext4 or xfs under `/var/lib/docker/overlay2/<id>/diff/tmp`). Consequences:

- Write amplification: each 10-byte payload dirties at least one 4 KiB data block, the inode table block, the directory block and journal records on the backing filesystem. Many of these blocks are re-dirtied before the ~30 s writeback interval, so actual disk writes are far lower than 60 x 4 KiB per minute, but they are nonzero and continuous on a host that also runs production workloads.
- Inode churn: one inode allocated and one freed per tick in the upper dir; harmless at this rate but entirely avoidable.
- The first write after container start triggers an overlay copy-up of the `/tmp` directory entry (metadata only; one-time).
- On `docker restart` of the same container the previous `/tmp/worker.alive` survives (same rw layer); on recreate it does not. Either way the age check rejects a stale file, so no semantic effect.

Rails boot: `require_relative "../config/environment"` loads bundler, Rails, ActiveRecord and ActionController railties, and `Bundler.require` (rails, pg, puma). This is a one-time startup cost (wall time of the order of one to a few seconds, resident memory of the order of 100 MB class, to be measured), not a per-tick CPU cost. With `eager_load=false`, no `listen` gem and no executor wrapping in the loop, the booted Rails process should have no periodic background threads of its own; expected voluntary context switches for the worker PID are therefore about 1/s (verify). No ActiveRecord connection is opened: nothing in `bin/worker` queries the DB, and Rails 8 connects lazily. Expected `pg_stat_activity` rows for `elevateo_worker` at steady state: 0 (verify). The startup cost also consumes part of the 30 s `start_period` budget.

Shutdown: the TERM/INT trap only sets a flag. MRI re-enters `sleep` for the remaining time after running a trap handler, so exit happens after at most the remaining sleep (<= 1 s) plus one further `publish` (the loop body runs once more after the flag is set). Expected exit code 0 and stop time well under the Docker default 10 s grace; `docs/evidence/be-01-r1.md:23` records that this has not been verified in a running container.

## Healthcheck cost model (derived, not measured)

`CMD ruby bin/worker-health` every 5 s (interval counts from the end of the previous probe) means ~12 probes per minute. Each probe costs:

1. A `runc exec` into the container (containerd shim spawn, `setns` into namespaces, cgroup join). This is paid regardless of what command runs and is often comparable to or larger than the command itself on a loaded host.
2. A cold Ruby VM start: `ruby` loads RubyGems by default (no `--disable-gems`, no `RUBYOPT` in the image), then `require "securerandom"` (needed only for `publish`, not for `healthy?`), then one `open`/`read`/`close` of a 10-byte file. Expectation to verify: tens of milliseconds of CPU and a transient RSS of roughly 15-30 MB per probe, versus the sub-millisecond work it actually performs.

Hypothesis to be tested by the benchmark: in steady state the healthcheck, not the worker loop, dominates the worker service's CPU usage (12 Ruby cold starts per minute versus 60 microsecond-scale publishes). Failure cost of the current design: on a heavily loaded host a `runc exec` + Ruby cold start can approach the 3 s timeout; three consecutive timeouts flip the service to unhealthy without the worker having stalled.

Detection latency with the current parameters (publish 1 s, window `0..5`, interval 5 s, retries 3). `healthy?` compares integer epoch seconds, so a value written at wall time `t_w` is accepted while `floor(now) - floor(t_w) <= 5`, i.e. until somewhere in `(5 s, 6 s)` after the write. If the worker stalls or dies at `t0`, its last write was at most 1 s earlier, so the file becomes stale between 5 and 6 s after `t0`. The first failing probe then occurs within the next 5 s, and two more failures are needed at 5 s spacing. Bound: time to `unhealthy` is in `(15 s, 21 s)` after `t0`, plus three probe durations. Note that Docker's `restart: unless-stopped` does not act on `unhealthy`; the status is observable (and used by `--wait`), not auto-remediated.

## Alternatives with tradeoffs

Each entry: benefit, failure cost, invariants, how to measure, gate.

### (a) tmpfs mount for `/tmp` on the worker service (Compose-only)

- Benefit: removes all backing-disk writes, journal traffic and overlay inode churn; the per-tick syscall count is unchanged but every operation is in-memory. Also clears the heartbeat on container restart.
- Failure cost: tmpfs pages count against the container memory cgroup (negligible: one 10-byte file plus at most one leaked 32-character temp file per crash between `open` and `rename`). A too-small `size=` would make `publish` raise `ENOSPC`; since the file is tiny, a 1 MiB cap is ample. Anything else in the container that uses `Dir.tmpdir` would also move to tmpfs (nothing on the worker path does; Rails writes to `/app/tmp`).
- Invariants: unchanged code, unchanged `PATH`, unchanged validation, atomic rename still valid on tmpfs. Mount must be writable by uid 10001 (Docker tmpfs default mode 1777; use `mode=1777,nosuid,noexec,size=1m` explicitly).
- Measure: worker PID `/proc/<pid>/io` `write_bytes` and `syscw` before/after; container cgroup `cpu.stat`; host-level disk write counters for the Docker data device are too noisy on a shared host and should be reported as context only.
- Gate: Compose edit; owned by whoever the lead assigns `compose.yaml`. Design gate required, but the design risk is low.

### (b) publish interval 2 s, window kept at `0..5`

- Benefit: halves wakeups, publishes and inode churn (60 -> 30 per minute).
- Detection tradeoff, exactly: last write is now at most 2 s before `t0`, so the file goes stale between 4 and 6 s after `t0` (versus 5-6 s). Time to `unhealthy` becomes `(14 s, 21 s)`: the worst case is unchanged because it is dominated by `interval x retries`. The legitimate age seen by a probe rises from `<= 1` (occasionally 2 with alignment) to `<= 2` (occasionally 3), leaving 2-3 s of slack to the window instead of 3-4 s. A false `unhealthy` still requires three consecutive failing probes, i.e. the loop must be stalled for 10 s or more, so the practical tolerance change is small.
- Failure cost: the halved slack matters only if the worker is CPU-throttled or paused for several seconds at a time; under a tight `cpu.max` cap this is more plausible. The healthcheck cost is untouched, so expected total savings are small.
- Invariants: window, `MAX_BYTES`, rename publish, hold all unchanged; `bin/worker:13` only. `heartbeat_test.rb` does not test the loop period.
- Measure: voluntary context switches per second and `syscw` on the worker PID.
- Gate: yes (changes documented liveness envelope). Low value relative to (a) and (c).

### (c) lighter healthcheck command

Two sub-options, in increasing order of risk:

- (c1) `ruby --disable-gems bin/worker-health`: avoids RubyGems boot while keeping the exact tested Ruby validation and the RBS. Requires verifying inside the image that `require "securerandom"` resolves from the stdlib path without RubyGems (it is a default gem in 3.4; expected yes). Still pays the `runc exec` and a smaller VM start. Compose-only.
- (c2) Shell/coreutils check (`/bin/sh`, `head -c 21`, `wc -c`, `case` digit test, `date +%s`, shell arithmetic). Can approximate the semantics but with concrete divergence risks that must be handled explicitly: `$(...)` strips trailing newlines, so `"99\n"` would be accepted unless length is checked with `wc -c` on the raw bytes; the 1..19-digit rule must be enforced by byte count, not `-le 20`; shell arithmetic is 64-bit signed, so 19-digit values above `2^63-1` wrap rather than being rejected by magnitude (Ruby's bignum makes `age` negative and rejects); empty file and missing file both must exit 1. An mtime-based variant (`find -newermt`) is not acceptable: the invariant is content-based freshness (tamper and clock-skew cases from the test), not inode mtime. (c2) duplicates validation logic outside the Ruby module and the RBS, so it needs an equivalence test that runs the shell check against the same fixture values as `heartbeat_test.rb` inside Docker.
- Benefit (both): removes the dominant steady-state CPU term if the hypothesis above holds, and widens the margin under the 3 s timeout on a loaded host.
- Failure cost: (c1) none in semantics if the require resolves; (c2) silent semantic drift as listed.
- Measure: container cgroup `cpu.stat` minus worker-PID CPU gives healthcheck CPU directly (see spec); `docker inspect .State.Health.Log` gives per-probe wall time.
- Gate: (c1) yes but low risk; (c2) yes, and the design-adversary should review the divergence list.

### (d) `sleep` loop vs signal-driven

Blocking `sleep` is already the cheapest primitive (one wakeup per period; no timer thread). A signal- or pipe-driven loop would still need a periodic timer to republish within the window, so it cannot reduce wakeups. The only functional gain would be sub-second TERM exit instead of up to ~1 s plus one publish, which is already far inside the 10 s grace. Recommendation: no change; measure voluntary context switches to confirm ~1/s.

### (e) skipping Rails environment boot

`bin/worker` needs only `Elevateo::Config`, `Elevateo::ConfigError` (both from `lib/elevateo/config.rb`, which requires only `uri`), `Heartbeat`, and `Hash#to_json` (would need `require "json"` without ActiveSupport). ActiveRecord is not used. So Rails boot is functionally unnecessary for the current idle worker, but it is a one-time startup and resident-memory cost rather than a steady-state CPU cost. Dropping it would change what the worker proves at start (today: the full application boots under the worker role's environment; that is implicit smoke coverage used by `scripts/dev up --wait`) and would be undone by any real job runner later. Benefit is RSS only; measure `VmRSS` first and decide at the gate. Recommendation: do not pursue in PERF-01 unless measured RSS is material to the fleet-02 memory budget.

## Proposed bounded slice (optional, needs design gate)

1. Primary candidate: (a) tmpfs for `/tmp` on the worker service in `compose.yaml` (or a perf-specific override file if the lead prefers to keep base Compose frozen). Code untouched.
2. Secondary candidate: (c1) `ruby --disable-gems bin/worker-health`, only after a one-line in-container check that it exits 0 against a live worker and 1 against a stale file.
3. Not proposed now: (b), (d), (e), (c2).

Honest expectation: these are housekeeping savings on an idle process (fractions of a percent of one core and a small stream of disk writes). They do not make any request faster. If the measured baseline shows the healthcheck and worker together below the noise floor of the host, the correct outcome is a documented no-change conclusion for this path.

## Measurement spec and regression checks for benchmark-runner

Preconditions: task-owned Compose project with the `elevateo.perf.task=perf01` label, internal network only, conservative `cpus`/`mem_limit` on the worker (record the exact values; the same caps for baseline and candidate). Record image ID/digest, source revision, dirty-diff hash, host kernel, Docker version, cgroup version and driver (paths differ: `/sys/fs/cgroup/system.slice/docker-<id>.scope/` vs `/sys/fs/cgroup/docker/<id>/`).

Non-perturbing sampling from the host (never `docker exec` into the worker during a sample window, since exec itself is the cost being measured):

1. `pid=$(docker inspect -f '{{.State.Pid}}' <worker>)`; `cid=$(docker inspect -f '{{.Id}}' <worker>)`.
2. Before and after each window read: container `cpu.stat` (`usage_usec`, `user_usec`, `system_usec`, `nr_periods`, `nr_throttled`, `throttled_usec`); `/proc/$pid/stat` fields utime/stime; `/proc/$pid/status` `VmRSS`, `voluntary_ctxt_switches`, `nonvoluntary_ctxt_switches`; `/proc/$pid/io` `syscw`, `wchar`, `write_bytes` (needs root or `CAP_SYS_PTRACE` on the host; record if unavailable); `memory.current` and `memory.stat` `shmem`/`file` for the container (tmpfs pages show up here in the candidate); `docker inspect -f '{{json .State.Health}}'` (status, `FailingStreak`, last 5 probe Start/End times).
3. Derived: worker CPU = delta(utime+stime) in clock ticks; healthcheck CPU ~= delta(container `usage_usec`) - worker CPU; wakeups/s = delta(voluntary_ctxt_switches)/window; publishes = delta(syscw) (the loop issues exactly one `write` per publish after the startup line); per-probe wall time from Health.Log.
4. Window: start sampling no earlier than 60 s after container start (past `start_period` and Rails boot); 120 s steady state per sample; 3 samples per configuration; one unmodified baseline repeat to estimate noise. Also capture `/proc/loadavg` and `docker stats --no-stream` for all perf01 containers at window edges as noise context. Report means with min/max; do not quote percentiles from 3 samples.
5. Diagnostic (not a candidate): one extra baseline run with the healthcheck disabled via a throwaway override (`healthcheck: {disable: true}`) to cross-check the subtraction method in step 3. Label it diagnostic; it changes Compose and must not be reported as a candidate.

Liveness regression checks (run for baseline and every candidate; same procedure):

- Stall: `docker kill -s STOP <worker>` at `t0` (process stops, container keeps running, probes still exec). Poll `.State.Health.Status` every 0.5 s. Expected `unhealthy` within the bound derived above: `(15 s, 21 s)` plus probe durations for the current configuration; `(14 s, 21 s)` if (b) were ever adopted. Then `docker kill -s CONT`; expected `healthy` within one publish plus one probe interval (Docker flips to healthy on a single success). Record exact times.
- Tampered/stale file while stopped: with the worker under SIGSTOP, run the health command against fixture values written to a separate path (`ruby -r./lib/elevateo/heartbeat -e 'exit Elevateo::Heartbeat.healthy?("/tmp/perf01-fixture") ? 0 : 1'`) for `""`, `"99\n"`, `"-1"`, a 21-byte value, a 7 s old value and a future value; all must exit 1, and a fresh value must exit 0. For candidate (c2) run the shell check against the identical fixtures and require identical exit codes.
- Bounded shutdown: `time docker stop -t 10 <worker>`; expected exit code 0 and stop time under ~2 s (not 137 after 10 s). Repeat with `docker kill -s INT` and `docker wait`.
- Hold: the startup log line must still be exactly the `worker.idle` JSON with `outbound_hold: true, dispatch: "disabled"`; `pg_stat_activity` must show 0 `elevateo_worker` sessions at steady state. Nothing in this path may add a dispatch, release or job path.
- Leak: `ls -la /tmp` inside the container after the run (one exec, after sampling) must show only `worker.alive` and no `worker.alive.*.tmp` files.

## Invariants that must not change

- Content-based liveness: digits-only 1..19 chars, `MAX_BYTES=20`, integer age in `0..5`, rejection of empty, trailing newline, negative, future, stale and overlong values, and of missing/unreadable files via `SystemCallError`/`IOError`.
- Atomic publish via `O_EXCL` temp file + `rename`; failed publish leaves the previous timestamp intact and leaves no temp file (AIDEV-NOTE `heartbeat.rb:10`; health never implies DB or job readiness).
- Bounded shutdown on TERM and INT with exit code 0 inside Docker's stop grace.
- Outbound hold enforced at boot (`ELEVATEO_OUTBOUND_HOLD` must be `"true"`); no dispatch, no release path, no pretend send job (B01-06).
- Worker runs as uid 10001, least-privilege `elevateo_worker` role, internal network only, no published ports.
- Healthcheck semantics observable by `scripts/dev up --wait`: `healthy` within `start_period` on a correct boot.
- RBS in `sig/heartbeat.rbs` stays in sync with any signature change (none proposed).

## Open questions

1. Who owns `compose.yaml` for PERF-01 writes? Candidates (a) and (c1) are Compose-only and must not collide with request-path or benchmark-runner edits. A perf-specific override file might be cleaner than editing the base file.
2. Does `ruby --disable-gems` resolve `require "securerandom"` in `ruby:3.4.11-slim-bookworm`? One in-container command settles it; must be run by benchmark-runner on fleet-02.
3. Is `/proc/<pid>/io` readable for the benchmark-runner on fleet-02 (root or ptrace capability)? If not, use `syscw` substitutes (`strace -c` is not acceptable inside the container) and report the gap.
4. Which cgroup driver/version does fleet-02 use? Determines the `cpu.stat` path and whether `nr_throttled` is available for the capped worker.
5. Does the lead want the worker's `RAILS_ENV=development` left as is for the perf profile? It is part of the frozen BE-01 Compose and I am not proposing a change; noting that development mode is irrelevant to the loop cost since no executor wraps the loop.
6. Should the measured RSS of the Rails-booted idle worker be reported to the gate as input for alternative (e), even though no change is proposed?

Finish: 2026-10-12T06:53:12+11:00. Working tree after this write: only `docs/perf-01/` (this file) and the pre-existing untracked `docs/backend-performance-task.md`.
