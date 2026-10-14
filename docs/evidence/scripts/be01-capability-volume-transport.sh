#!/usr/bin/env bash
# AIDEV-NOTE: Keep historical-ID guards out of SSH quoting; invoke the unchanged reviewed LF volume block once.
set -euo pipefail
exec </dev/null
umask 077
AUDIT=/home/tanzeel/elevateo-mail-tests-20261012-ultra/be01-recovery-validation-audit.DIGxywd8
EVIDENCE=$AUDIT/volume-transport-r2
[[ $(hostname -s) == Ubuntu-noble-latest-amd64-base ]]
[[ -z ${DOCKER_HOST:-} && -z ${DOCKER_TLS_VERIFY:-} && -z ${DOCKER_CERT_PATH:-} ]]
[[ ! -e $EVIDENCE && ! -L $EVIDENCE ]]
[[ ! -e $AUDIT/recovery-volumes && ! -L $AUDIT/recovery-volumes ]]
[[ ! -e $AUDIT/recovery-volumes.console && ! -L $AUDIT/recovery-volumes.console ]]
[[ ! -e $AUDIT/recovery-volumes.process.status && ! -L $AUDIT/recovery-volumes.process.status ]]
[[ -f $AUDIT/invoke.sh && ! -L $AUDIT/invoke.sh && $(realpath "$AUDIT/invoke.sh") == "$AUDIT/invoke.sh" ]]
printf '%s  %s\n' 98d543f4ca570473a6f2e19bc0f1e8f300d810c510726a833faebc5a310597ee "$AUDIT/invoke.sh" | sha256sum -c -
mkdir -m 0700 "$EVIDENCE"
phase=guard
finish() { local rc=$?; trap - EXIT; printf 'transport_exit=%s phase=%s\n' "$rc" "$phase" > "$EVIDENCE/status"; exit "$rc"; }
trap finish EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
d() { timeout -k 3s 15s docker --context default "$@"; }
[[ $(d context inspect default --format '{{.Endpoints.docker.Host}}') == unix:///var/run/docker.sock ]]
d container ls -a --no-trunc --format '{{.ID}}' > "$EVIDENCE/container-ids"
# Require a successful complete ID inventory; absence must not be inferred from a failed grep or daemon call.
jq -Rse 'split("\n") | map(select(length>0)) as $ids |
  all($ids[]; test("^[0-9a-f]{64}$")) and (($ids|unique|length)==($ids|length)) and
  (["4e6e0384c68c53a8dc5a399ac29475bd512a1c9944495c18b346d60a4a0f3c4f",
    "204eb69b6ee37cfbecc49186a5135c8b64ac762bd22b958dc844b6a1a6954082",
    "9550a43d00f4683d763bb08ac53c8e1d7c87c2ff1ea0d529d073d44fa2dbf5a9",
    "3fc61e99ba60e33b95254fec05751d4e6705125749643a5b75a10fd89fa3fe95"] |
    all(.[]; . as $old | ($ids|index($old))==null))' "$EVIDENCE/container-ids" >/dev/null
printf 'historical_id_absence_exit=0\n' > "$EVIDENCE/guard.status"
phase=invoke
set +e
timeout -k 40s 690s bash "$AUDIT/invoke.sh" </dev/null > "$EVIDENCE/invoke.log" 2>&1
invoke_exit=$?
set -e
printf 'invoke_process_exit=%s\n' "$invoke_exit" > "$EVIDENCE/invoke.status"
phase=finished
exit "$invoke_exit"
