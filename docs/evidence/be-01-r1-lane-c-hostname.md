# Lane C shared-network hostname repair — frozen, review pending

The latest run is NOT accepted. Child test_exit=1, cleanup_failed=1. Parent test_exit=1, cleanup_failed=0. No further validation or cleanup is authorized until parent review. Exclusive fleet-02 ownership remains with this terminal; no ultrareviews are permitted.

## Evidence and diagnosis

Remote evidence root: /home/tanzeel/elevateo-mail-tests-20261012-ultra/

- Synthetic prior package: be01tools-97da8e5f-256c-41a0-a90a-b99d2327bec5.WYGXHp; six regression groups and syntax PASS, test_exit=0, cleanup_failed=0; independent inventories empty.
- Actual parent: be01app-a16f116d-c3c3-4d60-997e-2a59e35c06ab.BU0HpR. App build and baked verification PASS. Image sha256:6b6a0ba9474c0a716acba3735d8aa01dc39705b59c0ba3aa9efe9b25c7c746ae. Parent logs report app image/builder/cache removed.
- Actual child: be01r1-2fb0fbfc-ab83-4249-a11a-d2a9192b93da.OXM4uc. Compose 5.3.1 created all nine service containers successfully. Prior unsupported create flag defect is resolved in this runtime. Actual egress acceptance was not reached.
- Mailpit readiness tool returned {"outcome":"connected","default_route":false}, exit 0. Post-start fingerprint verification failed before proceeding.
- Captures: retained-tool-inspect.json, retained-tool-fingerprint.json, retained-tool-output.log in child evidence. Logs at root: create-app-dispatch.log and create-app-console.log.

Config.Hostname changed from own short ID 9c90bd737e49 to pinned network donor short ID 7c450c5b789a. Replacing ONLY that field in the captured normalized fingerprint reproduces the original stored SHA256 d935675c39c7d507d15b0fc800618093e7ee7164eb4308536214bf9c2f68ecba. Current fingerprint SHA256 is 23cf2e889c66fb7d1be5358e1605b44fc2d92f8b3c8fe3b7caccb69fd0646158. This isolates the new drift to hostname; stdin/attach settings are not implicated. The prior false/null OomKillDisable equivalence remains intact.

## Retention and cleanup

Retained stopped tool name: be01r1-2fb0fbfc-ab83-4249-a11a-d2a9192b93da-tool-7c9e9bf4-bef3-4cbd-a844-dbd7f3c940dc

Exact ID: 9c90bd737e4917e53445e983207f9b340b286308535056d651b36b78a6fef6e1

Readonly source bind to /src; shared pinned Ruby image; no persistent volume. NetworkMode container:7c450c5b789a00caf34f67d49b3fb1010414dbe95994f77e878faca1f4ba65bb. Read-only name-filter inventories confirmed only this child container, no matching child volumes/networks, and no parent containers. Parent image/builder/cache deletion is log evidence, not a fresh independent inventory claim. No resources were removed during diagnosis. Space reclaimed was not measured. Shared resources remain preserved.

## Narrow repair and review scope

ops/tests/fleet02-egress-inspect.jq normalizes only nonservice tools whose exact pinned network is container:<64 lowercase hex ID>. Hostname must equal either the tool ID's first 12 characters or the pinned donor ID's first 12 characters. Both map to the tool short ID. Arbitrary hostnames fail closed. All other Config, HostConfig, mounts, network keys and existing profile checks remain covered.

ops/tests/fleet02-egress-regression.sh adds both lifecycle directions, combined hostname/OOM serialization, safe exact-ID removal, and rejection before removal for foreign/null hostname, domain change, donor change, identity replacement, memory-cap removal and environment drift. Docker-only synthetic coverage authored but NOT executed. Inspector 40 LOC plus regression 141 LOC = 181 unique LOC for bounded review. Delta: inspector +7/-1; regression +39/-0 against the preceding frozen snapshot. Three orchestration scripts change hashes only; dependent manifests change hash entries only.

One confirmed runtime defect: fingerprint treats inherited shared-network hostname as identity drift. New review coverage and defect density remain pending, not zero. Prior Compose-create review: 192 unique LOC, zero defects, 0/KLOC; design 166 overlapping LOC, zero defects, 0/KLOC. These do not validate the new patch.

