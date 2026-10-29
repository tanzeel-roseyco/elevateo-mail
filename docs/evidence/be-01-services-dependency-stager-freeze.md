Bind-boundary repair frozen for review: stager139 SHA50eba803, regression189 SHA4bb6d89a, manifest9d39e2e2. Host ancestors retain directory/symlink checks; other-execute scoped to bind root/descendants. Nine Docker-only tests NOT_RUN. Review pending; previous288 LOC static PASS superseded for changed bytes. Lease released, no remote mutation. Packet: docs/evidence/be-01-dependency-bind-boundary-repair.md.

Latest staging attempt STOPPED: authenticated archives/source PASS, frozen dependency stager exit1 on /home/tanzeel mode0750 ancestor guard. SSH_STAGE1; independent reconciliation SSH0/source0, all five canonical destinations absent. No Docker/pull/tests or ancestor chmod. Retained authenticated private evidence; lease RELEASED. See docs/evidence/be-01-dependency-staging-attempt.md. Prior static PASS remains static only; executable hashes unchanged.

Dependency stager static review COMPLETE: correctness135 + regression153 =288 unique LOC, zero confirmed defects,0/KLOC; dedicated design135 overlaps and is nonadditive. All execution hashes stable. Design simulations analytical only (Obsidian unavailable); trusted exclusive filesystem and bounded transferred inputs required; modes do not prove alternate UID access. Six Docker-only cases NOT_RUN. No fleet lease or remote execution. See docs/evidence/be-01-services-dependency-stager-freeze.md for delivery and runtime proposal.

# Separate dependency stager freeze

Accepted by coordinator after correctness and design review; no tests, imports, Docker or remote mutation executed. Fleet remains RELEASED. This implements the seven checks in [the accepted dependency packet](be-01-services-dependency-stage.md). Earlier preflight exit1 was a missing prerequisite, not a test failure. No task resources were created.

## Frozen inputs and review slices

| File under docs/evidence/scripts | Lines | SHA256 |
| --- | ---: | --- |
| be01-services-dependency-stage.py | 135 | `486b0d485e91fe30c64f6d75fb9001ef7896c6020ca454d489a074d93e930901` |
| be01-services-dependency-stage-regression.py | 153 | `c8de99281352540a95955c8c96cab9b0b474b138912206761ce8f0be0ee43ecd` |
| be01-services-dependency-stage-review.sha256 | 4 | `9108c62875ded410014aff77e9577fbd4ae5db243486fe55c239089910fec6ff` |
| be01-services-dependency-stage.sha256 (unchanged) | 24 | `0297f2c03e3049b1746829907e589fbda5847357c47af6bcd079d48f1a0a27c2` |

Archive remains `C:/Users/Tanzeel/AppData/Local/Temp/be01-services-dependencies-review.tar`, SHA256 `f9455d2fb3e66412fc6ac7c171027d9745c1163cf6a8e883d493d5c3dccc826a`. Review manifest uses flat sibling names; assemble these four authenticated inputs together without extracting the dependency archive.

Correctness slices: stager135 and regression153, total288 unique new code/test LOC. Design review may use those same two bounded slices; overlapping coverage is nonadditive. Reviews complete: correctness135 + regression153 =288 unique LOC, zero confirmed defects,0/KLOC; dedicated analytical design135 overlaps, zero defects. No execution bytes will change during review without a new freeze.

The original six-file stager remains SHA256 `3bcafad3d1246a4cb6abe152445d38c2f4318f6e33e33bd901670feebf822ed9`. Adapter3044a0e2, fixture028c90c2 and canonical52 manifest03d590dd remain unchanged; full pins are in the accepted packet. No canonical source file is an archive member.

## Behavior and regression oracles

The stager authenticates archive, external allowlist, nested manifests, canonical52 and existing dependencies before either target is created. Both targets must be absent, including dangling symlinks. It creates only the exact two directories and24 files with exclusive creation, explicit0755/0644, then rechecks hashes, sets, modes and source. It never extracts archive paths or removes partial output. Existing ancestors and private evidence permissions remain unchanged.

Six Docker-only tests use the authentic archive and copy existing dependencies from read-only `/src` into disposable `/tmp`:

1. Authenticated happy path under umask077, exact added paths/hashes/modes, original source unchanged, evidence0700 preserved.
2. Existing second target with sentinel refused before either target changes.
3. Dangling first target refused without mutation.
4. Corrupt existing dependency refused with complete snapshot unchanged.
5. Corrupt archive refused with complete snapshot unchanged.
6. Injected chmod failure after a real second-directory write retains complete first directory and partial second; retry refuses and preserves the snapshot.

