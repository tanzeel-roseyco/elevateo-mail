Latest runtime FAILED: child test_exit=1, cleanup_failed=1; parent test_exit=1, cleanup_failed=0. Compose batch create, app build and baked verification passed, but shared-network tool hostname drift broke post-start fingerprint verification. One stopped uncertain tool remains preserved. Narrow hostname normalization and Docker-only regression are frozen for parent review, NOT tested. See docs/evidence/be-01-r1-lane-c-hostname.md for exact evidence, eight execution-file hashes and 181 LOC review scope. Exclusive fleet-02 ownership remains here; no further validation/cleanup until review and no ultrareviews. Earlier checkpoints below are historical.

Latest Compose create checkpoint: parent bounded code review complete, 192 unique LOC, zero defects, 0/KLOC; dedicated design review complete, 166 overlapping LOC, zero defects, 0/KLOC. Do not add overlapping coverage to unique LOC. Frozen hashes match the repair packet. User has delegated exclusive fleet-02 validation to this author: authenticated nine-file staging, synthetic Docker lifecycle, then app lifecycle only on PASS. Runtime results remain pending; previous review-pending statements below are historical. No further ultrareviews authorized.

Current checkpoint: parent app run be01app-83de589a-f3d7-421f-9376-ac34aa465fb8.pGefaO built and passed baked verification; child be01r1-4527ddae-4799-451f-a956-3c5ad98dd24f.D6REHw failed Compose create on unsupported --no-deps. Both test_exit=1, cleanup_failed=0; parent reports exact app image/builder/cache removed. Registered whole-set batch creation and a Docker-only regression are frozen for parent review, not executed. See [Compose create repair packet](be-01-r1-lane-c-create.md) for nine changed execution files, exact hashes and parent commands. Canonical source manifest remains 03d590dd. Earlier active-run and synthetic results below are historical and do not validate this repair.

Latest parent checkpoint (2026-10-12): frozen 9-file repair uploaded and verified; hash-only orchestration comparison passed. Parent fleet-02 synthetic Docker run PASS: test_exit=0, cleanup_failed=0. Evidence: `/home/tanzeel/elevateo-mail-tests-20261012-ultra/be01tools-224ed9b8-dda2-4b0a-8d86-f8dd8159d443.Iq4dbB`. Independent exact task container inventory empty. Both bounded and design reviews complete: 173 unique LOC, zero defects, 0/KLOC (coverage is not doubled across reviews). Historical status, superseded by the failed runs above: actual full app runner was active; its result, actual Compose acceptance and final cleanup remain pending. Frozen source, scripts and manifests unchanged; this update records parent evidence only. Earlier pending-review/synthetic statements below are historical.

Current checkpoint: parent app build/baked source PASS, then Lane C failed on confirmed OomKillDisable false-to-null serialization. Parent recovered exact child/app resources; inventories empty, only default builder remains. Narrow normalization and regressions are frozen; parent jq/regression review 136 LOC, zero defects, 0/KLOC; helper/design review and Docker validation pending. Canonical source manifest 03d590dd remains unchanged. See [fingerprint repair packet](be-01-r1-lane-c-fingerprint.md) for the eight changed files and hashes. Earlier checkpoints below are historical.

# Lane C app build and lifecycle handoff

Parent independent and design reviews each covered 170 LOC with zero confirmed script defects (0/KLOC per review). Parent reports the clean LF-file Docker syntax/synthetic rerun passed with SSH exit 0 and an independently empty name-filter inventory. Historical dispatch status, not current: actual app-build/Compose runner was running in parent SSH session 60111; outcome and cleanup remain pending. No application, frozen Lane C or validated tools module changed. The previous app image was cleaned. This separate orchestration builds from the canonical staged source and invokes the unchanged reviewed Lane C driver with an immutable image ID.

## Frozen new files

