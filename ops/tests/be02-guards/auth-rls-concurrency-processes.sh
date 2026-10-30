# AIDEV-NOTE: Sourced only by the concurrency probe; every process and server session has a unique captured identity.
declare -A children=() backend_pid=() backend_start=() app_name=()
psql_args=(-X --no-password --quiet --tuples-only --no-align --set ON_ERROR_STOP=1 --set VERBOSITY=verbose)

query() {
  # AIDEV-NOTE: Portable BusyBox/GNU syntax preserves the 4s deadline and 1s kill grace.
  PGAPPNAME="${tag}_control" timeout -k 1 4 psql "${psql_args[@]}" \
    --command "SET statement_timeout = '2s'; SET lock_timeout = '1s'; $1" 2>>"$scratch/control.log"
}

await_value() {
  local label=$1 statement=$2 budget=$3 until=$((SECONDS + $3))
  while (( SECONDS <= until )); do
    answer=$(query "$statement") || fail "control query failed: $label"
    if [[ -n "$answer" ]] && (( SECONDS <= until )); then return; fi
    sleep 0.05
  done
  fail "server barrier timed out: $label ($budget seconds)"
}

identity() {
  local name=$1
  printf "a.pid = %s AND extract(epoch FROM a.backend_start) = %s AND a.application_name = '%s' AND a.datname = 'postgres' AND a.usename = 'supabase_admin'" \
    "${backend_pid[$name]}" "${backend_start[$name]}" "${app_name[$name]}"
}

capture() {
  local name=$1
  await_value "$name identity" "SELECT pid || '|' || extract(epoch FROM backend_start)
    FROM pg_stat_activity WHERE application_name = '${app_name[$name]}'
      AND datname = 'postgres' AND usename = 'supabase_admin';" 3
  [[ "$answer" =~ ^[0-9]+\|[0-9]+\.[0-9]+$ ]] || fail "ambiguous session identity: $name"
  IFS='|' read -r "backend_pid[$name]" "backend_start[$name]" <<<"$answer"
  printf 'EVIDENCE captured %s app=%s pid_start=%s\n' "$name" "${app_name[$name]}" "$answer"
}

start_child() {
  local name=$1 file=$2
  app_name[$name]="${tag}_${name}"
  # AIDEV-NOTE: -c observes the fresh connection; -f then executes the original file without rewriting its transaction.
  # AIDEV-NOTE: Portable BusyBox/GNU syntax preserves the 25s deadline and 2s kill grace.
  PGAPPNAME="${app_name[$name]}" timeout -k 2 25 psql "${psql_args[@]}" \
    --command "SELECT pg_backend_pid(), session_user, current_user, current_setting('transaction_isolation');" \
    --file "$file" >"$scratch/$name.log" 2>&1 &
  children[$name]=$!
}

start_holder() {
  local name=$1 ddl=${2:-}
  start_child "$name" "$scratch/holder.fifo"
  printf '%s\n' "BEGIN ISOLATION LEVEL READ COMMITTED;
SET LOCAL lock_timeout = '2s'; SET LOCAL statement_timeout = '5s';
SET LOCAL idle_in_transaction_session_timeout = '20s';
LOCK TABLE auth.sessions IN ACCESS EXCLUSIVE MODE;
$ddl
SELECT 'holder-ready';" >&"$holder_fd"
  capture "$name"
  # AIDEV-NOTE: Idle alone can occur between statements; this marker also proves DDL/OID output finished.
  await_locks "$name holds" "$(identity "$name") AND a.state = 'idle in transaction'
    AND a.wait_event = 'ClientRead' AND a.query ~ '^[[:space:]]*SELECT ''holder-ready'';[[:space:]]*$'
    AND l.granted" 1
}

waiting() {
  local name=$1 holder=$2
  printf "%s AND a.state = 'active' AND a.wait_event_type = 'Lock' AND NOT l.granted AND %s = ANY(pg_blocking_pids(a.pid)) AND a.query ~ 'LOCK TABLE auth[.]sessions IN ACCESS EXCLUSIVE MODE;[[:space:]]*$'" \
    "$(identity "$name")" "${backend_pid[$holder]}"
}

await_locks() {
  local label=$1 predicate=$2 count=$3
  await_value "$label" "SELECT jsonb_agg(jsonb_build_object('pid', a.pid, 'app', a.application_name,
      'state', a.state, 'wait', a.wait_event, 'mode', l.mode, 'granted', l.granted,
      'wait_started', l.waitstart, 'blockers', pg_blocking_pids(a.pid)) ORDER BY a.pid)
    FROM pg_stat_activity a JOIN pg_locks l ON l.pid = a.pid
    WHERE l.locktype = 'relation' AND l.database = (SELECT oid FROM pg_database WHERE datname = current_database())
      AND l.relation = 'auth.sessions'::regclass AND l.mode = 'AccessExclusiveLock' AND ($predicate)
    HAVING count(*) = $count;" 3
  printf 'EVIDENCE %s %s\n' "$label" "$answer"
}

finish_child() {
  local name=$1 expected=$2 until=$((SECONDS + 18)) status=0
  while kill -0 "${children[$name]}" 2>/dev/null; do
    (( SECONDS < until )) || fail "child wait exceeded 18 seconds: $name"
    sleep 0.05
  done
  wait "${children[$name]}" || status=$?
  unset 'children['"$name"']'
  [[ "$status" = "$expected" ]] || fail "unexpected child exit: $name code=$status expected=$expected"
  grep -Fxq "${backend_pid[$name]}|supabase_admin|supabase_admin|read committed" "$scratch/$name.log" \
    || fail "fresh READ COMMITTED admin identity absent: $name"
  await_value "$name disconnected" "SELECT 'disconnected; no locks' WHERE NOT EXISTS
    (SELECT 1 FROM pg_stat_activity a WHERE $(identity "$name"))
    AND NOT EXISTS (SELECT 1 FROM pg_locks WHERE pid = ${backend_pid[$name]});" 3
  printf 'EVIDENCE %s exit=%s %s\n' "$name" "$status" "$answer"
}

