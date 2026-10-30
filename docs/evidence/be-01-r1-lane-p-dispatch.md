Lane P activation repair: independent bounded code and dedicated design reviews both PASS, zero confirmed defects, 140 executable LOC / 155 including manifests, 0/KLOC; overlap counted once. All six hashes verified unchanged; dispatcher manifest 4509ce8417eb93167847a67093b435eb000e11b1e82755e8ddcd0803402cdb25. Authenticated six-file LF archive including gems.rb and proposed rerun commands prepared locally; see docs/evidence/be-01-r1-lane-p-rerun.md. Frontend r8 retains fleet-02 reservation. No remote staging, Docker rerun or ultrareviews; runtime and native Windows acceptance remain pending. Earlier review-pending statements are historical.

Current Lane P result: FAILED before assertions (SSH exit=1, test_exit=1, cleanup_failed=0); child Ruby could not require minitest/mock. Independent worker and parent inventories confirm exact task resources absent, shared bases retained. Backend fleet reservation released to frontend r8. Six-file tools-only gem activation repair is frozen for parent review; no rerun until review and reservation return. Canonical source/test/harness remain unchanged. See docs/evidence/be-01-r1-lane-p-activation.md for hashes, regression prerequisite and cleanup evidence. Earlier pending/running statements below are historical. No native Windows acceptance or ultrareviews.

Lane P dispatcher reviews PASS: zero confirmed defects, 116 executable LOC / 126 including manifest, overlapping coverage counted once; design review 291 LOC including reused context. Parent granted exclusive fleet-02 reservation for authenticated Lane P staging/validation; execution pending. No native Windows claim or ultrareviews.

# Lane P separate dispatcher — review pending

The package's two independent reviews passed: zero static defects over 40 executable plus 90 provenance LOC, 130 unique LOC, 0/KLOC. Overlap is counted once. This dispatcher has not been reviewed or executed. No Docker, host tests, remote execution or ultrareviews occurred during authoring. Fleet reservation remains released.

## Boundary and reuse

New files live only under ops/tools/lane-p-dispatch. Existing package, product, Lane C, app and synthetic lifecycle bytes remain frozen. The dispatcher authenticates the package, canonical 52-file source manifest and unchanged harness. Source pins remain canonical LF; never regenerate them from the CRLF checkout. The parent must authenticate the dispatch manifest against this packet BEFORE launching; it binds the dispatcher and every sourced helper. Existing resource helper and supported Buildx JSON inventory/cleanup are sourced unchanged by hash.

Strict short hostname Ubuntu-noble-latest-amd64-base; explicit selected local Docker context; rejects DOCKER_HOST/TLS overrides. Already-present immutable Ruby and BuildKit images are inspected before mutation. Dedicated builder: 2CPU/2GiB. Build context contains only Dockerfile/checks.sh. Build permits the checksum-pinned upstream downloads described in the package provenance; runtime is network-none and socket-free. Runtime is UID10001, read-only source/root, 1CPU/1GiB, pids128, capabilities dropped, no-new-privileges, /tmp128MiB noexec/nosuid/nodev. Source readability is checked at the same UID/profile before builder creation. Source/package hashes are rechecked after build and successful tests.

Outer deadline1200s + kill grace180s; daemon calls10s by default, bootstrap180s, build720s, each runtime120s, per-call kill grace3s. Timeout or uncertain ownership preserves resources; cleanup status must be independently checked, never inferred from the shell exit alone. Frozen cleanup checks exact ownership/mounts/caps and recovers task-labelled partial loads, removes verified builder registration/cache and task images without broad prune. Its full-profile fingerprint remains conservative: any unexpected serialization change on a retained runtime can cause retention rather than deletion.

## Parent execution prerequisites and command (NOT executed)

First complete bounded dispatcher review and reacquire fleet reservation. Stage new files as LF without modifying canonical source or existing package. Authenticate dispatch.sha256 against the digest below, then verify its entries and the package manifest. Parent must pre-stage both digest references embedded in parent-run.sh and ensure source directories are readable/traversable by UID10001. Run syntax checks inside a reviewed Docker image before lifecycle execution. Existing cleanup regression evidence is reuse evidence; it does not validate this new dispatcher. New runtime acceptance requires the unchanged Lane P oracle (9 tests/48 assertions, zero failures/errors/skips).

```bash
cd /home/tanzeel/elevateo-mail-tests-20261012-ultra/lane-c-20261012
printf '%s  %s\n' d8697801281bb09109c1ac5953c0ace3aea31fc7c340071c87777813f59ad03b ops/tools/lane-p-dispatch/dispatch.sha256 | sha256sum -c -
sha256sum -c ops/tools/lane-p-dispatch/dispatch.sha256
TOOLS_SOURCE="$PWD" TOOLS_CONTEXT=default TOOLS_HOST=Ubuntu-noble-latest-amd64-base \
TOOLS_EVIDENCE=/home/tanzeel/elevateo-mail-tests-20261012-ultra \
bash ops/tools/lane-p-dispatch/parent-run.sh
```

Use default only after verifying it is the reserved local daemon. Capture complete console, shell exit, checks.log and cleanup test_exit/cleanup_failed. Independently inventory exact names/IDs/nonce labels across containers, images, cache volume and Buildx registry; capture host bytes and Docker usage. Do not release reservation while cleanup is uncertain. No network is created by this lane. Linux pwsh PASS would not prove native Windows acceptance or actual PowerShell Docker orchestration.

## Frozen new files
- `ops/tools/lane-p-dispatch/parent-run.sh` — 83 LOC — `a480c2a4285f0418a8364f01111197a50c598d63048744f309d996ebef17194e`
- `ops/tools/lane-p-dispatch/run-container.sh` — 24 LOC — `3b847a5faa7a59b3c0f8cf325d91429f1d9a5be757fb5ffe29975f9bedde7289`
- `ops/tools/lane-p-dispatch/preflight.sh` — 9 LOC — `bbded0f0293175732e60c42251b54bc1010a3f895ea5b6d49bd37f05f6dfc613`
- `ops/tools/lane-p-dispatch/dispatch.sha256` — 10 LOC — `d8697801281bb09109c1ac5953c0ace3aea31fc7c340071c87777813f59ad03b`
