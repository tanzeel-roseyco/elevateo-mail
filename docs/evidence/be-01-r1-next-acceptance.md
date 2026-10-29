Current checkpoint: actual Lane C and Linux Lane P PASS with exact cleanup; parent verified Lane P 9/48/0. FE owns fleet-02. Lane P2/native Windows and remaining B01 checks are pending. Earlier results/proposals below are historical. See be-01-r1-lane-p-result.md and ../be-02-readiness-handoff.md.

Current Lane P result: FAILED before assertions (SSH exit=1, test_exit=1, cleanup_failed=0); child Ruby could not require minitest/mock. Independent worker and parent inventories confirm exact task resources absent, shared bases retained. Backend fleet reservation released to frontend r8. Six-file tools-only gem activation repair is frozen for parent review; no rerun until review and reservation return. Canonical source/test/harness remain unchanged. See docs/evidence/be-01-r1-lane-p-activation.md for hashes, regression prerequisite and cleanup evidence. Earlier pending/running statements below are historical. No native Windows acceptance or ultrareviews.

Lane P package static reviews closed: two independent reviews, zero defects over 130 unique LOC (40 executable + 90 provenance), 0/KLOC. Separate dispatcher is frozen for bounded review at 116 executable LOC; see docs/evidence/be-01-r1-lane-p-dispatch.md. No execution; fleet reservation remains released. Linux pwsh and native Windows acceptance remain pending and distinct. Prior review-pending package statements below are historical.

Lane P prerequisite selection prepared autonomously: separate immutable-input Ruby 3.4.11 + PowerShell 7.4.20 tools Dockerfile (29 LOC) and checks (11 LOC), official release/registry/gem checksum evidence and manifest are frozen for parent bounded review. See docs/evidence/be-01-r1-lane-p-tools.md. No Docker build/test or remote execution; output image ID and Linux pwsh validation pending. Native Windows and Lane P2 remain separate. Existing execution bytes/canonical source unchanged. Fleet reservation remains released; no ultrareviews. This supersedes the earlier request for the user to select an image.

Current verified checkpoint: actual Lane C Compose PASS, parent and child test_exit=0 cleanup_failed=0, SSH exit=0. Parent be01app-11aefacf-f5d7-40af-9bd7-711d97429044.aHk1UD; child be01r1-2b13e3b0-9a83-4804-a313-473cc151fe14.wJSJkA. Independent fresh exact IDs/names/labels and builder inventories confirm task resources absent; old retained tool recovery also completed. Frozen source/scripts unchanged. PowerShell acceptance remains pending: reviewed immutable Ruby+pwsh image pin is missing; Linux fleet-02 cannot establish native Windows acceptance. No PowerShell test was launched or passed. Fleet reservation released after verified cleanup; reacquire before future execution. Earlier running/retained/pending statements below are historical. Lane C is not whole BE01 completion. See docs/evidence/be-01-r1-lane-c-hostname.md.
# Next bounded backend acceptance: parent review proposal

Status: Lane C is now implemented for review; Lane P remains prepared and Lane P2 remains proposed. This is not execution authorization or an acceptance result. No additional ultrareview. Parent owns fleet-02 builds, execution and bounded review. Keep all R3b backend sources, full runner, helper and existing regression harness frozen. R3b passed required_failures=0 / cleanup_exit=0; it did not launch the actual seven-service Compose topology or execute PowerShell.

## Files and review boundaries

Lane C files, exact hashes, added line counts and parent prerequisites are recorded in [the concrete implementation handoff](be-01-r1-lane-c.md). The frozen originals remain unchanged. Each new module is below 200 lines; parent owns bounded review. No new independent review count or zero-defect claim is made.

Lane P uses the existing 24-line `ops/tests/fleet02_powershell_protocol.sh`. Lane P2's capped PowerShell orchestration adapter is still proposed, not implemented.

## Lane P: PowerShell assertion/pipeline protocol

Prepared harness SHA256: `5c011bd57503af6d17f570a3b2793e7e255c5c45bd50b79dcc6f5aeecc861701`.

Use a prebuilt immutable tools image containing Bash, coreutils, Ruby, the listed gems and a working `pwsh` in PATH. Parent must record its image ID/digest and versions. A Ruby-only image will fail the prerequisite rather than skip. Source tree must contain the exact frozen egress test, both original wrappers, probe and assertion files (all five hashes are checked by the harness). Do not mount a Docker socket, credentials or host home. Tools image preparation is a separate capped Docker build with task-owned builder cleanup; it is not covered by R3b.

