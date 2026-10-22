# Production Mox overlay — 2026-10-23

Task task_22d178cb3da0 / dispatch ctx_08690908ac68. Implemented only
`ops/production/compose.mox.yaml` (77 lines) and `ops/production/README-mox.md`
(82 lines), plus this receipt. No commit, frontend edit, live deployment, database,
DNS, Workspace, Cloudflare or mail mutation. Existing dirty files belong to other owners.
Coordinator handles bounded adversarial/design reviews, code-reviews.md and central state integration.

## Configuration and coordination

Separate SMTP one-pass/manual profile and IMAP continuous opt-in profile share only the
existing admitted application image and external private network. Both use uid 10001,
read-only root and protected mounts, cap-drop ALL, no-new-privileges, no ports and restart=no.
The base API/revocation worker remain held, secure-cookie and SSO-only; no base file changed.
The SMTP run requires explicit per-run environment activation AND released control epoch;
neither profile enables sending. Inbound production polling stays outbound-held.
Mailpit metadata remains required by Config but is not the production transport endpoint.

Coordinator message msg_976a5414412d confirms the backend's final setting is
`ELEVATEO_MOX_VERIFIED_DOMAINS`: JSON array 1..120, <=32768 bytes, not FROM_DOMAINS.
Read current production_mox_profile.rb and inbound/worker_config.rb: SMTP 587,
production IMAP 993, `mox-imap-v1`, absolute Bundle paths. Send worker itself selects
`mox-smtp-v1` from outbound mode mox; no invented SMTP profile environment switch.
Runbook includes private paths/permissions, restricted DB roles, separate Bundles,
Storage token isolation, control-file rotation, activation, rollback and unknown-outcome holds.

## Fleet validation

SSH fleet-02 port 2222 using the supplied identity; exclusive flock on
`/home/tanzeel/elevateo-mail-wave-20261014/control/soren-docker.lock`.
Namespace `overlay20261023`; unique task staging under /tmp was removed in finally.
Compose v5.3.1 host CLI parsed synthetic env files through the unchanged deploy.sh
digest-admission wrapper and absolute overlay path. This is the explicitly permitted
Compose host-parse exception: used the installed plugin without creating/pulling a
Docker-in-Docker/Compose image. The 37 merged-invariant assertions ran inside fleet Docker;
host-side parse checks inspected default profiles and missing-input rejection statuses.

`config --quiet`: exit 0. JSON merged configuration was piped to Ruby in an existing
immutable backend image, with --rm --pull=never --network none --read-only, uid 10001,
cap-drop ALL and no-new-privileges. Image:
`sha256:9cce7a1f822506e17bbe03ac803b150372af0933a888b76c099d4bce9caa81b5`.

- PASS 37 merged invariants: image identity, roles, both holds, send API disabled,
  SSO-only/secure cookies, commands, Bundle paths, profiles, ports, restart, protected
  mounts and exact external private network. Default profile inspection passed.
- PASS missing send env path, missing SMTP directory variable, missing admitted image:
  each rejected before runtime (three negative cases).
- No app/Mox process started, no network attachment, DB read, secrets or provider call.
- Source whitespace check passed; no runtime application test or actual protected-file
  validation claimed. Runtime Config/Bundle loader evidence, TLS/account admission,
  production capacity, acceptance and release remain coordinator/backend gates.

Exact tested source SHA256:

| File | SHA256 |
| --- | --- |
| compose.mox.yaml | 332835f35cb740c00e4a52e3411e2fbf726bcfd8f563cff8bb4364d84456855d |
| base compose.yaml | 0fff194842ff47846104797054a735d536242bec50572f351e5db17966a341c9 |
| deploy.sh | da4bb10e40f46c50fb56347bb4ba44616dd69bc7ea2164d46b2ecf965c71c6fb |
| final README-mox.md | 1a55ebca9248f6ed0149425ed707733557f3a15b89957da0fede2cab35414dab |

## Cleanup and limits

Disposable `overlay20261023-check` exited and --rm removed it; subsequent exact-prefix
container listing returned empty. Task staging and synthetic files removed. No image,
build cache, volume or persistent resource was created; shared backend image and all
other workloads retained. No prune or unrelated cleanup. Docker cache/image reclamation
0 bytes; temporary/container reclaimed bytes were not independently measured.
Post-check fleet host free space: 72,672,092,160 bytes. Shared Docker usage observed:
images 104.6GB, containers 4.881GB, volumes 16.81GB, build cache 4.62MB; none deleted.
No local Docker/WSL disk was used, so no local compaction applies.
