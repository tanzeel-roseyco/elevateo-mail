Latest Python runtime PASS: dependency9, direct identity3, original1+3; transport/test/cleanup/inventory/source exits0. Exact task containers absent; sole-acquired Python f0408636 removed without force, shared builder/state/bases retained. Lease RELEASED. Raw shared-host delta +13697024 bytes, not attributable reclamation. See docs/evidence/be-01-services-python-result.md. Full-services remains pending: next reviewed tools socket-free checks, then separately reviewed app-parent wiring; see docs/evidence/be-01-services-next-runtime.md. Earlier pending/running checkpoints below are historical.

# Dependency staging bind-boundary repair freeze

Prior staging failed before canonical mutation because the guard required other-execute on private host home0750. Coordinator confirmed all targets absent. Lease RELEASED; no remote mutation, Docker or tests for this repair. Do not chmod host ancestors. Prior delivery574b820a remains historical and must not be rerun as repaired bytes.

Minimal repair passes the bind root explicitly to safe_directory. Every host ancestor still must be a real directory according to lstat (symlinks rejected); only the bind root and descendants require other-execute. Paths outside the bind root are rejected. The canonical absolute/resolved root guard remains. Docker daemon resolves host bind source; container UID traverses mounted root/descendants. This permission boundary change does not prove actual UID access or defeat concurrent path replacement; trusted exclusive filesystem boundary remains required.

| Frozen file under docs/evidence/scripts | Full LOC | SHA256 |
| --- | ---: | --- |
| be01-services-dependency-stage.py |139|`50eba803369041f19da5492d6b3def5333f08043f913a891a1c8268f94cab6c7`|
| be01-services-dependency-stage-regression.py |189|`4bb6d89a8fc41ecfb139c75231edcb01dc0d74a27b137c33c7d26fd983257e9c`|
| be01-services-dependency-stage-review.sha256 |4|`9d39e2e263a020b5cd4554bd865ca6b28a2dc9706291da80db7b645c1aca1836`|

Completed reviews: correctness139 plus regression189 =328 unique LOC, zero confirmed new defects,0/KLOC. Dedicated design139 overlaps/nonadditive, analytical only (Obsidian unavailable). Parent independently rehashed both executable pins. Prior288 LOC zero-defect static review remains historical; runtime subsequently exposed one guard compatibility defect, recorded separately. Static repair acceptance does not establish runtime acceptance. Parent inspected downstream tools/identity guards and found no identical host-other-execute requirement.

New regression cases (all NOT_RUN): private host parent0700 with traversable bind root succeeds and keeps parent mode unchanged; nontraversable bind root, ops ancestor and ops/tests each refuse with unchanged snapshots; symlink host ancestor refuses via canonical-root check without mutation. Six existing cases remain, total nine tests. Original guard fails the private-parent success oracle by static inspection; actual original-code discrimination has not run. Actual UID10001 Docker bind access remains required.

Dependency archivef9455d2f, allowlist0297f2c0, adapter3044a0e2, fixtures028c90c2, original six-file stager3bcafad3 and canonical52 remain unchanged. This modifies only two executable files and their review manifest; no payload repinning. Existing remote evidence is retained. A fresh staging lease remains required; no retry over any existing target. Existing capped Docker test proposal expects nine tests, subject to staging success and separate execution approval.

## Fresh authenticated delivery

Local path: `C:/Users/Tanzeel/AppData/Local/Temp/be01-dependency-repaired-de1405ab-3eb4-4a24-bb29-a7437147aa26.tar`

Outer SHA256: `200b242786e02c92e3f808a9f03669f4a9ffb6bf196c41089b433bfb73c207df`.

Verified local archive listing has exactly five unique regular flat members, no directories/links/extra paths:

- be01-services-dependency-stage.py
- be01-services-dependency-stage-regression.py
- be01-services-dependency-stage-review.sha256
- be01-services-dependency-stage.sha256
- be01-services-dependencies-review.tar

Each staged input hash was checked against its frozen pin before packaging. Packaging/listing/hashing are file operations, not tests. Execution bytes unchanged since review. Archive permissions are not deployment modes; use explicit0755 for newly created review directory and0644 files. Keep evidence parents private and unchanged.

After separate authorization, transfer to fresh evidence, authenticate outer SHA, exact five-member allowlist, review manifest9d39e2e and all four entries before materializing authenticated bytes. Do not reuse old delivery574b820a or edit the prior attempt in place. Do not generally extract nested24-member archive. Recheck both targets absent including dangling links, then the concrete dependency deployment command is:

```sh
SOURCE=/home/tanzeel/elevateo-mail-tests-20261012-ultra/lane-c-20261012
# REVIEW is the newly authenticated delivery directory; never the prior attempt's directory.
timeout -k 5s 90s python3 "$REVIEW/be01-services-dependency-stage.py" \
  "$REVIEW/be01-services-dependencies-review.tar" \
  "$REVIEW/be01-services-dependency-stage.sha256" "$SOURCE"
```

Capture deployment exit and independently verify canonical52, adapter/fixture packages and dependencies before unchanged tools staging. Stop on any mismatch/partial state. Tools and identity follow the already reviewed sequence, with exact absent-only `.acceptance` creation requiring renewed staging authorization. Jq remains blocked until coordinator accepts a successful staging report. No reservation, remote mutation, Docker, paid calls or ultrareviews in preparing this delivery.