Proposed parent command after image/hash review (variables intentionally require real parent-selected paths and immutable image reference):

```sh
: "${PS_TOOLS_IMAGE:?Set reviewed immutable Ruby+PowerShell tools image}"
: "${R1_SOURCE:?Set absolute read-only staged source root}"
: "${R1_EVIDENCE:?Set fresh private evidence directory}"
case "$PS_TOOLS_IMAGE" in *@sha256:*|sha256:*) ;; *) exit 2 ;; esac
protocol_name="be01ps-$(cat /proc/sys/kernel/random/uuid)"
timeout --signal=TERM --kill-after=15s 120s docker run --rm \
  --name "$protocol_name" --label "elevateo.r1.protocol=$protocol_name" \
  --network none --read-only --user 10001:10001 \
  --cpus 1 --memory 1g --memory-swap 1g --pids-limit 128 \
  --cap-drop ALL --security-opt no-new-privileges \
  --tmpfs /tmp:rw,noexec,nosuid,nodev,size=128m,mode=1777 \
  -e HOME=/tmp -e DOTNET_CLI_HOME=/tmp -e TMPDIR=/tmp \
  --mount "type=bind,src=$R1_SOURCE,dst=/src,readonly" \
  --entrypoint bash "$PS_TOOLS_IMAGE" \
  /src/ops/tests/fleet02_powershell_protocol.sh > "$R1_EVIDENCE/powershell-protocol.log" 2>&1
```

Budget 1 CPU/1 GiB allows repeated PowerShell startup while remaining bounded on the shared host. Internal test timeout is 90 seconds; outer deadline includes cleanup grace. Parent captures original exit status immediately. `--rm` alone is not a timeout-cleanup guarantee: after every outcome parent inspects the exact name, verifies invocation label, no volume mounts, only expected read-only source bind, tmpfs and caps, then stops/removes only a surviving verified task container. No prune or shared-image deletion. Verify absence and record retained resources. Full inspection includes no supplied credentials but should still not be dumped indiscriminately into shared logs.

Oracle: all nine existing tests execute, expected 48 assertions, zero failures/errors/skips. The real unrestricted checker must receive pipeline JSON; the real denial checker must return exit 42 plus exact token. Injected Docker exits 0/1/125, empty output, incorrect token and exit42 without token must fail. Existing suite covers these independently. The harness uses a synthetic Docker function; passing proves PowerShell pipeline and LASTEXITCODE behavior for extracted assertion functions, not real Docker orchestration or Windows behavior. Failure or timeout is not a pass; no automated retries.

## Lane C: actual Compose namespace egress

Implemented separately from the R3b validated sources. See [Lane C implementation handoff](be-01-r1-lane-c.md) for the source/package manifests, driver, override, minimal shell orchestration adapter, synthetic inspection regression, exact limits and cleanup. Parent review and all Docker execution remain pending. The implemented interface and resource design supersede this document's earlier proposal.

## Lane P2: real PowerShell Docker orchestration / native platform boundary

After Lane P and shell Lane C pass, use the separately reviewed capped PowerShell wrapper against the same fresh actual Compose profile. Parent may run Linux PowerShell orchestration in a pinned tools container with Docker CLI and explicit access to the test daemon. That socket grants daemon control and belongs only in this orchestration lane, never Lane P. Bind the staged repository at the SAME absolute path inside the tools container so Docker bind mounts computed from PSScriptRoot resolve on the daemon host. Record this path mapping and socket access; do not assume `/src` works for sibling containers. Apply the same outer bounds and parent verified cleanup sweep on failures.

Proposed container command is `pwsh -NoLogo -NoProfile -File <same-absolute-source>/ops/tests/egress-check-fleet02.ps1 -Project <fresh-exact-project>`. Parent must review the complete container launch, tools digest, mounts and cleanup driver before dispatch; no ready-made socket-enabled launch is claimed here. Require identical controls and six-service verdicts plus zero retained unverified task resources. Native Windows/PowerShell and filesystem semantics remain a separate target-OS gate even if Linux pwsh passes.

Other acceptance gaps (legacy exploit oracle, broader static/type checks, environment/DSN leakage, real worker stop/stall, native clients and remaining BE-01 requirements) are not closed by these lanes. See the existing acceptance record for their full scope.
