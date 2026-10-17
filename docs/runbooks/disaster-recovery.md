# Runbook: disaster recovery and restore (draft)

Status: draft for the private pilot. Targets below are proposals until the pilot owner approves them; nothing here is scheduled yet (readiness item 19).

## Targets

| Measure | Pilot proposal | Growth |
| --- | --- | --- |
| RPO (data loss tolerated) | 24 hours (nightly backup) | 1 hour (WAL archiving) |
| RTO (time to restore service) | 8 business hours on a rebuilt VPS | 2 hours on a warm standby |
| Backup retention | 7 daily, 4 weekly, 3 monthly | add 12 monthly |
| Restore drill | Monthly, into a disposable project | Monthly plus after every schema change |

## What is backed up

- PostgreSQL database and globals (roles, memberships) from the live Supabase stack.
- Supabase Storage objects (private attachments) by volume archive.
- Stack credential files (`.env.live`) and the Compose pin set, encrypted.
- Not backed up: Mailpit captures, build caches, anything under `third_party`.

The existing tooling is `ops/supabase/stack.sh live backup` (dumps DB plus globals, archives objects and credentials, hashes the set under ignored `.backups`) and `ops/supabase/restore-drill.sh <snapshot>` (restores into an isolated disposable project and verifies markers). `docs/operations/supabase.md` describes both; the backup stops HTTP writers, so it is a short maintenance window.

## Nightly job (to be installed)

1. systemd timer at 02:30 host time runs `ops/supabase/stack.sh live backup` under the operator lease.
2. The resulting archive set is encrypted with `age` to the two operators' keys and uploaded with `restic` or `rclone` to the off-host target (Backblaze B2 bucket or Hetzner Storage Box; cost model H08/H09).
3. The job verifies the upload hash, prunes per the retention table and posts a one-line success or failure to the monitoring channel; a missing nightly success is an alert.
4. Hetzner server backups (20% add-on) stay enabled as a fast same-host rollback, not as DR.

## Restore procedure

1. Fetch the newest archive set, decrypt, verify hashes.
2. Run `ops/supabase/restore-drill.sh <snapshot>` into a disposable project; confirm DB and object markers, migration lineage and role privileges.
3. For a real recovery, rebuild the host (section below), restore into the live project with the same tenant ID (Storage paths depend on it), then run the authenticated, cross-tenant and revoked-principal probes from `ops/ops820/activation-checklist.md`.
4. Keep `ELEVATEO_OUTBOUND_HOLD=true` until the send ledger has been reconciled: any send in `submitting` or `unknown` at the time of the failure must be checked against provider records before anyone approves a replacement; never resubmit automatically (`docs/mail-delivery-and-hosting.md`).
5. Record the drill or recovery (date, snapshot ID, duration, issues) in `docs/operations/`.

## Rebuilding the VPS (manual until IaC exists)

1. Create the server from the cost-model plan, attach the SSH keys of both operators, enable Hetzner backups, enable the firewall (22, 80, 443 only).
2. Install Docker, create the operator user, enable unattended security updates, enable disk encryption for the data volume (readiness item 41).
3. Clone the repository at the tagged release, restore `.env.live` from the encrypted archive, pull the pinned images, start the stack with `ops/supabase/stack.sh live up`.
4. Point DNS at the new host, confirm TLS issuance and the `/health` and `/ready` checks, then restore data as above.

## Rollback

- Application: images are pinned by digest; redeploy the previous digest and restart; the API and worker share one migration lane so roll both.
- Schema: migrations are reversible except the deliberately irreversible attachment migration (readiness item 15); run `down` inside the lease and re-run the rollback regression tests before serving traffic.
- Data: a rollback to an earlier backup loses sends and receipts after that point; the provider ledger at Resend and the Gmail Sent folders remain the source of truth for what actually left.

## Open items before this is final

- Approve RPO and RTO.
- Choose the off-host target and create the operators' `age` keys.
- Install the timer and the alert on missing success.
- Run the first drill and record it.
