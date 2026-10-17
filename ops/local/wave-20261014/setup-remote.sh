set -euo pipefail
root=/home/tanzeel/elevateo-mail-wave-20261014
for spec in "soren|ops/soren-supabase" "rowan|fix/rowan-schema-auth" "elara|test/elara-acceptance" "mira|feat/mira-mailroom-experience" "nadia|research/nadia-deliverability"; do
  name="${spec%%|*}"; branch="${spec#*|}"
  if [ -e "$root/$name" ]; then echo "Refuse existing checkout: $name"; exit 1; fi
  git clone --quiet -b feature/local-completion "$root/incoming/baseline.bundle" "$root/$name"
  git -C "$root/$name" switch -c "$branch"
  git -C "$root/$name" remote set-url origin https://github.com/tanzeel-roseyco/elevateo-mail.git
  git -C "$root/$name" config user.name "Elevateo Mail Automation"
  git -C "$root/$name" config user.email "elevateo-mail@users.noreply.github.com"
  mkdir -p "$root/$name/.planning/wave-20261014"
  cp "$root/incoming/$name-task.md" "$root/$name/.planning/wave-20261014/remote-assignment.md"
  printf '%s\n' 'No additional directives yet. Root is integrating the source baseline.' > "$root/control/$name-inbox.md"
done
