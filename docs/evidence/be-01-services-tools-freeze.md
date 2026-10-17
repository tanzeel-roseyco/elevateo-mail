## Services-tools runtime checkpoint — lease released

Frozen package `844af34c43800bb45fe65fb23299e1c7a36083b923c60d735d1cc2883ec07e0f` passed on fleet-02: syntax, three shell regressions, boundary 7 runs/14 assertions/0 failures/errors/skips. SSH preflight/parent/reconciliation, parent/test/cleanup/inventory/source all zero. Exact task resources independently absent; shared bases, builder and persistent resources preserved. Reservation explicitly RELEASED. Raw shared-host free-byte delta -51,245,056 is not attributable reclamation. See `docs/evidence/be-01-services-tools-result.md`. Full Auth/private Storage/lifecycle remains pending; teammate owns the separate app-parent adaptation, with no full-services dispatch authorized. Frozen implementation bytes unchanged.

# BE01 services prerequisite image and bounded lifecycle freeze

Prepared locally only. FE exclusively owns fleet-02. No reservation, remote mutation, build, syntax check, test, paid launch or ultrareview occurred. Parent bounded reviews now complete: A119/B102 zero defects; unique implementation plus boundary221 LOC, 0/KLOC; design157 overlapping zero. New implementation157 LOC. Runtime remains required; staging packet has its own pending review. Adapter and fixture execution bytes remain frozen.

## Decision and provenance

One separate test-tools image replaces the two prerequisite images proposed in be-01-services-socket-free.md. It contains Bash/coreutils/grep/jq plus Ruby3.4.11 and Minitest6.0.6 only; no Rails build, PowerShell, minitest-mock, product dependency changes, source layers or credentials. Boundary tests only require Minitest and Ruby stdlib. Explicit gem activation in the fresh Ruby process avoids the earlier Lane P activation error. `--ignore-dependencies` forbids implicit gem resolution; fresh require and actual boundary execution must prove sufficiency. This reduces build scope and resources; it does not establish baked app-source or full-stack behavior.

Reused exact inputs:

- Ruby `ruby:3.4.11-slim-bookworm@sha256:22165c5f904d76a8a02fbdd419d0269481369523fd66978232d16c88099730e2`, linux/amd64.
- BuildKit `moby/buildkit:buildx-stable-1@sha256:cec9f139f45e93c5c69c60f8b07cfad9f43f4ef6b6a6cd917527fea5ff2e3dea`.
- Minitest archive `https://rubygems.org/downloads/minitest-6.0.6.gem`, SHA256 `153ea36d1d987a62942382b61075745042a2b3123b1cd48f4c3675af9cc7d6f1`, copied from reviewed ops/tools/lane-p-protocol/Dockerfile and provenance.json. BuildKit verifies archive bytes. No new provenance retrieval claimed.
- Debian bookworm and bookworm-security snapshot URLs fixed at `20261010T000000Z`, from the reviewed Lane P recipe. APT authenticates repository metadata; packages are snapshot-selected, not individually SHA-pinned here. Output image is identified by its actual immutable ID after build, not promised reproducible bit-for-bit.
- Unchanged cleanup `ops/tools/lane-c-synthetic/cleanup.sh`, SHA `095fb2a580620b724070a0dc3c0d5400e38a98fc347d034c97f3fe3e47dcc3ec`; unchanged resource helper `docs/evidence/scripts/be-01-r1-fleet02-resources.sh`, SHA `86681089c789e3b636f518508e8c6cf496d332f69bd69e5696bbc1dd4302aa4d`.

## New files and review scope

All files under `ops/tools/be01-services-tools/`, LF bytes. Five implementation files 157 LOC; manifest9, total166. None exceed200. Suggested review A: parent86 + preflight9 + runner24 =119; B: Dockerfile21 + checks17 =38 plus pinned dependency context. Dedicated design review overlaps; parent review results recorded above; see be-01-services-stage-freeze.md. Inspect changes against Lane P parent/preflight/runner, not a claim of new review for untouched cleanup dependencies.

| File | LOC | SHA256 |
|---|---:|---|
| Dockerfile |21|`cfb5ebe7a254355d7e6b15b4ba99fde488cca43b72f9dc75a4e9c6617e919917`|
| checks.sh |17|`a59e5155bc9e54f171d331b3e995094ab5de216dd595b0da650572016531b77d`|
| parent-run.sh |86|`81fb601ba983b49b1c8f7dfbca4dcf18bec088ad84e4ad7ba7fcb307b3ab1962`|
| preflight.sh |9|`5648c30b8793a4eb6704eb10a34ce047c205126f0b6ffa1939c4c8ca3ebb99fd`|
| run-container.sh |24|`34c6ecf015a80c5fd5928d0d676439b820ed8b017e4fd7cc2da5ed04010667e9`|
| package.sha256 |9|`844af34c43800bb45fe65fb23299e1c7a36083b923c60d735d1cc2883ec07e0f`|

