Current checkpoint: the bootstrap regression b511c3c1 has coordinator-supplied static closure (97 LOC,0 defects). The new finalizer/status regression also has supplied static closure (52 LOC,0 defects). Runtime remains NOT_RUN. The frozen combined tools packet in repairs/be01-bootstrap-tools/HANDOFF.md supersedes the standalone proposed invocation below; its remaining control scripts still require bounded review. Earlier pending-review statements below are historical.

# Frozen bootstrap Docker regression fixture

Local preparation only: no host tests, SSH, Docker, builds or downloads. Actual caller bytes remain frozen. Full-services retry and retained-config mutation remain gated. Runtime NOT_RUN.

## Inputs and review slices

Directory: `docs/evidence/repairs/be01-diagnostic-bootstrap`. All files LF. Authenticate fixture.sha256 independently BEFORE running checks; it authenticates five inputs including checks itself.

| Input | LOC | SHA256 |
| --- | ---: | --- |
| bootstrap.ps1 (unchanged) |80|0dd7ddede090bb85eaaf6e5b94de1d3ed12011ea288787061384cbefe406484d|
| bootstrap.sh (unchanged) |16|3ab389aa8f6d022afa3ea531d031b2912d3c0a8911b66ac761df5a4121424db3|
| fake-ssh.rb |29|79705a0d32ad99f119d1f208d4bbec8a873b66db610a99406fa1094183ca10c2|
| regression.rb |97|b511c3c1eb7507caffbbb22bf2f3ef619264719ec7264fb633fa9b1238856c50|
| checks.sh |12|46bcbc373a111c859ee0ab54a5ff87a2e158c38595b84acc4a2b92e9290d7f39|

Fixture manifest SHA **cd6472a8a82f59724d1a78b79cb22dae48ab53c15c6f813b0f11fdb4f6f65f53**, distinct from caller hash. Prior three-script review manifest25eec650 remains unchanged. New executable review scope138 LOC (fake29+regression97+checks12); existing caller80+shell16 context can be split into a separate <=200LOC assignment. Original fake29+regression87 review:116 LOC,1 HIGH,8.62/KLOC. Corrected regression awaits re-review.

## Actual implemented cases

The Ruby stdlib harness copies only fake-ssh.rb into a fresh tmpfs bin/ssh.exe and invokes the real unmodified caller via pwsh. It never executes the bootstrap shell on a host. Each case verifies exact argv, exact stdin bytes, caller/native status, timeout/error fields and fake SSH process termination. Cases: success; exit37; delayed inherited pipe EOF with trailing stdout/stderr and exit0; same with37; pipe drain exceeding5s fails closed; stdout evidence path collision yields failure; same collision preserves37; native TERM status143; actual75s caller timeout yields124 and native kill137 in evidence. Both output channels are compared separately on successful-drain cases.

Every case owns an isolated process group; ensure kills only that group on success/failure. Container removal is the outer descendant boundary. Nine cases expected; no skip path. Timeout test deliberately retains the real75s production timeout without hooks. Case deadline105s; overall container180+10. Linux timing/Process.Kill exit assumptions require runtime proof. Post-start caller exception path is UNPROVEN: no case forces it. Evidence-write collisions exercise evidence failure only. Shared-deadline hold case is bounded but does not independently simulate each possible asymmetric stream scheduling order. Native Windows transport and remote bootstrap identity/absence guards remain separate acceptance requirements.

## Pinned image prerequisite, no acquisition authorized

Reuse unchanged reviewed Lane P recipe, not a new tools stack:
- ops/tools/lane-p-protocol/package.sha256: a86ec51727ac71f3984ef7d5f13649afe2b95c8e1dc719468d357799a34abb1b.
- Dockerfile:815122c2b11123910e890218c6344bd7250eb34d322891a29cb50bd9f7e97ad0; package pins checks/gems/provenance.
- Ruby base: ruby:3.4.11-slim-bookworm@sha256:22165c5f904d76a8a02fbdd419d0269481369523fd66978232d16c88099730e2.
- PowerShell7.4.20 release tar SHAed8008345c7f5337f5e293145f5e243ce132e5ee4dfc24ac551c45a4b3092181; other downloads remain recipe-checksummed.
- Existing reviewed lifecycle manifest ops/tools/lane-p-dispatch/dispatch.sha256:4509ce8417eb93167847a67093b435eb000e11b1e82755e8ddcd0803402cdb25; see Lane P rerun/result evidence. Its default entrypoint runs a different suite and must NOT be dispatched as this test.

Previously disposable tools image was removed. No current immutable output image ID is asserted. Coordinator must supply an authenticated immutable tools image built from this exact recipe through the reviewed capped Buildx lifecycle under separate build approval, or prove an existing matching image. Capture immutable ID/provenance and exact build cleanup before the command below. Never silently substitute mutable tag or Ruby-only image. Shared/preexisting images retained; task-acquired build resources need reviewed exact-owned cleanup. This is an explicit prerequisite, not a current build grant.

