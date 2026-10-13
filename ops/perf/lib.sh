#!/bin/sh
# AIDEV-NOTE: Shared PERF-01 guards. Every ops/perf script sources this first; nothing here runs Docker.
# Sourced with `. "$(dirname -- "$0")/lib.sh"`; callers must have `set -eu` enabled.
# Required environment for any remote step:
#   PERF01_RESERVATION  Codex resource-reservation id relayed by the lead. Unset => refuse.
#   PERF01_PROJECT      Fresh Compose project name, perf01-<8..32 hex>. Doubles as task directory name.
PERF01_LABEL_KEY=elevateo.perf.task
PERF01_LABEL_VALUE=perf01
PERF01_LABEL="$PERF01_LABEL_KEY=$PERF01_LABEL_VALUE"
PERF01_EMPTY_SHA256=e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855

perf01_die() { echo "perf01: $*" >&2; exit "${2:-2}"; }
perf01_log() { echo "perf01 $(perf01_now): $*" >&2; }
perf01_now() { date -u +%Y%m%dT%H%M%SZ; }
perf01_iso() { date -u +%Y-%m-%dT%H:%M:%SZ; }

perf01_require_reservation() {
  [ -n "${PERF01_RESERVATION:-}" ] || perf01_die "PERF01_RESERVATION is unset; a Codex reservation must be relayed by the lead before any remote step"
  case $PERF01_RESERVATION in
    *[!A-Za-z0-9._:-]*) perf01_die "PERF01_RESERVATION contains unexpected characters" ;;
  esac
}

perf01_require_project() {
  [ -n "${PERF01_PROJECT:-}" ] || perf01_die "PERF01_PROJECT is unset; generate one with: echo perf01-\$(cat /proc/sys/kernel/random/uuid | tr -d - | cut -c1-12)"
  printf '%s\n' "$PERF01_PROJECT" | grep -Eq '^perf01-[0-9a-f]{8,32}$' || perf01_die "PERF01_PROJECT must match perf01-<8..32 lowercase hex>"
}

# Task checkout root: scripts live in <root>/ops/perf. On fleet-02 this is ~/<PERF01_PROJECT>.
perf01_root() { CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd; }

# Refuse to continue if any ops/perf script contains a forbidden Docker operation. The patterns are split so
# this file does not match itself; this is a guard against future edits, not a substitute for review.
perf01_assert_no_forbidden_commands() {
  root=$1
  pattern='system[[:space:]]+prune|volume[[:space:]]+prune|image[[:space:]]+prune[[:space:]]+-a|down[[:space:]]+(-v|--volumes)|--privileged|network_mode:[[:space:]]*host|docker\.sock'
  # Comment lines (file:line:  # ...) may name the forbidden operations in order to forbid them.
  if grep -En "$pattern" "$root"/ops/perf/*.sh "$root"/ops/perf/*.yaml 2>/dev/null \
      | grep -Ev '^[^:]*:[0-9]+:[[:space:]]*#' | grep -v 'pattern='; then
    perf01_die "forbidden Docker operation present in ops/perf; refusing to run"
  fi
}

# Compose invocation for the task project only. --project-directory pins relative paths to the task root.
perf01_compose() {
  docker compose --project-name "$PERF01_PROJECT" --project-directory "$PERF01_ROOT" \
    -f "$PERF01_ROOT/compose.yaml" -f "$PERF01_ROOT/ops/perf/compose.perf.yaml" \
    --env-file "$PERF01_ROOT/ops/local/.env" "$@"
}

# Read-only listing of resources that would collide with this project or carry the task label, written sorted to
# <out-file>. Fails CLOSED: each of the seven inventory commands is checked individually and any failure (daemon
# unreachable, permission, timeout) dies with the command named, so an empty list can never mean "clean" by accident.
perf01_existing_resources() { # perf01_existing_resources <out-file>
  out=$1
  : > "$out"
  : > "$out.err"
  perf01_inventory() { # perf01_inventory <description> <docker args...>
    desc=$1; shift
    if ! docker "$@" >> "$out" 2>> "$out.err"; then
      perf01_die "inventory command failed (docker $desc); stderr in $out.err; refusing to treat the host as clean"
    fi
  }
  perf01_inventory "ps -a --filter label" ps -a --filter "label=$PERF01_LABEL" --format 'container {{.ID}} {{.Names}} {{.Status}}'
  perf01_inventory "ps -a --filter name" ps -a --filter "name=^${PERF01_PROJECT}" --format 'container {{.ID}} {{.Names}} {{.Status}}'
  perf01_inventory "network ls --filter label" network ls --filter "label=$PERF01_LABEL" --format 'network {{.ID}} {{.Name}}'
  perf01_inventory "network ls --filter name" network ls --filter "name=^${PERF01_PROJECT}" --format 'network {{.ID}} {{.Name}}'
  perf01_inventory "volume ls --filter label" volume ls --filter "label=$PERF01_LABEL" --format 'volume {{.Name}}'
  perf01_inventory "volume ls --filter name" volume ls --filter "name=^${PERF01_PROJECT}" --format 'volume {{.Name}}'
  perf01_inventory "images --filter reference" images --filter "reference=${PERF01_PROJECT}-*" --format 'image {{.ID}} {{.Repository}}:{{.Tag}}'
  sort -u -o "$out" "$out"
  rm -f "$out.err"
}

perf01_refuse_existing() { # perf01_refuse_existing <out-file>
  perf01_existing_resources "$1"
  if [ -s "$1" ]; then
    cat "$1" >&2
    perf01_die "perf01 resources already exist (above); serialized runs require a clean slate. Run cleanup.sh for the owning project first" 3
  fi
}

# Host quiet check: 1-minute load average and MemAvailable must stay inside caps chosen from the probe
# (16 vCPU / 63 GB, production neighbours present). Defaults: load1 <= nproc/2, MemAvailable >= 6 GiB.
perf01_host_quiet() {
  max_load=${PERF01_MAX_LOAD1:-$(( $(nproc) / 2 ))}
  min_mem=${PERF01_MIN_MEM_MB:-6144}
  load1=$(cut -d' ' -f1 /proc/loadavg)
  avail=$(awk '/MemAvailable/ { printf "%d", $2 / 1024 }' /proc/meminfo)
  echo "load1=$load1 max_load1=$max_load mem_available_mb=$avail min_mem_mb=$min_mem"
  awk -v l="$load1" -v m="$max_load" 'BEGIN { exit !(l <= m) }' || return 1
  [ "$avail" -ge "$min_mem" ] || return 1
}

perf01_host_snapshot() {
  echo "time=$(perf01_iso)"
  # procps may be absent (slim images used by the Docker-only guard tests); /proc is always there.
  if command -v uptime >/dev/null 2>&1; then echo "uptime=$(uptime)"; else echo "uptime=unavailable"; fi
  echo "loadavg=$(cat /proc/loadavg)"
  if command -v free >/dev/null 2>&1; then free -m; else grep -E '^(MemTotal|MemAvailable|SwapTotal|SwapFree)' /proc/meminfo; fi
  df -h / | tail -1
}

perf01_sha256() { sha256sum "$1" | cut -d' ' -f1; }

# Minimal JSON string escaping for names/paths we control (no control characters expected).
perf01_json_str() { printf '"%s"' "$(printf '%s' "$1" | tr '\n' ' ' | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g')"; }
