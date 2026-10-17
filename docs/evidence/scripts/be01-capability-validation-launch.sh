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
