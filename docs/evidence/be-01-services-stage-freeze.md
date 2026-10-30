Latest static review and runtime prerequisites are finalized in [Python regression packet](be-01-services-python-regression.md). Original staging169 LOC/one P2/5.92 per KLOC; repair125 LOC/one coverage P2/8 per KLOC; final boundary+runner146 unique new LOC/zero new defects/0 per KLOC, design146 overlaps. Both findings resolved statically. Historical pending-review statements below are superseded; runtime and actual UID readability remain pending. No BE reservation or execution authorization. Existing staging scripts remain frozen.

# Services tools: staging and independent inventory review packet

Prepared only. FE explicit release confirmed by parent (terminal message e78cd0cc); PERF holds Docker pending coordinator reservation. No BE reservation or execution authorization exists. No remote commands or tests executed. Parent staging reviews are still finishing; the permission repair and new regression require review before execution. No paid calls or ultrareviews.

## Recorded tools review

Frozen tools package844af34c: A parent/preflight/runner119 LOC zero defects; B Dockerfile/checks plus existing boundary102 LOC zero; dedicated design157 overlapping zero. Unique implementation plus boundary221 LOC, zero defects,0/KLOC; new implementation157 LOC. Parent directly inspected cleanup_tools/snapshot/owned_run/verify_builder wiring and found no variable mismatch. Inherited dependencies are not newly runtime proven. These results do not cover the new staging scripts below. Adapter3044a0e2, fixture028c90c2 and canonical52 remain unchanged.

## New review files

| Path under docs/evidence/scripts | LOC | SHA256 |
|---|---:|---|
| be01-services-stage.py |67|`3bcafad3d1246a4cb6abe152445d38c2f4318f6e33e33bd901670feebf822ed9`|
| be01-services-inventory.sh |41|`6ca249554afacb3dde83cd473f8907994fb852b20e5bd3a4d2a5603bd402f03a`|
| be01-services-stage-run.sh |63|`e80ca8217abc5c41e4f1d1b0566e42c9716869cce0f9a8929ba29866448a88d5`|

171 orchestration LOC plus58 regression LOC, review pending. One confirmed P2: caller umask077 made the intended0755 target0700, preventing UID10001 traversal. Repair adds chmod0755 only after successful exclusive target creation; evidence directories and ancestors are unchanged. Split review into stager+regression125 LOC and wrapper+inventory104 LOC; do not count overlapping design coverage twice. Final original review coverage/density awaits parent completion. The Python stdlib orchestrates archive authentication/copy only, not host tests; Python3 is an explicit host prerequisite. Bash/jq/coreutils/Docker/Buildx are existing orchestration prerequisites. No dependency installation is included.

Archive remains `C:/Users/Tanzeel/AppData/Local/Temp/be01-services-tools-review.tar`, SHA `ab611aff1b4d5ff029d25a0b62dff12e81a5f004ba12438fb38ddf1ea5deac1d`. Manifest remains `844af34c43800bb45fe65fb23299e1c7a36083b923c60d735d1cc2883ec07e0f`. Archive allows exactly six regular files under ops/tools/be01-services-tools, no duplicates, symlinks/hardlinks, directories, traversal or extra entries. Authentication reads the same in-memory bytes it parses, checks outer hash then manifest then all package/dependency payloads before canonical mutation. It never calls tar extract. Existing target directory rejects the operation; interrupted partial staging is preserved for inspection, never silently overwritten or deleted. Canonical source hash checks run before/after additive staging and after runtime.

## Proposed transport and invocation, not authorization

After review and lease, transfer the unchanged tools archive and these three scripts into a fresh private staging directory under `/home/tanzeel/elevateo-mail-tests-20261012-ultra`. Independently verify all four hashes remotely before invocation; set directory755 and script/file644 so actual UID readability is possible. The canonical destination is `/home/tanzeel/elevateo-mail-tests-20261012-ultra/lane-c-20261012`. Do not stage scripts over existing frozen files. The orchestrator verifies its two sibling pins; separately verify its own hash before launching. Capture the actual SSH exit locally, without a pipeline that masks status, for example in PowerShell (replace `REVIEWED_STAGE` with the exact freshly authenticated directory):

