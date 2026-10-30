# BE01 bootstrap tools packet — candidate for remaining review

Preparation only. No host tests, Docker calls, SSH, fleet allocation, paid sessions or ultrareviews were performed for this repair. No runtime PASS. Full-services execution previously failed and remains unaccepted. No BE02 work. This document describes a future execution, not permission to execute it.

## Review provenance and scope

The coordinator supplied static closure for regression b511c3c1 (97 LOC; zero defects after the Open3 join HIGH and assertion-after-cleanup MED fixes). That file is unchanged. Parent22c6f91e plus fixture4572143c previously had 132 LOC plus60 dependency LOC reviewed with zero confirmed defects; this was not whole-packet approval. The subsequent parent/fixture/cleanup design review covered200 LOC, found1 MED (5 defects/KLOC), and used analytical simulations only; Obsidian was unavailable. The additional dependency review covered106 LOC with0 defects,298 cumulative per coordinator. Overlapping counts must not be summed as unique coverage.

The new MED was loss of fixture124 when post-test inspection returned1 under errexit. The production finalizer now records fixture, inspection and ownership results separately, preserves a nonzero fixture result, and fails a successful fixture when verification fails. Inspection failure skips ownership verification with explicit NOT_RUN. Status-record write errors also fail a successful fixture. The regression injection names were changed after the coordinator identified Bash dynamic-scope shadowing. Coordinator-supplied bounded re-review at regression ed678b60 and fixture eab086e6 covered52 LOC with0 defects (0/KLOC), statically closing both findings. Runtime remains NOT_RUN; this closure does not cover the new inventory/delivery/invocation/reconciliation controls.

Six bounded cases invoke the actual finalizer in a separate errexit-enabled bash: fixture124/inspect1 =>124; fixture0/inspect1 =>1; fixture124/ownership1 =>124; fixture0/ownership1 =>1; fixture124/verification0 =>124; all0 =>0. Each checks the original-status file and separate verification statuses, including whether ownership was called. Each subprocess has5s+1s termination grace; the parent wraps the suite at40s+2s. These are injected daemon outcomes, not a real180s timeout demonstration. The existing real bootstrap regression runs later in the combined tools image. Report-write failure, native Windows behavior and fixture105s-watchdog injection remain unproven.

## Authentication and delivery

`review.sha256` is the external review root; authenticate its SHA256 through the coordinator handback, then check every entry from this directory. `delivery.json` records every tar member's hash, bytes, physical lines and mode, plus workspace hash and any delivery-only CRLF-to-LF normalization. Existing upstream/canonical pins are never repinned to accommodate drift. `changes.patch` reconstructs and authenticates the two previous reviewed adapter hashes before showing the exact changed hunks. `review-lines.tsv` is a convenience index; authoritative hashes are in review.sha256.

`freeze.py` only reads/writes local files and creates a deterministic, content-addressed uncompressed tar (regular members,0644, uid/gid0, epoch mtime). It does not run application code or tests. Authenticated closure includes the canonical52 source files, adapter, bootstrap fixture, Lane P recipe/dispatch dependencies and new control scripts. Canonical application files are carried only for the existing parent's source verification; no application services run. Recipe provenance remains `ops/tools/lane-p-protocol/provenance.json`: Ruby3.4.11 pinned digest, PowerShell7.4.20 checksum and exact pinned gems. No image ID exists for this proposed build until runtime records it.

For a later authorized transfer, copy the exact review-listed files to a fresh private incoming directory, without replacing the canonical staged source. Authenticate review.sha256 out of band first; on the target, run `sha256sum -c review.sha256`. Use the archive filename in delivery.json as the literal ARCHIVE argument below; do not choose a different archive by glob. No remote transport is executed or accepted by this local preparation. The earlier fixed-path diagnostic bootstrap is not a proven long-running transport for this packet.

```sh
# Future target-side staging, only after remaining review and a separate allocation authorization.
python3 deliver.py ARCHIVE delivery.json /home/tanzeel/elevateo-mail-tests-20261012-ultra/be01-bootstrap-tools-review-r1
```

