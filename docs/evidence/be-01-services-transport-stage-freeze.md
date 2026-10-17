Latest checkpoint: BE-STAGE-20261012-01 seven-member source staging PASS once; native SSH/process/staging/source/inventory/retention/independent reconciliation/status-read all0. Exact seven hashes/files0644/module0755 and canonical52 verified. Four volumes/app/shared bases/builders and retained Python preserved; no Docker mutation/tests. Raw shared-host delta +32190464 bytes, not attributable reclamation. Execution stopped; staging slot relinquished for coordinator acceptance, no next allocation claimed. Prior fixture five-test PASS/cleanup1/UNKNOWN historical ID remains unchanged. See docs/evidence/be-01-services-transport-stage-result.md. Earlier checkpoints below are historical.
Current staging-fixture checkpoint: five Docker tests PASS on fleet-02 audit6bc117b9; acquisition/identity/test/source/independent reconciliation0. Cleanup1 STOPPED_IMAGE_RETAINED: historical container ID UNKNOWN, fresh exact task name/label absent. Acquired Python f0408636 remains retained; four historical volumes/app/shared bases/builders preserved. Coordinator accepted partial-cleanup disposition and CLOSED allocation752a6c0f; no active lease or retry. Raw shared-host delta -46268416 bytes is not attributable reclamation. Frozen execution bytes unchanged. See docs/evidence/be-01-services-transport-stage-regression-result.md and be-01-services-transport-stage-next.md. Actual seven-member source staging, transport runtime and real Auth/private Storage/restart remain pending. Earlier checkpoint entries below are historical.
# Seven-member transport staging packet — local freeze, NOT_RUN

Coordinator closed dependency review: correctness and dedicated analytical design each170 executable LOC, zero defects/0 per KLOC, overlapping not additive; Obsidian unavailable. Runtime NOT_RUN. No active reservation. Original failed preflight/reconciliation and accepted follow-up remain unchanged. This packet does not authorize a remote operation.

## Frozen new review slices

| File under docs/evidence/scripts | LOC | SHA256 |
|---|---:|---|
| be01-transport-stage.sh |103|d6bbc4c0106b7550feabe1afee5eaa629910b7ac2477d5d83d864b0765d9ac80|
| be01-transport-stage.py |97|d5f9a669c2a413ed5b03faf39f9fde5baaeac95073792a407be305c2b44eb222|

Two correctness slices103/97; dedicated design same200 overlapping. New code unreviewed and unexecuted, including syntax; no host tests performed. Frozen parent/checks/regression remain1161916e/00c811df/9d99e7a1. No inherited lifecycle edits. No new framework or dependencies: existing host Bash/coreutils/Python3/jq/Docker CLI perform staging and bounded reads only.

## Authenticated input and boundary

Use unchanged local archive `C:/Users/Tanzeel/AppData/Local/Temp/be01-transport-check-8a9613df.tar`, outer SHA256 `0dde1cfc01484f32020e6c4f5ee8b91f76b614075c1bb1bb7abd323fdc336c54`. Seven exact regular members: `ops/tools/be01-transport-check/{parent-run.sh,checks.sh,run-container.sh,dependency-regression.sh,package.sha256}` and `docs/evidence/scripts/be01-capability-volume-transport{,-regression}.sh`. Duplicate/link/traversal/extra-member rejection precedes writes. Do not reuse old six-member staging.

Package pin8a9613df authenticates all six scripts plus five inherited dependencies: tools Dockerfile/checks, cleanup helper, fleet resources helper and canonical52 manifest. Existing inherited bytes and canonical52 entries are checked before exclusive target creation. No service/app capability manifest dependency. Exact full pins remain in the accepted dependency freeze. Stager refuses existing/dangling module directory or either transport script; all parents must already exist, be symlink-free, and be traversable within the bind root. Host ancestors need no other-execute bit. Only new module gets0755 and new files0644; manifest written last. Private audit0700; no ancestor chmod. Trusted exclusive filesystem ownership is required against TOCTOU; archive reads assume bounded authenticated delivery. Partial targets remain on failure and prohibit retry.

## Proposed delivery and invocation after review/allocation

Upload both new scripts and unchanged archive into a fresh coordinator-created private0700 delivery directory. Authenticate all three with the exact hashes above before calling either new script. Capture SCP/SSH statuses independently; use uploaded LF commands or fixed paths, not nested regex quoting. Do not run staged transport parent from this staging-only packet. Example **remote LF launcher contents** after filling fresh fixed delivery/audit paths:

