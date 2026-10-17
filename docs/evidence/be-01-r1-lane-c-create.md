Latest runtime FAILED: child test_exit=1, cleanup_failed=1; parent test_exit=1, cleanup_failed=0. Compose batch create, app build and baked verification passed, but shared-network tool hostname drift broke post-start fingerprint verification. One stopped uncertain tool remains preserved. Narrow hostname normalization and Docker-only regression are frozen for parent review, NOT tested. See docs/evidence/be-01-r1-lane-c-hostname.md for exact evidence, eight execution-file hashes and 181 LOC review scope. Exclusive fleet-02 ownership remains here; no further validation/cleanup until review and no ultrareviews. Earlier checkpoints below are historical.

Latest Compose create checkpoint: parent bounded code review complete, 192 unique LOC, zero defects, 0/KLOC; dedicated design review complete, 166 overlapping LOC, zero defects, 0/KLOC. Do not add overlapping coverage to unique LOC. Frozen hashes match the repair packet. User has delegated exclusive fleet-02 validation to this author: authenticated nine-file staging, synthetic Docker lifecycle, then app lifecycle only on PASS. Historical pre-dispatch status: runtime was pending here; the completed failed run and retained resource are documented in be-01-r1-lane-c-hostname.md. No further ultrareviews authorized.

# Lane C Compose create compatibility repair

Current status: frozen for parent bounded review and Docker validation. No new execution tests performed by this author.

## Runtime finding

Parent run be01app-83de589a-f3d7-421f-9376-ac34aa465fb8.pGefaO built successfully; baked source verification PASS. Child be01r1-4527ddae-4799-451f-a956-3c5ad98dd24f.D6REHw failed create-db.log with unknown flag: --no-deps. Parent and child each reported test_exit=1, cleanup_failed=0; parent reports exact app image, builder and cache removed. This is one new confirmed CLI compatibility defect, separate from the previously fixed OOM fingerprint defect. Actual Compose acceptance remains pending.

## Supported semantics and repair