Canonical 52-file source manifest remains 03d590ddaa39b22c6b1851c9911405473c0b01b0a50fff08001144e66a14638b. Product sources, Compose helper, create regression, tools lifecycle implementation and app source implementation remain unchanged. Do not repin local CRLF product files.

## Frozen execution files

| File | LOC | SHA256 |
| --- | ---: | --- |
| ops/tests/fleet02-egress-inspect.jq | 40 | ee8df9810329ea884b4e706e0b9dee558026262fd7488afeff8abde2af873f4e |
| ops/tests/fleet02-egress-regression.sh | 141 | cdf0e32c0ee2e68a3130fa11132343408a5cf88b04ae777882a5b053f34b4694 |
| ops/tests/fleet02-egress-package.sha256 | 11 | 46b296fd1158da3e9df1362162d903e01013c5fedd33465bf8ab323ed4217862 |
| docs/evidence/scripts/be-01-r1-fleet02-compose-egress.sh | 83 | 97bdb91a0cc406cff6611c5eb97158988e12ffd19cd4413231ea578de7c5a1f4 |
| ops/tools/lane-c-synthetic/parent-run.sh | 78 | 1af110b569c506396122500936dbadb53e5396041aa4422acb7d658bcab1dae8 |
| ops/tools/lane-c-synthetic/tools.sha256 | 8 | f799b9edefd8f88fccd10ab6c452e253d6174cf68b2cdee919a3d5d15e046b6e |
| ops/tools/lane-c-app/parent-run.sh | 84 | c18bf4df32f373e5c6f00535d7ed2e688504790f5898a28024138eb586321f45 |
| ops/tools/lane-c-app/app.sha256 | 3 | 1eeeca5c896bc1082e43202478b5816e8d909efdf0c40e712c367df4ad50f9c4 |

Next action: parent bounded code/design review of this packet. After approval, authenticate only these eight LF-byte files and all dependent manifests against preserved canonical source; run Docker synthetic lifecycle first, then actual app only on PASS. Retained-container recovery requires separate exact ownership/profile reconciliation against captured evidence. No rerun or cleanup has been performed for this patch.

## Proposed ordered staging, synthetic and recovery sequence (NOT executed)

Parent code and dedicated design reviews are currently reading inspector plus regression, 181 unique LOC (each assignment below 200). Execution bytes remain frozen. The commands and operations below are a proposal for after review, not authorization to bypass it.

1. Record both reviewer outcomes against the exact inspector/regression hashes above. Stop on any finding. Build a transport archive containing exactly the eight table paths, all regular files, no links, no extra entries. Record its SHA256 outside the archive before upload. Preserve the canonical 52-file source manifest and all source files. No new regression path is introduced: the existing profile regression changes in place.
2. Adapt TEMP/be01-create-stage-test.sh for those eight paths only, a new hostname-specific archive/log/stage name and independently recorded archive SHA256. Remove its special new-create-regression branch: all eight destinations must already be regular, non-symlink files. Authenticate archive digest and exact member list before extraction. Reject links, traversal, absolute paths, duplicate members and unexpected types. Extract to a new private evidence staging directory, never directly over canonical source. Verify every extracted file against the eight hashes in this packet before any copy.
3. Before writing canonical staging, verify source manifest SHA256 03d590ddaa39b22c6b1851c9911405473c0b01b0a50fff08001144e66a14638b and all 52 entries. Preserve the old eight execution files and their hashes in the evidence directory. Require hash-only comparisons of the three orchestration scripts using the existing sed replacement of 64-hex tokens followed by diff. No changes to commands, ordering or other bytes are allowed in those scripts. Confirm all parent directories resolve within the canonical source root and are not symlinks. Copy only eight authenticated files with readable mode 0644; do not change app source modes or bytes. Recheck the complete source/package/tools/app manifests afterward.
4. Run the existing capped Docker tools lifecycle with the environment below. It runs all six synthetic groups and syntax checks without a Docker socket in the test container. Capture SSH/process exit, task/evidence path, test_exit and cleanup_failed. A PASS requires process exit 0, test_exit=0, cleanup_failed=0 and independent exact-task name/label inventories confirming no new task containers, volumes, images or builder remain. The old retained tool is a different task and must remain untouched by synthetic cleanup. Any failure stops this sequence for diagnosis/review.

