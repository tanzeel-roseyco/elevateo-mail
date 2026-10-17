# Frozen recovery validation delivery — dispatcher reviewed; staging review pending, NOT_RUN

Recovery correctness and dedicated design are closed: driver/content156 plus image/regression111 =267 unique LOC, zero remaining defects,0/KLOC. Design overlaps/nonadditive; analytical only, Obsidian unavailable. Historical draft124 LOC had two unique MED findings: serial inspection budget and default ancestor pruning,16.13/KLOC. The four recovery scripts/profile and manifest a727ce21 remain unchanged.

New validation uses the previously reviewed services-app-check base-only lifecycle, with its explicit cleanup/source failure propagation and normalized fingerprint. The regression requires Bash/coreutils, not jq inside the container. This avoids rebuilding tools and avoids inheriting the tools build cleanup's bare image rm. No existing lifecycle files were modified. Host jq remains a prerequisite for profile and inventory checks. No recovery function other than the mocked extracted removal function runs.

## Frozen new files

| File under docs/evidence/scripts | LOC | SHA256 |
|---|---:|---|
|be01-capability-validation-parent.sh|62|01ca66e2dd0332fd39c0b9ebfa8857eb594bef06216306475f8413785000cb75|
|be01-capability-validation-checks.sh|12|eb2a90caf805b66caf2f7d3f0adecaa2a3a0ee5424f74f708fc85dad92a40edc|
|be01-capability-validation-inventory.sh|29|7ac8fee18a2b8ae164a61eb51cfa927db2e66e9923e2122d581b5d3a09b3733f|

103 unique executable LOC: correctness and dedicated analytical design reviews both zero concrete defects,0/KLOC. Design overlaps/nonadditive; Obsidian unavailable. All three hashes verified before/after. No tests or syntax executed. The wrapper retains an uncertain create-time container if no verified fingerprint exists. Its240s+30s deadline does not guarantee cleanup completes; missing status requires independent reconciliation, never retry. Independent audit has180s+10s bound and15s+3s daemon calls. It fails on missing identities. Such failure requires separate exact-name/create-log reconciliation rather than an absence claim.

Archive: `C:/Users/Tanzeel/AppData/Local/Temp/be01-recovery-validation-b328d81a-3b95-4bde-933e-c174238f5001.tar`

Outer SHA256: `8fa39315af9d8e56ff15a0147f0cfd662a025c0771aa15bd150f1b8ef90f013f`.
Flat `validation.sha256`: `3c388c9889c007055671592b3d4ad758d77eaf9817c2779fcfb36223b14e3318`.
Exact ten regular members and all nine member hashes are recorded in `be-01-services-capability-validation-delivery.json`. Archive creation and read-only listing completed locally; this is not test evidence.

## Proposed additive staging after review and fresh lease

Request10 minutes plus independent reconciliation for staging and socket-free check only. Fresh coordinator conflict/capacity/host/context/base/source checks first. Preserve shared builder, all four retained volumes and app image. No pulls, builds, service starts or volume/image removals. Upload archive to a fresh private0700 AUDIT directory under the existing root (root mode0775 unchanged). The mounted root is exclusively $AUDIT/source, created0755; ten archive members arrive with0666 modes and are explicitly changed to0644. Never chmod an existing ancestor. Use an uploaded LF launcher, authenticate its reviewed bytes before invocation; avoid nested SSH quoting. The following is the concrete launcher body for review (ARCHIVE is the uploaded absolute path, AUDIT the fresh private0700 evidence directory):

