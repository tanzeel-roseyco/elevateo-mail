# BE02 BusyBox timeout portability repair

Source ready; runtime verification **NOT_RUN**, owned by root. This bounded dispatch made no SSH calls, Docker calls, host test runs, dependency installations, commits, or subagent/review launches. Shared state and review ledger remain root-owned.

## Failure and exact repair

Coordinator-reported integrated fleet-02 archive SHA256: `1a368d4d0f71df09cbbc11d7661e016ed966cfe8cf3ec2ac2acada52e3ac065b`. It stopped before Rails because BusyBox v1.37.0 rejects `--kill-after=1s`; supplied help is `timeout [-s SIG] [-k KILL_SECS] SECS PROG ARGS`. This worker did not independently execute that archive.

Only three existing timeout invocations changed:

| File | Before | After | Preserved deadline / kill grace |
| --- | --- | --- | --- |
| `ops/tests/be02-guards/auth-rls-concurrency.sh` | `timeout --kill-after=1s 5s` | `timeout -k 1 5` | 5 / 1 seconds |
| `ops/tests/be02-guards/auth-rls-concurrency-processes.sh`, query | `timeout --kill-after=1s 4s` | `timeout -k 1 4` | 4 / 1 seconds |
| `ops/tests/be02-guards/auth-rls-concurrency-processes.sh`, start_child | `timeout --kill-after=2s 25s` | `timeout -k 2 25` | 25 / 2 seconds |

No dependency or timeout wrapper was introduced. Corresponding AIDEV comments describe portable syntax and unchanged timing. All three actual AUTH schedules (serialized bootstrap reruns, lock-timeout rollback, post-wait policy drift), SQL, catalog assertions, process/session cleanup and 75-second work watchdog remain unchanged. The harness retains its existing 5-second outer deadline and 1-second escalation grace.

## Bounded regression

The existing `auth-rls-concurrency-harness-regression.sh` entry point runs the image's actual timeout command before the existing 18 diagnostic and 16 cleanup fixtures:

1. Immediate Bash child exits successfully.
2. Immediate Bash child exits 37, which timeout must propagate exactly.
3. A delayed Bash child installs a TERM trap, emits `ready`, then blocks in a builtin 3-second read on an inherited FIFO descriptor. Timeout uses `-k 1 1`; the oracle requires exactly `ready` plus `terminated`, and exit 42 (BusyBox child status) or 124 (GNU timeout status). Natural completion emits `overran` and fails the oracle.

The FIFO is opened read/write so opening cannot block. The child launches no sleep or other descendants; even a non-terminating timeout implementation that merely waits for this child encounters the child's own bounded read. Normal foreground completion reaps the direct child. Descriptor closure and exact FIFO deletion are included in harness cleanup, with no credentials printed or new database access. Comments and the final fixture-count message were updated. No additional helper file was needed.

This tests actual TERM delivery and termination, not a separately forced SIGKILL escalation scenario. Existing production kill graces are preserved, but runtime process/reaping behavior and the full 5-second suite budget still require root's actual-image run; no measured timing or orphan-absence result is claimed here.

## SHA256 source evidence

Hashes are of working-tree bytes, before and after this repair:

| File under `ops/tests/be02-guards/` | Before | After |
| --- | --- | --- |
| `auth-rls-concurrency.sh` | `1f5ecc889dcd0e038a2687086dda6fe9c198720e3c2a9dceaa7be92edefade91` | `45607d692294380623575d7fef7ba0579172b0c4138a319ad34ca0985092d68e` |
| `auth-rls-concurrency-processes.sh` | `aef6bcc55040a65a52b9652df2d30d30a22aff3e188452aa56c497894935578e` | `9c08211610cde922df845367139596a789b4a8c07ebfe07c5683203c19ddb508` |
| `auth-rls-concurrency-harness-regression.sh` | `626420e8cb558a2e836516cb4ce62712dc299c2a302028841c781f24b3536f7c` | `028fcd7736b019b90febf252e4b69f093eab52f2beb46deb9317521dff822d52` |

## Root-owned verification commands — NOT_RUN

Run inside the actual guards image/container using root's existing disposable lifecycle, read-only `/workspace` source mount, and `BE02_GUARDS_DISPOSABLE=1`. These are intended container commands, not host test instructions or authorization for a new allocation:

```bash
bash -n /workspace/ops/tests/be02-guards/auth-rls-concurrency.sh
bash -n /workspace/ops/tests/be02-guards/auth-rls-concurrency-processes.sh
bash -n /workspace/ops/tests/be02-guards/auth-rls-concurrency-harness-regression.sh
timeout -k 1 5 bash /workspace/ops/tests/be02-guards/auth-rls-concurrency-harness-regression.sh
```

Then root's existing integrated runner invokes `bash /workspace/ops/tests/be02-guards/auth-rls-concurrency.sh` through the guards Compose service with its existing real pinned Auth readiness/grant prerequisites and 120-second runner bound (`ops/tests/be02/run.py`). Full application tests, source-packet refresh, independent adversarial review, resource reconciliation and acceptance remain root-owned and NOT_RUN by this worker. Source inspection and hash collection alone do not establish runtime acceptance.
