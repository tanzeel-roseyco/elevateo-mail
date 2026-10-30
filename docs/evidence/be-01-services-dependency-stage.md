# Executable follow-up frozen for review

The separate135-line stager and153-line Docker-only regression are now authored and frozen; parent correctness/design reviews assigned, outcomes pending. See [executable freeze and invocation](be-01-services-dependency-stager-freeze.md). The original procedure and packaging checkpoint below remain historical evidence. No remote mutation or tests; fleet released.

# Missing dependency additive staging packet

Prepared locally for parent review. Fleet reservation is RELEASED. No remote mutation, Docker test, paid call or ultrareview. This packet supplies previously reviewed bytes only; it does not authorize full services or alter the frozen six-file stager.

## Exact input freeze

- Local archive: `C:/Users/Tanzeel/AppData/Local/Temp/be01-services-dependencies-review.tar`
- Archive SHA256: `f9455d2fb3e66412fc6ac7c171027d9745c1163cf6a8e883d493d5c3dccc826a`
- Exact 24-path allowlist and per-file SHA256: [be01-services-dependency-stage.sha256](scripts/be01-services-dependency-stage.sha256)
- Allowlist SHA256: `0297f2c03e3049b1746829907e589fbda5847357c47af6bcd079d48f1a0a27c2`
- Adapter package SHA256: `3044a0e2df4daa6cf5372e1edd90c609f5ed9d91a2b874842e97710d09694787`
- Fixture package SHA256: `028c90c20b356ffaa8c4ba285524d4835dd8513685c096aa41acaa12b22a476d`
- Adapter dependency manifest SHA256: `b1a60a9948b4fc24288ce469a5852fb11eb321c008c6a4d821789d93622b4263`

Archive contains exactly14 regular adapter files under `ops/tools/be01-services/` and10 regular fixture files under `ops/tests/be01-services/`, including their manifests. No other directory or file is included. Archive modes are not deployment permissions: deploy directories0755/files0644 explicitly, never inherit archive mode0666. No general tar extraction is proposed.

The local checkout was read into separate LF staging bytes; every payload was checked against its accepted package hash before archive creation. Original checkout files were not rewritten. Both package manifest pins match their accepted final freezes. Local archive listing confirms24 regular members. These are packaging checks, not execution tests. Canonical52 has no entry in this archive and is never normalized or repinned.

## Review provenance

Fixture code:484 unique LOC/zero defects;179 overlapping design LOC/zero. Original adapter:488 unique LOC/one P2,2.05/KLOC;164 overlapping design LOC/zero. Marker repair:132 LOC/zero new defects, prior P2 resolved statically. The final fixture.sh and four-case fixture-regression.sh are included. See [marker repair](be-01-services-marker-repair.md) and [fixture freeze](be-01-real-services-acceptance.md). No new implementation or new code-review PASS is claimed by this packaging operation. Existing code/runtime limits remain.

## Proposed bounded deployment operation for review

Destination root is exactly `/home/tanzeel/elevateo-mail-tests-20261012-ultra/lane-c-20261012`. A fresh coordinator lease and acceptance of this staging addition precede remote mutation.

1. Transfer archive and external24-entry manifest to a new private evidence directory. Authenticate both complete SHA256 values above before parsing. Read archive payloads without extracting member paths. Require exactly24 unique regular members whose names equal the authenticated allowlist; reject duplicates, links, directories, extra names, absolute paths and traversal. Require each payload hash to match before writing any canonical destination. Preserve original transfer bytes and logs.
2. Resolve the canonical root and inspect each ancestor of the two destinations (`ops`, `ops/tools`, `ops/tests`): existing directories, no symlinks, existing traversal suitable for UID10001. Do not chmod existing ancestors or evidence directories. Verify canonical source manifest03d590dd and all52 entries before writes.
3. Check BOTH exact targets with existence AND symlink checks before creating either: `ops/tools/be01-services` and `ops/tests/be01-services`. Both must be absent. Any existing target, including an empty directory or dangling symlink, stops deployment without overwrite or removal. A partially staged prior attempt is retained for reconciliation; never retry over it.
4. Authenticate adapter dependencies against already-staged canonical files before creating either destination. The fixture package dependency is verified against its authenticated incoming bytes. All other dependencies are read-only: fleet02-egress-resources.sh, fleet02-egress-compose.sh, fleet02-egress-baked.rb, compose.fleet02-egress.yaml and source manifest. Compare exact hashes from the frozen dependency manifest; any absent/mismatched dependency stops deployment. Do not widen this archive to repair it silently.
5. Create each exact target exclusively and set only the newly created directory to0755, independent of caller umask077. Copy only authenticated bytes through exclusive file creation, set0644, never execute payloads. This is a two-directory deployment, not an atomic transaction: an I/O failure after first creation must retain partial state and report its exact paths; no automatic rollback/delete/retry.
6. Independently verify both package pins, all package entries, dependency entries, exact directory file sets, and canonical52 after staging. Record actual staging/source/authentication exits. Mode checks do not prove alternate-UID access; the existing Docker UID10001 preflight remains required.
7. Only after complete verification may the unchanged accepted six-file tools stager3bcafad3 stage archiveab611aff into absent `ops/tools/be01-services-tools`. Then follow the reviewed identity supplement and jq-first packet. Full Auth/Storage/persistence/bootstrap execution remains excluded.

Parent review should assess the24-entry authenticated file set, inherited dependency pins, absent-target/symlink refusal, umask handling and partial-copy preservation. This packet specifies the deployment procedure; no new remote stager was installed or executed. Any executable adaptation of the existing stager must be frozen and reviewed before use, rather than changing its hardcoded six-file allowlist at runtime.

## Current evidence and status

[Read-only prerequisite checkpoint](be-01-identity-preflight-prerequisites.md): preflight1, canonical source0, follow-up SSH0/inventory0. Both dependency directories, tools directory and identity destination absent. No task resource was created. All staging, jq and Python tests remain NOT_STARTED; no cleanup mutation was needed. Fleet remains released while this packet is reviewed. Shared/persistent resources preserved.