```bash
# Proposed remote commands, only after authenticated staging and review.
set -euo pipefail
export TOOLS_SOURCE=/home/tanzeel/elevateo-mail-tests-20261012-ultra/lane-c-20261012
export TOOLS_EVIDENCE=/home/tanzeel/elevateo-mail-tests-20261012-ultra
export TOOLS_HOST=Ubuntu-noble-latest-amd64-base
export TOOLS_CONTEXT=default
[[ $(hostname -s) == "$TOOLS_HOST" && -z ${DOCKER_HOST:-} ]]
cd "$TOOLS_SOURCE"
printf '%s  %s\n' \
  f799b9edefd8f88fccd10ab6c452e253d6174cf68b2cdee919a3d5d15e046b6e ops/tools/lane-c-synthetic/tools.sha256 \
  1eeeca5c896bc1082e43202478b5816e8d909efdf0c40e712c367df4ad50f9c4 ops/tools/lane-c-app/app.sha256 \
  46b296fd1158da3e9df1362162d903e01013c5fedd33465bf8ab323ed4217862 ops/tests/fleet02-egress-package.sha256 \
  03d590ddaa39b22c6b1851c9911405473c0b01b0a50fff08001144e66a14638b ops/tests/fleet02-egress-source.sha256 | sha256sum -c -
sha256sum -c ops/tests/fleet02-egress-source.sha256 ops/tests/fleet02-egress-package.sha256 \
  ops/tools/lane-c-synthetic/tools.sha256 ops/tools/lane-c-app/app.sha256
result=0
bash ops/tools/lane-c-synthetic/parent-run.sh > "$TOOLS_EVIDENCE/hostname-tools-console.log" 2>&1 || result=$?
printf 'synthetic_exit=%s\n' "$result"
# Stop here; inspect lifecycle statuses and independent exact task inventories before recovery.
exit "$result"
```

5. After synthetic PASS and reviewed recovery authorization, reconcile only the retained immutable ID listed above. Keep original .spec/.pin/.id evidence unchanged in child resources/. Capture a fresh bounded inspect by full ID, and verify the exact name, elevateo.lane label, stopped state, recorded ID file, immutable shared Ruby image, readonly source bind, no volumes/extra mounts, caps/user/security/resource limits and exact donor NetworkMode against the original spec. Run the reviewed inspector on that fresh snapshot with the original spec/task; its canonical output hash must equal original pin d935675c39c7d507d15b0fc800618093e7ee7164eb4308536214bf9c2f68ecba. Compare with the saved diagnostic inspection too; never replace/re-pin the historical hash to make cleanup pass. Preserve on any ambiguity, failed inspection or mismatch.
6. Immediately re-inspect by immutable ID and repeat stopped/profile/fingerprint checks. Only then propose bounded `docker --context default rm 9c90bd737e4917e53445e983207f9b340b286308535056d651b36b78a6fef6e1` (no force, no volume-removal flag). A concurrent restart should make removal fail rather than force-stop work. Verify absence by exact immutable ID AND exact name/task-label inventory. Do not remove the shared Ruby image, source bind, evidence directory, unrelated resources or anything inferred from a prefix. Record recovery exit/status and retained items separately from the original failed run; recovery never changes its test_exit=1/cleanup_failed=1 history.
7. Only after the above review, synthetic PASS and reconciled recovery, independently inspect all five Compose digest-pinned images and the immutable BuildKit reference below. Authenticate app manifest again. Reuse the unchanged reviewed app lifecycle; preserve strict hostname/context, dedicated 2 CPU/2 GiB builder and bounded cleanup. No pulls in Lane C. Capture full parent/child statuses and exact cleanup inventories. Any next runtime defect stops execution for a narrow patch and parent review.

```bash
# Separate proposed dispatch after all previous gates have passed.
export APP_BUILDKIT_IMAGE=moby/buildkit:buildx-stable-1@sha256:cec9f139f45e93c5c69c60f8b07cfad9f43f4ef6b6a6cd917527fea5ff2e3dea
cd "$TOOLS_SOURCE"
printf '%s  %s\n' 1eeeca5c896bc1082e43202478b5816e8d909efdf0c40e712c367df4ad50f9c4 \
  ops/tools/lane-c-app/app.sha256 | sha256sum -c -
sha256sum -c ops/tools/lane-c-app/app.sha256
result=0
bash ops/tools/lane-c-app/parent-run.sh > "$TOOLS_EVIDENCE/hostname-app-console.log" 2>&1 || result=$?
printf 'app_exit=%s\n' "$result"
exit "$result"
```

