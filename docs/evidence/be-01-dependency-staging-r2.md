# Repaired dependency staging attempt: launch failure

Coordinator staging-only lease consumed 2026-10-12T02:40:02+02:00 (00:40:02 UTC). Reservation RELEASED after independent reconciliation. No retry or Docker execution.

Fresh preflight SSH0: expected short hostname and default context, canonical52 manifest and all source hashes PASS; five exact targets absent including dangling links. Available bytes272811622400, available memory38740832256. No conflicting BE/FE task container names found. Shared buildx_buildkit_fleet02 and its state volume retained.

Fresh private0700 evidence directory and SCP transfer exited0:
`/home/tanzeel/elevateo-mail-tests-20261012-ultra/be01-dependency-stage-r2-20261012-004002`

The SSH compound launch used incorrect PowerShell escaping of shell status variables. Remote shell rejected it with unexpected EOF before executing the orchestration: SSH_STAGE=2, remote staging.log absent. Authentication, dependency staging, tools staging and identity staging are NOT_STARTED; this is a transport harness failure, not a stager/test failure. Frozen implementation bytes unchanged. No retry performed.

Independent fresh reconciliation SSH0/source0/space0: all five canonical destinations absent; successful container and volume inventory reads (each pipeline0/0) show no BE/FE task resources, shared builder/state still present. No task Docker resources were created or deleted. Evidence files retained. No host ancestor permissions changed. Free bytes after272744148992; raw shared-host delta -67473408, not attributable to this task or reclaimed storage.

Local evidence: `%TEMP%/be01-dependency-r2-preflight.log`, `be01-dependency-r2-stage-console.log`, `be01-dependency-r2-reconciliation.log`. Additive orchestration `be01-dependency-authorized-stage-r2.py` SHA3fb24873c048d63aa7e5b17cd3b8a72725af3d92d9639bd5663f8541b5c22536 changes only three frozen delivery pins/name from original orchestration. Fresh delivery200b242786e02c92e3f808a9f03669f4a9ffb6bf196c41089b433bfb73c207df remains locally/parent authenticated; remote authentication did not run.

Next coordinator-authorized attempt should pass a literal LF shell script through SSH stdin (as the successful read-only reconciliation does), capture status without PowerShell interpolation, authenticate the orchestration and all archive pins before deployment, and recheck absent targets. Renew staging lease first; do not reuse an existing canonical target. Jq/Python/full-services remain unauthorized and NOT_RUN. No paid calls or ultrareviews.