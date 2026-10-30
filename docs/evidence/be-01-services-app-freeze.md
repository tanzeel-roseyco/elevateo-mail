Latest full-services runtime FAILED: build/baked PASS; parent and child test_exit=1 cleanup_failed=0. Compose normalized away unused fixture state, violating the adapter's four-volume predicate before real service tests. Independent reconciliation SSH/inventory/source=0; exact task resources absent, shared resources retained. Fleet reservation RELEASED. Seven-file local volume-plan repair frozen for parent bounded review; regression NOT_RUN, no rerun authorized. See docs/evidence/be-01-services-compose-volume-repair.md. Prior running/preflight/pending-reservation entries below are historical.

Current BE01 checkpoint: services-app socket-free Docker check PASS; staging/SSH/parent/test/source/cleanup/independent reconciliation all0. Exact task container absent; shared bases/builder/persistent resources retained. Lease RELEASED. Fresh full-services read-only preflight SSH0/source0/ready; all pinned images present. Actual Auth/private Storage/lifecycle remains pending new70-minute-plus-reconciliation reservation. See docs/evidence/be-01-services-app-check-result.md. Earlier pending/running statuses are historical; frozen execution bytes unchanged.

# BE01 separate services app parent freeze

Status: authored for independent bounded review; NOT syntax-tested, executed, staged or committed. No Docker, remote operations, paid calls or ultrareviews. Only the new ops/tools/be01-services-app directory and this document were created. Shared ledgers belong to the coordinator. No frozen execution files or manifests were changed.

## Purpose and coupling

The new parent adapts frozen lane-c-app/parent-run.sh to build the same manifest-listed app and dispatch the authenticated be01-services child instead of the original Lane C child. It uses the original source.sh, cleanup.sh, run-container.sh, preflight.sh and resource helper unchanged. The nonce prefix becomes be01servicesapp; the child retains its separate be01services prefix and ownership registry. No disposable image is intentionally left behind.

External staging must authenticate the NEW manifest and parent before execution. SERVICES_APP_PACKAGE_SHA is mandatory and compared before loading dispatch.sh, before child dispatch and during finalization. The services manifest is pinned to3044a0e2; it authenticates dependencies and the fixture manifest, which authenticate fixture members and canonical source. Regular-file, symlink, canonical-path and digest checks precede allocation. The new package manifest is checked again at finalization, so replacing its allowlist cannot silently remove dispatch from the final drift check.

Frozen check_sources still covers the original app manifest and canonical source; it is not replaced. finish_services_app checks additional sources, preserves a nonzero child status and then calls frozen finish_app. That helper deliberately passes the preserved status through a subshell into cleanup_tools via $?. Failed final authentication changes success to failure, but does not bypass the already loaded exact-ownership cleanup. Parent cleanup cannot remove child service resources; a surviving child consumer prevents non-force image deletion and must be independently reconciled.

Parent budget:3600s normal deadline plus600s SIGKILL grace, requiring at least70 minutes of reserved execution time plus independent reconciliation time. Existing bootstrap180s and build720s limits remain; child retains1200s plus600s cleanup grace. Individual daemon calls retain their bounds. The parent normally waits for the child to finish cleanup before starting parent recovery. An outer timeout signals the process group; forced termination can interrupt cleanup and leaves uncertain resources for exact reconciliation. No claim of guaranteed reclamation under timeout is made.

The BuildKit/Ruby/Compose image inspection, UID readability,34-file app tar, nonce labels, preexisting-image inventory, builder profile verification, cache ownership/content checks and non-force image cleanup remain frozen behavior. BuildKit must be the approved pre-staged immutable reference from be-01-services-next-runtime.md. Capacity, host/context, lease ownership and successful services-tools checks remain external prerequisites. No ports or real external mail are enabled.

## Exact new LF files

| File under ops/tools/be01-services-app | LOC | SHA256 |
|---|---:|---|
| parent-run.sh |91|643bfe925f232263dc1619352f5fc5326bb86d01544856325fad493221199434|
| dispatch.sh |38|1f015ed10eb66eed0f0f070895b7b3ac0526583d7796953cd0e6761d8607eb4d|
| regression.sh |82|0acdbb7f2640f566415247975e1595f71e8d6aee3db15389d310d38a47a006c9|
| package.sha256 |3|6721b35694543a6e758df4547fa145491e737f8f9bb05a3e2ef7ffaefd35238f|

