#!/bin/bash
# AIDEV-NOTE: Docker-only command doubles prove ownership guards; full builds use the real Docker daemon.
set -euo pipefail
test "${INITREPAIR_CONTAINER_TEST:-}" = 1
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
mkdir -p /tmp/transport20261023-work/source/apps/server /tmp/elevateo-initrepair20261023/apps/server
mkdir -p /home/tanzeel/elevateo-mail-wave-20261014/control
printf 'FROM scratch\n' > /tmp/transport20261023-work/source/apps/server/Dockerfile
cat > "$work/docker" <<'MOCK'
#!/bin/bash
printf '%s\n' "$*" >> "$CALLS"
case "$*" in
  'buildx inspect '*) test "$CASE" = existing ;;
  'buildx create '*) test "$CASE" = buildfailure ;;
  'buildx build '*) exit 1 ;;
  'container inspect '*) exit 1 ;;
  'buildx rm '*) exit 0 ;;
  *) exit 99 ;;
esac
MOCK
chmod +x "$work/docker"
export PATH="$work:$PATH" CALLS="$work/calls"
for CASE in existing createfailure buildfailure; do
  export CASE
  : > "$CALLS"
  if bash build-runner.sh; then echo "unexpected success: $CASE"; exit 1; fi
  if test "$CASE" = buildfailure; then
    test "$(grep -c '^buildx rm ' "$CALLS")" = 1
  else
    if grep -q '^buildx rm ' "$CALLS"; then echo 'removed unowned builder'; exit 1; fi
  fi
done
echo 'PASS: existing builder, failed create and failed build ownership regressions'
