# Volume transport correction — frozen for bounded review

Reservation0d0ee0ad-381d-4f53-8043-c5bb767b2324 RELEASED following root independent SSH0 reconciliation. Recovery NOT_STARTED. No retry/allocation; all four volumes/app image retained.

New `docs/evidence/scripts/be01-capability-volume-transport.sh`:41 LOC, LF-only, SHA25644bbb5de36b813a5f68b68d894fc50e2ec400fe1271e9143aad5ceccec93b1a7.

Exact delta: replaces inline SSH regex with uploaded authenticated LF script. Fresh bounded full container-ID inventory, jq exact membership of four historical IDs, shape/uniqueness validation. Failed inventory stops; successful empty inventory is valid. No grep pipeline or stdin wait. Global `exec </dev/null`, explicit child stdin redirection, deliberate child exit capture and set-e restored before status writes. Authenticates existing invoke.sh98d543f4ca570473a6f2e19bc0f1e8f300d810c510726a833faebc5a310597ee and invokes unchanged reviewed block once. Frozen recovery267LOC/profile/source52 unchanged.

Requires absent transport-r2 directory and absent recovery directory/console/status including dangling links. No cleanup logic. Fresh coordinator allocation and complete documented capacity/conflict/canonical/oracle/historical/provenance/consumer preflight remain mandatory; launcher does not replace them.

## Proposed transport — NOT authorized for execution

Upload to fresh absent/non-symlink `audit.DIGxywd8/volume-transport.sh`; capture SCP exit and stop on failure. Initialize fresh private local evidence directory first. Then use fixed command without nested regex quotation:

```powershell
$remote = 'cd /home/tanzeel/elevateo-mail-tests-20261012-ultra/be01-recovery-validation-audit.DIGxywd8 && echo 44bbb5de36b813a5f68b68d894fc50e2ec400fe1271e9143aad5ceccec93b1a7 volume-transport.sh | sha256sum -c - && timeout -k 45s 720s bash volume-transport.sh'
ssh -n -o BatchMode=yes -o ConnectTimeout=10 -o ServerAliveInterval=15 -o ServerAliveCountMax=3 fleet-02 $remote > $localEvidence/transport.log 2>&1
$sshExit = $LASTEXITCODE
[IO.File]::WriteAllText("$localEvidence/ssh.status", "ssh_exit=$sshExit`n")
```

Outer720+45s; launcher child690+40; unchanged block640+35; driver600+30; daemon15+3. On timeout/interruption, missing SSH/child statuses remain unknown. Independently reconcile exact probe IDs/names/labels, four volumes, unchanged app/shared images/builders/source and df before release. No retry/image removal/full-services launch.

## Review packet

One41LOC correctness slice and overlapping dedicated design slice, both pending: stdin/Windows transport boundary, exact historical IDs, failed/malformed inventory, collisions/symlinks, pin failure, exit/status-write propagation, deadlines and frozen-child coupling. No agents launched or static PASS claimed. Docker-only regression cases still to validate: successful absent/empty IDs, any historical ID present, malformed inventory/daemon failure, wrong invoke hash, child nonzero and EOF stdin. No host/Docker tests executed. Real recovery and Auth/private Storage/restart remain pending.

## Transport-specific regression supplement

Frozen launcher41LOC remains44bbb5de36b813a5f68b68d894fc50e2ec400fe1271e9143aad5ceccec93b1a7; no byte change during review. New separate regression70LOC `docs/evidence/scripts/be01-capability-volume-transport-regression.sh`, SHA256f04981e96117e854327d9d6744ad5e5fe3d95068fc03a6d4f2d8398f3d99e43f. NOT_RUN, pending bounded review.

Runs actual frozen launcher after exactly one AUDIT-path substitution into disposable container tmp. Mocks hostname/Docker/invoke-file authentication; real Bash/jq/timeout handle control flow. Cases: absent IDs/EOF stdin, historical ID present prevents child, daemon37 propagates without child, child23 propagates with saved status, and old unquoted-alternation shell command fails127. Does not prove actual Windows argument forwarding or real daemon/pin behavior; unchanged script authentication and later real SSH remain required.

Reuse the existing reviewed services-volume-check/tools lifecycle (parent f2499630, tools build/runtime/cleanup) through a small separately pinned checks adaptation; do not alter those historical files. Required image contains Bash/coreutils/jq; plain Ruby base is insufficient. Existing tools images were cleaned, so a new lease would need the reviewed capped tools build and exact cleanup, not a silent prerequisite assumption. No generic acquisition framework is proposed. Runtime checks body after authenticated readability and manifest verification:

```bash
bash -n /src/docs/evidence/scripts/be01-capability-volume-transport.sh
bash -n /src/docs/evidence/scripts/be01-capability-volume-transport-regression.sh
bash /src/docs/evidence/scripts/be01-capability-volume-transport-regression.sh /src/docs/evidence/scripts/be01-capability-volume-transport.sh
```

Use existing socket-free UID10001/network-none/read-only/sourceRO/capped profile, with executable tmpfs because the regression launches mock executables. Bound parent/test and independently reconcile exact container/image/cache/builder IDs and shared retained resources. A concrete independently pinned parent/checks adaptation still needs freeze/review before execution; no recovery run can precede regression PASS. Current packet supplies exact regression source and test commands, not an allocated runnable lifecycle.
## Current transport review and Docker wiring freeze

Supersedes pending-review wording above: parent reports correctness and dedicated design review of transport41 LOC SHA44bbb5de completed with zero defects, unique41 LOC/0 per KLOC; design overlaps. Regression70 LOC f04981e9 correctness found one LOW pipefail/SIGPIPE defect, 14.29/KLOC; dedicated design independently found the same LOW, overlapping and counted once. Repaired regression71 LOC SHA bab36a6ae50b7c9ce9665c051e88141206e302cf9205ef968667e224e6f962fc writes input before invocation and redirects it into timeout, so the captured status is directly timeout/transport. No pipeline remains at that boundary. Coordinator independently verified bab36a6a; correctness re-review71 unique LOC zero remaining defects,0/KLOC, prior SIGPIPE closed statically. Docker runtime pending; original shell discrimination does not prove Windows SSH.

Concrete new additive module: ops/tools/be01-transport-check. Parent88 LOC copies the reviewed volume-check parent with only package/checks/runtime paths and external package variable changed. Runtime24 LOC copies reviewed run-container with explicitly inspected exec tmpfs for mock commands. Checks18 LOC authenticate nested dependencies, syntax-check scripts and run only the transport regression. New wiring130 executable LOC; regression71 separate review slice. All historical files and41LOC transport remain unchanged.

| File | LOC | SHA256 |
|---|---:|---|
| parent-run.sh |88|5e6d47097c0fe50b8515ccff418d98a6b799270d575cfe18a261d12815bf6e1a|
| checks.sh |18|bd96889f5464eafcd7d69f1f317de0c4f3315faa3f853df524ce1cc0420680c7|
| run-container.sh |24|5baa05479c1f2a60e7a94ac33aab333ade38d832a78dda086e0cc97d3ffff6d1|
| package.sha256 |15 entries|52a8c974a6fa2250b16ded714f66b568cd0963e8289e8553c851b712ec2e2381|

Proposed command ONLY after bounded review, authenticated additive staging, fresh host/context/capacity/conflict/pinned-base/source checks and coordinator lease:

```bash
TOOLS_SOURCE=/home/tanzeel/elevateo-mail-tests-20261012-ultra/lane-c-20261012 \
TOOLS_CONTEXT=default TOOLS_HOST=Ubuntu-noble-latest-amd64-base \
TOOLS_EVIDENCE="$AUDIT" \
TRANSPORT_CHECK_PACKAGE_SHA=52a8c974a6fa2250b16ded714f66b568cd0963e8289e8553c851b712ec2e2381 \
timeout -k 180s 1200s bash /home/tanzeel/elevateo-mail-tests-20261012-ultra/lane-c-20261012/ops/tools/be01-transport-check/parent-run.sh </dev/null
```

AUDIT must be a fresh private existing evidence directory. Capture process exit under set +e, restore set -e before writing parent.status. Existing build recipe installs tools and needs separately authorized build/network access; no execution or lease is implied. Existing immutable Ruby22165c5f and BuildKitcec9f139 bases must already be authenticated. Parent caps builder2CPU/2GiB and test0.5CPU/256MiB, UID10001, no network/socket, sourceRO. Parent performs actual UID readability before building. Scope includes tools build and exact task cleanup only, never recovery.

Independent reconciliation remains mandatory: successful full container/volume/image/buildx inventories; exact emitted task be01serviceschecks UUID, container IDs/names/labels, cache and registry absence; shared bases/builders and four retained volumes/app image unchanged; canonical52 and nested manifests; raw df-B1 delta. Missing status or deadline expiry means unknown until reconciliation, never retry. Do not infer cleanup from --rm. Reuse prior accepted exact-prefix services-check inventory for this unchanged task prefix; no new generic inventory framework.

Delivery contains six new regular files: four files under ops/tools/be01-transport-check plus the two transport scripts. Before staging authenticate outer archive and exact allowlist, refuse existing/dangling destinations, preserve canonical52 and existing packages, use new directory0755/files0644, and authenticate package after extraction. Staging execution is not authorized. Real recovery remains NOT_STARTED and reservation released.

Delivery frozen: C:/Users/Tanzeel/AppData/Local/Temp/be01-transport-check-52a8c974.tar SHA25685042689cfeb33cffbfb5142cab588429bfc210db529928c1960732050090df6. Static tar inventory contains exactly the six listed regular members; archived666 modes must be set0644 only on newly staged files. No extraction/execution performed. Proposed upload after approval: scp -o BatchMode=yes -o ConnectTimeout=10 this exact archive to a freshly allocated private delivery directory; capture SCP exit and authenticate SHA before parsing. Do not reuse a populated destination.

## Inherited evidence and next bounded staging plan

Wiring correctness review completed130 unique executable LOC, zero defects,0/KLOC; hashes matched. Dedicated design is pending. This does not constitute runtime acceptance or a reservation. FE standby/no conflict and PERF no lease are coordinator-reported observations requiring fresh confirmation.

| Frozen dependency | Accepted evidence and limit |
|---|---|
| cleanup_tools, owned_run, snapshot: ops/tools/lane-c-synthetic/cleanup.sh,095fb2a580620b724070a0dc3c0d5400e38a98fc347d034c97f3fe3e47dcc3ec | Direct wiring inspection recorded in be-01-services-stage-freeze.md; accepted tools runtime and independent exact cleanup in be-01-services-tools-result.md. Latest inherited parent runtime in be-01-services-volume-check-result.md also removed exact image/cache/builder/container with all statuses0. Fingerprint uncertainty still retains resources; prior success is not proof of every failure path. |
| verify_builder: docs/evidence/scripts/be-01-r1-fleet02-resources.sh,86681089c789e3b636f518508e8c6cf496d332f69bd69e5696bbc1dd4302aa4d | Same direct wiring review and two accepted capped BuildKit lifecycle runs. Exact ownership/mount/cap checks retained. This packet does not reuse its historical database cleanup. |
| tools Dockerfile cfb5ebe7a254355d7e6b15b4ba99fde488cca43b72f9dc75a4e9c6617e919917 and baked checks a59e5155bc9e54f171d331b3e995094ab5de216dd595b0da650572016531b77d | be-01-services-tools-freeze.md:221 unique implementation/boundary LOC review0, design157 overlaps. be-01-services-tools-result.md: three regressions and7/14/0 boundary PASS; volume-check-result corroborates jq-capable rebuild. Baked checks are authenticated build inputs; new mounted checks are executed. Debian snapshot20261010T000000Z/APT metadata authentication does not promise bit-identical output images. |

Exact accepted runtime references: tools be01serviceschecks-bda55109-5f08-4577-b578-778772a24653.Kn7zmp, independent be01-services-tools-audit-20261012-r1; volume be01serviceschecks-833c6d01-c15f-436f-a48b-1ea05de02248.n5ALO7, independent be01-volume-runtime-7de5d808-bd8c-4508-8e30-f910e8d1c28a. All under /home/tanzeel/elevateo-mail-tests-20261012-ultra. Both coordinator-accepted test/cleanup/source/inventory0 with exact task resources absent. Their raw shared-host deltas are not attributable reclamation.

### Preflight and staging scope

Request only after design disposition: fresh staging-only20-minute allocation plus reconciliation; subsequent tools check30-minute allocation plus reconciliation. Neither is granted. Bound each SSH connection (ConnectTimeout10, ServerAliveInterval15, ServerAliveCountMax3); uploaded authenticated LF administrative command under total300s preflight deadline, individual Docker reads10s+3s. Preserve each real exit and missing/timeout status as unknown. No global-empty-host condition.

1. Reconfirm coordinator lease and FE/PERF holds, hostname -s Ubuntu-noble-latest-amd64-base, default Unix socket, no Docker host/TLS overrides, resource capacity (record free RAM and df-B1; require at least4GiB available RAM and10GiB available disk as a conservative prerequisite for2GiB builder plus256MiB check), successful full inventories and no conflicting task activity. Preserve shared workloads/builders, four retained volumes and app image; record their exact identities before/after.
2. Authenticate existing immutable Ruby22165c5f and BuildKitcec9f139 references and inspect actual image identities; no automatic prerequisite pulls. Verify canonical52 manifest03d590dd and every inherited pin in package52a8c974 before staging. IMPORTANT prerequisite: package expects repaired capability adapter ad477380..., app e00f1937... and dependencies b1a60a99.... Prior capability execution packet still records eight-file staging as pending. Do not assume these repaired pins exist remotely. If absent/different, stop and report exact mismatch; six additive files cannot repair it. Separately reviewed capability staging requires explicit allocation; do not overwrite or repin to bypass it.
3. Require new ops/tools/be01-transport-check directory and both docs/evidence/scripts transport files absent, including dangling symlinks. Reject symlink ancestors; verify bind-root/visible directory traversal without changing host ancestor modes. New private delivery0700 only; authenticate archive85042689cfeb33cffbfb5142cab588429bfc210db529928c1960732050090df6 before parsing. Enforce exactly six regular allowlisted members from this packet, no duplicates/links/absolute or traversal paths. Extract into fresh delivery staging, never canonical root. Authenticate package52a8c974 independently, its five new members, and existing ten inherited entries before writes.
4. Install only new directory0755 and five execution files0644 plus package0644 last, using exclusive destination creation. Preserve all existing ancestors/source52/historical packages. Stop on any partial failure; retain evidence and never retry over targets. Independently authenticate all six destination hashes/modes, all nested manifests and canonical52; capture transport/staging/source/hash/mode/inventory exits separately and raw df-B1 delta. Close staging lease before requesting check allocation.
5. After separate check allocation and fresh preflight, invoke exact parent command above once. Record parent/SSH/test/cleanup/source and emitted IDs independently. Parent bounds1200+180s, builder2CPU/2GiB; test120s,0.5CPU/256MiB,UID10001,network-none/sourceRO/no socket, executable tmpfs. This is mocked transport proof only, not Windows SSH or recovery proof.
6. Immediately run accepted services-check inventory (SHA6ca249554afacb3dde83cd473f8907994fb852b20e5bd3a4d2a5603bd402f03a, prior tools-result) for unchanged be01serviceschecks UUID prefix. Also independently capture successful full inventories, verify actual emitted IDs/names/nonce labels/cache/registry/image absent and shared bases/builders/four retained volumes/app image unchanged. If identity/status missing or fingerprint uncertain, retain resources and reconcile read-only; no blind rerun or broad cleanup. Report actual df-B1 delta, release only after coordinator independent reconciliation. No volume recovery, image recovery or full services in this scope.

Current disposition supersedes pending-design/no-allocation text above: design201LOC PASS0; allocated attempt stopped before staging on inherited service/app pins. Follow-up read-only reconciliation0; lease relinquished, root acceptance requested. Frozen archive/package unchanged and NOT_RUN. Exact dependency-cycle correction proposal and evidence: be-01-services-transport-preflight-result.md. Do not invoke historical command until dependency correction is reviewed and new packet allocated.

Current replacement packet: be-01-services-transport-dependency-freeze.md, package8a9613df/archive0dde1cfc with seven regular members. Local dependency correction awaiting bounded review, NOT_RUN. Original52a8c974 command/archive retained only as historical evidence; no allocation remains.