No transport archive or adapted executable staging/recovery script is claimed frozen in this packet; those future wrappers must be inspected against this sequence before execution. All daemon inventory/inspection/removal commands must use explicit default context and timeout (existing daemon_for: 10 seconds, kill-after 3 seconds). No daemon operation is needed to finish this documentation. No host tests, remote mutation, commit, push or ultrareview was performed in this documentation update.

## Static review closure and limited runtime authorization

Hostname review closure: parent code reviewer and dedicated design reviewer each inspected inspector 40 LOC plus regression 141 LOC; zero confirmed defects, 0/KLOC each. Unique coverage 181 LOC; design 181 LOC overlaps. Frozen hashes ee8df9810329ea884b4e706e0b9dee558026262fd7488afeff8abde2af873f4e and cdf0e32c0ee2e68a3130fa11132343408a5cf88b04ae777882a5b053f34b4694. Static acceptance only; Docker and recovery unproven. Obsidian unavailable, design scenarios analytical. Ordinary-network/service/malformed-donor negative cases are coverage limits, not confirmed defects. User subsequently authorized authenticated staging and synthetic lifecycle cleanup only; old retained tool and app lifecycle remain gated.

## Authorized synthetic execution result

Eight execution hashes remain exactly as frozen above. Transport archive be01-hostname-repair.tar SHA256 7510104c4cd4773cb4e7bce16b9592580e95d9b7faeb2eea856e37a4f0b61c8b; authenticated staging wrapper be01-hostname-stage-test.sh SHA256 a9986ef915e52569727d028c4ba37651386ab33aef10deca195bf2a46a3ed591. Both staged under the existing remote evidence root. Wrapper archived previous eight files, authenticated exact archive members/types, checked all eight hashes, compared hash-only orchestration, preserved canonical source and verified all dependent manifests. Staging evidence: hostname-repair.MCh7T2; console hostname-stage-console.log.

Synthetic Docker task be01tools-2eb395c9-23bd-4994-86c5-85fb6e51e3e9, evidence /home/tanzeel/elevateo-mail-tests-20261012-ultra/be01tools-2eb395c9-23bd-4994-86c5-85fb6e51e3e9.E9ICRf. SSH exit=0, test_exit=0, cleanup_failed=0. Six synthetic groups and syntax PASS. Expected negative-test jq/readability errors in checks.log are deliberate rejection assertions, not run failures. No first failure in this run.

Fresh independent inventories (independent-* files in that evidence directory) confirmed no synthetic task containers/volumes/networks by names and ownership labels, no task-labelled images and no task Buildx registration. Exact synthetic builder, cache and image sha256:5ae38d001eb32ee12f4081e5a1ad3720caae962ece07257cc63a28a26141ef0a were removed by the existing lifecycle. Shared images retained. Fresh exact-ID inspection confirms the old uncertain tool remains exited with exit code 0; no recovery attempted.

Host available space: before 272899129344 bytes; immediately after 272898875392 bytes (253952-byte decrease); independent later observation 272915591168 bytes. This is a shared host, so no attributable reclaimed-byte claim is made. No global prune, persistent deletion, local Docker, host tests or app lifecycle execution.

## Concrete recovery script for separate parent inspection

File: docs/evidence/scripts/be-01-r1-hostname-recovery.sh
SHA256: 55319c8579f12fd5ac5f5f9a6e8a075637ba04bba63f7ee8a66990c284a04188

This is separate from the frozen eight-file package and has NOT been uploaded or executed. It requires RECOVERY_APPROVED=hostname-retained-tool, authenticates the reviewed inspector, preserves historical .spec/.id/.pin, verifies the saved diagnostic snapshot and two fresh inspections against the same old fingerprint, requires exited state, and removes only the immutable ID without force or volume flags. All daemon calls are bounded and use explicit default context; overall deadline is 90 seconds plus 5-second kill grace. It then records exact identity/task inventory and host space. Any uncertainty fails closed. Parent must review before staging/execution. No app run is authorized by this script.

Proposed post-review invocation only: RECOVERY_APPROVED=hostname-retained-tool bash be-01-r1-hostname-recovery.sh. Authenticate the script hash independently before invocation. App dispatch remains separately gated on recovery review and completion. Synthetic PASS proves the fixture/lifecycle regression only; actual Docker shared-network acceptance remains pending.