```powershell
$remoteCommand = 'env BE01_LEASE=services-socket-free ARCHIVE=REVIEWED_STAGE/be01-services-tools-review.tar TOOLS_SOURCE=/home/tanzeel/elevateo-mail-tests-20261012-ultra/lane-c-20261012 TOOLS_CONTEXT=default TOOLS_EVIDENCE=/home/tanzeel/elevateo-mail-tests-20261012-ultra bash REVIEWED_STAGE/be01-services-stage-run.sh'
& ssh fleet-02 $remoteCommand > "$env:TEMP/be01-services-stage-console.log" 2>&1
$sshExit = $LASTEXITCODE
[IO.File]::WriteAllText("$env:TEMP/be01-services-stage-ssh-exit.txt", "$sshExit`n")
```

Only set BE01_LEASE after coordinator grants the lease; the string itself is not proof of authority. Shell assertions enforce short hostname and explicit local daemon endpoint. The script calls the reviewed bounded parent without an output pipeline and preserves parent_exit. It separately parses exactly one cleanup summary for test_exit/cleanup_failed. Missing/duplicate summary produces unknown status and fresh incomplete inventory, never PASS. Its exact incomplete_inventory_exit is explicitly recorded in status even when inspection fails; no swallowed inventory failure. SSH loss remains transport failure even if a later remote result exists; independently reconcile evidence before any retry.

Independent inventory records exact task label resources across containers/volumes/networks/images, exact known container/cache/image-tag/builder names and recorded immutable builder/image IDs when available. Shared pinned Ruby/BuildKit IDs must match before/after. All daemon inspection calls bound20s+3s kill grace. `df -B1` is recorded before and after on canonical source and evidence filesystems; report raw available-byte delta, not a claim that concurrent space changes were reclaimed by this task. No inventory function mutates Docker or removes resources.

Evidence directory `be01services-stage.*` holds archive stage.log, context.json, manifest/source checks, before/after inventories, shared IDs, space bytes, full console.log and status. Child evidence remains `be01serviceschecks-UUID.*` with build/readability/checks/cleanup records. Any timeout, missing summary, changed base, inventory failure or retained exact resource prevents acceptance/release; inspect and preserve uncertainty, no automatic retry or recovery. A preflight failure before parent invocation is not a test failure. No full Auth/Storage/lifecycle launch is included; that remains next only after socket-free success and separate review/lease authorization.

## Caller umask077 repair (pending review/runtime)

New Docker-only regression `docs/evidence/scripts/be01-services-stage-regression.py` is58 LOC, SHA256 `f67fa995bdea5e3568839cb26bb3b8be3cbef01cb638930be40e5f0c2b80bb0f`. It executes the real stager against a synthetic authenticated six-file archive under umask077. Oracle: target0755, all six files0644 with exact payloads, sibling evidence0700, caller umask unchanged. The original implementation produces0700 and fails the target-mode assertion. No execution or discrimination result is claimed. Hash constants are replaced only in the test module to authenticate synthetic fixtures, not in production staging.

After review/reservation, run this regression only inside an independently pinned Python3 Docker environment with both Python files bound read-only, no socket/network, nonroot UID10001, readonly root, cap-drop/NNP,0.5CPU256MiB, writable disposable/tmp. Python is not provided by the frozen Ruby tools image: exact Python image prerequisite and invocation still require a separate reviewed packet; do not install it into frozen tools or run the regression on the host. Proposed in-container command: `python3 -B /review/be01-services-stage-regression.py`. This verifies POSIX mode semantics, not actual alternate-UID traversal; the existing tools lifecycle UID readability preflight remains required.

Frozen tools archive/package, fixtures, adapter and canonical52 remain unchanged. Staging script pin was updated in the wrapper; inventory script remains unchanged. All review/runtime acceptance is pending. Full Auth/Storage/lifecycle remains pending. No remote mutation, tests, paid calls or ultrareviews.