Partial-copy coverage is post-write permission failure, not disk-full/mid-write fault injection. Mode assertions alone do not prove alternate-user traversal. Exclusive lease and non-hostile filesystem are prerequisites; this is not a concurrent attacker-resistant dirfd implementation. Actual UID10001 traversal must pass in the Docker invocation and later tools preflight.

## Proposed execution wiring for coordinator review

No new acquisition framework or change to the frozen Python runner. Reuse the accepted jq-first identity authentication, pinned Python prerequisite acquisition and exact cleanup procedure from [identity packet](be-01-services-identity-parent-freeze.md). New tests are one supplemental invocation using its socket-free capped Python pattern. Existing Python suites remain separate and unchanged.

After reviews, fresh lease and authenticated transfer, the additive deployment command is:

```sh
python3 "$REVIEW/be01-services-dependency-stage.py" \
  "$REVIEW/be01-services-dependencies-review.tar" \
  "$REVIEW/be01-services-dependency-stage.sha256" "$SOURCE"
```

This is staging, not host test execution. SOURCE must be `/home/tanzeel/elevateo-mail-tests-20261012-ultra/lane-c-20261012`. Authenticate the review manifest itself against9108c628 before checking its four entries. Inspect both exact targets freshly before deployment; any partial/existing target requires reconciliation, never overwrite. Capture staging exit and independently verify both packages, dependencies and canonical52 afterward. Then the unchanged six-file stager can supply tools, followed by the reviewed jq-first lifecycle. This deployment-first bootstrap relies on static acceptance; it does not claim prior runtime proof of the new stager.

Only after jq PASS, independent cleanup and pinned Python authentication, proposed supplemental regression command (REVIEW readable as UID10001, SOURCE unchanged):

```sh
task="be01dependencystage-$(cat /proc/sys/kernel/random/uuid)"
timeout -k 5s 90s docker --context default run --rm --pull never --name "$task" \
  --label "org.elevateo.stage-task=$task" --network none --read-only --user 10001:10001 \
  --cpus 0.5 --memory 256m --memory-swap 256m --pids-limit 64 --cap-drop ALL \
  --security-opt no-new-privileges --tmpfs /tmp:rw,noexec,nosuid,nodev,size=32m,mode=1777 \
  --mount "type=bind,src=$REVIEW,dst=/review,readonly" \
  --mount "type=bind,src=$SOURCE,dst=/src,readonly" \
  --env PYTHONDONTWRITEBYTECODE=1 --entrypoint python3 \
  python@sha256:f040863673aea2570c3ff6a5c3fb4c673a016cbc5375005ad145915922b6b78a \
  -B /review/be01-services-dependency-stage-regression.py
```

Expected oracle: six tests, zero failures/errors. Record actual transport/test/inventory/source/image-cleanup exits separately and raw df-B1 before/after. Do not mask timeout or missing status. Check this exact new task name/label independently; old inventory prefix filters do not cover it. If retained, inspect exact ID, ownership and read-only mounts before any separately accepted cleanup; uncertain resources remain. Preserve shared/preexisting images; remove only a sole-task acquired Python image after all accepted Python checks using existing ownership evidence and non-force removal. No broad prune. No full services lifecycle is authorized by this packet.

## Authenticated delivery freeze

Local five-file delivery archive: `C:/Users/Tanzeel/AppData/Local/Temp/be01-dependency-delivery-5a8be0df-aef1-4a8e-8215-35e1169223ef.tar`.
SHA256: `574b820a3b0cd1456d4f33d12a2ff0294e2e7a4410c49f9f0deb2f00724e8292`.

Exact outer members, all regular files at archive root:

- be01-services-dependency-stage.py
- be01-services-dependency-stage-regression.py
- be01-services-dependency-stage-review.sha256
- be01-services-dependency-stage.sha256
- be01-services-dependencies-review.tar

On a separately authorized lease, transfer to a fresh private evidence directory, verify the complete outer archive SHA before reading members. Require these exact five unique regular members, no links or other members. Materialize only in a fresh review directory, set that newly created directory0755 and these files0644 for the UID10001 bind; leave private evidence parents unchanged and use a separately traversable source path for the bind. Verify review manifest SHA9108c62875ded410014aff77e9577fbd4ae5db243486fe55c239089910fec6ff and its four entries before executing anything. Do not unpack the nested24-file archive; the frozen stager reads it in memory. Stop on any preexisting target, authentication failure or partial copy; preserve evidence.

The capped Docker command above is the concrete supplemental runtime proposal. Existing jq-first and Python identity/acquisition gates still apply; this archive is not permission to reserve fleet or execute. Preserve original Python suites and resource reconciliation. No tests were executed during packaging. Static review closure supersedes earlier pending-review wording in this document; no executable hash changed.