Local six-file staging archive: `C:/Users/Tanzeel/AppData/Local/Temp/be01-services-tools-review.tar`, SHA256 `ab611aff1b4d5ff029d25a0b62dff12e81a5f004ba12438fb38ddf1ea5deac1d`. Only the six paths above; no product or fixture files. Preserve this archive for review. Its bytes are staging provenance; runtime minimal build context contains Dockerfile/checks.sh only, recorded separately in evidence/context.tar and context.sha256.

## Execution proposal after review AND explicit reservation

First independently inspect the exact six archive entries and their regular-file types before extraction; reject extra paths, symlinks or traversal. Authenticate archive externally using the hash above, extract into a new staging directory, authenticate package hash there, then stage these six files only into canonical source. Do not overwrite canonical52 or frozen adapter/fixtures. Existing dependencies must already match manifest pins; abort on mismatch. No automatic repairs or repinning. Ensure directories are traversable and files readable by UID10001; the in-container preflight rechecks actual access before creating builder/cache.

From the authenticated canonical source directory, with reviewed daemon default verified as the expected local unix socket and independently inspected immutable bases already present:

```bash
set -euo pipefail
printf '%s  %s\n' 844af34c43800bb45fe65fb23299e1c7a36083b923c60d735d1cc2883ec07e0f \
  ops/tools/be01-services-tools/package.sha256 | sha256sum -c -
sha256sum -c ops/tools/be01-services-tools/package.sha256
TOOLS_SOURCE="$PWD" TOOLS_CONTEXT=default TOOLS_HOST=Ubuntu-noble-latest-amd64-base \
TOOLS_EVIDENCE=/home/tanzeel/elevateo-mail-tests-20261012-ultra \
bash ops/tools/be01-services-tools/parent-run.sh
```

Capture SSH status and full console via the previously reviewed LF-file transport; never hide exit behind an unchecked tee. No command above is authorization to run now. Parent creates nonce `be01serviceschecks-*`, hashes canonical52 and all dependent packages, rejects wrong host/remote daemon/TLS overrides, inventories collision names and preexisting images, and verifies actual runtime UID readability. The 2CPU/2GiB dedicated builder is inspected before/after build against exact cache mount and immutable BuildKit image. Build is bounded720s, bootstrap180s; ordinary daemon calls10s, container checks120s, overall1200s +180s termination grace. No shared/default builder build and no global prune.

Runtime checks use 0.5CPU/256MiB, memory-swap256MiB, pids128, UID10001, read-only root and source, networknone, cap-dropALL, no-new-privileges, noexec/nosuid/nodev32MiB tmpfs, no socket. Source readability preflight uses the already pinned Ruby base; tests use the newly built immutable image. Syntax then all three frozen shell regressions then fresh-Ruby boundary oracle7/14/0 must pass. Checks preserve failing boundary output through pipefail+tee. No second app image is needed. Output image/cache are disposable and removed in this same lifecycle, not retained for a later task.

## Failure recovery and evidence

Reuse unchanged reviewed cleanup, including supported buildx ls JSON inventory (not unsupported inspect --format), exact registry/node/endpoint checks and keep-daemon/keep-state deregistration. Empty pre-bootstrap labelled cache uses a capped read-only emptiness probe; populated cache requires verified builder/mount/content evidence. Partial/timed-out load images are recovered by nonce label plus exact tag/immutable ID, exclusion of preexisting images and twice-checked metadata, using non-force removal. Container cleanup requires pinned ID/fingerprint; changed or unavailable inspection retains resources. Never turn uncertain ownership into deletion.

Every normal failure/TERM invokes cleanup with original test status; report test_exit and cleanup_failed separately. Overall hard kill can interrupt cleanup: timeout is not proof of absence. Do not automatically rerun after failure or manually broaden cleanup. Preserve uncertain resources and request a concrete exact-ID recovery review if inherited cleanup cannot verify them. Existing cleanup-regression and preflight-regression evidence is inherited from the validated tools lifecycle; new wiring remains untested and requires review. No claim of new timeout regression PASS.

After exit, independently save exact task IDs/names/labels, cache volume, image tag/ID, Buildx registry and actual `df -B1` before/after (the inherited lifecycle's human-readable df is supplementary). All task resources must be absent before release unless coordinator explicitly accepts retained inventory. Shared base images and persistent/FE resources remain. Preserve build.log, builder.log, identities, context.sha256, readability.log, checks.log, manifest before/after evidence, cleanup console and independent inventories. Full Auth/Storage/persistence, actual app, native Windows and BE02 gates remain unchanged.
