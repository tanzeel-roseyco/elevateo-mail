Latest checkpoint: BE-STAGE-20261012-01 seven-member source staging PASS once; native SSH/process/staging/source/inventory/retention/independent reconciliation/status-read all0. Exact seven hashes/files0644/module0755 and canonical52 verified. Four volumes/app/shared bases/builders and retained Python preserved; no Docker mutation/tests. Raw shared-host delta +32190464 bytes, not attributable reclamation. Execution stopped; staging slot relinquished for coordinator acceptance, no next allocation claimed. Prior fixture five-test PASS/cleanup1/UNKNOWN historical ID remains unchanged. See docs/evidence/be-01-services-transport-stage-result.md. Earlier checkpoints below are historical.
# Seven-member source staging: next invocation for coordinator acceptance

Preparation only. Allocation752a6c0f is CLOSED with accepted partial cleanup; no active lease. Request a fresh exclusive staging-only20-minute slot plus independent reconciliation. FE reports no conflict; PERF has no allocation, but both must be freshly coordinated before consumption. No Docker allocation, pulls, builds, tests, recovery, service starts or removal in this step.

Reviewed execution bytes remain unchanged:

| Input | SHA256 |
|---|---|
| docs/evidence/scripts/be01-transport-stage.sh (103 LOC) |d6bbc4c0106b7550feabe1afee5eaa629910b7ac2477d5d83d864b0765d9ac80|
| docs/evidence/scripts/be01-transport-stage.py (97 LOC) |d5f9a669c2a413ed5b03faf39f9fde5baaeac95073792a407be305c2b44eb222|
| C:/Users/Tanzeel/AppData/Local/Temp/be01-transport-check-8a9613df.tar |0dde1cfc01484f32020e6c4f5ee8b91f76b614075c1bb1bb7abd323fdc336c54|
| Payload ops/tools/be01-transport-check/package.sha256 |8a9613df9d49c86a4f05748a75365a51b0cac7d60e406d30efb2598103fb40a7|

Wrapper103/stager97 static reviews PASS0; fixture153/checks16 static169 PASS0 and Docker five-test PASS are separate evidence. No fresh reviews or runtime claims are added here. Detailed accepted guards/limits remain in be-01-services-transport-stage-freeze.md. Exclusive filesystem lease is required; guard is not internally race-proof.

## Fresh prerequisite and historical baseline gate

Before target writes, collect successful bounded read-only evidence: expected short hostname Ubuntu-noble-latest-amd64-base; default context unix:///var/run/docker.sock; no DOCKER_HOST/TLS override; at least10GiB disk and4GiB MemAvailable; successful full container/volume/image/builder inventories; no conflicting task lease or running be01/fe01/perf tasks and no be01serviceschecks collisions. Shared unrelated workloads are allowed. Use individual10s+3s Docker read bounds and an overall bounded preflight; missing evidence stops advancement.

Authenticate canonical52 manifest03d590ddaa39b22c6b1851c9911405473c0b01b0a50fff08001144e66a14638b and its52 entries. Before staging, authenticate the archive/package and all five inherited dependencies using their exact entries in the frozen payload manifest: services-tools Dockerfile/checks, lane-c-synthetic cleanup, fleet02 resources helper and canonical source manifest. Do not repin missing/mismatched files. The stager repeats these checks before target creation. No not-yet-staged capability manifest is required.

All three exclusive destinations must be absent INCLUDING dangling links below canonical root `/home/tanzeel/elevateo-mail-tests-20261012-ultra/lane-c-20261012`:

- ops/tools/be01-transport-check (whole directory)
- docs/evidence/scripts/be01-capability-volume-transport.sh
- docs/evidence/scripts/be01-capability-volume-transport-regression.sh

Seven regular archive members are the latter two scripts and module parent-run.sh/checks.sh/run-container.sh/dependency-regression.sh/package.sha256. Authenticate outer archive BEFORE parsing. Frozen stager rejects duplicates, links, traversal and unexpected paths. Existing parent directories must be safe; never chmod ancestors or overwrite targets.

For retained resources, compare fresh stable fields against accepted6bc117b9 preflight/reconciliation, with historical provenance d473c069 preserved. Exact volumes: be01services-6f1401a6-071b-475a-8c27-1a3de66edc4b-{config,data,state,storage}; app ID sha256:7d755994b0456f71886c92ec548e55b64f58d0c8a579c14cde401f23b715b0f8. Preserve Ruby22165c5f and BuildKitcec9f139 exact digest references from the frozen wrapper. Also independently verify/preserve newly retained Python ID/digest sha256:f040863673aea2570c3ff6a5c3fb4c673a016cbc5375005ad145915922b6b78a using the existing reviewed identity verifier9e4575e8 and authenticated raw manifest. Python is NOT required for host staging and is NOT authorized for removal. Keep its historical container ID UNKNOWN; fresh successful inventories must show prior fixture task name/label absent.

Compare volume Name/Driver/Labels/Options/Scope/Mountpoint/CreatedAt, exact image IDs/sorted RepoDigests/labels, and existing builders' names/drivers/node endpoints. Full shared image lists are evidence, not equality gates. The frozen wrapper covers volumes/app/Ruby/BuildKit/builders; additional external baseline/read-only reconciliation covers retained Python. Do not silently amend frozen wrapper.

## Exact reviewed invocation after allocation and successful prerequisite gate

Create a fresh private0700 delivery (outside canonical source), upload only the two frozen staging scripts and archive, authenticate transfer. AUDIT must be a fresh absent absolute `.../be01-transport-stage-UUID` path, not the delivery. Save these commands as LF transport content, authenticate its bytes separately before invocation; use fixed SSH paths and stdin /dev/null, with native SSH exit captured directly. These are the existing reviewed commands, not a new runner.

```bash
set -euo pipefail
exec </dev/null
umask 077
: "${DELIVERY:?fresh authenticated delivery}" "${AUDIT:?fresh absent audit}"
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

Use BatchMode=yes, ConnectTimeout10, ServerAliveInterval15/CountMax3. SCP exit, native SSH exit and remote process/staging/source/inventory statuses remain separate. Capture actual raw df-B1 before/after. No retry on partial/unknown result. Target directory0755 and seven files0644 only; manifest last. Canonical52 unchanged. The payload transport parent is NOT invoked.

## Independent reconciliation and release

After definite termination, reauthenticate both staging scripts, then invoke the existing read-only reconciliation command from the freeze packet once: `timeout -k 30s 240s bash "$DELIVERY/be01-transport-stage.sh" reconcile "$AUDIT"`. Capture its direct exit under set+e then restore set-e BEFORE writing status. Independently recheck seven hashes/modes, nested manifest11 entries, canonical52 and all retained identities including Python; successful full inventories must prove no new task Docker allocation and preserve shared resources. Read every component status; process0 alone is insufficient. Missing status is UNKNOWN. Report raw shared-host delta without attributing reclamation.

If before snapshot is incomplete or targets partial, preserve them and reconcile read-only against the external accepted baseline. No cleanup/overwrite retry is authorized. Close staging slot only after coordinator receives reconciliation; subsequent transport Docker validation and actual volume recovery require separate scope/allocation. Real Auth/private Storage/restart remain pending.
