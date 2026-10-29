# Capability-eight staging: next coordinator packet

LOCAL PREPARATION ONLY. No remote allocation, mutation or tests in this update. Image recovery accepted/CLOSED; see be-01-services-image-recovery-result.md. All four historical volumes/probes and exact app image are now absent. Python remains retained; historical transport/Python uncertainty is unchanged. Do not repeat recovery.

## Frozen delivery and review

Existing local archive: C:/Users/Tanzeel/AppData/Local/Temp/be01-capability-eight.tar
SHA256 b4664cb774fa24b338d7dd2463aeb2cd5371ee381a6cb562e82278ba252056f5.
Stager: docs/evidence/scripts/be01-capability-stage.py, 92 LOC, SHA256 f0ec97799654f24c8b657575406da6f40901ecb9e64f61242f36c3778ccd9dd1.
Socket-free launcher: docs/evidence/scripts/be01-capability-check-launch.sh, 51 LOC, SHA256 0a38d5252cd5c9e363d70658c7dba0182f65bc097531d1857b857a25f57431c7.
All rehashed locally unchanged. Eight payload paths/hashes below reverified against local bytes. The archive hash authenticates the existing eight-member payload; frozen stager validates exact regular member set and each member before any write.

Prior static coverage: capability snapshot157 unique agent-reviewed LOC, zero defects/0 per KLOC, overlapping dedicated design; coordinator separately inspected app regression82 with zero concrete findings. Recovery56/stager92/launcher51 final199 unique script LOC, zero defects/0 per KLOC, design overlapping, parent88 context nonadditive. Analytical design only; Obsidian unavailable. Recovery runtime acceptance is separate: capability-eight staging and its socket-free launcher remain NOT_RUN. No new implementation/review claims.

## Fresh prerequisites (staging-only slot requested: 20 minutes plus reconciliation)

Coordinator exclusive filesystem/task lease and fresh FE/PERF conflict check required. Host short name Ubuntu-noble-latest-amd64-base; context default at unix:///var/run/docker.sock; no Docker host/TLS overrides. Bounded read-only daemon calls15+3s and preflight240+30s; capture native SSH status immediately. Disk >=10GiB and record MemAvailable; no global-idleness requirement. Successful full container/image/volume and builder inventories required, comparing stable identities rather than formatted whole-list order.

Use accepted image independent baseline under be01-image-1dd9d729-f6c9-48ba-9863-04584d5a41a1/independent. Reconfirm exact old app ID/tag and four historical volume/probe IDs/names absent from successful inventories. Preserve retained Pythonf0408636, Ruby22165c5f, BuildKitcec9f139, all other images/builders/shared resources; no Docker mutations in staging.

Authenticate canonical52 manifest03d590ddaa39b22c6b1851c9911405473c0b01b0a50fff08001144e66a14638b and its contents, transport package8a9613df9d49c86a4f05748a75365a51b0cac7d60e406d30efb2598103fb40a7 and inherited manifests. Verify every OLD pin below before writes. Existing targets must be regular/non-symlink with directory ancestors non-symlink. This is eight replacements, not additive target creation. New delivery/backup must be absent including dangling links. Trusted exclusive filesystem boundary required; no ancestor chmod. Stop on changed/partially staged targets; never retry over them.

## Concrete staging invocation

After allocation, choose one fresh UUID D directly beneath the evidence root; upload only the frozen archive and stager into D0700, files0644. Authenticate uploaded files before invocation. Save this block as LF launcher with concrete D, hash/authenticate that launcher before a direct fixed-path SSH invocation with stdin /dev/null. No nested SSH regex/quoting. Capture SSH separately from process status. The following remote block is proposed, not executed:

```bash
set -euo pipefail
: "${D:?Fresh authenticated absolute delivery path required}"
root=/home/tanzeel/elevateo-mail-tests-20261012-ultra
[[ $D == "$root/"* && $(realpath -e "$D") == "$D" ]]
cd "$D"
printf '%s  %s\n' \
 b4664cb774fa24b338d7dd2463aeb2cd5371ee381a6cb562e82278ba252056f5 be01-capability-eight.tar \
 f0ec97799654f24c8b657575406da6f40901ecb9e64f61242f36c3778ccd9dd1 be01-capability-stage.py | sha256sum -c -
[[ ! -e old-byte-backup && ! -L old-byte-backup ]]
df -B1 "$root" > free.before
set +e
timeout -k 5s 600s python3 "$D/be01-capability-stage.py" "$D/be01-capability-eight.tar" "$D/old-byte-backup" < /dev/null > staging.log 2>&1
stage_process_exit=$?
set -e
printf 'stage_process_exit=%s\n' "$stage_process_exit" > process.status
exit "$stage_process_exit"
```

Independent reconciliation runs after EVERY outcome under240+30s bound: authenticate all eight new hashes and0644 modes (or report each actual old/new/partial state on failure); verify backups equal all eight old pins, nested manifests and canonical52, unchanged ancestor modes, retained stable IDs/builders and historical absence. Save source/inventory/retention/eight_hash_mode/backup statuses separately, full successful inventories, free.after and raw shared-host delta. SSH/process0 alone is insufficient. Missing status is UNKNOWN. Preserve private backups and partial state, stop and report; no automatic rollback, restaging or cleanup.

