#!/usr/bin/env bash
# AIDEV-NOTE: File-backed mock schedules survive query subshells and check actual cleanup ordering/kill authority.
set -euo pipefail
scratch=$1; test_dir=$2
fatal() { printf '%s\n' "$1" >"$scratch/infra"; exit 90; }
fixture() (
  source "$test_dir/auth-rls-concurrency-processes.sh"
  local scenario=$1 expected=$2 status=0 events
  app_name[late]=be02_fixture_late; children[late]=900001
  case "$scenario" in
    changed-pid|changed-start) backend_pid[late]=41; backend_start[late]=100.1 ;;
    mixed) app_name[early]=be02_fixture_early; backend_pid[early]=42; backend_start[early]=100.2 ;;
    invalid-registry) app_name[late]="invalid'" ;;
    duplicate-registry) app_name[other]=be02_fixture_late ;;
  esac
  : >"$scratch/events"; : >"$scratch/infra"; : >"$scratch/killed"; printf '0\n' >"$scratch/step"
  kill() {
    [[ "$2" = 900001 ]] || fatal 'foreign client PID'
    case "$1" in
      -TERM) printf 'term\n' >>"$scratch/events" ;;
      -KILL) printf 'kill\n' >>"$scratch/events"; printf yes >"$scratch/killed" ;;
      -0) [[ "$scenario" = escalation && ! -s "$scratch/killed" ]] ;;
      *) fatal 'foreign signal' ;;
    esac
  }
  wait() {
    [[ "$1" = 900001 ]] || fatal 'foreign wait PID'
    printf 'reap\n' >>"$scratch/events"
    [[ "$scenario" != reap-failure ]] || return 127
  }
  sleep() { SECONDS=$((SECONDS + 9)); }
  query() {
    local statement=$1 step kind
    read -r step <"$scratch/step"; step=$((step + 1)); printf '%s\n' "$step" >"$scratch/step"
    grep -Fxq reap "$scratch/events" || fatal 'query before reap'
    [[ "$statement" = *"a.datname = 'postgres'"* && "$statement" = *"a.usename = 'supabase_admin'"* \
      && "$statement" = *"a.application_name = 'be02_fixture_late'"* && "$statement" != *LIKE* ]] || fatal 'missing exact scope'
    if [[ "$statement" = *pg_terminate_backend* ]]; then
      kind=terminate
      [[ "$statement" = *"a.pid = 41 AND extract(epoch FROM a.backend_start) = 100.1"* ]] || fatal 'missing identity'
      case "$scenario" in
        late|mixed|residual|reap-failure|escalation) ;;
        *) fatal 'unauthorized termination' ;;
      esac
    elif [[ "$statement" = 'SELECT count(*)'* ]]; then
      kind=absence
    else
      kind=discover
    fi
    if [[ "$scenario" = mixed ]]; then
      [[ "$statement" = *"a.application_name = 'be02_fixture_early'"* ]] || fatal 'missing registered name'
      if [[ "$kind" = terminate ]]; then
        [[ "$statement" = *"a.pid = 42 AND extract(epoch FROM a.backend_start) = 100.2"* ]] || fatal 'missing early identity'
      fi
    fi
    printf '%s\n' "$kind" >>"$scratch/events"
    case "$scenario:$kind" in
      discovery-failure:discover|absence-failure:absence) return 1 ;;
      never:discover|absence-failure:discover|escalation:discover) ;;
      between:discover) (( step != 1 )) && printf '41|100.1|be02_fixture_late\n' || true ;;
      changed-pid:discover) printf '43|100.1|be02_fixture_late\n' ;;
      changed-start:discover) printf '41|101.1|be02_fixture_late\n' ;;
      duplicate:discover) printf '41|100.1|be02_fixture_late\n43|100.2|be02_fixture_late\n' ;;
      malformed:discover) printf '41|broken|be02_fixture_late\n' ;;
      foreign:discover) printf '41|100.1|be02_foreign\n' ;;
      mixed:discover) printf '41|100.1|be02_fixture_late\n42|100.2|be02_fixture_early\n' ;;
      *:discover) printf '41|100.1|be02_fixture_late\n' ;;
      residual:absence|between:absence) printf '1\n' ;;
      *:absence) printf '0\n' ;;
      *:terminate) printf 't\n' ;;
    esac
  }
  stop_children || status=$?
  [[ ! -s "$scratch/infra" ]] || fatal 'mock boundary assertion failed'
  [[ "$status" = "$expected" ]] || fatal "unexpected cleanup result $scenario:$status"
  events=$(cat "$scratch/events")
  case "$scenario" in
    late|mixed|reap-failure|residual) [[ "$events" = $'term\nreap\ndiscover\nterminate\nabsence' ]] || fatal 'wrong late schedule' ;;
    between|never|absence-failure) [[ "$events" = $'term\nreap\ndiscover\nabsence' ]] || fatal 'wrong absence schedule' ;;
    escalation) [[ "$events" = $'term\nkill\nreap\ndiscover\nabsence' ]] || fatal 'wrong escalation schedule' ;;
    invalid-registry|duplicate-registry) [[ "$events" = $'term\nreap' ]] || fatal 'invalid registry queried' ;;
    *) [[ "$events" = $'term\nreap\ndiscover' ]] || fatal 'invalid discovery authorized termination' ;;
  esac
  printf 'PASSED cleanup fixture %s\n' "$scenario"
)
fixture late 0
fixture never 0
fixture mixed 0
# AIDEV-NOTE: The fake clock forces a bounded failure after observing a backend appearing after empty discovery.
fixture between 1
fixture changed-pid 1
fixture changed-start 1
fixture duplicate 1
fixture malformed 1
fixture foreign 1
fixture discovery-failure 1
fixture absence-failure 1
fixture reap-failure 1
fixture residual 1
fixture escalation 1
fixture invalid-registry 1
fixture duplicate-registry 1
