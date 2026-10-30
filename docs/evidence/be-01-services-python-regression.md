# BE01 staging Python regression packet — review only

No execution authorization or backend fleet reservation. FE release is confirmed (e78cd0cc); PERF holds Docker pending coordinator reservation. No host tests, Docker, fleet commands, paid calls or ultrareviews were run. Existing tools/fixture/adapter/canonical source bytes are unchanged. Full Auth/Storage/lifecycle remains pending.

## Review ledger and scope

Original staging review:169 unique LOC, one confirmed P2 umask defect,5.92 defects/KLOC; dedicated design overlaps with no additional defects. Parent independently confirmed cleanup-summary format matches the wrapper. Repair review:125 LOC, original chmod defect fixed statically, one P2 test-coverage defect,8/KLOC; no additional implementation defect. Final boundary91 and runner55 reviews passed at the table hashes:146 unique new LOC, zero new defects,0/KLOC; dedicated design146 overlapping LOC zero additional defects. The original P2 coverage finding is resolved statically. Preserve all review records; none is a runtime PASS. No tests have run.

The67-line stager and58-line mode regression stay at their reviewed hashes. New separate boundary regression91 LOC adds existing-target refusal, corrupt-archive refusal and exact-original discrimination. Review it with stager context (158 LOC); runner55 LOC is a separate orchestration slice. No claims of complete archive-adversarial coverage: allowlist/link/duplicate and dependency-specific negatives remain outside this narrow addition.

## Immutable Python prerequisite