| Path under ops/tools/lane-c-app | Lines | SHA256 |
| --- | ---: | --- |
| parent-run.sh | 84 | a564160260a1a46a8ae1930c027c53cb6180c7645e90a3c9c63d3611a3731014 |
| source.sh | 40 | 339cc168f1ce84fbb581ed4bcf26d37a0d80d5aa30b5bb559dd9575771e1ccd8 |
| regression.sh | 46 | dde4730db073af7e1a61a8a3bf1bffbc55976406a0ef898ec4422b5ad2ab79d0 |
| app.sha256 | 3 | 278f73ed7374e12307c4debb5c8a5f950e64c74233cba29baa932578d759f75e |

170 added shell lines, three manifest lines; each module below 200 LOC. Both parent reviews covered the same 170 LOC (340 review-LOC, not 340 unique LOC), with zero confirmed script defects. Runtime exposed two handoff configuration defects, corrected below; documentation review LOC was not supplied, so handoff defect density is not calculated. Existing tools manifest remains 5f21fc5cf87bf44ec9da1934311033634ec71af77796a14463000d6bfc0f9b06.

The runner authenticates reused manifests/helper/driver; regular canonical files and executable app entrypoints gate a tar context containing only the 34 manifest-listed app files. Hash checks run before context creation, afterward, after build and at exit. Extras and credentials are excluded from the build context. The original Dockerfile and its ignore rules are unchanged; dependencies still resolve through approved build connectivity. Evidence retains the source-only tar and hash, logs and IDs, not generated credentials.

All own daemon operations select the explicit context and have ten-second deadlines (three-second kill grace). Bootstrap is capped at 180 seconds and app build at 720 seconds. The entire lifecycle has 1800 seconds plus 240-second cleanup grace. The unchanged child Lane C driver retains its 600-second deadline and 120-second grace. Builder inspection checks 2 CPU/2 GiB, exact owned cache mount and immutable container identity; the new runner additionally checks its image against the parent-pinned BuildKit image. The task-tagged app requires UID10001, no inherited volumes and the nonce label.

Cleanup reuses the validated tools cleanup module and supported Buildx ls JSON inventory, never the old database helper cleanup. It recovers partial loads and empty pre-bootstrap caches, retains uncertain/foreign resources, removes verified task builder registration/cache/app image, and preserves the original failure status. Hash drift turns success into failure without replacing an earlier failure. Lane C cleans its own distinct UUID resources before returning. Parent must independently inventory both task identities even after success; uninterruptible daemon work, SIGKILL or late completion can require exact recovery. Shared prerequisite images remain. No broad prune or reclaimed-byte claim.

## Parent prerequisites and commands

Parent reports all five exact Compose service digests downloaded, plus the BuildKit reference below present. Independently inspect those images and pinned Ruby before dispatch; preflight rejects missing local references before resource creation. Lane C uses its unchanged no-build/pull-never path. BuildKit may access approved registry/frontend metadata, Debian mirrors and Ruby dependency sources during the build; this is not an offline-build claim. No service pulls are authorized in Lane C.

Stage exactly the nine files in the Compose create repair packet alongside the existing canonical source with LF bytes, traversable directories and readable files; preserve original executable app entrypoint modes. Keep all staging immutable during execution. Require host headroom, Bash/coreutils/tar/awk/sed/jq and compatible Docker/Buildx/Compose. The strict expected hostname is the parent-reported value below; do not derive it dynamically to bypass the check. The local context must resolve to unix:///var/run/docker.sock.

First run syntax and the new synthetic in a parent-reviewed immutable tools image with Bash/coreutils/jq, without a Docker socket. The previous task tools image was cleaned; parent must prepare/reuse an approved image. Example after parent review (all assertions stay in Docker):

