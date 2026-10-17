Current: separate adapter and authenticated archive are now authored/frozen in be-01-services-identity-parent-freeze.md. Its concrete hashes/commands supersede the prospective adapter section below, retained as historical design context. Identity implementation bytes unchanged; no execution or reservation.

# Python image identity repair — frozen for bounded review

## Actual execution and cleanup

Coordinator authorized finalized packet99f49007c67d41c30aaa20d8c57041bbc89ad5637a9c73803a86ff835c008c16 only. Evidence: fleet-02:/home/tanzeel/elevateo-mail-tests-20261012-ultra/be01python-acquire.3rbgTX. Initial transfer/auth wrapper erroneously required no globally running containers; it exited1 before authentication. Original inventories/auth.sh are retained. Corrected resume-auth inventories shared resources (303 containers), finds no task collision candidates, records available memory38755139584 bytes, authenticates five exact regular archive members and all hashes; SSH0. No shared workload stopped.

Pinned image pull exit0; launch SSH1 because inspect `.Id` equals pinned OCI manifest f0408636..., not config4143a73d.... image.verified.json records matching linux/amd64, RepoDigests and Descriptor. Frozen runner was NOT invoked; no test_exit or runner cleanup_failed exists. This is failed acquisition verification, not a passing test or failed assertion. No test container was created. Old frozen archive remains unchanged and preserved locally/remotely.

Independent reconciliation inspected full exact image identity/references, verified actual manifest-ID absence in both before inventories, no ancestor containers or task-name containers, and no extra tags/digests. Removed only acquired exact Python reference without force. cleanup.status: image_cleanup_exit=0 inventory_exit=0 source_exit=0 test_status=not_started verification_exit=1; reconciliation SSH0. Fresh image inventory confirms acquired ID absent and all preexisting image IDs retained. Separate subsequent read-only SSH0 confirmed absence again. All source hashes preserved; canonical52 never mounted or changed. No builders/volumes/networks created. Evidence retained; no task resources retained. Fleet reservation RELEASED after reconciliation.

Raw available bytes:272781148160 before ->272813113344 after; delta+31965184. Shared-host activity means this is not an attributable reclaimed-byte estimate.

## Primary-source diagnosis

