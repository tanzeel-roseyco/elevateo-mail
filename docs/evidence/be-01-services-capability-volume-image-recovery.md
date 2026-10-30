Current update: four-probe recovery and coordinator independent reconciliation PASS; exact volumes/image retained. Final199-LOC execution static review closed0 defects; staging/launcher runtime remain pending. Earlier consumer/pending-review observations below are historical. New local executable proposal: be-01-services-capability-volume-image-freeze.md; no additional remote authorization.

# Separate retained volume and app-image recovery proposal

Preparation only; no mutation or runtime acceptance. Frozen199-LOC recovery/staging/launcher unchanged. This proposal does not invoke finish_services, fixture, or failed parent cleanup. New executable recovery must be bounded-reviewed before authorization.

## Read-only evidence

`C:/Users/Tanzeel/AppData/Local/Temp/be01-capability-volume-image-readonly.log`: SSH0 / READ_ONLY_EXIT=0. All daemon reads explicit default context,12s+3s; SSH120s+5s. No config/env secrets printed. Four historical volume identity comparisons true; each has exactly one listed Created probe. Image has the same four consumers. Zero-consumer prerequisite currently FAILS; no contents inspected or cleanup claimed.

Remote root `/home/tanzeel/elevateo-mail-tests-20261012-ultra`; task `be01services-6f1401a6-071b-475a-8c27-1a3de66edc4b`; registry `<root>/<task>.qXP5nL/resources`. Exact volume names are task plus `-config`, `-data`, `-state`, `-storage`.

| Historical snapshot | SHA256 |
|---|---|
|config.volume|7cf01d4cd847257fab5900eb980a1e275bbc556fe4b812bd5feb9ab681adaf17|
|data.volume|73067ea1144bcbde24bde0e474c40d179ac035936f0a7bad1a84a22ccfe04b27|
|state.volume|4d120429862b7cfe894801384704d9252ce2a0292167a819443ddeb8c84b1a7c|
|storage.volume|595857572c7971b0bd81c0608a618f96a62c0d92d0198864f7ba2eb7d331a4d2|

All four historical `.volume-intent` files exist and hash to empty-file e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855. They record the original absent-before-create gate, not independent evidence that current contents are disposable. Authenticate original volumes.sh against the historical source evidence; intent alone never authorizes deletion.

## Volume procedure (proposed bounded executable slices)

Prerequisites: successful independently reconciled four-probe recovery, coordinator exclusive lease, fresh host/default-context/capacity checks, authenticated historical records, repaired profile d7e8a7d9 and pinned volume.rb `1c9e6f6a7aeb8cedace643d9c3798bd36d6fb623bff58e2ce6876becee8d54fa`. Preserve originals and a private audit with raw free bytes. Require source path free of symlink substitutions. No service starts or init-state invocation.

1. Inspect all four exact volumes before any new probe. Require local driver/scope, empty options, exact task label, and equality to historical `{Name,Driver,Scope,Labels,Options,Mountpoint,CreatedAt}`. Verify all-container inventory and successful `container ls -a --filter volume=EXACT` are empty for each. Cross-check fresh full container inspections' Mounts against these exact names; an inspect/list failure stops the procedure. Never infer absence from error.
2. Register each new UUID probe spec/name and capture create-returned full ID before start. Use retained immutable app image after provenance checks below. Bind authenticated canonical source read-only at /repo; mount exactly one existing volume read-only at /acceptance with volume-nocopy; use /tmp tmpfs64MiB; network none, no ports/socket, root read-only, UID0, cap-drop ALL plus DAC_READ_SEARCH only, no-new-privileges,1CPU/512MiB with equal swap, pids256. Entry ruby with `/repo/ops/tools/be01-services/volume.rb check-KIND`. No secrets passed. Exact-volume existence immediately before create is mandatory; exclusive lease protects the check/create boundary from cooperating deletion. Docker named-volume mount can recreate an absent volume, so identity must be checked again after create and before start; mismatch retains both probe and volume.
3. Validate full intended profile using the repaired inspector; pin normalized fingerprint. Bound start/attach30s+3s. Require stopped exited state, actual State.ExitCode0, exact expected PASS line, stable full normalized profile and unchanged volume identity. No timeout qualifies as content PASS. Remove only exact verified stopped probe ID non-force, then prove its ID/name absent with successful inventories. Keep uncertain probe and volume on failure.
4. Perform all four successful content checks and probe-removal proofs before the first volume deletion. Reauthenticate oracle/profile and all historical records. Immediately before each deletion, fresh identity must equal historical and successful fresh all-container/filter inventories must establish zero consumers again. Execute only `docker --context default volume rm EXACT_NAME` (no force). Capture individual exit, successful full volume inventory proving exact name absent, and fresh container inventory. Stop on first failure; never roll back/recreate or retry automatically.
5. Independently enumerate exact names and task labels after the phase. Record identity_exit, consumer_exit, content_exit, probe_cleanup_exit, volume_rm_exit and absence_exit per kind, plus transport/overall exits. Unrun and unknown remain distinct from zero. Save df-B1 before/after as shared-host delta, not reclaimed bytes attributable to this task.

