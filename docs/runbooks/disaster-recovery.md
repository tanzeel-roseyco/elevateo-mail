# Runbook: disaster recovery and restore

Use this with [completion operations](../../ops/production/completion/README.md) and the [handoff](../handoff/README.md). Jeison and Tanzeel maintain the recovery procedure together. Callum approves the recovery target, downtime and production cutover. Nothing here authorizes execution.

## Before an incident

Record the accepted source revision, digest-pinned images, six-volume inventory, recovery-key custodian and verified off-host SFTP destination. Approve RPO, RTO, retention, backup schedule and alert ownership with Callum; the earlier 24-hour/8-hour targets were proposals, not measured guarantees. No timer is installed by `deploy.sh`.

Current backup code is [recovery.py](../../ops/production/completion/recovery.py), not the historical `ops/supabase/stack.sh` workflow. It takes a cold snapshot of `db-data`, `db-config`, `storage-data`, `mox-config`, `mox-data` and `mox-tls`. Keep recovery-critical environment secrets separately in the company vault; this is not a promise to recover an operator's environment from the archive.

## Backup and restore

1. Export the protected settings specified in [completion operations](../../ops/production/completion/README.md), using the correct project, absolute Compose path, source revision and shared operations lock. Agree the outage before starting.
2. Run `python3 ops/production/completion/recovery.py backup` from the repository root in the reviewed operations environment. It stops all project writers, encrypts before SFTP upload, downloads the ciphertext and compares hashes. Previously running services restart on success or failure. Preserve a private receipt; never put keys or message contents in Git.
3. For recovery, obtain the encrypted snapshot and offline age identity. Configure a fresh `elevateo-restore-*` project with identical revision/images, no existing containers or volumes, no published ports, no host networking and only internal networks. Preserve every snapshot service name and image, including `mox` and `mox-readiness`; replace their host networking with internal networking and remove all published ports. `recovery.py` requires exact service-name/image roster equality, so removing these services fails admission. A compatible full-production restore definition is not yet verified: Jeison and Tanzeel must prepare and test it before Callum approves go-live. The command below is conditional on that work, not a proven full-production recipe.
4. Run `python3 ops/production/completion/recovery.py restore --snapshot /absolute/snapshot.tar.age`. Success means archive hashes/paths and restored bytes passed checks, old application/Supabase sessions and connector grants were revoked, unfinished sends were held, and RLS/role checks passed. Only the database starts for checks, then stops. Restored volumes remain for inspection.
5. Compare restored data and record measured duration/data loss. The command does not switch production or delete the restored volumes. Submit evidence and an exact cutover/reversion plan to Callum before reopening access.
6. Reconcile every unfinished or ambiguous send against authoritative transport evidence before approving a replacement. Never automatically retry an `unknown` send.

The [backend receipt](../completion/backend-20261030-receipt.md) records a local encrypted six-volume drill. It does not prove company SFTP access, real-data restore, measured production RPO/RTO or deliverability.

## Failure and rollback

Deployment is forward-only and retains volumes on failure. Do not overwrite production with a restored snapshot or blindly run migration rollback. Jeison must review schema compatibility before using earlier application images; API and worker must remain compatible with the database. Data rollback can discard newer receipts and mail, so Callum must approve the exact recovery point and reconciliation plan.

Keep the isolated restore offline on failure and preserve diagnostics privately. Never prune volumes. Fleet-01 is read-only and off limits; this runbook grants no fleet access.

Every deployment stops `mox` before running the initializer. Activation or TLS/configuration changes can make the existing files differ from the generated held configuration, causing initialization to fail before the final service start and leaving Mox stopped. Jeison and Tanzeel must develop and verify a post-activation update/rotation procedure, including recovery from that stop, before Callum approves such an update. Do not reuse initial deployment as an assumed safe live update command.
