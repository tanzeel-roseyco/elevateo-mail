#!/bin/sh
set -eu
# AIDEV-NOTE: Run in a disposable shell container; fake Docker tests harness failures without daemon access.
directory=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
scratch=$(mktemp -d)
trap 'rm -rf "$scratch"' EXIT
mkdir "$scratch/bin"
cat > "$scratch/bin/docker" <<'FAKE'
#!/bin/sh
case "$1 $2" in
  'network create') touch "$FAKE_STATE" ;;
  'container ls')
    case "$MODE" in
      cleanup_failure) if [ -f "$FAKE_STATE" ]; then echo retained-container; fi ;;
      listing_failure) exit 1 ;;
      cleanup_listing_failure) if [ -f "$FAKE_STATE" ]; then exit 1; fi ;;
    esac ;;
  'network ls') : ;;
  'logs '*)
    if [ "$MODE" = logs_failure ]; then exit 1; fi ;;
  'rm -f') exit 1 ;;
  'exec -i') cat >/dev/null ;;
esac
exit 0
FAKE
chmod +x "$scratch/bin/docker"
for mode in logs_failure cleanup_failure listing_failure cleanup_listing_failure; do
  rm -f "$scratch/created"
  if MODE="$mode" FAKE_STATE="$scratch/created" PATH="$scratch/bin:$PATH" sh "$directory/check-auth-proxy.sh" >"$scratch/output" 2>&1; then
    echo "Harness incorrectly passed $mode" >&2
    exit 1
  fi
  if grep -q AUTH_PROXY_CHECKS_PASS "$scratch/output"; then
    echo "Harness printed PASS after $mode" >&2
    exit 1
  fi
  case "$mode" in
    logs_failure) grep -q 'Proxy log capture failed' "$scratch/output" ;;
    listing_failure) grep -q 'Proxy preflight listing failed' "$scratch/output" ;;
    *) grep -q 'Proxy cleanup failed' "$scratch/output" ;;
  esac
  echo "AUTH_PROXY_NEGATIVE_PASS $mode"
done
