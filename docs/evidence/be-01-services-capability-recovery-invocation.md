# Exact retained-resource recovery invocation — proposed, NOT_RUN

No recovery allocation exists. Validation lease is released. Reuse the authenticated immutable delivery already staged at:
`/home/tanzeel/elevateo-mail-tests-20261012-ultra/be01-recovery-validation-audit.DIGxywd8/source`.
Do not restage, overwrite, repin or retry over evidence. The four-file manifest is a727ce2126c4294b8481a9c85c146ac11fb8cf71e79d8100119531439bae1a42; exact four file hashes and267 reviewed LOC are listed in be-01-services-capability-volume-image-freeze.md. Profile d7e8a7d982b4e9bac6bbca3daf8f13494a8181a40d4d704dcd7a28fc93b9b633. Authenticated ten-member delivery manifest3c388c9889c007055671592b3d4ad758d77eaf9817c2779fcfb36223b14e3318 covers all of these.

## Before any allocation is consumed

Coordinator must grant volume recovery separately (propose15 minutes plus independent reconciliation). Fresh bounded reads must confirm expected hostname/default Unix context, no conflicting task lease/workload, adequate RAM/disk, canonical52, structural volume.rb pin1c9e6f6a, all four historical volume identity and empty-intent pins, historical app output provenance, four old probe IDs absent, and current zero consumers. The script repeats identity/provenance/consumer checks; prior observations are not reusable permission to delete changed resources. No global-idleness requirement. Shared resources remain untouched.

The parent source directory is0755 under private0700 audit. Recovery runs as the authenticated host user; probes bind the unchanged canonical source directly, not this private delivery. Existing ancestors remain unchanged. Evidence directories below must be absent, including dangling links. Capture SSH exit separately on the local coordinator; upload an LF invocation rather than nested shell quoting when authorized.

## Volume phase only: authenticated exact command

```bash
set -euo pipefail
umask 077
AUDIT=/home/tanzeel/elevateo-mail-tests-20261012-ultra/be01-recovery-validation-audit.DIGxywd8
DELIVERY=$AUDIT/source
cd "$DELIVERY"
printf '%s  %s\n' 3c388c9889c007055671592b3d4ad758d77eaf9817c2779fcfb36223b14e3318 validation.sha256 | sha256sum -c -
sha256sum -c validation.sha256
[[ ! -e $AUDIT/recovery-volumes && ! -L $AUDIT/recovery-volumes ]]
set +e
RECOVERY_APPROVED=capability-four-volumes RECOVERY_INSPECTOR="$DELIVERY/profile.jq" RECOVERY_EVIDENCE="$AUDIT/recovery-volumes" timeout -k 35s 640s bash "$DELIVERY/be01-capability-volume-recovery.sh" </dev/null > "$AUDIT/recovery-volumes.console" 2>&1
volume_transport_status=$?
set -e
printf 'volume_process_exit=%s\n' "$volume_transport_status" > "$AUDIT/recovery-volumes.process.status"
exit "$volume_transport_status"
```

Driver inner bound600s+30s, daemon15s+3s, each probe start30s+3s. All four exact identities/zero-consumer checks precede all four readonly volume-nocopy content probes. Original volume.rb structural oracle, repaired profile, before/after/fresh fingerprints, exited0/exact output and non-force probe removal apply. All four content/status/cleanup proofs precede volume deletion. Each removal repeats historical identity and zero-consumer checks. Failures retain uncertain probes/volumes; no failed-lifecycle cleanup reuse. Contents may include sensitive records: keep raw evidence0700; report booleans/statuses only.

After termination, independently run successful bounded full container/volume/image/buildx inventories. Read each `content-*/name`, `id`, `status` without sourcing shell text; require all actual probe IDs/names and task labels absent. Match all four exact volume names and lane label against successful inventories. Verify unchanged app/base/shared image identities and shared builders, source hashes and df-B1. Capture volume_exit, phase, removed count, each content/probe_cleanup/absence status, final source/inventory and independent inventory separately. Missing statuses or failed inventories are uncertainty, never zero. Stop on any failure; reconcile exact names/specs read-only, never automatic retry/removal. Root acceptance is required before the image phase.

## Separate final image phase: only after volume acceptance and allocation

Fresh evidence path must be absent. Reauthenticate the same delivery first. Proposed command:

```bash
set -euo pipefail
umask 077
AUDIT=/home/tanzeel/elevateo-mail-tests-20261012-ultra/be01-recovery-validation-audit.DIGxywd8
DELIVERY=$AUDIT/source
cd "$DELIVERY"
printf '%s  validation.sha256\n' 3c388c9889c007055671592b3d4ad758d77eaf9817c2779fcfb36223b14e3318 | sha256sum -c -
sha256sum -c validation.sha256
[[ ! -e $AUDIT/recovery-image && ! -L $AUDIT/recovery-image ]]
set +e
RECOVERY_APPROVED=capability-exact-image RECOVERY_EVIDENCE="$AUDIT/recovery-image" timeout -k 15s 140s bash "$DELIVERY/be01-capability-image-recovery.sh" --remove </dev/null > "$AUDIT/recovery-image.console" 2>&1
image_process_status=$?
set -e
printf 'image_process_exit=%s\n' "$image_process_status" > "$AUDIT/recovery-image.process.status"
exit "$image_process_status"
```

Inner bound120s+10s. Historical identities/preexisting-images hashes, exact sole tag/digest/config/label provenance, twice-fresh identity and complete batched consumer ID-set validation must pass; at most1000 containers, disappearing/changing IDs fail closed. Exact and labelled volumes must be absent. Remove only sha256:7d755994b0456f71886c92ec548e55b64f58d0c8a579c14cde401f23b715b0f8 using non-force `docker image rm --no-prune`. No parent deletion or broader pruning.

Independent successful full inventories must exclude exact image ID/tag and all recovery containers/volumes; compare all other prior image IDs, shared builder and pinned bases. Capture image_exit/mode/phase, removal/absence/shared-retention statuses, independent inventory/source statuses and raw df delta. Retain unknown resources and evidence on timeout/failure; no automatic retries. No full-services rerun or Auth/Storage acceptance is authorized by either recovery phase.

Volume-only attempt stopped before execution: fresh preflight SSH0; additional SSH regex guard lost quotation, local interrupted session exit1/actual SSH status unknown. Independent read-only reconciliation SSH0 proves recovery NOT_STARTED, no probes, unchanged four volume identities/app/shared images/builders/canonical52. Recovery phase/content/cleanup statuses missing, not PASS. Raw shared-host delta -7766016 bytes. Reservation HELD for root independent reconciliation; no retry. See docs/evidence/be-01-services-capability-volume-attempt.md. Auth/private Storage/restart pending.

Coordinator independently reconciled via SSH0 and RELEASED reservation 0d0ee0ad-381d-4f53-8043-c5bb767b2324. Recovery NOT_STARTED; four volumes/app image retained. No retry or remote allocation. Local transport correction41LOC frozen for bounded review; see docs/evidence/be-01-services-capability-volume-transport-freeze.md. Prior HELD wording is historical.