release_holder() {
  local name=$1 action=$2
  printf '%s;\n\\quit\n' "$action" >&"$holder_fd"
  finish_child "$name" 0
}

expect_error() {
  local name=$1 sqlstate=$2 reason=$3 line payload count=0 prefix
  prefix="psql:/workspace/ops/db/bootstrap-auth-grants.sql:"
  # AIDEV-NOTE: Exact diagnostic identity prevents a different injected policy from satisfying this oracle.
  while IFS= read -r line || [[ -n "$line" ]]; do
    if [[ "$line" == "$prefix"* ]]; then
      payload=${line#"$prefix"}
      [[ "$payload" =~ ^[1-9][0-9]*:\  ]] || fail "invalid diagnostic prefix: $name"
      payload=${payload#*: }
      [[ "$payload" == "ERROR:  $sqlstate: $reason" ]] || fail "wrong SQLSTATE/reason: $name"
      count=$((count + 1))
    else
      [[ "$line" != *ERROR:* ]] || fail "foreign error diagnostic: $name"
      case "$line" in
        ''|CONTEXT:\ *|LOCATION:\ *) ;;
        *) [[ "$line" =~ ^[0-9]+\|supabase_admin\|supabase_admin\|read\ committed$ ]] \
             || fail "foreign diagnostic text: $name" ;;
      esac
    fi
  done <"$scratch/$name.log"
  [[ "$count" = 1 ]] || fail "wrong error count: $name"
  printf 'EVIDENCE %s SQLSTATE=%s reason=%s\n' "$name" "$sqlstate" "$reason"
}

reap_stopped() {
  local pid=$1 until=$((SECONDS + $2)) status=0
  while kill -0 "$pid" 2>/dev/null && (( SECONDS < until )); do sleep 0.05; done
  kill -0 "$pid" 2>/dev/null && return 1
  wait "$pid" 2>/dev/null || status=$?
  # AIDEV-NOTE: A signalled child is expected; 127 means wait could not establish ownership/reaping.
  [[ "$status" != 127 ]]
}

stop_children() {
  local name rows pid started application predicate=false result=0 until
  local row termination
  local -A registered=() seen=() pending_pid=() pending_start=()
  # AIDEV-NOTE: Stop/reap clients BEFORE final discovery; registry includes launches interrupted before capture.
  for name in "${!children[@]}"; do kill -TERM "${children[$name]}" 2>/dev/null || true; done
  until=$((SECONDS + 5))
  for name in "${!children[@]}"; do
    while kill -0 "${children[$name]}" 2>/dev/null && (( SECONDS < until )); do sleep 0.05; done
    if kill -0 "${children[$name]}" 2>/dev/null; then
      kill -KILL "${children[$name]}" 2>/dev/null || true
      result=1
    fi
    reap_stopped "${children[$name]}" 1 || result=1
  done
  for name in "${!app_name[@]}"; do
    application=${app_name[$name]}
    [[ "$application" =~ ^[a-zA-Z0-9_]+$ && ${#application} -le 63 ]] || return 1
    [[ -z ${registered[$application]:-} ]] || return 1
    registered[$application]=$name
    predicate+=" OR (a.application_name = '$application')"
  done
  predicate="a.datname = 'postgres' AND a.usename = 'supabase_admin' AND ($predicate)"
  until=$((SECONDS + 8))
  while (( SECONDS < until )); do
    rows=$(query "SELECT a.pid || '|' || extract(epoch FROM a.backend_start) || '|' || a.application_name
      FROM pg_stat_activity a WHERE $predicate;") || return 1
    (( SECONDS < until )) || return 1
    seen=() pending_pid=() pending_start=()
    if [[ -n "$rows" ]]; then
      while IFS= read -r row; do
        [[ "$row" =~ ^[1-9][0-9]*\|[0-9]+\.[0-9]+\|[a-zA-Z0-9_]+$ ]] || return 1
        IFS='|' read -r pid started application <<<"$row"
        name=${registered[$application]:-}
        [[ -n "$name" && -z ${seen[$name]:-} ]] || return 1
        seen[$name]=1
        if [[ -n ${backend_pid[$name]:-} || -n ${backend_start[$name]:-} ]]; then
          [[ ${backend_pid[$name]:-} = "$pid" && ${backend_start[$name]:-} = "$started" ]] || return 1
        fi
        pending_pid[$name]=$pid; pending_start[$name]=$started
      done <<<"$rows"
    fi
    # AIDEV-NOTE: Validate the entire batch before granting any termination authority; duplicates fail closed.
    termination=false
    for name in "${!pending_pid[@]}"; do
      backend_pid[$name]=${pending_pid[$name]}; backend_start[$name]=${pending_start[$name]}
      termination+=" OR ($(identity "$name"))"
    done
    if [[ "$termination" != false ]]; then
      query "SELECT pg_terminate_backend(a.pid) FROM pg_stat_activity a WHERE $termination;" >/dev/null || return 1
      (( SECONDS < until )) || return 1
    fi
    # AIDEV-NOTE: Fresh all-name absence closes the empty-discovery/late-start race, even without captured PIDs.
    rows=$(query "SELECT count(*) FROM pg_stat_activity a WHERE $predicate;") || return 1
    (( SECONDS < until )) || return 1
    [[ "$rows" =~ ^[0-9]+$ ]] || return 1
    [[ "$rows" != 0 ]] || return "$result"
    sleep 0.05
  done
  return 1
}