`deliver.py` verifies the entire archive and exact member set before writing regular bytes into a new canonical absolute directory. It changes modes only in that new tree (directories0755/files0644, needed by UID10001); existing ancestors stay unchanged. Failed/partial staging is retained for inspection, never overlaid or auto-retried. No secrets enter the archive. Authenticate the actual Python delivery script from the external review root before use.

## Concrete future invocation

Exclusive allocation, sufficient free space/memory for the2GiB builder and no conflicting workload are coordinator prerequisites. Existing default local Docker socket context, jq, GNU timeout, sha256sum, realpath, tar, Python3 and the retained Ruby/BuildKit/Python digest images must already exist; no install or pull fallback. Review the inventory scripts before use. They conservatively require at most300 containers,300 volumes and300 images per inventory (builders have the enclosing time bound only) and exact stable inventories; concurrent unrelated changes therefore require investigation rather than a clean verdict.

```sh
export TOOLS_SOURCE=/home/tanzeel/elevateo-mail-tests-20261012-ultra/be01-bootstrap-tools-review-r1
export TOOLS_CONTEXT=default
export TOOLS_HOST=Ubuntu-noble-latest-amd64-base
export TOOLS_EVIDENCE=/home/tanzeel/elevateo-mail-tests-20261012-ultra/be01-bootstrap-tools-review-r1-evidence
umask 077
mkdir -m 700 "$TOOLS_EVIDENCE"   # Must be new; stop on failure, never reuse an earlier attempt.
cd "$TOOLS_SOURCE"
sha256sum -c payload.sha256
bash docs/evidence/repairs/be01-bootstrap-tools/invoke.sh
# Record the native invocation exit immediately in the independently supervised caller.
```

`invoke.sh` has1800s+30s outer bound; parent has1200s+180s bound; Docker calls have individual bounds. The invocation saves the parent's returned status immediately, then runs read-only reconciliation even after a nonzero parent result. A killed wrapper may lack final status: UNKNOWN, not0. Do not use `set -e` in the supervising caller in a way that skips collection/reconciliation after failure. The supervisor must record native transport and caller statuses separately, and fetch the complete private audit path printed by invoke.sh. Missing/blank transport status stays UNKNOWN. No retry.

The parent first authenticates sources/readability and runs the six status regressions in the pinned Ruby container without a socket; then builds the combined Lane P image with the exact three-file context and runs the real bootstrap regression in a retained-for-inspection constrained fixture container. Actual fixture output is checks.log. Status-precedence output is status-regression.log. The dedicated nonce builder, cache, image and containers alone are candidates for the inherited verified cleanup.

## Independent cleanup and reporting

Run the authenticated `reconcile.sh AUDIT NEW_OUTPUT_DIRECTORY` independently after the parent stops, with the same exported context/host/source, including when invocation failed or transport was lost. AUDIT is the exact printed invocation audit path; NEW_OUTPUT_DIRECTORY must be fresh. Its180s+5s bound includes a120s+5s read-only inventory. It never deletes anything. Complete fresh inventories are compared with the pre-allocation baseline: container IDs/profiles, volume stable metadata, image IDs/tags/digests, builder registrations/endpoints and pinned image IDs. This proves no added surviving objects only when all required comparisons succeed. Container state is deliberately excluded; this is identity/retention evidence, not a service-health claim. The inventory is not an atomic daemon transaction; exclusive allocation and independent review are still required.

```sh
# Future independent invocation; AUDIT comes from the real invocation, never an invented suffix.
: "${AUDIT:?Set to the exact audit path recorded by invoke.sh}"
export TOOLS_SOURCE=/home/tanzeel/elevateo-mail-tests-20261012-ultra/be01-bootstrap-tools-review-r1
export TOOLS_CONTEXT=default TOOLS_HOST=Ubuntu-noble-latest-amd64-base
independent_exit=0
bash "$TOOLS_SOURCE/docs/evidence/repairs/be01-bootstrap-tools/reconcile.sh" \
  "$AUDIT" "$AUDIT/independent-01" || independent_exit=$?
printf 'independent_reconciliation_exit=%s\n' "$independent_exit"
# Record native caller/transport status separately and collect independent-01 even when this is nonzero.
```

