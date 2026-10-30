# AIDEV-NOTE: Post-restart observation contains no seed, baseline, bootstrap or migration that could heal loss.
observe() {
  local phase=$1
  fixture "$phase-services" services check || return 1
  fixture "$phase-database" database compare || return 1
  fixture "$phase-authorized" authorized-storage || return 1
  fixture "$phase-credentials" credentials compare || return 1
}
run_phases() {
  fixture boundary boundary_test
  fixture credentials-initial credentials baseline
  start_service db; healthy db
  oneshot bootstrap; oneshot migrate
  local service kind
  for service in mailpit auth rest storage api worker; do start_service "$service"; done
  for service in auth storage api worker; do healthy "$service"; done
  fixture initial-readiness readiness
  fixture initial-services services seed
  fixture initial-database database seed
  observe initial
  # Frozen generator observes the same retained credential file in a read-only mount.
  fixture repeat-generation regenerate
  fixture repeat-credentials credentials compare
  oneshot bootstrap; oneshot migrate
  fixture repeat-services services seed
  fixture repeat-database database seed
  observe repeat
  for kind in data config storage state; do volume_verify "$kind"; done
  for service in worker api storage rest auth mailpit db; do
    verify_container "$task-$service"
    daemon_for 20s stop --time 10 "$(cat "$registry/$task-$service.id")" >/dev/null
    [[ $(daemon inspect -f '{{.State.Status}}' "$task-$service") == exited ]]
  done
  for kind in data config storage state; do volume_verify "$kind"; done
  printf 'PASS all seven services stopped; exact volumes retained\n' > "$evidence/restart.log"
  start_service db; healthy db
  for service in mailpit auth rest storage api worker; do start_service "$service"; done
  for service in auth storage api worker; do healthy "$service"; done
  fixture restart-readiness readiness
  observe restart
  for kind in data config storage state; do volume_verify "$kind"; done
  printf 'PASS retained identities/rows/bytes/credentials; NEW grants only, old sessions unproven\n'
}
