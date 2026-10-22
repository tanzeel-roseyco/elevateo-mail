# Held production Mox workers

Merge this overlay with the held base; it does not deploy a Mox server or change the API.
No live activation is authorized here. Keep SSO-only, secure cookies, the private network,
database and attachment gateway unchanged. No Cloudflare, DNS or Workspace routing changes.
The notification Mailpit fixture is unrelated: production SMTP uses verified TLS on Mox
port 587 and IMAP uses verified TLS on 993, never the fixture metadata in Config.

## Protected inputs and preflight

Export the existing digest-pinned `ELEVATEO_PRODUCTION_IMAGE` accepted by `deploy.sh`;
never set its internal admitted-image variable yourself. Keep the base API/worker/gateway
env-file path variables. Additionally export absolute `ELEVATEO_MOX_SEND_ENV_FILE`,
`ELEVATEO_MOX_INBOUND_ENV_FILE`, `ELEVATEO_MOX_SEND_DIR`, `ELEVATEO_MOX_INBOUND_DIR`,
and `ELEVATEO_MOX_CONTROL_DIR`, all outside the repository and backups of application DB.
Use distinct directories, no symlinks, directory mode 0700 owned by uid 10001;
Bundle/token files must be regular, single-link, uid 10001, mode 0600, readable by that uid.
Env files are operator-owned mode 0600. Never print resolved production Compose output.
Read-only directory mounts permit operator atomic replacement of the control file.
Missing paths must fail rather than create empty host directories.

Both worker env files need the existing restricted WORKER_DB_PASSWORD and runtime auth/session
policy from README.md, not API/migrator credentials or Auth signing/admin keys.
Set `ELEVATEO_MOX_HOST` to the approved TLS hostname and
`ELEVATEO_MOX_VERIFIED_DOMAINS` to a JSON array of 1..120 unique lowercase verified domains
(at most 32768 bytes). The host must be a subdomain of one of them; reserved domains fail.
Do not use obsolete FROM_DOMAIN/FROM_DOMAINS settings. The allowlist grants no DNS authority.
Inbound additionally needs `ELEVATEO_INBOUND_STORAGE_BUCKET` for the approved private bucket
and `storage-token` containing the restricted Storage token, without a trailing newline.
Never put that token or `ELEVATEO_ATTACHMENT_STORAGE_SERVICE_TOKEN` in worker env files.
SMTP receives only its SMTP Bundle; inbound receives only its IMAP Bundle and Storage token.
Each `credentials.json` uses Bundle format_version 1 with entries bound to actual account,
organization, mailbox, credential version and `secret:` credential_ref; protocol is smtp or imap.
Fixture identities and test credentials cannot be used as production bindings.

Create operator-managed `control.json` (uid 10001, mode 0600) with exactly `epoch` (fresh lowercase UUID) and
`outbound_held: true`. Preserve the same epoch when changing its hold. Missing/malformed
control fails closed; database-restored control must never authorize submission.
Validate approved schema/grants, mailbox budgets, account bindings, TLS trust and restore
evidence independently before activation. No automatic migration or provisioning is included.

Run from repository root; deploy.sh supplies the first absolute Compose file:

```sh
sh ops/production/deploy.sh -f "$PWD/ops/production/compose.mox.yaml" config --quiet
```

The merged default has no active Mox workers, all submission holds true, activation false,
API send disabled, no new ports, uid 10001, read-only root/mounts and restart=no.
Explicitly targeting a profiled service can start it: profiles are convenience, not authorization.
Held send startup deliberately exits before clients/DB: never run it as a health check.
For held validation use a separately reviewed offline Config/profile/Bundle loader in an isolated
Docker test with synthetic files; Compose config alone validates wiring, not runtime semantics.

## Explicit activation, observation and rollback

Only after separate owner authorization: opt into inbound with the exact merged command
above replacing `config --quiet` with `--profile mox-inbound up -d mox-inbound-worker`.
It continuously polls, writes inbox/attachments and remains outbound-held; observe import lag,
lease failures, disk and attachment errors. restart=no requires deliberate operator recovery.

Sending requires a distinct approval for every one-pass run. Review due IDs and limits;
release control.outbound_held only for the reviewed epoch and bounded run window.
Keep the manifest and API globally held. Invoke the same wrapper/overlay with:

```sh
--profile mox-send-manual run --rm --no-deps -e ELEVATEO_OUTBOUND_HOLD=false \
  -e ELEVATEO_MOX_PRODUCTION_ENABLED=true mox-send-worker
```

These are trailing arguments to the wrapper, not a standalone shell command.
The mox-smtp-v1 worker drains once and exits; no scheduler, restart policy or retry loop
may rerun it. Always re-hold control atomically after the run, including failure/interruption.
Do not change API send enablement here; separately reviewed API activation is another gate.
Inspect durable outcomes: accepted means provider accepted, not delivered; ambiguous SMTP
outcomes remain unknown. Never automatically retry unknown, release its reservation, switch
provider, or replay a restored queue. Reconcile independently before any manual follow-up.

Rollback: re-hold control first, stop only these two named worker services with the merged
wrapper, revoke the affected account credential version if needed, and retain DB/storage/mail
data and evidence. Do not use down -v, prune, or remove shared networks. Bundle/token rotation
requires SQL version revocation, atomic private-file replacement and deliberate worker restart.