The [Docker Compose create reference](https://docs.docker.com/reference/cli/docker/compose/create/) documents create, --no-build and --pull never, but no --no-deps. [Official Compose v2.39.4 create implementation](https://github.com/docker/compose/blob/v2.39.4/cmd/compose/create.go) also registers no such flag and passes service selection to backend.Create. This is reference evidence, not a claim about the installed fleet version. No remote help or workload was invoked by this author.

prepare_compose already validates the exact nine-service resolved model and writes every service's ownership/profile specification before create_services. The repaired create_services additionally checks all nine specification name/service pairs and exact container-name absence before network or container creation. One supported batch call explicitly requests all nine services: db bootstrap migrate auth rest storage mailpit api worker. Dependencies therefore remain inside the registered set. After successful creation, each container is pinned through the unchanged ownership/mount/cap/image/profile inspector before any driver startup. A single batch avoids later create calls reconciling and replacing dependencies already pinned by earlier calls. Start order and database/bootstrap/migration readiness logic are unchanged; create does not replace that startup orchestration.

The call retains --no-build, --pull never, selected context and the existing 25-second bound/global deadline. It logs to create-services.log. No up/start, pull, orphan-removal or broad cleanup option was introduced. Failed or timed-out partial creation returns failure before pinning: registered but unpinned containers are retained as uncertain by the existing cleanup policy, for parent exact recovery. This deliberately does not infer ownership from names alone.

## Regression and pending review

New Docker-only, socket-free create regression exercises the production create_services function with controlled daemon adapters. It checks the exact supported single batch argv; all nine registered intents before creation; all nine pins after success; missing/mismatched intent and occupied names rejected before resource creation; network verification failure; create failure without pins; and pin rejection halting progress. These synthetic checks do not establish installed Compose compatibility or actual namespace isolation; the parent actual run remains required.

The tools checks entrypoint now includes syntax and execution of this regression, increasing its synthetic groups from five to six. Existing tests remain. Suggested bounded review: helper 89 LOC + new regression 77 LOC + checks entrypoint 26 LOC = 192 unique LOC. Separate hash-only orchestration inspection covers the three entrypoint pin updates and manifests. Review has not yet been reported; do not interpret this packet as zero-defect certification.

Relative to prior freeze: helper +10/-2; new regression +77/-0; checks +2/-1; driver +1/-1; tools parent +2/-2; app parent +3/-3. Total code +95/-9. Manifests: package +2/-1; tools +2/-2; app +1/-1, total +5/-4. Documentation is separate.

## Exact changed execution files

| File | LOC | SHA256 |
| --- | ---: | --- |
| ops/tests/fleet02-egress-compose.sh | 89 | a8d1e2d61de4871f5a4da672e593c6474df3587d37478f27a8cb9bd87197cfbc |
| ops/tests/fleet02-egress-create-regression.sh | 77 | 759ecf0544262e40beac0ceb5714c5fd39265bd6bf46f23b976e7442d52f20b2 |
| ops/tools/lane-c-synthetic/checks.sh | 26 | e92a416815a8a8e499bac7686484a5be8b83d24884c34f71c605715b6c81cc10 |
| ops/tests/fleet02-egress-package.sha256 | 11 | 59fd0dbb4d66c1a26317c5297e3dc4bc72a303ee6c20e5c7c848b8849dc4dfc8 |
| docs/evidence/scripts/be-01-r1-fleet02-compose-egress.sh | 83 | 0b24c0ae88449d2829839bef955de35bc157a54a21fa5a8584439a81e168e1b0 |
| ops/tools/lane-c-synthetic/parent-run.sh | 78 | fe481adff098831511e97eccf8de0e5a82dc8829512418f3381c0a8542c115f0 |
| ops/tools/lane-c-synthetic/tools.sha256 | 8 | 5f21fc5cf87bf44ec9da1934311033634ec71af77796a14463000d6bfc0f9b06 |
| ops/tools/lane-c-app/parent-run.sh | 84 | a564160260a1a46a8ae1930c027c53cb6180c7645e90a3c9c63d3611a3731014 |
| ops/tools/lane-c-app/app.sha256 | 3 | 278f73ed7374e12307c4debb5c8a5f950e64c74233cba29baa932578d759f75e |

All three dependent manifests match their files by static byte inspection. Canonical source manifest stays 03d590ddaa39b22c6b1851c9911405473c0b01b0a50fff08001144e66a14638b. Do not repin the 52 source files or overwrite canonical source with Windows checkout bytes. Stage only the nine execution files above, preserving exact LF bytes. OOM inspector/regression, resources cleanup, Compose overlay and all product sources remain frozen.

## Parent sequence after review

Use the existing capped socket-free Docker command in be-01-r1-lane-c-app.md, its reviewed immutable tools image, /tmp rw,exec,nosuid,nodev fixture mount, strict short hostname Ubuntu-noble-latest-amd64-base and explicit independently verified context. Its payload should run:

```bash
bash -euc 'bash /src/ops/tools/lane-c-synthetic/checks.sh; for f in /src/ops/tools/lane-c-app/*.sh; do bash -n "$f"; done; bash /src/ops/tools/lane-c-app/regression.sh'
```

This executes all six synthetic groups, existing syntax checks and app syntax/synthetic checks. If no approved tools image remains, use the updated authenticated tools lifecycle. After review and Docker success, use the updated app-manifest pin and existing app handoff environment to run bash ops/tools/lane-c-app/parent-run.sh. Parent owns prerequisite image inventory, exact recovery and execution. Capture create-services.log, all exit/cleanup statuses and independent inventories. Actual Compose egress and PowerShell remain pending. No remote execution, host tests, local Docker, ultrareviews, commits or pushes by this author.


## Delegated validation checkpoint

User delegated exclusive fleet-02 validation after both reviews; no competing parent workloads. Archive SHA256 38bacc0536eb9324620fb28a0c356c0682d83db3d2e2bd85d5cca8b7188ffef7 contains only the nine frozen files. Adapted TEMP/be01-create-stage-test.sh SHA256 0a25cdc30915785f4caf7d25ef71fc13dab9847a41d35b5368dbb54b1cf115e2 authenticated the archive and exact file set, allowed only the sole new regression path, passed hash-only comparison of all three orchestration scripts, and verified canonical source plus all dependent manifests after staging.

Synthetic lifecycle PASS, SSH exit 0, test_exit=0, cleanup_failed=0. Evidence: /home/tanzeel/elevateo-mail-tests-20261012-ultra/be01tools-97da8e5f-256c-41a0-a90a-b99d2327bec5.WYGXHp; consoles create-stage-console.log and create-tools-console.log. All six synthetic groups and syntax passed. Expected malformed-input/profile-rejection stderr belongs to passing negative assertions. Independent exact-task name/label inventories verified no containers, volumes, networks, images or builder registration. Shared images remain. One initial read-only inventory SSH command suffered quote parsing; repeated LF-file inventory passed before app dispatch. This was a harness transport error, not a test failure.

Authenticated TEMP/be01-create-app-run.sh SHA256 7dc549db3bd192bed8c68f7a5f2d319e1b8bbc43890c3f2fa93e441816008204 gates app dispatch on independent tools absence and authenticated app manifest. It uses strict short hostname, explicit default unix-socket context and immutable BuildKit digest from the handoff. Historical dispatch status (superseded): app task be01app-a16f116d-c3c3-4d60-997e-2a59e35c06ab was running at this checkpoint. It subsequently finished: build/baked verification and batch creation PASS, parent test_exit=1 cleanup_failed=0; child test_exit=1 cleanup_failed=1 from hostname fingerprint drift. The stopped uncertain tool remains retained; see be-01-r1-lane-c-hostname.md. Consoles: create-app-dispatch.log and create-app-console.log under the evidence parent. No product/source changes, host tests, local Docker, ultrareviews, commits or pushes.