```bash
set -euo pipefail
exec </dev/null
umask 077
: "${DELIVERY:?fresh private authenticated delivery}" "${AUDIT:?fresh be01-transport-stage-UUID evidence path}"
cd "$DELIVERY"
printf '%s  %s\n' \
 d6bbc4c0106b7550feabe1afee5eaa629910b7ac2477d5d83d864b0765d9ac80 be01-transport-stage.sh \
 d5f9a669c2a413ed5b03faf39f9fde5baaeac95073792a407be305c2b44eb222 be01-transport-stage.py \
 0dde1cfc01484f32020e6c4f5ee8b91f76b614075c1bb1bb7abd323fdc336c54 be01-transport-check-8a9613df.tar | sha256sum -c -
set +e
timeout -k 60s 480s bash ./be01-transport-stage.sh stage "$AUDIT" "$DELIVERY/be01-transport-check-8a9613df.tar" > "$DELIVERY/stage.console" 2>&1
stage_process=$?
set -e
printf 'stage_process_exit=%s\n' "$stage_process" > "$DELIVERY/stage.process.status"
exit "$stage_process"
```

SSH transport: BatchMode=yes, ConnectTimeout=10, ServerAliveInterval=15, ServerAliveCountMax=3, explicit stdin null. Coordinator captures actual SSH exit separately. Fresh coordinator lease/conflict confirmation remains a prerequisite not inferable solely from container names. Preflight validates expected short hostname/default Unix context, rejects DOCKER_HOST, requires10GiB free disk/4GiB MemAvailable, inventories all containers/volumes/images/builders, rejects running be01/fe01/perf task names and transport collisions. Shared unrelated containers are allowed. No pulls, builds, allocations, removals, services, tests or recovery.

## Exact retention and independent reconciliation

Before and after, inspect four exact `be01services-6f1401a6-071b-475a-8c27-1a3de66edc4b-{config,data,state,storage}` volumes, app image `sha256:7d755994b0456f71886c92ec548e55b64f58d0c8a579c14cde401f23b715b0f8`, immutable Ruby22165c5f and BuildKitcec9f139 references. Compare stable volume identity fields and sorted exact image IDs/digests/labels. Every preexisting builder's name/driver/node endpoints must remain; new unrelated builders do not fail retention. Whole shared-host image listings are evidence only, never compared for row equality. No volumes are mounted/read or declared safe to delete by this packet.

After staging invocation has definitely terminated, reauthenticate both scripts and run the separate read-only mode once:

```bash
set +e
timeout -k 30s 240s bash "$DELIVERY/be01-transport-stage.sh" reconcile "$AUDIT" > "$DELIVERY/independent.console" 2>&1
independent_process=$?
set -e
printf 'independent_process_exit=%s\n' "$independent_process" > "$DELIVERY/independent.process.status"
```

This creates fresh independent evidence below AUDIT, re-reads successful inventories, compares exact retained resources to before, requires transport container absence, canonical52/package checks and all seven file modes0644/module0755. Record source, staging, process, inventory and SSH statuses separately. NOT_RUN or missing statuses are never zero. Process status in AUDIT records initial stage exit; launcher exit can additionally fail on reconciliation. Raw before/after free bytes are captured; subtract numerically and report as shared-host delta, not reclaimed bytes.

If staging fails or times out, do not retry writes. Read-only reconciliation may return nonzero for absent/partial staged files even when retained-resource comparisons succeeded; component logs are evidence, not an inferred PASS. If before snapshot incomplete, reconcile manually by exact IDs/names and retain uncertainty. Outer grace does not guarantee every final read finishes: coordinator must reconcile after unknown transport/timeout. No cleanup is needed or authorized because staging allocates no Docker resources. Actual UID10001 container readability remains a later runtime gate. Auth/private Storage/restart proof remains pending.

## Supplemental static closure and Docker-only staging regression freeze

Coordinator reports preliminary Python stager correctness/design PASS0 over97 unique LOC at d5f9a669 (overlap nonadditive,0/KLOC). Analytical only, Obsidian unavailable. Exclusive filesystem lease remains required; implementation is not internally race-proof. Additional manifest/runtime/Dockerfile/baked-check follow-up73 LOC PASS0; all11 pins match. Coordinator independently verified seven regular archive members at0dde1cfc. Neither is runtime acceptance.

The 103-LOC staging wrapper d6bbc4c0 remains frozen pending root disposition. New Docker-only regression153LOC SHA25642cff9fd6c3c566817f86ceca2d37bcdb421c929822bb08af2f4d081ec6af347 and in-container checks16LOC SHA256a794d932075f66e92f7d9c58dfb3e701b7aa697e6fa97e633fb8d3ba10ddda99 await review. Correctness slices: wrapper103 and regression153+checks16=169. Dedicated design review can use these same slices; overlap is not additive. No tests or syntax runs performed.

Regression reuses Python stdlib unittest/tmpfile/mock pattern from be01-services-dependency-stage-regression.py. Five methods cover successful exact bytes/modes under umask077; corrupt archive; all five inherited dependencies individually; existing and dangling module/script targets; actual second exclusive file write interrupted after seven bytes with first file and partial state preserved, manifest absent, retry refused without modification. Every pre-write failure snapshots and compares all source bytes/modes. It runs actual frozen stager, does not replace authentication, and never writes /src. Ordinary CLI paths use subprocess deadlines; injected path is bounded by the whole Docker test deadline. This is not alternate-user host-path proof or Windows SSH proof.

