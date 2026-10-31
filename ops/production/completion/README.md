# Completion operations

These Python 3.12+ operations run in the final Docker operations environment with Docker CLI/Compose,
`age`, `age-keygen`, and OpenSSH `sftp`. They never contact a mail provider. The
[backend completion receipt](../../../docs/completion/backend-20261030-receipt.md) records local Docker
verification and a six-volume encrypted restore drill. Live off-host SFTP and existing Authentik integration
remain unverified. Follow the [handoff approval gates](../../../docs/handoff/README.md) before production
execution. Fleet-01 is read-only and off limits.

`python3 -m unittest discover -s ops/production/completion -p 'test_*.py'` runs the admission and archive
unit cases. These mocks do not substitute for the real database restore drill described below.

## Provisioning

`python3 ops/production/completion/provision.py --csv approved-mailbox-assignments.csv --dry-run`
validates every row before mutation. Header is exactly `organization_id,user_id,mailbox_id,address`;
IDs are canonical nonzero UUIDs; addresses are unique lowercase ordinary addresses, up to 1,000 rows.
The user must already be an active, verified member of the organization. `--apply` additionally requires
`ELEVATEO_PROVISIONING_ENABLED=true`. Repeated matching assignments do not create new mailboxes.
The application role and mailbox authority remain authoritative; this script cannot enroll new users.

Required: `ELEVATEO_EGRESS_ID`. Daily ceilings use `ELEVATEO_MAILBOX_DAILY_SEND_LIMIT` (default 30)
and `ELEVATEO_USER_DAILY_SEND_LIMIT` (default 300), with lower limits allowed. The global user quota
is keyed by user UUID across mailboxes and organizations. Quotas share the existing reservation ledger;
usage is never reset. Mailboxes remain held. Destination domains require explicit quota policy and are
never silently wildcarded. Existing incompatible identity/route assignments abort the transaction.

`initialize_mox.py --csv PATH` writes only empty owned `mox-config` and `mox-tls` volumes; exact retries
succeed, changed live config is rejected. The host-network Mox service uses supplied public IPv4.
`configuration(assignments)` and `tls_material()` are side-effect-free preflight functions.
Required env: `ELEVATEO_MOX_HOSTNAME`, `ELEVATEO_MOX_IPV4`, `ELEVATEO_MAIL_DOMAINS` (comma-separated),
`ELEVATEO_WORKSPACE_DOMAINS` (excluded, comma-separated), `ELEVATEO_MOX_TLS_CERT_BASE64`,
`ELEVATEO_MOX_TLS_KEY_BASE64`. Domains and accounts are disabled; no passwords, DKIM activation,
DNS changes or sends are performed. Preflight bounds and parses the PEM certificate chain and private key,
verifies their match, and rejects invalid material before either volume is written. The host-networked
`mox-readiness` service verifies the live IMAPS certificate/hostname and SMTP/submission greetings;
isolated restore definitions must retain both service names and images to match the snapshot manifest,
while removing host networking and published ports and using only internal networks. Removing either
service fails the exact image-roster comparison in `recovery.py`. A compatible full-production restore
definition has not been verified and is a go-live blocker; the local drill does not establish that recipe.

## Backup and recovery

Common env: `COMPOSE_FILE` (absolute paths, OS path separator for overlays), `COMPOSE_PROJECT_NAME`,
`ELEVATEO_SOURCE_REVISION` (40 lowercase hex commit), `ELEVATEO_BACKUP_HELPER_IMAGE` (digest-pinned,
must contain GNU tar and sh), `ELEVATEO_OPERATIONS_LOCK` (absolute private lock path shared by operations).
The exact six-volume roster is `db-data`, `db-config`, `storage-data`, `mox-config`, `mox-data`, `mox-tls`.
Writable bind mounts or unknown persistence are rejected. Serialize deployment with the same lock path.

`recovery.py backup` stops all project writers before archiving the database, private objects, and Mox.
This is a cold consistency barrier with downtime proportional to data size. Previously running services
restart after success or failure. Encryption occurs before transfer; plaintext is private temporary data.
Off-host SFTP upload is followed by a full ciphertext download/hash comparison. Required env:
`ELEVATEO_BACKUP_AGE_RECIPIENT`, `ELEVATEO_BACKUP_SSH_HOST` (`user@host`), `ELEVATEO_BACKUP_REMOTE_DIR`,
`ELEVATEO_BACKUP_SSH_KEY_BASE64`, `ELEVATEO_BACKUP_KNOWN_HOSTS` (public pinned-host file).
Private keys originate exclusively in environment and are materialized as temporary mode-0600 files.

`recovery.py restore --snapshot /absolute/snapshot.tar.age` requires `ELEVATEO_BACKUP_AGE_IDENTITY_BASE64`.
Use a fresh `elevateo-restore-*` project, identical service images/source revision, no existing containers or
volumes, no published ports or host networking, and only internal networks. Restore checks all archive
hashes and paths before mutation, reads all restored bytes back, starts only DB, revokes application and
Supabase sessions and connector grants, holds every unfinished send, validates RLS/roles, and stops DB.
Restored volumes remain isolated for inspection. No automatic deletion or production cutover occurs.
Manual provider reconciliation is required before any held send is approved again.

`restore_drill.py` is the real final Docker acceptance drill. The disposable migrated source project must
start `elevateo-drill-` and contain active session/grant and unfinished send fixtures. Set
`ELEVATEO_DRILL_RESTORE_COMPOSE_FILE` and `ELEVATEO_DRILL_RESTORE_PROJECT` to a fresh isolated target.
The drill generates an ephemeral age key, snapshots all volumes, simulates post-snapshot source revocation
and acceptance entirely in the DB, restores, and asserts old access is revoked and old sends cannot replay.
It performs no real send or off-host upload. The same production restore path verifies every volume byte,
including storage objects and Mox ingestion state. The source fixture state is deliberately changed and
all target volumes remain for explicit, task-scoped cleanup by the verification harness.

Every deployment stops `mox` before running the initializer. Activation or TLS/configuration changes can make the existing files differ from the generated held configuration, causing initialization to fail before the final service start and leaving Mox stopped. Jeison and Tanzeel must develop and verify a post-activation update/rotation procedure, including recovery from that stop, before Callum approves such an update. Do not reuse initial deployment as an assumed safe live update command.
