#!/bin/bash
set -euo pipefail
root=/home/tanzeel/elevateo-mail-rd-20261014
source=/home/tanzeel/elevateo-mail-wave-20261014/soren
mkdir -p "$root"/{incoming,control,reports}
git -C "$source" fetch /home/tanzeel/elevateo-mail-wave-20261014/incoming/cassian-59a8ce6.bundle refs/heads/integrate/cassian-unified:refs/remotes/root/cassian-59a8ce6
for name in aster rhea corin vesper leonie darius; do
 if [ ! -d "$root/$name/.git" ]; then
  git clone --no-hardlinks --no-checkout "$source" "$root/$name"
  git -C "$root/$name" checkout -b "mail/$name-$(case "$name" in aster) echo architecture;; rhea) echo delivery;; corin) echo mailbox-storage;; vesper) echo provider;; leonie) echo hetzner-pilot;; darius) echo security-qa;; esac)" 59a8ce66dfa86dd3618712c129c66598234a31a0
  git -C "$root/$name" remote set-url origin https://github.com/tanzeel-roseyco/elevateo-mail.git
 fi
 touch "$root/control/$name-inbox.md"
done
touch "$root/control/root-inbox.md"
printf '\nJules ADV-733: new six-worker mailserver R&D is SECONDARY to application acceptance queue. Leonie OFF-505 sole collector; ONE reviewed immutable synthetic private fixture only after app queue clears. Ceiling 2GiB RAM/2CPU/5GiB disk/15min; preserve 8GiB reserve. No worker Docker privileges, network changes, live mail, or purchases.\n' >> /home/tanzeel/elevateo-mail-wave-20261014/control/soren-inbox.md