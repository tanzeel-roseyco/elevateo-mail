# Edge port validation follow-up — 2026-10-23

Task `task_af1ee15f46e2`, dispatch `ctx_29d2e60862bd`. Scoped to `ops/railway/start.sh`,
`ops/railway/edge-test.cjs` and this receipt. No frontend, CSP, restart policy, credentials,
live API, cloud configuration or deployment changes. Fleet Docker runtime verification PASS.

## Change and independent review packet

- `start.sh:4-12`: replace the `PORT` AND-list guard and SSH-port shape-only guard with
  one explicit exit-on-invalid validator, called before secret presence checks or decoding.
  Canonical decimal means `[1-9][0-9]{0,4}` followed by an upper bound of 65535.
  Short-circuiting bounds the input before `10#` arithmetic: no octal interpretation,
  arithmetic expressions or integer overflow. Ports 1 and 65535 are accepted; leading zeroes rejected.
- `edge-test.cjs:5,19-67`: import `spawnSync`, add bounded startup subprocess checks and
  invoke them before the existing routing checks. Thirty-two negative cases cover missing,
  empty, malformed, signed, whitespace, newline, leading-zero, zero, out-of-range,
  overflow-sized and expression inputs independently for both variables.
  Each requires exit 1, the expected diagnostic, no downstream command marker and no secret directory.
  Four valid pairs (1, 22, 8080, 65535) must reach both decode calls, substitution and both children.
  Stub children intentionally terminate; the unchanged real-nginx routing test proves readiness at 18080.
- Existing 46 routing assertions remain intact at `edge-test.cjs:68-120`.
  Current complete source: 36 shell lines plus 120 JS lines, 156 lines total; added/changed source is under 200 LOC.

Exact guard delta:

```diff
-[[ ${PORT:-} =~ ^[0-9]{2,5}$ ]] && (( PORT > 0 && PORT < 65536 ))
+# AIDEV-NOTE: Bound canonical decimal input before arithmetic to exclude octal and integer overflow.
+validate_port() {
+  if [[ ! $1 =~ ^[1-9][0-9]{0,4}$ ]] || (( 10#$1 > 65535 )); then
+    printf '%s must be a canonical decimal port in 1..65535\n' "$2" >&2
+    exit 1
+  fi
+}
+validate_port "${PORT:-}" PORT
+validate_port "${FLEET_SSH_PORT:-}" FLEET_SSH_PORT
-[[ ${FLEET_SSH_PORT:-} =~ ^[0-9]{2,5}$ ]]
```

Source SHA-256:

```text
180b2b449dae68926196bd40abeb22fae0f4eab37d2c584757abee2ac5875760  ops/railway/start.sh
c60d38ad22006543b9c00d520b6bafd30524fd0dd02a2f1521ef30e0f91b985b  ops/railway/edge-test.cjs
```

Root owns independent functional/design review and the central `code-reviews.md` update;
no nested reviewer was launched. This worker's source inspection is not independent acceptance.
Confirmed inherited defect: one LOW from the security receipt; independent post-fix defect
count/density remains pending, not claimed as zero.

## Verification and cleanup

Fleet-02 Docker execution passed **234 assertions**, container exit **0**:
188 new guard assertions and all 46 existing routing assertions. `bash -n` passed inside
the same container. The valid 18080 startup reached actual nginx readiness and routing;
the boundary cases use command stubs because binding port 1 as an unprivileged user is
outside this validation contract. No laptop tests or dependency installs were run.

The coordinator explicitly authorized pulling the pinned Node 24 base and installing edge
tools for this fixture. Base:
`node:24.21.0-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20`.
Disposable setup container installed nginx 1.22.1-9+deb12u10, openssh-client
1:9.2p1-2+deb12u10 and gettext-base 0.21-12. Source hashes inside the container matched
the hashes above. The resulting task-only image was
`sha256:0624235b54eb41febf31b4d7fd719a0a546f28d9cf653c78d71f04679d4b9586`.

Test container `elevateo-edge-af1ee-test` ran `node /tmp/edge-test.cjs` as user `node`,
with network mode `none`, no host port publishing and inspected mounts `[]`.
Both HTTP upstreams and SSH were fake; the only HTML was
`<!doctype html><title>Edge fixture only</title>`.
This minimal fixture does not rebuild or establish acceptance of the frontend bundle,
real SSH transport, Railway connectivity, Google login or live backend authorization.
Only package/image acquisition used external networking; the test had loopback only.

Cleanup completed: setup and test containers, task image and exact staging directory
`/tmp/elevateo-edge-af1ee` (four harmless fixture/source files) removed.
The newly pulled base reference was also removed after confirming zero container consumers;
pre-existing shared bases and unrelated workloads were preserved. Offline availability
probe containers named `elevateo-edge-af1ee-tools` were removed as well.
Final exact-prefix container inventory was empty; task image and staging absence verified.
No Docker build was used (a disposable setup container was committed), so no task builder
or build cache was created or pruned. Shared cache count remained 40 and size 1.521 GB;
volume inventory remained 258, with no volume deletion.

Host free space measured 68,499,062,784 bytes before cleanup and 68,566,515,712 bytes
after cleanup: net +67,452,928 bytes on a concurrent host, not an exclusive attribution.
Docker images decreased 86 to 84 including removal of the task-only image/base reference.
No laptop Docker/WSL disk was used; Windows compaction was unnecessary.

## Coordinator acceptance

Independent reviewer `ctx_755c0f7f3c5f` accepted the exact 156 physical source lines above:
zero defects, density 0/KLOC; hashes matched. Root accepted the runtime and cleanup receipt
and released both workers. Static review does not establish live connectivity or login.