Implementation129 LOC and regression82 LOC;211 unique executable LOC, each module under200. Independent implementation review by perf_q1_q2_review covered parent91+dispatch38=129 LOC: zero defects,0/KLOC. Its separate regression review covered82 LOC: zero defects,0/KLOC, unchanged SHA0acdbb7f2640f566415247975e1595f71e8d6aee3db15389d310d38a47a006c9. Total unique coverage211 LOC: zero defects,0/KLOC. Independent design review by perf_q1_q2_design covered the same129 implementation LOC, with368 total context lines: zero defects,0/KLOC. Design coverage overlaps and is nonadditive. Obsidian was unavailable; timing/failure scenarios were analytical only, not executed simulations. Docker remains unexecuted; static review closure does not establish runtime acceptance. The BE lead owns code-reviews.md and shared-document updates.

Frozen coupling hashes observed unchanged during preparation:

- lane-c-app/app.sha256:1eeeca5c896bc1082e43202478b5816e8d909efdf0c40e712c367df4ad50f9c4.
- lane-c-app/parent-run.sh:c18bf4df32f373e5c6f00535d7ed2e688504790f5898a28024138eb586321f45.
- lane-c-app/source.sh:339cc168f1ce84fbb581ed4bcf26d37a0d80d5aa30b5bb559dd9575771e1ccd8.
- lane-c-synthetic/cleanup.sh:095fb2a580620b724070a0dc3c0d5400e38a98fc347d034c97f3fe3e47dcc3ec.
- be01-services/package.sha256:3044a0e2df4daa6cf5372e1edd90c609f5ed9d91a2b874842e97710d09694787.

## Proposed Docker verification, not executed

After independent reviews, use a reviewed capped tools image with Bash/coreutils, no Docker socket, network none, UID10001, read-only authenticated canonical source at /src and writable /tmp tmpfs. Run bash -n for all three new shells and bash /src/ops/tools/be01-services-app/regression.sh. The regression copies only authenticated manifest members into its temporary tree; its positive oracle requires the real canonical bytes and dependencies, not this checkout's potentially CRLF product sources. Stage additively using authenticated absent-target handling, readable files0644/directories0755 below the bind root; do not relax private host ancestors.

The regression tests changed child bytes, changed pinned child manifest, child symlink, changed new dispatch and changed new allowlist; happy/failing dispatch, final source drift, canonical drift, cleanup failure, exact environment and immutable app-reference rejection. Cleanup is deliberately mocked: these assertions verify status/order coupling, not Docker ownership or actual reclamation. No daemon timeout, partial build, real services or native Windows acceptance is claimed. Those remain real lifecycle tests under a separate lease.

After successful socket-free verification and fresh lease/capacity/image checks, the proposed parent invocation is:

```bash
cd "$CANONICAL_STAGED_SOURCE"
printf '%s  %s\n' 6721b35694543a6e758df4547fa145491e737f8f9bb05a3e2ef7ffaefd35238f ops/tools/be01-services-app/package.sha256 | sha256sum -c -
sha256sum -c ops/tools/be01-services-app/package.sha256
SERVICES_APP_PACKAGE_SHA=6721b35694543a6e758df4547fa145491e737f8f9bb05a3e2ef7ffaefd35238f \
TOOLS_SOURCE="$PWD" TOOLS_CONTEXT=default TOOLS_HOST=Ubuntu-noble-latest-amd64-base \
TOOLS_EVIDENCE=/home/tanzeel/elevateo-mail-tests-20261012-ultra \
APP_BUILDKIT_IMAGE=moby/buildkit:buildx-stable-1@sha256:cec9f139f45e93c5c69c60f8b07cfad9f43f4ef6b6a6cd917527fea5ff2e3dea \
bash ops/tools/be01-services-app/parent-run.sh
```

Capture transport, parent and child test/cleanup statuses separately; inspect services.log and both evidence directories. Independently inventory both nonce prefixes, exact IDs/names/labels, builder registration, image/cache and four child volumes; verify canonical and added source digests and host free bytes. Retain shared bases/builders and all uncertain resources. Any missing summary, timeout, retained resource or source drift blocks acceptance. This packet grants no fleet reservation or execution permission.

Read-context note: this checkout has no .planning/BACKEND-STANDARDS.md; the draft in the main Elevateo Mail checkout was read as historical planning context. The BE01 checkout's current AGENTS/STANDARDS and explicitly assigned bounded adapter govern this work; no backend standards approval is inferred from that historical draft.