Use the [Docker Official Python image](https://hub.docker.com/_/python), directly; no Buildx, image build, pip install, product dependency or Docker socket. Registry read-only retrieval at2026-10-11T23:52:56Z resolved `3.13-slim-bookworm` to version3.13.16-slim-bookworm. Execution uses the platform manifest digest, never the mutable tag:

`python@sha256:f040863673aea2570c3ff6a5c3fb4c673a016cbc5375005ad145915922b6b78a`

- Linux/amd64 manifest/config ID: `sha256:4143a73d5a9804c1bb2f93cc823a7c173dbc62964d4a5ccabcb1167229b0e2b9`.
- Multi-platform index: `sha256:a1165e272e578941b84abc79e4ab38a0305cd12803a5c4247979ac7655f4d641`.
- Official source revision: `d2a898cb88e46203577eabc62cdcf6e92aaee176`, directory3.13/slim-bookworm.
- Raw registry evidence: `be01-python-registry/index.json`, `amd64.json`, `provenance.json`. Raw index and platform JSON file hashes equal their respective registry digests. Initial local response decoding failed to select a platform; corrected byte decoding and fresh GETs produced these evidence files. No Docker/runtime evidence was produced.

Parent prerequisite after review/reservation: acquire this exact amd64 image if absent and independently verify config ID/architecture. The runner uses `--pull never` and fails closed if missing/mismatched. Preserve a preexisting/shared image; remove an image acquired solely for this task after its checks and verified container cleanup, using the exact reference without force as detailed below. No build/cache/volume/network creation is needed.

## Frozen execution inputs

All paths under `docs/evidence/scripts/`; files are LF without BOM.

| File | LOC | SHA256 |
|---|---:|---|
| be01-services-stage.py |67|`3bcafad3d1246a4cb6abe152445d38c2f4318f6e33e33bd901670feebf822ed9`|
| be01-services-stage-regression.py |58|`f67fa995bdea5e3568839cb26bb3b8be3cbef01cb638930be40e5f0c2b80bb0f`|
| be01-services-stage-boundary.py |91|`4bf9d60282682bb3db2d49cc81bc6e0f598aabc5eadb391743867daf1f8a3801`|
| be01-services-python.sha256 |3|`0782b6e2ac3e2403ce5e094958d64fe92d821a299358a03893401d6cb1a24a5e`|
| be01-services-python-run.sh |55|`fca2ab6be20293682fa9fdbe68c91fbd71be71f5e6a3f0d2ec33ecb01eedfafb`|

Local five-file archive: `C:/Users/Tanzeel/AppData/Local/Temp/be01-services-python-review.tar`, SHA256 `f996df2705260762fdeb8afdc2af3bb240be639f60dbc1f04c7776d06938a06a`. Archive packaging and byte hashing only were performed locally, not tests. Parent must authenticate archive and exact five regular basenames (no links, traversal, duplicate or extra members), extract only into a fresh disposable review directory, and independently verify all five table hashes before launch. Never extract over canonical52 or any frozen tools source. Runtime mounts only three exact Python files read-only, not the staging archive or canonical checkout.

## Oracles and limitations

Expected successful outer results: mode suite1 test OK and boundary suite3 tests OK; no skips/errors. Nested original-code subprocess must exit1 with exactly one failed test and `AssertionError: 493 != 448` (0755 versus0700). That expected nested failure is required evidence of discrimination, not a failed repaired suite. The test reconstructs original bytes by removing exactly the two repair lines and verifies original SHA256 `d3da6ca50e541fe23c741cf75c4deafde035411bcef15b0f905a660e9b60a52f` before running the unchanged mode regression against it in disposable/tmp. No original source is overwritten.

Existing-target case supplies an existing checks.sh with sentinel contents, expects FileExistsError and compares complete before/after directory/file modes and bytes. Corruption case alters a previously authenticated archive, expects the precise outer-hash rejection, confirms destination absent and compares all existing source contents/modes. The mode suite checks0755 target,0644 payloads,0700 evidence and unchanged umask077. These run as UID10001 but create files as that same UID: **they do not prove alternate-user traversal/readability of host-staged sources**. Existing real tools UID10001 readability preflight remains mandatory.

## Proposed invocation after review and coordinator lease

Preconditions: strict short hostname `Ubuntu-noble-latest-amd64-base`; default context points to local unix socket; no DOCKER_HOST/TLS overrides; pinned image present; Bash/coreutils/jq/Docker available. Exact authenticated REVIEW directory and three files must be readable by UID10001. Evidence root already exists. Preserve private evidence directories; no recursive chmod of shared source. The runner bounds each inventory call20s+3s grace, workload90s+5s grace, caps0.5CPU/256MiB/swap256MiB/pids64, uses nonroot/read-only/network-none/cap-drop/NNP and32MiB noexec/tmp. The original discrimination subprocess has its own15s timeout.

Proposed remote command (not executed; replace REVIEWED_PYTHON_DIR with independently authenticated absolute path):

```sh
env BE01_LEASE=services-python-regression \
  REVIEW=REVIEWED_PYTHON_DIR \
  EVIDENCE=/home/tanzeel/elevateo-mail-tests-20261012-ultra \
  timeout -k 5s 300s bash REVIEWED_PYTHON_DIR/be01-services-python-run.sh
```

Capture SSH directly to a local log without a pipeline; immediately save `$LASTEXITCODE` as transport status. A disconnect/timeout never establishes acceptance. `BE01_LEASE` is a guard string, not a grant of reservation. No command is authorized by this packet alone.

Runner evidence: private `be01stagepy-UUID.*` directory with checks.log, manifest/source checks, daemon endpoint, before/after exact name and nonce-label container inventory, pinned Python-image IDs, actual `df -B1` and status (`test_exit`, `cleanup_failed`, `inventory_exit`, `source_exit`). Independently repeat exact name/label inventory after completion and inspect actual space bytes. The runner creates no images/builders/caches/volumes or networks; the prerequisite acquisition may download the exact Python image. Only `--rm` removes the disposable test container normally. If timeout, missing summary, inventory error or residual container occurs, preserve it and its mounts/ownership evidence; no force removal or automatic retry is included. Review an exact recovery separately. Status must be all-zero and independent inventories empty before acceptance/release. Full service lifecycle is not invoked.

## Parent prerequisite acquisition and exact image cleanup

These are proposed parent actions after explicit reservation, not performed preparation. Save every command's true exit and stdout/stderr in a separate private acquisition evidence directory. Use `docker --context default` on every daemon call, ordinary calls wrapped in `timeout -k 3s 20s`. Record endpoint/hostname, `df -B1`, `docker image ls -a --no-trunc --digests --format '{{json .}}'`, and `docker ps -a --no-trunc --format '{{json .}}'` before acquisition. Both inventories must succeed; failed inspect alone does not prove absence. Record whether the exact config ID already exists under any reference, plus whether the pinned reference resolves. If either already exists, classify the base as preexisting and preserve it. Coordinate with other owners before classifying any image as task-owned.

If the immutable reference is missing and coordinator approves the prerequisite download, capture this bounded acquisition command and its exit (no pipeline masking):

```sh
timeout -k 5s 300s docker --context default pull --platform linux/amd64 \
  python@sha256:f040863673aea2570c3ff6a5c3fb4c673a016cbc5375005ad145915922b6b78a
```

Independently inspect the resulting reference: require `.Id` exactly `sha256:4143a73d5a9804c1bb2f93cc823a7c173dbc62964d4a5ccabcb1167229b0e2b9`, `.Os=linux`, `.Architecture=amd64`, and matching RepoDigest. Save full inspect and fresh image/container inventories plus free bytes. New complete image is task-owned only if successful before-inventory proved that ID absent and no concurrent owner/shared use exists. Existing layers do not confer ownership of unrelated images and must never be pruned. If pull times out or fails, retain uncertain partial/complete resources and reconcile fresh inventories before any retry or removal; no broad cleanup.

After the regression runner exits, independently confirm its exact task name and nonce-label containers absent using successful fresh queries. Read the full test/status evidence. Timeout/missing status remains uncertain, including when later container inventory is empty; do not infer test success or retry. Before any image removal, inspect the exact reference/ID again, enumerate all stopped/running containers using that image (`ps -a --no-trunc --filter ancestor=sha256:4143a73d5a9804c1bb2f93cc823a7c173dbc62964d4a5ccabcb1167229b0e2b9`), and save full image inventories/RepoTags/RepoDigests. Require no container references, no unrelated tags/digests or owner claims, unchanged immutable identity, and acquisition evidence proving sole task ownership. Uncertainty or newly shared use means retain and report the precise reason; never remove a preexisting/shared image.

Only when those ownership conditions hold, remove the single downloaded reference, without `--force`:

```sh
timeout -k 3s 20s docker --context default image rm \
  python@sha256:f040863673aea2570c3ff6a5c3fb4c673a016cbc5375005ad145915922b6b78a
```

Record image-removal exit separately from runner `cleanup_failed` (the runner only checks its container and preserves its input image). Independently repeat full image and exact-container inventories afterward: verify task-owned config ID/reference absent, or report exact retained references; retain all unrelated bases/layers. Capture `df -B1` after image cleanup and report raw available-byte difference, not inferred reclaimed storage. No builder/cache/volume cleanup or prune is part of this lane. Acquisition timeout, ambiguous sharing, removal failure, or inability to inspect remains an explicit retained-resource/status item before coordinator release. A verified failing test still requires this same exact-owned cleanup when safe; failure does not authorize broader deletion.