```bash
#!/usr/bin/env bash
set -euo pipefail
umask 077
root=/home/tanzeel/elevateo-mail-tests-20261012-ultra
export CANONICAL_SOURCE=$root/lane-c-20261012 TOOLS_CONTEXT=default
: "${ARCHIVE:?}" "${AUDIT:?}"
[[ -d $AUDIT && ! -L $AUDIT && $(realpath "$AUDIT") == "$AUDIT" && $(stat -c %a "$AUDIT") == 700 ]]
# AIDEV-NOTE: Docker binds source directly; private host parents are not container-visible ancestors.
export TOOLS_SOURCE=$AUDIT/source
export AUDIT TOOLS_EVIDENCE=$AUDIT
[[ ! -e $TOOLS_SOURCE && ! -L $TOOLS_SOURCE ]]
printf '%s  %s\n' 8fa39315af9d8e56ff15a0147f0cfd662a025c0771aa15bd150f1b8ef90f013f "$ARCHIVE" | sha256sum -c -
tar -tf "$ARCHIVE" > "$AUDIT/members"
cat > "$AUDIT/expected-members" <<'MEMBERS'
be01-capability-content-probe.sh
be01-capability-image-recovery.sh
be01-capability-volume-recovery.sh
be01-capability-image-recovery-regression.sh
profile.jq
be-01-services-capability-volume-image-files.json
be01-capability-validation-parent.sh
be01-capability-validation-checks.sh
be01-capability-validation-inventory.sh
validation.sha256
MEMBERS
cmp "$AUDIT/expected-members" "$AUDIT/members"
tar -tvf "$ARCHIVE" > "$AUDIT/member-types"
awk 'substr($0,1,1)!="-" {bad=1} END {exit bad}' "$AUDIT/member-types"
mkdir -m 0755 "$TOOLS_SOURCE"
chmod 0755 "$TOOLS_SOURCE"
tar --no-same-owner --no-same-permissions -xf "$ARCHIVE" -C "$TOOLS_SOURCE"
while IFS= read -r member; do
  [[ -f $TOOLS_SOURCE/$member && ! -L $TOOLS_SOURCE/$member ]]
  chmod 0644 "$TOOLS_SOURCE/$member"
done < "$AUDIT/expected-members"
cd "$TOOLS_SOURCE"
export RECOVERY_CHECK_PACKAGE_SHA=3c388c9889c007055671592b3d4ad758d77eaf9817c2779fcfb36223b14e3318
printf '%s  validation.sha256\n' "$RECOVERY_CHECK_PACKAGE_SHA" | sha256sum -c -
sha256sum -c validation.sha256
stat -c '%a %n' . * > "$AUDIT/staged-modes"
bash be01-capability-validation-inventory.sh before > "$AUDIT/inventory-before.log" 2>&1
set +e
bash be01-capability-validation-parent.sh > "$AUDIT/parent.log" 2>&1
parent_exit=$?
set -e
printf 'parent_exit=%s\n' "$parent_exit" > "$AUDIT/parent.status"
matches=("$AUDIT"/be01recoverycheck-*)
[[ ${#matches[@]} == 1 && -d ${matches[0]} ]]
export RUN_EVIDENCE=${matches[0]}
set +e
bash be01-capability-validation-inventory.sh after > "$AUDIT/independent-inventory.log" 2>&1
inventory_exit=$?
set -e
printf 'independent_inventory_exit=%s\n' "$inventory_exit" > "$AUDIT/reconciliation.status"
((parent_exit == 0 && inventory_exit == 0))
```bash
set -euo pipefail
umask 077
root=/home/tanzeel/elevateo-mail-tests-20261012-ultra
export TOOLS_SOURCE=$root/be01-recovery-validation-b328d81a-3b95-4bde-933e-c174238f5001
export CANONICAL_SOURCE=$root/lane-c-20261012 TOOLS_CONTEXT=default
: "${ARCHIVE:?}" "${AUDIT:?}"
export AUDIT TOOLS_EVIDENCE=$AUDIT
[[ ! -e $TOOLS_SOURCE && ! -L $TOOLS_SOURCE ]]
printf '%s  %s\n' 8fa39315af9d8e56ff15a0147f0cfd662a025c0771aa15bd150f1b8ef90f013f "$ARCHIVE" | sha256sum -c -
tar -tf "$ARCHIVE" > "$AUDIT/members"
cat > "$AUDIT/expected-members" <<'MEMBERS'
be01-capability-content-probe.sh
be01-capability-image-recovery.sh
be01-capability-volume-recovery.sh
be01-capability-image-recovery-regression.sh
profile.jq
be-01-services-capability-volume-image-files.json
be01-capability-validation-parent.sh
be01-capability-validation-checks.sh
be01-capability-validation-inventory.sh
validation.sha256
MEMBERS
cmp "$AUDIT/expected-members" "$AUDIT/members"
tar -tvf "$ARCHIVE" > "$AUDIT/member-types"
awk 'substr($0,1,1)!="-" {bad=1} END {exit bad}' "$AUDIT/member-types"
mkdir -m 0755 "$TOOLS_SOURCE"
chmod 0755 "$TOOLS_SOURCE"
tar --no-same-owner --no-same-permissions -xf "$ARCHIVE" -C "$TOOLS_SOURCE"
while IFS= read -r member; do
  [[ -f $TOOLS_SOURCE/$member && ! -L $TOOLS_SOURCE/$member ]]
  chmod 0644 "$TOOLS_SOURCE/$member"