## Proposed constrained Docker check (review and allocation required)

No new service stack or tools build. Reuse exact previously authenticated Python prerequisite `python@sha256:f040863673aea2570c3ff6a5c3fb4c673a016cbc5375005ad145915922b6b78a` only if present and its image identity passes the previously reviewed manifest/config-store verifier. Absence requires coordinator decision; this packet grants no acquisition. Deliver four regular flat files (stager, regression, checks, unchanged archive) beneath fresh private outer directory with mounted delivery0755/files0644. Authenticate their hashes before invocation; canonical52 and five inherited source dependencies must be present. Keep separate staging-only script out of the container entrypoint.

Proposed bounded command, following the established Python socket-free profile:

```bash
# Coordinator must set fresh exact NAME, source S, readable DELIVERY, and private EVIDENCE after preflight.
set -euo pipefail
: "${NAME:?be01transportstagecheck UUID}" "${S:?canonical source}" "${DELIVERY:?authenticated mounted directory}" "${EVIDENCE:?private evidence}"
[[ $NAME =~ ^be01transportstagecheck-[0-9a-f-]{36}$ ]]
set +e
timeout -k 15s 210s docker --context default run --rm --pull never \
 --name "$NAME" --label "elevateo.task=$NAME" --network none --read-only \
 --user 10001:10001 --cap-drop ALL --security-opt no-new-privileges \
 --cpus 0.5 --memory 256m --memory-swap 256m --pids-limit 64 \
 --mount "type=bind,src=$S,dst=/src,readonly" \
 --mount "type=bind,src=$DELIVERY,dst=/delivery,readonly" \
 --tmpfs /tmp:rw,noexec,nosuid,nodev,size=64m,mode=1777 \
 python@sha256:f040863673aea2570c3ff6a5c3fb4c673a016cbc5375005ad145915922b6b78a \
 bash /delivery/be01-transport-stage-checks.sh </dev/null > "$EVIDENCE/checks.log" 2>&1
test_process=$?
set -e
printf 'test_process_exit=%s\n' "$test_process" > "$EVIDENCE/test.status"
```

No Docker socket or network, no executable tmpfs required for Python subprocess/interpreter tests. Before allocation, successful bounded full container inventories must exclude exact name and label; record actual pinned image ID and shared retained identities/free bytes. After invocation, independently capture successful full no-trunc ID/name and exact-label inventories, prove task absent and shared/retained image/volume identities unchanged. --rm alone is not cleanup proof. Any timeout, daemon failure or missing identity/status stops advancement: inspect exact container state/image/labels/caps/mounts read-only, retain unknown resources, obtain exact cleanup disposition rather than retry/remove by name. This proposed command does not authorize cleanup of uncertain containers. Existing four volumes/app image are never mounted by this test. Capture true SSH/test/cleanup/inventory/source exits and shared-host raw space delta; no acceptance claim before independent reconciliation. No lease exists.

## Wrapper preliminary review closure and interpretation limits

Coordinator correctness and dedicated design reviews passed the same103 unique wrapper LOC at d6bbc4c0106b7550feabe1afee5eaa629910b7ac2477d5d83d864b0765d9ac80: zero defects,0/KLOC; overlap nonadditive. Analytical design only; Obsidian unavailable. No wrapper changes requested or made. Python97 and wrapper103 are now200 unique preliminary reviewed LOC; new regression153/checks16 remain pending review and all runtime NOT_RUN.

Invocation requires an exclusive coordinator lease, authenticated delivery, whole-process watchdog, and a trusted historical retained-resource baseline checked outside the wrapper before staging. Its fresh before/after comparison proves preservation relative to that fresh baseline, not historical provenance by itself. Missing status after forced termination remains UNKNOWN until independent reconciliation. inventory_exit aggregates retained inventory and staged verification; process_exit0 alone is not success. Require actual transport/launcher/staging/source/inventory and independent reconciliation success together. No fleet allocation exists.


## Staging regression static closure and prerequisite stop

Latest staging-fixture checkpoint: preflight1 on absent pinned Python f0408636; test NOT_RUN, no container/delivery staging/pull/recovery. Independent reconciliation SSH/process/source/inventory/retained/shared0; no cleanup needed. Raw shared-host free delta -17395712 bytes. Execution slot relinquished; coordinator independent acceptance pending. Regression153+checks16 static correctness/design PASS0 over169 unique LOC, overlap nonadditive. Frozen bytes unchanged; see docs/evidence/be-01-services-transport-stage-regression-result.md. Earlier pending-review/no-allocation statements are historical.

Coordinator correctness/design:169 unique LOC,0 defects,0/KLOC; analytical only, Obsidian unavailable. No runtime PASS. Initial preflight SSH exit was not captured (UNKNOWN); subsequent independent status reads and reconciliation SSH0 establish remote statuses without retroactively fabricating that transport exit.