```bash
export TOOLS_SOURCE=/home/tanzeel/elevateo-mail-tests-20261012-ultra/lane-c-20261012
export TOOLS_EVIDENCE=/home/tanzeel/elevateo-mail-tests-20261012-ultra
export TOOLS_HOST=Ubuntu-noble-latest-amd64-base
export APP_BUILDKIT_IMAGE=moby/buildkit:buildx-stable-1@sha256:cec9f139f45e93c5c69c60f8b07cfad9f43f4ef6b6a6cd917527fea5ff2e3dea
: "${TOOLS_CONTEXT:?Set independently verified local Docker context}"
: "${APP_CHECK_IMAGE:?Set reviewed immutable sha256 tools image ID}"
export TOOLS_CONTEXT
cd "$TOOLS_SOURCE"
printf '%s  %s\n' 278f73ed7374e12307c4debb5c8a5f950e64c74233cba29baa932578d759f75e \
  ops/tools/lane-c-app/app.sha256 | sha256sum -c -
sha256sum -c ops/tools/lane-c-app/app.sha256
timeout -k 10s 120s docker --context "$TOOLS_CONTEXT" run --rm --network none --read-only \
  --user 10001:10001 --cpus 0.5 --memory 256m --memory-swap 256m --pids-limit 64 \
  --cap-drop ALL --security-opt no-new-privileges \
  --mount "type=bind,src=$TOOLS_SOURCE,dst=/src,readonly" \
  --tmpfs /tmp:rw,exec,nosuid,nodev,size=32m,mode=1777 "$APP_CHECK_IMAGE" \
  bash -euc 'for f in /src/ops/tools/lane-c-app/*.sh; do bash -n "$f"; done; bash /src/ops/tools/lane-c-app/regression.sh'
# Only after review and the Docker checks pass:
bash ops/tools/lane-c-app/parent-run.sh
```

Parent must inspect/remove any timed-out synthetic container by verified immutable identity/profile; --rm alone is not evidence of absence. New synthetic covers accepted/missing/unpinned image inventory, source drift, symlink and executable-mode rejection, plus cleanup status preservation for success/failure and drift. It mocks daemon calls and does not prove real BuildKit or Compose behavior. Capture runner exit, evidence/identities, lane-c.log, test_exit and cleanup_failed independently. Actual Compose egress and PowerShell remain pending.

## Handoff configuration corrections from parent runtime

Two confirmed handoff defects, with frozen scripts unchanged:

1. The runner compares `hostname -s`, whose parent-observed value is `Ubuntu-noble-latest-amd64-base`. The full hostname ends in `.zst`; the earlier command incorrectly supplied that full name. `TOOLS_HOST` above now matches the short hostname while preserving strict validation.
2. The synthetic creates executable-mode fixtures under `/tmp` and checks them with `test -x`. A `noexec` mount makes those assertions fail even after `chmod`. Only this socket-free synthetic command now uses `/tmp:rw,exec,nosuid,nodev`; its read-only root, non-root UID, network isolation, caps and resource limits remain. Frozen lifecycle and Lane C tmpfs settings are unchanged.

Parent subsequently confirmed the clean LF-file Docker syntax/synthetic rerun passed with SSH exit 0; log: fleet-02:/home/tanzeel/elevateo-mail-tests-20261012-ultra/be01app-final-check.log. Independent name-filter inventory was empty. This establishes syntax/synthetic success, not actual app-build or Compose egress success. No new execution or review was performed by this author. App manifest remains `7152b86727b06d58f9e4666a126472fb6eb34dc34f7ffecd68f5b20c804d5cc9`.

## Historical parent clean synthetic PASS and app/Compose dispatch

Parent reports the clean LF-file Docker syntax/synthetic rerun passed with SSH exit 0. Evidence: `fleet-02:/home/tanzeel/elevateo-mail-tests-20261012-ultra/be01app-final-check.log`; independent name-filter inventory was empty.

The actual runner's first preflight correctly rejected staged `apps/server/bin/rails`, `apps/server/bin/worker` and `apps/server/bin/worker-health` modes 664. Parent restored exactly those three staged files to 755 without byte changes. This was a staging-mode prerequisite rejection, not a script defect or app-build result.

Historical report (superseded): parent reported the actual app-build/Compose runner running in SSH session `60111`, console `lane-c-app-console.log`. Its outcome, actual Compose acceptance and final cleanup remain pending; await parent evidence before completion claims. Frozen script bytes/manifests remain unchanged. No local tests, Docker/remote execution or ultrareviews were performed by this author.