[Docker containerd image-store documentation](https://docs.docker.com/engine/storage/containerd/) describes the distinct backend and its image-index/manifest support. [Docker Engine implementation](https://github.com/moby/moby/blob/master/daemon/containerd/image_inspect.go) sets inspect ID from target.Digest and returns the target Descriptor. Thus config-ID equality is not portable. [Docker registry manifest API](https://docs.docker.com/reference/api/registry/latest/operations/GetImageManifest/) documents digest-addressed manifest retrieval. The preserved raw amd64.json hash equals pinned f040... and its config.digest is4143...; bytes are copied unchanged into the new authenticated package. Runtime evidence establishes the fleet shape; primary sources explain it, not a claim that every Docker version uses it.

## Narrow repair and review slices

Runner remains55 LOC: replace config-only comparison with full inspect plus19-line jq validator; manifest now authenticates validator, regression and raw platform manifest in addition to unchanged three Python sources. Raw manifest hash is f040..., config link must equal4143.... Validator accepts exactly one JSON document containing one image, linux/amd64, exact Python RepoDigest; classic shape requires config ID, containerd Descriptor requires exact manifest/mediaType and ID config-or-manifest. Unknown identity, missing Descriptor for manifest ID, wrong config link/platform/repository, array multiplicity and JSON streams fail closed. Caller must authenticate all package bytes first; validator alone does not hash manifest input.

New38-line socket-free Bash/jq regression: two positive store shapes; original config-only guard discrimination;14 negative cases including wrong ID/descriptor/mediaType/platform/repository, missing/null/multiple input and wrong config link. Pending Docker execution. Review executable slice112 LOC (runner55+validator19+regression38), plus41 raw provenance lines and6 manifest lines context. Coordinator completed correctness112 LOC/zero defects and analytical design112 overlapping LOC/zero defects; unique112 LOC,0/KLOC. Obsidian unavailable; runtime pending. Full Auth/Storage/lifecycle and actual alternate-UID source traversal remain pending. All other tools/product/adapter/fixture execution bytes unchanged.

## Frozen hashes

All paths below are under docs/evidence/scripts; LF bytes. New eight-file allowlist replaces the old five-file staging proposal only AFTER review. No revised archive has been dispatched.
| File | LOC | SHA256 |
|---|---:|---|
| be01-services-stage.py | 67 | 3bcafad3d1246a4cb6abe152445d38c2f4318f6e33e33bd901670feebf822ed9 |
| be01-services-stage-regression.py | 58 | f67fa995bdea5e3568839cb26bb3b8be3cbef01cb638930be40e5f0c2b80bb0f |
| be01-services-stage-boundary.py | 91 | 4bf9d60282682bb3db2d49cc81bc6e0f598aabc5eadb391743867daf1f8a3801 |
| be01-services-python-identity.jq | 19 | 9e4575e8fdccbd2d94fb250eb4e61e6f47244a3bb6f18938184348bc29940702 |
| be01-services-python-identity-regression.sh | 38 | 3e5d590135683f3d0c6ac59c10e765f69202238888cbee0d627a51480be6b1af |
| be01-services-python-manifest.json | 41 | f040863673aea2570c3ff6a5c3fb4c673a016cbc5375005ad145915922b6b78a |
| be01-services-python.sha256 | 6 | 1f19030c64e24e72c7f0f137504717ea65d7acb3600a352dcf24842c0cfad02c |
| be01-services-python-run.sh | 55 | 4db705113689b82b39980a765c861d00fd06947c31e1dd60a83098ca3999bf90 |

## Rerun prerequisites after bounded review and new lease

Authenticate all eight exact regular files and outer archive before staging into a fresh directory; no canonical overwrite. Preserve successful full inventories; classify preexisting by BOTH config and manifest ID plus pinned reference, not failed inspect alone. Acquisition guard must use this same authenticated jq/manifest check, not obsolete launch.sh config-ID equality. Use observed authenticated `.Id` for ancestor inventory, then exact ref/ID checks and non-force removal only for newly acquired, unshared image. Leave uncertain resources for reconciliation. No global-vacancy requirement; coordinate task lease and exact names plus capacity.

First run identity regression inside an already reviewed Bash/jq tools image using socket-free read-only UID10001/network-none/cap-drop/NNP,0.5CPU/256MiB/pids64 and disposable tmpfs; no host regression execution. Invoke `bash /review/be01-services-python-identity-regression.sh` with authenticated review directory read-only mounted. Image availability/acquisition needs concrete coordinator review; no unpinned tools image substitution. Then authenticate pinned Python using new check and run the unchanged bounded invocation environment from original packet against repaired runner. Python workload/oracles remain1+3 tests. Record transport/test/source/inventory/image cleanup statuses independently. Do not rerun until reviewed/reserved.
## Concrete jq-first Docker route for coordinator acceptance

Existing Ruby runner images are NOT assumed to contain jq. Build the dedicated image from the already frozen `ops/tools/be01-services-tools/Dockerfile` (SHA cfb5ebe7a254355d7e6b15b4ba99fde488cca43b72f9dc75a4e9c6617e919917) and checks.sh (a59e5155bc9e54f171d331b3e995094ab5de216dd595b0da650572016531b77d). This image supplies Bash/coreutils/jq. Do not execute its broader services checks entrypoint. Reuse parent-run.sh81fb601b... and its exact pinned cleanup/resource/run-container/preflight dependencies, dedicated2CPU2GiB builder and immutable Ruby/BuildKit bases documented in be-01-services-tools-freeze.md. No product app build or added product dependency. No new Dockerfile is needed.

The frozen parent has NO command override and immediately cleans its output image. Consequently it cannot be invoked unchanged for the identity suite, and its image must not be assumed available after exit. Concrete minimal proposed adaptation for separate bounded review is a NEW parent copy with the sole workload replacement below; keep original parent/package bytes frozen. Authenticate original package first, independently pin the copied parent before execution, and retain all original preflight/build/traps/cleanup/source checks. This proposed adapter has NOT been authored or executed during current review.

At the existing `phase=checks; run_container /opt/be01-services/checks.sh` call, replace only that call with:

```bash
run_container -ceu 'cd /src/.acceptance/python-identity
  printf "%s  %s\n" 1f19030c64e24e72c7f0f137504717ea65d7acb3600a352dcf24842c0cfad02c be01-services-python.sha256 | sha256sum -c -
  sha256sum -c be01-services-python.sha256
  bash -n be01-services-python-run.sh
  bash -n be01-services-python-identity-regression.sh
  bash be01-services-python-identity-regression.sh'
```

Before this lifecycle, authenticate all eight exact regular package files into a fresh0755 `.acceptance/python-identity` directory with0644 files under canonical staged root; refuse an existing target. This is additive staging only; canonical52 bytes/manifests and tools package remain immutable. Preserve private evidence ancestors. Original parent actual-UID source readability preflight still precedes builder creation; the identity command reads/authenticates this added directory as UID10001 before assertions. Do not turn the failed original global-vacancy check into this adapter: original exact collision checks remain.

Proposed adapter command after its additional bounded review/packet acceptance/reservation: `env TOOLS_SOURCE=/home/tanzeel/elevateo-mail-tests-20261012-ultra/lane-c-20261012 TOOLS_CONTEXT=default TOOLS_HOST=Ubuntu-noble-latest-amd64-base TOOLS_EVIDENCE=/home/tanzeel/elevateo-mail-tests-20261012-ultra bash AUTHENTICATED_NEW_IDENTITY_PARENT`. Its full timeout and inherited exact-owned cleanup apply to success and failure. Record build/readability/checks/cleanup/SSH independently. Expected identity output: two store successes, original discrimination and14 negative cases; syntax exits0.

Sequence is strict: (1) jq-only lifecycle/syntax PASS; (2) independently reconcile exact nonce container, builder registry/node/cache and built image removal, preserve bases, capture df-B1; (3) only then acquire pinned Python if absent and authenticate image with repaired jq check using exact pinned raw manifest; (4) execute repaired Python runner with REVIEW pointing to authenticated eight-file directory and original BE01_LEASE; (5) independently reconcile Python task containers/source statuses, sole-acquired exact image cleanup and df-B1. Stop after any failure or uncertain inventory; no automatic retry or cross-stage cleanup. Shell identity tests run only in Docker; host jq is used for authentication/inspection only, not synthetic tests. Python suites remain1+3tests and no skips; identity PASS cannot stand in for them.

This is a concrete build/run/cleanup route, but the new adapter copy and expanded authenticated archive remain an explicit readiness prerequisite. Current implementation review covers identity/regression/runner hashes only, not this prospective orchestration delta. No Docker route is presently execution-approved; fleet is released. No further changes to current implementation bytes while reviewers work.