done < "$AUDIT/expected-members"
cd "$TOOLS_SOURCE"
export RECOVERY_CHECK_PACKAGE_SHA=3c388c9889c007055671592b3d4ad758d77eaf9817c2779fcfb36223b14e3318
printf '%s  validation.sha256\n' "$RECOVERY_CHECK_PACKAGE_SHA" | sha256sum -c -
sha256sum -c validation.sha256
stat -c '%a %n' . * > "$AUDIT/staged-modes"
bash be01-capability-validation-inventory.sh before > "$AUDIT/inventory-before.log" 2>&1
set +e
bash be01-capability-validation-parent.sh > "$AUDIT/parent.log" 2>&1
parent_exit=$?
printf 'parent_exit=%s\n' "$parent_exit" > "$AUDIT/parent.status"
set -e
matches=("$AUDIT"/be01recoverycheck-*)
[[ ${#matches[@]} == 1 && -d ${matches[0]} ]]
export RUN_EVIDENCE=${matches[0]}
set +e
bash be01-capability-validation-inventory.sh after > "$AUDIT/independent-inventory.log" 2>&1
inventory_exit=$?
printf 'independent_inventory_exit=%s\n' "$inventory_exit" > "$AUDIT/reconciliation.status"
((parent_exit == 0 && inventory_exit == 0))
```,1,1)!="-" {bad=1} END {exit bad}' "$AUDIT/member-types"
mkdir -m 0755 "$TOOLS_SOURCE"
chmod 0755 "$TOOLS_SOURCE"
tar --no-same-owner --no-same-permissions -xf "$ARCHIVE" -C "$TOOLS_SOURCE"
while IFS= read -r member; do
  [[ -f $TOOLS_SOURCE/$member && ! -L $TOOLS_SOURCE/$member ]]
  chmod 0644 "$TOOLS_SOURCE/$member"
done < "$AUDIT/expected-members"
cd "$TOOLS_SOURCE"
export RECOVERY_CHECK_PACKAGE_SHA=3c388c9889c007055671592b3d4ad758d77eaf9817c2779fcfb36223b14e3318
printf '%s  validation.sha256\n' "$RECOVERY_CHECK_PACKAGE_SHA" | sha256sum -c -
sha256sum -c validation.sha256
stat -c '%a %n' . * > "$AUDIT/staged-modes"
bash be01-capability-validation-inventory.sh before > "$AUDIT/inventory-before.log" 2>&1
set +e
bash be01-capability-validation-parent.sh > "$AUDIT/parent.log" 2>&1
parent_exit=$?
printf 'parent_exit=%s\n' "$parent_exit" > "$AUDIT/parent.status"
set -e
matches=("$AUDIT"/be01recoverycheck-*)
[[ ${#matches[@]} == 1 && -d ${matches[0]} ]]
export RUN_EVIDENCE=${matches[0]}
set +e
bash be01-capability-validation-inventory.sh after > "$AUDIT/independent-inventory.log" 2>&1
inventory_exit=$?
printf 'independent_inventory_exit=%s\n' "$inventory_exit" > "$AUDIT/reconciliation.status"
((parent_exit == 0 && inventory_exit == 0))
```

Before dispatch, independently authenticate canonical52 and inspect existing pinned Ruby manifest reference (22165c5f), current capacity and conflicting task activity. No global-idleness requirement. The packet is additive, not a canonical checkout overlay. Exclusive trusted filesystem boundary is required; never chmod existing ancestors, overwrite a target or retry partial staging. The newly created bind directory0755 is container-visible; private evidence stays0700 and is not mounted.

## Acceptance and reconciliation

Capture SSH separately from parent, checks test_exit, cleanup_failed, source_exit and independent inventory exits. A missing field is unknown/NOT_RUN, never0. Workload: UID10001,0.5CPU/256MiB equal swap,pids128,readonly root,network none,cap-drop ALL,no-new-privileges,deliveryRO only,tmpfs32MiB noexec. Actual UID hashes all delivery files, bash-n parses all four scripts, and regression checks exact no-prune/full-ID arguments, daemon37 propagation and unsafe-original91 rejection. It sources Bash text; executable tmpfs is unnecessary.

After parent termination, audit independently checks full ID/name/nonce-label absence and pinned base retention. Read saved full inventories to verify the shared builder, four retained exact volumes and retained app image remain; compare their historical IDs/identities without deleting anything. Record df-B1 before/after as shared-host raw delta. Neither successful --rm nor failed inspect substitutes for successful inventory. If create/cleanup timed out, preserve uncertain resources and reconcile exact identities before any further mutation. Do not release until coordinator independently accepts cleanup evidence. No recovery or full-services authorization is included; real content/profile transitions, volume removals, image retention semantics and Auth/Storage/restart proof remain pending.

## Exact LF launcher authentication (pending final staging review)

Saved launcher: `docs/evidence/scripts/be01-capability-validation-launch.sh` (55 LOC), SHA256 `f1fff25dc950aa0de5307a70f9b3bc51024e2fdb10e3d734bdf25071cacea5b3`. The Bash block above is byte-identical to this LF file. Archive and manifest hashes remain unchanged. Create AUDIT with bounded SSH using mktemp -d under the existing evidence root and umask077, then upload archive and launcher there. Authenticate the launcher before invocation using the command below; ARCHIVE and AUDIT are the exact fresh absolute paths. Do not execute until coordinator approves staging and grants the lease.

```bash
printf '%s  %s\n' f1fff25dc950aa0de5307a70f9b3bc51024e2fdb10e3d734bdf25071cacea5b3 "$AUDIT/be01-capability-validation-launch.sh" | sha256sum -c -
timeout -k 30s 600s env AUDIT="$AUDIT" ARCHIVE="$ARCHIVE" bash "$AUDIT/be01-capability-validation-launch.sh"
```

Coordinator fresh read-only preflight SSH0 reported expected host/context, pinned Ruby present, RAM available38794956800 bytes and filesystem free272173879296 bytes. This is preflight evidence only, not a reservation or runtime acceptance. Recheck before any authorized launch.

Launcher review: original doc8d0db39a fenced51 LOC had one LOW status-write propagation defect,19.61/KLOC. Restored set-e immediately after capturing parent_exit and inventory_exit, before writing either status. Private AUDIT/source retained. Final LF launcher 55 LOC SHA256 f1fff25dc950aa0de5307a70f9b3bc51024e2fdb10e3d734bdf25071cacea5b3; doc block matches. Static final comparison pending; runtime NOT_RUN, no lease. Three reviewed dispatcher hashes unchanged. This supersedes prior launcher hash.

Recovery socket-free validation PASS: audit.DIGxywd8, SSH/launch/parent/test/cleanup/source/inventory/independent reconciliation all0; actual UID10001 hashes/syntax and no-prune/daemon-error/original-discrimination passed. Exact container87432c68 absent; four volumes/app image/shared bases retained. Root independently accepted and RELEASED validation reservation. Raw shared-host free delta -43646976 bytes. Scope only; real Auth/private Storage/restart pending. See docs/evidence/be-01-services-capability-validation-result.md and separate recovery-invocation.md proposal (NOT_RUN, no recovery allocation). Earlier NOT_RUN statements for socket-free validation are historical; recovery remains NOT_RUN.