Content oracle is the unchanged reviewed volume.rb: data allows PostgreSQL root names; config only *.conf; storage only stub; state only state/identities/services-ready/database-baseline/credentials-baseline JSON filenames. It recursively rejects non-file/non-directory objects and caps traversal at100000 entries. Empty is allowed but NOT assumed from the failed init. This is a structural disposable-content oracle, not proof of database integrity, secret absence, old-session survival or full lifecycle acceptance. Unexpected contents retain the volume. No file content is printed.

Keep modules below200LOC: one fixed identity/removal driver and one isolated content-probe module, if implementation is approved; no generalized recovery framework. Suggested overall bound10minutes+30s with per-daemon15s+3s and per-content30s+3s; hard deadline may interrupt cleanup, so independent exact reconciliation remains mandatory. No read-only content probe is launched under current authorization.

## Exact app-image procedure (separate phase, after volume/probe closure)

Image ID `sha256:7d755994b0456f71886c92ec548e55b64f58d0c8a579c14cde401f23b715b0f8`; sole tag `be01servicesapp-00ef5f0b-5d3a-4285-813b-b9895a0bc443:app`; observed sole RepoDigest uses the same repository and sha256. Label elevateo.r1.run must equal `00ef5f0b-5d3a-4285-813b-b9895a0bc443`, Config.User10001, no declared volumes.

Parent historical directory `<root>/be01servicesapp-00ef5f0b-5d3a-4285-813b-b9895a0bc443.qiDe2B`. Authenticate `identities` SHA380cb63781dc296acd718b82523302bdf2504b08c80a9e4c7bdc9efaf8604930 and `preexisting-images` SHA57b2d5ae5322297d79e3d709bc2495c2cc66fa8283f5cc3d178ed54e6f2f72c7. Read-only evidence confirms exact ID recorded as task output and absent from historical preexisting list. No portable config-digest equality assumption is needed for this task-output ID.

Require two fresh image inspections identical for ID/tags/digests/task label/user/volumes, exact tag resolution to this ID and no extra shared tags/digests. Enumerate every container including stopped; batch at most1000 captured exact IDs into one bounded inspection, validate complete unique ID-set equality and require none has this Image ID. Also require successful ancestor-filter inventory empty (conservative descendant protection). Any missing/changed record, new tag, consumer or inventory error retains image. Remove only exact full ID using non-force image rm --no-prune. Successful fresh image inventories must prove full ID and exact tag absent; inspect error alone never proves removal. Compare shared/preexisting image IDs before/after and report separate image_rm_exit/absence_exit/shared_retention_exit. Bound phase120s+10s, daemon15s+3s. No prune, builder cleanup, force, or base deletion.

## Failure reconciliation

On timeout/disconnection/missing marker, stop mutations. Read-only successful exact container/volume/image inventories plus individual fresh inspections identify what remains; do not rerun the driver. Preserve partial removal ledger and raw statuses. Unknown new probe identity requires name+spec+creation evidence reconciliation before removal, never label-only cleanup. A running timed-out probe is retained pending a separately approved exact stop/removal decision. Existing volume/image consumers now observed are expected blockers, not permission to remove them here. Release allocation only after coordinator accepts exact reconciliation; report retained resources explicitly.