## Exact recovery executed; app rerun dispatched

Parent approved this exact recovery script after inspection. Authenticated script SHA256 55319c8579f12fd5ac5f5f9a6e8a075637ba04bba63f7ee8a66990c284a04188; SSH exit 0, recovery_exit=0. Evidence: /home/tanzeel/elevateo-mail-tests-20261012-ultra/be01r1-2fb0fbfc-ab83-4249-a11a-d2a9192b93da.OXM4uc/recovery.g2GPut. Exact old ID 9c90bd737e4917e53445e983207f9b340b286308535056d651b36b78a6fef6e1 removed without force or volumes after historical and two fresh pin/profile checks. Post-removal exact ID/name and task-label inventories empty. Shared image retained. Original failed run status remains unchanged.

Parent conditionally authorized app execution after recovery. Authenticated dispatch wrapper be01-hostname-app-run.sh SHA256 5d90cdee52bd8f4a27795c1764245cb1a6f10dc6205727290b96160cea621674 rechecks synthetic independent inventories and current app manifest, then uses the existing reviewed app lifecycle and immutable BuildKit digest. Dispatched; result pending. Root logs: hostname-app-dispatch.log and hostname-app-console.log. No frozen execution bytes changed, no broader cleanup or ultrareviews.

## Final actual Compose result and PowerShell prerequisite checkpoint

Actual app run finished SSH exit 0; parent and child both `test_exit=0 cleanup_failed=0`. No first failure. App build and baked source verification passed. Actual api, worker, auth, mailpit, storage and rest namespaces each passed local connectivity and external no-route denial; missing/stopped-target negative controls and restored-worker connectivity/denial passed.

Evidence root: `/home/tanzeel/elevateo-mail-tests-20261012-ultra/`.
- Parent: `be01app-11aefacf-f5d7-40af-9bd7-711d97429044.aHk1UD`, including `lane-c.log`, `identities`, `final-*` and task-labelled inventories.
- Child: `be01r1-2b13e3b0-9a83-4804-a313-473cc151fe14.wJSJkA`, including `egress.log`, `egress-restored.log` and resource identities.
- Dispatch/console: `hostname-app-dispatch.log`, `hostname-app-console.log`.

Independent inventory rerun exited 0. Exact app image `sha256:c221f465a6ec32b13fca71e7f07dfe2d0ccd4999e782bb4657f15dbae6f6191b` and builder container `1774b04de6377248bac81a2ede65f6e63e4b9398d39d809174176d8b47724624` are absent. Parent builder registry/cache, task-labelled images, child resource IDs, parent/child named and labelled containers/volumes/networks are absent. Old recovered tool full ID recorded above is absent. Lifecycle removed nine service containers, three listeners, transient tools, task networks and owned build resources. Shared resources/images, canonical source and evidence retained; no prune or persistent deletion.

Resource delta: zero remaining parent/child task resources after cleanup. Available host bytes before synthetic staging 272899129344; final fresh observation 272888016896 (net decrease 11112448 bytes across this shared-host observation interval). Earlier post-app observation was 272921427968. These are host-wide observations, not attributed task storage reclamation; no reclaimed-byte claim.

PowerShell prerequisite inspection: `powershell-prerequisite-images` in parent evidence records image repository/tag/ID inventory. No reviewed Ruby+PowerShell image digest is supplied by the acceptance plan or identifiable as a staged PowerShell tools image. This does not assert that unrelated image filesystems lack pwsh. No unrelated images were executed. The earlier inline image-filter command had SSH quoting errors; corrected LF-file read-only prerequisite inspection exited 0. Host confirmed `Ubuntu-noble-latest-amd64-base`, Linux.

Lane P remains NOT RUN pending its reviewed immutable image prerequisite; harness `ops/tests/fleet02_powershell_protocol.sh` stays frozen. Its expected oracle is 9 tests / 48 assertions / zero failures, errors and skips. Linux pwsh protocol evidence would not prove native Windows or real PowerShell Docker orchestration. Lane P2 adapter remains proposed. Requested missing image pin from parent; no silently substituted runtime, host tests or image build was performed.

Fleet reservation explicitly released after fresh verified cleanup. Reacquire exclusive ownership before any subsequent execution. No frozen execution file changed, no commit/push or ultrareview. Lane C alone does not complete BE01. Earlier dispatched/running, unrecovered and authorization-pending text above is historical and superseded by these executed results.