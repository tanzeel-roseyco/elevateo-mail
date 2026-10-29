# Next exact-image recovery — coordinator inspection packet

Local preparation only. BE-VOLUME-RECOVERY-20261012-01 accepted/CLOSED; no image allocation. Request a separate 10-minute image-only slot plus mandatory independent reconciliation. No service execution, pulls/builds, capability staging, Python removal or retries.

## Frozen inputs and scope

Reuse existing /home/tanzeel/elevateo-mail-tests-20261012-ultra/be01-recovery-validation-audit.DIGxywd8/source. No restaging/repinning. Frozen image helper85LOC SHA256 8ac8a690a9dd1e31a71b226bdf10d0cc9eca04381c94c51c0c1b771deb7b8348. Four-member manifest a727ce2126c4294b8481a9c85c146ac11fb8cf71e79d8100119531439bae1a42; delivery validation.sha256 3c388c9889c007055671592b3d4ad758d77eaf9817c2779fcfb36223b14e3318. Prior267LOC recovery closure and socket-free no-prune/daemon-failure/original-discrimination PASS apply; actual image removal remains NOT_RUN.

Only authorized prospective deletion: sha256:7d755994b0456f71886c92ec548e55b64f58d0c8a579c14cde401f23b715b0f8 using exact non-force docker image rm --no-prune. No parent-image deletion. Its sole tag is be01servicesapp-00ef5f0b-5d3a-4285-813b-b9895a0bc443:app.

## Fresh prerequisites before mutation

Bound read-only preflight240+30 seconds, each daemon call15+3. Require fresh coordinator allocation, expected short hostname Ubuntu-noble-latest-amd64-base, default unix:///var/run/docker.sock, no DOCKER_HOST/TLS/CERT overrides, no conflicting task workload; shared global idleness is unnecessary. Record df-B1 and available RAM; retain existing floor10GiB disk/4GiB RAM. Successful full container/image/volume/builder inventories are mandatory.

Reauthenticate delivery manifest and every entry, helper full hash above, canonical52 manifest03d590ddaa39b22c6b1851c9911405473c0b01b0a50fff08001144e66a14638b and its entries, staged transport manifest8a9613df9d49c86a4f05748a75365a51b0cac7d60e406d30efb2598103fb40a7 and entries. Require regular nonsymlink immutable inputs. Authenticate historical app identities380cb63781dc296acd718b82523302bdf2504b08c80a9e4c7bdc9efaf8604930 and preexisting-images57b2d5ae5322297d79e3d709bc2495c2cc66fa8283f5cc3d178ed54e6f2f72c7 under be01servicesapp-00ef5f0b-5d3a-4285-813b-b9895a0bc443.qiDe2B.

Verify accepted volume recovery status removed4/complete and all four content/cleanup statuses; fresh successful inventories must independently exclude the four captured probe IDs (result document), task names/labels, and exact config/data/state/storage volumes. Do not use failed inspect as absence proof.

Run frozen helper --verify once with a fresh private preflight evidence path before removal. This authenticates historical nonpreexisting task ownership, sole tag/digest, UID10001, no declared volumes, exact run label, twice-fresh identity and complete batched consumer-ID set (maximum1000). Any disappearing container or failed inspect stops. Its read-only result must be image_exit0 mode=--verify phase=complete. Mutation repeats these checks internally and repeats exact/labelled volume absence.

Capture stable Pythonf0408636/Ruby22165c5f/BuildKitcec9f139 IDs/digests/labels and builders against accepted c264cead independent baseline. Require absent including dangling links: DIGxywd8/recovery-image, recovery-image.console, recovery-image.process.status. Fresh evidence private0700; do not chmod ancestors. Raw image Config/inspect evidence remains private, never print it.

## Exact previously reviewed invocation after allocation and gates

Save the following as LF, upload to fresh private delivery and authenticate its full locally calculated SHA before invoking with stdin /dev/null. Capture native SSH status immediately. This is the unchanged image block from be-01-services-capability-recovery-invocation.md; absent console/status gates above prevent overwrite.

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

Inner120+10 seconds, outer140+15; missing status after timeout is UNKNOWN. No automatic retry or cleanup on ambiguous termination.

## Independent reconciliation after every outcome

Fresh bounded240+30 read-only audit with explicit native SSH/process statuses. Read helper status/image removal/absence statuses and console without sourcing text. Capture successful full image ID/tag inventories: exact target ID and tag absent on success, all other before-image IDs retained. Compare shared bases/Python stable identities and builders; preserve unexpected resources. Do not require unordered formatted whole-host lists byte-identical. Missing unrelated prior image requires reporting uncertainty, not deleting/recreating anything.

Successful full container names/IDs/labels and volume inventories must prove four recovered probes/task containers and volumes remain absent. Reauthenticate canonical52/delivery/transport source; record source, image absence, shared retention, container/volume inventory, builders and independent process/SSH exits separately. Record raw df-B1 before/after, never attribute shared-host delta to this removal. If target remains or identity changes, inspect read-only and retain; no force or retry. Hold for coordinator acceptance after exact reconciliation.

Historical auto-removed transport IDs UNKNOWN and Python retained disposition remain separate. Image recovery is cleanup evidence only, not real Auth/private Storage/restart-before-reseed acceptance. Full-services still requires its own reviewed packet and allocation.