## Proposed single-container invocation after review/allocation

Trusted coordinator sets TOOLS_IMAGE to authenticated sha256 image ID and FIXTURE_DIR to a freshly authenticated six-file directory (five inputs plus manifest), root0755/files0644 in private evidence parent. Preserve canonical52, retained config identity/zero consumers, shared image/builder baselines and current reservation. Fresh host/context/conflict/capacity gates required. Read-only root and source; tmpfs MUST be exec for fake ssh.exe. No Docker socket or network. Commands below are a review packet, not executed.

```bash
set -euo pipefail
: "${TOOLS_IMAGE:?authenticated immutable image ID required}" "${FIXTURE_DIR:?}" "${AUDIT:?fresh private directory}"
[[ $TOOLS_IMAGE =~ ^sha256:[0-9a-f]{64}$ ]]
TASK="be01bootstrap-$(cat /proc/sys/kernel/random/uuid)"
cd "$FIXTURE_DIR"
printf '%s  fixture.sha256\n' cd6472a8a82f59724d1a78b79cb22dae48ab53c15c6f813b0f11fdb4f6f65f53 | sha256sum -c -
sha256sum -c fixture.sha256
# Authenticate image inspection/provenance and successful full inventories before allocation.
timeout -k 3s 15s docker --context default image inspect "$TOOLS_IMAGE" > "$AUDIT/image.before.json"
timeout -k 3s 15s docker --context default create --name "$TASK" --label "be01.bootstrap=$TASK" \
  --network none --read-only --user 10001:10001 --cap-drop ALL --security-opt no-new-privileges \
  --memory 256m --cpus 0.5 --pids-limit 128 --tmpfs /tmp:rw,exec,nosuid,nodev,size=134217728 \
  --mount "type=bind,src=$FIXTURE_DIR,dst=/fixture,readonly" --entrypoint bash \
  "$TOOLS_IMAGE" /fixture/checks.sh > "$AUDIT/container.id"
CID=$(cat "$AUDIT/container.id"); [[ $CID =~ ^[0-9a-f]{64}$ ]]
timeout -k 3s 15s docker --context default inspect "$CID" > "$AUDIT/created.json"
# Profile proof below must pass BEFORE start and again before cleanup.
set +e
timeout -k 10s 180s docker --context default start -a "$CID" > "$AUDIT/checks.log" 2>&1
test_exit=$?
set -e
printf 'test_exit=%s\n' "$test_exit" > "$AUDIT/test.status"
```

Exact cleanup on every outcome, including test failure, is mandatory; allocation operator must not treat this linear command block as an unattended failure-safe dispatcher. If create/inspect/status is missing or timed out, stop and independently reconcile exact task name/label before any deletion. Do not retry. A captured ID alone is not ownership proof.

Before start and before removal, authenticate successful single-object Docker inspect: Id=CID, Name=/TASK, Image=TOOLS_IMAGE, exact task label, Config.User=10001:10001, Entrypoint=[bash], Cmd=[/fixture/checks.sh], network none, readonly root, CapDrop=[ALL], no CapAdd/devices, no-new-privileges, Memory268435456/NanoCpus500000000/PidsLimit128, sole bind mount source=FIXTURE_DIR destination=/fixture RWfalse; sole tmpfs /tmp with exact approved flags/size. Preserve unknown profiles. Verify no published ports or additional mounts. On stopped matching container use bounded non-force `docker --context default rm "$CID"`; if still running after timeout, only verified exact profile permits bounded exact-ID kill, fresh stopped inspect, then non-force rm. Record each native exit separately. No volume/image removal in this regression command.

Independent reconciliation must obtain successful fresh full container inventories and prove absence of exact ID, name and be01.bootstrap label; verify source manifest unchanged and retained config/shared bases/builders identical by stable identities. Missing/failed inventory means UNKNOWN. Capture raw df-B1 before/after as shared-host delta only. Save create/inspect/checks/test/cleanup/inventory/source/retention and native transport statuses under AUDIT, fetch all evidence. Release only after independent cleanup acceptance. No full-services execution.

## Waiter-join repair freeze

Original timeout unwound through Open3 join before outer cleanup. Regression lines43-94 now keep assertions and exact-group cleanup inside popen3; lines72-93 perform cleanup before Open3 joins. Survival assertions run before fixture cleanup to avoid masking caller leaks. KILL is followed by a three-second waiter join. Original exception propagates when reaped; cleanup errors do not replace it. If reap remains unknown, print original failure and exit!1 to bypass the unbounded library join; container reconciliation remains required. No runtime proof, tests NOT_RUN. Frozen caller/fake/checks unchanged. No case yet forces the fixture105s watchdog itself; this remains a coverage limit.