Preserve `be01services-d07cdf3e-f525-49e2-8b35-e940eb3451c6-config` and require zero consumers. Before allocation its stable metadata must match the historical object under the prior full-services audit. Preserve all freshly observed baseline resources and shared pinned bases. Lane P preservation of `fe01r8-probes-stage` is historical: the coordinator cites FE docs/frontend-regression-repair-status.md483 for r10 empty/unattached inspection, removal and confirmed absence, and FE state.md91 for r11 final release e78cd0cc. Those are supplied chronology, not fresh remote observations by this preparation. Do not require or recreate that stage. Inventory records its current presence or absence, and complete exact before/after comparisons preserve the observed state; failed or ambiguous fresh gates remain UNKNOWN and require independent verification. Never mount or inspect retained config contents. No blind prune, forced shared-image removal, volume deletion by pattern, Docker/WSL disk deletion or compaction is part of this packet.

The report must keep these separate: native transport/caller exit; parent returned exit; parent's pre-cleanup test_exit and cleanup_failed; fixture test_exit; fixture inspect_exit/ownership_exit; independent reconciliation exit; source authentication; exact task ID/name/label absence; retained identities; Docker usage and raw host-free-byte delta. Parent test_exit is not necessarily the fixture result. A fixture124 remains124 even if verification fails; cleanup evidence may independently be failed or UNKNOWN. Missing task identity, incomplete inventories or changed ownership require retention and a separately reviewed exact-resource recovery packet. No inference from a Docker error to absence. Auto-removed readability/status containers may lack captured historical IDs; label/name and whole-inventory evidence cannot manufacture those IDs.

Collect the entire audit tree, including baseline, parent log, parent resource evidence, fixture verification/status files, build log/image ID, cleanup summary and independent output. Report actual removed identities and retained resources from evidence. Host free-space delta is shared-host change, not attributable reclaimed bytes. No resources were allocated or deleted during this preparation; reclaimed space is not measured.

## Remaining review assignments

Use review-lines.tsv and changes.patch for exact frozen hashes and physical ranges. Each assignment stays below200 lines: parent; fixture finalizer plus status regression; inventory; invoke plus reconcile; deliver.py; freeze.py; and a dedicated design review of status precedence, failure-path cleanup, authentication, bounds and retention. These are pending assignments for the coordinator, not newly spawned sessions. New scripts and the full packet have no independent approval yet. New-code defect count/density is NOT_ASSESSED; do not reuse earlier zero-defect counts as approval. All runtime cases are NOT_RUN. No publication or full-services acceptance.

## C1 status-write repair (runtime NOT_RUN)

Both post-parent evidence writes now capture failure without skipping the existing bounded reconciliation. Any nonzero parent result wins; parent0 fails on reconciliation or required evidence writing. Best-effort stderr diagnostics include both write statuses and cannot replace the selected exit. Missing evidence remains UNKNOWN; no successful write is inferred from native parent status.

The standalone socket-free Docker regression is `invoke-regression.sh`; it extracts the actual block beginning at `set +e` and runs that block in a separate errexit-enabled Bash process with parent/reconciliation stubs. Eight cases cover parent124 plus either failed write, parent0 plus either failed write, parent124/reconcile1, parent0/reconcile1, all0, and failed stderr diagnostics. This is post-parent control-flow coverage, not full inventory/daemon/outer-timeout coverage. Root must arrange a pinned socket-free container at UID10001, read-only source and writable /tmp, then run `timeout -k 2s 60s bash /src/docs/evidence/repairs/be01-bootstrap-tools/invoke-regression.sh`. No tests or syntax checks were run during repair; no parent/build/finalizer redesign or mount normalization was made.