## Separately allocated next commands toward actual acceptance

Only after staging accepted, request30-minute capability socket-free slot plus independent reconciliation. Authenticate frozen launcher above, parent f2499630b41ddbbfcabe018bc6e00740cbcef20e36cdc3aad4d2cc40a10076c2 and repaired volume-check packageaf243965b395e7defd021b9f249958ab77b01e881bc2bae30811b63928ca99ad. Fresh pinned bases/capacity/source/conflict gates and UID10001 readability required. Exact command (CHECK_AUDIT must be fresh):

```bash
CAPABILITY_CHECK_APPROVED=capability-socket-free CHECK_AUDIT="$root/be01-capability-check-$(cat /proc/sys/kernel/random/uuid)" bash "$D/be01-capability-check-launch.sh" < /dev/null
```

Launcher is uploaded/authenticated separately; it uses reviewed capped tools lifecycle,1500+20 outer bound, parent1200+180. Inspect capability security negatives, nine volume cases, app coupling, test/cleanup/source statuses; independently reconcile actual container/builder/cache/image IDs and shared retention before release. No actual service acceptance inferred.

Only after that PASS/cleanup acceptance, request70-minute full-services slot plus reconciliation. Reauthenticate unchanged parent643bfe925f232263dc1619352f5fc5326bb86d01544856325fad493221199434 and new app packagee00f1937002e6efef78b3a7dd1e733f351955377e95fe43fdbddc1036c3245ef. Fresh five Compose digest pins, Ruby/BuildKit, entrypoint modes, canonical52/nested hashes and capacity/conflicts required; no pulls, published ports or live mail. Existing parent3600+600 deadline:

```bash
TOOLS_SOURCE="$root/lane-c-20261012" TOOLS_EVIDENCE="$root" TOOLS_HOST=Ubuntu-noble-latest-amd64-base TOOLS_CONTEXT=default APP_BUILDKIT_IMAGE=moby/buildkit:buildx-stable-1@sha256:cec9f139f45e93c5c69c60f8b07cfad9f43f4ef6b6a6cd917527fea5ff2e3dea SERVICES_APP_PACKAGE_SHA=e00f1937002e6efef78b3a7dd1e733f351955377e95fe43fdbddc1036c3245ef bash "$root/lane-c-20261012/ops/tools/be01-services-app/parent-run.sh" < /dev/null
```

Capture true SSH/parent/child/test/cleanup exits and private evidence. Required product proof remains real Auth provisioning/token/signup denial/invite recovery, private Storage round-trip/direct denial, whole-stack persisted-state comparison immediately after restart BEFORE reseed, then bootstrap idempotence. New grants do not prove old-session survival. Stop on first failure; independent exact cleanup/reconciliation mandatory, uncertain resources retained. No new product implementation, paid calls, ultrareviews or BE02 gate bypass.

## Exact old -> new payload pins

- `ops/tools/be01-services/profile.jq`
  - Old: `803dd61d285ffcc14702002355366a18b5b93e58ee88ec2051ca94b5b838da9d`
  - New: `d7e8a7d982b4e9bac6bbca3daf8f13494a8181a40d4d704dcd7a28fc93b9b633`

- `ops/tools/be01-services/profile-regression.sh`
  - Old: `5008cc993b651374e6eb1e5ad2912263a909991f9dd7125bb7311a2068d08a13`
  - New: `a80ebee722656cdf1311a28ce4d6621c5332358bd336b63c2668caab8ba93889`

- `ops/tools/be01-services-volume-check/checks.sh`
  - Old: `3e4b75f5c010ca86a32434e359d3161dc4f7631ee173225d1c6143b8f8f703b4`
  - New: `d51f8fbe765c077f804dfe1334d33df3316571d14ab1d098325719707d72f050`

- `ops/tools/be01-services/package.sha256`
  - Old: `b20a69471069c9e8c24d241c327fb1457c55982d175756b3623bd15036e7cbc3`
  - New: `ad4773807748c99d23c763f2a6203a4cde276c68cca09ea6f9f030380252235d`

- `ops/tools/be01-services-app/dispatch.sh`
  - Old: `3b452c1e20d750487f0c464007739448075acb31d581bf9893c75f3247d63e92`
  - New: `5d159340df518eaf4dcaf7c67d76728befb18b6e34f5761dee1bc124f777541c`

- `ops/tools/be01-services-app/regression.sh`
  - Old: `90a7d57d5c53e146155ff31f5437200ebee580e459c4313c52414582b8d308e8`
  - New: `bdab4ccb62c24b4433d4d05c2f1b901155f4e8f4c6dcd47d88d6b42aca55518f`

- `ops/tools/be01-services-app/package.sha256`
  - Old: `2da812bb3a95fabdad927a7ed9d5c7fb1e03d4fac0601ca66100c80938f48466`
  - New: `e00f1937002e6efef78b3a7dd1e733f351955377e95fe43fdbddc1036c3245ef`

- `ops/tools/be01-services-volume-check/package.sha256`
  - Old: `5c40fbe1efe92b65b2f99a0120497027d7971127bae4eb689b7ad718d3fc88e7`
  - New: `af243965b395e7defd021b9f249958ab77b01e881bc2bae30811b63928ca99ad`
